import { calculatePricing } from "../services/pricing.server";
import { validateDraftOrderInput, formatError } from "../services/validation.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

/**
 * Queries the last 100 code discount nodes in the Shopify store,
 * filters for those created by our app (starting with "Vaahini Bundle:") that are EXPIRED,
 * and deletes them to keep the Admin Discounts screen clean.
 */
async function cleanupExpiredDiscounts(shop, token) {
  try {
    const listQuery = `
      query getExpiredDiscounts {
        codeDiscountNodes(first: 100, reverse: true) {
          edges {
            node {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  status
                }
              }
            }
          }
        }
      }
    `;

    const graphQLUrl = `https://${shop}/admin/api/2026-07/graphql.json`;
    const response = await fetch(graphQLUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query: listQuery })
    });

    if (!response.ok) return;
    const responseJson = await response.json();
    const edges = responseJson.data?.codeDiscountNodes?.edges || [];

    // Filter for expired Vaahini discount codes
    const expiredIds = [];
    for (const edge of edges) {
      const node = edge.node;
      const discount = node.codeDiscount;
      if (
        discount &&
        discount.title &&
        discount.title.includes("Vaahini Bundle:") &&
        discount.status === "EXPIRED"
      ) {
        expiredIds.push(node.id);
      }
    }

    if (expiredIds.length === 0) {
      console.log("[Vaahini] No expired discount codes to clean up.");
      return;
    }

    console.log(`[Vaahini] Found ${expiredIds.length} expired discount codes. Deleting...`);

    const deleteMutation = `
      mutation apiDiscountCodeDelete($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedDiscountCodeId
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Run delete mutations sequentially to avoid API rate limiting
    for (const id of expiredIds) {
      try {
        const delRes = await fetch(graphQLUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token
          },
          body: JSON.stringify({
            query: deleteMutation,
            variables: { id }
          })
        });
        if (delRes.ok) {
          const delJson = await delRes.json();
          if (delJson.data?.discountCodeDelete?.deletedDiscountCodeId) {
            console.log(`[Vaahini] Successfully deleted expired discount code: ${id}`);
          }
        }
      } catch (err) {
        console.error(`[Vaahini] Failed to delete discount code ${id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Vaahini] Error in cleanupExpiredDiscounts:", err);
  }
}

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};

export const action = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== "POST" && request.method !== "DELETE") {
    return corsJsonResponse(formatError("Method not allowed", 405), request, { status: 405 });
  }

  try {
    const cloneRequest = request.clone();
    let body = {};
    try {
      body = await cloneRequest.json();
    } catch (e) {
      // Body may not be JSON or empty
    }

    // Handle DELETE / Deactivate request
    if (request.method === "DELETE" || (request.method === "POST" && body.action === "deactivate")) {
      const { shop, code } = body;
      if (!shop || !code) {
        return corsJsonResponse(formatError("Missing required parameters: 'shop' and 'code'", 400), request, { status: 400 });
      }

      const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
      if (!token) {
        return corsJsonResponse(formatError("Shopify API Token not configured", 500), request, { status: 500 });
      }

      // 1. Get the Discount Node ID from the code string
      const lookupQuery = `
        query getDiscountNode($code: String!) {
          codeDiscountNodeByCode(code: $code) {
            id
          }
        }
      `;

      const graphQLUrl = `https://${shop}/admin/api/2026-07/graphql.json`;
      const lookupRes = await fetch(graphQLUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        },
        body: JSON.stringify({
          query: lookupQuery,
          variables: { code }
        })
      });

      if (!lookupRes.ok) {
        return corsJsonResponse(formatError("Failed to lookup code in Shopify", 400), request, { status: 400 });
      }

      const lookupJson = await lookupRes.json();
      const id = lookupJson.data?.codeDiscountNodeByCode?.id;

      if (!id) {
        return corsJsonResponse({ success: true, message: "Discount code already deleted or not found." }, request);
      }

      // 2. Delete the discount node using the ID
      const deleteMutation = `
        mutation apiDiscountCodeDelete($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedDiscountCodeId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const deleteRes = await fetch(graphQLUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        },
        body: JSON.stringify({
          query: deleteMutation,
          variables: { id }
        })
      });

      if (!deleteRes.ok) {
        return corsJsonResponse(formatError("Failed to delete code in Shopify", 400), request, { status: 400 });
      }

      const deleteJson = await deleteRes.json();
      if (deleteJson.errors || (deleteJson.data?.discountCodeDelete?.userErrors?.length > 0)) {
        return corsJsonResponse(
          formatError("Shopify errors deleting discount code", 400, deleteJson.errors || deleteJson.data.discountCodeDelete.userErrors),
          request,
          { status: 400 }
        );
      }

      console.log(`[Vaahini] Immediately deleted cancelled/failed discount code: ${code} (${id})`);
      return corsJsonResponse({ success: true, deletedCode: code }, request);
    }

    // Standard POST Coupon Creation Flow
    const validation = validateDraftOrderInput(body);

    if (!validation.valid) {
      return corsJsonResponse(formatError(validation.error, 400), request, { status: 400 });
    }

    const { shop, items } = validation.cleanData;

    // 1. Calculate the discount amount
    const pricing = calculatePricing(items);
    const discountAmount = pricing.discountAmount;

    // If there is no discount, return success with no code
    if (discountAmount <= 0) {
      return corsJsonResponse({ success: true, code: null, discountAmount: 0 }, request);
    }

    // 2. Generate a unique discount code
    const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const discountCode = `VAAHINI-${pricing.pricingBreakdown.groupsOf4.count > 0 ? "B4-" : "B1G1-"}${uniqueId}`;

    // 3. Resolve Shopify Admin API token
    const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    if (!token) {
      console.error("[Vaahini] SHOPIFY_ADMIN_API_ACCESS_TOKEN is not configured in .env.");
      return corsJsonResponse(
        formatError("Shopify API Token not configured", 500),
        request,
        { status: 500 }
      );
    }

    // Run cleanup of expired Vaahini codes asynchronously with 10% probability to reduce Serverless API load and improve response latency
    if (Math.random() < 0.1) {
      cleanupExpiredDiscounts(shop, token).catch((err) =>
        console.error("[Vaahini] Background cleanup error:", err)
      );
    }

    // 4. Create the discount code in Shopify via GraphQL directly
    const mutation = `
      mutation apiDiscountCodeCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const graphQLUrl = `https://${shop}/admin/api/2026-07/graphql.json`;
    const response = await fetch(graphQLUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          basicCodeDiscount: {
            title: `Vaahini Bundle: ${pricing.pricingBreakdown.activeDealName || "Discount"}`,
            code: discountCode,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes expiration
            usageLimit: 1,
            appliesOncePerCustomer: true,
            customerSelection: {
              all: true
            },
            customerGets: {
              value: {
                discountAmount: {
                  amount: discountAmount.toFixed(2),
                  appliesOnEachItem: false
                }
              },
              items: {
                all: true
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Vaahini] Shopify API HTTP error:", response.status, errorText);
      return corsJsonResponse(
        formatError(`Shopify API responded with status ${response.status}`, 400),
        request,
        { status: 400 }
      );
    }

    const responseJson = await response.json();

    if (responseJson.errors) {
      console.error("Shopify GraphQL Discount error:", responseJson.errors);
      return corsJsonResponse(
        formatError("Shopify GraphQL Error creating discount", 400, responseJson.errors),
        request,
        { status: 400 }
      );
    }

    const { codeDiscountNode, userErrors } = responseJson.data.discountCodeBasicCreate;

    if (userErrors && userErrors.length > 0) {
      console.error("Shopify User Discount error:", userErrors);
      return corsJsonResponse(
        formatError("Shopify User Error creating discount", 400, userErrors),
        request,
        { status: 400 }
      );
    }

    return corsJsonResponse({
      success: true,
      code: discountCode,
      discountAmount,
      ruleId: codeDiscountNode.id
    }, request);

  } catch (error) {
    console.error("Error in discount creation/deletion endpoint:", error);
    return corsJsonResponse(
      formatError("Internal server error", 500, error.message),
      request,
      { status: 500 }
    );
  }
};

import { calculatePricing } from "../services/pricing.server";
import { validateDraftOrderInput, formatError } from "../services/validation.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};

export const action = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== "POST") {
    return corsJsonResponse(formatError("Method not allowed", 405), request, { status: 405 });
  }

  try {
    const body = await request.json();
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
            endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiration
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
    console.error("Error in discount creation endpoint:", error);
    return corsJsonResponse(
      formatError("Internal server error", 500, error.message),
      request,
      { status: 500 }
    );
  }
};

import { unauthenticated } from "../shopify.server";
import { calculatePricing } from "../services/pricing.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};

export const action = async ({ request }) => {
  // Handle preflight OPTIONS request
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== "POST") {
    return corsJsonResponse({ error: "Method not allowed" }, request, { status: 405 });
  }

  try {
    const body = await request.json();
    const { shop, items, customer, shippingAddress, billingAddress, note } = body;

    // 1. Basic validation
    if (!shop) {
      return corsJsonResponse({ error: "Missing required field: 'shop'." }, request, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return corsJsonResponse({ error: "Missing or invalid 'items' field. It must be a non-empty array." }, request, { status: 400 });
    }

    // Validate items
    for (const item of items) {
      if (typeof item.price === "undefined" || typeof item.quantity === "undefined") {
        return corsJsonResponse({ error: "Each item must have 'price' and 'quantity' fields." }, request, { status: 400 });
      }
      if (isNaN(parseFloat(item.price)) || isNaN(parseInt(item.quantity, 10))) {
        return corsJsonResponse({ error: "Item 'price' and 'quantity' must be valid numbers." }, request, { status: 400 });
      }
    }

    // 2. Load the authenticated admin context
    let adminClient;
    try {
      const auth = await unauthenticated.admin(shop);
      adminClient = auth.admin;
    } catch (sessionError) {
      console.error(`Failed to retrieve session for shop: ${shop}`, sessionError);
      return corsJsonResponse({
        error: "App session not found",
        message: `Please install the app on ${shop} before calling this API.`
      }, request, { status: 401 });
    }

    // 3. Compute discount
    const pricing = calculatePricing(items);

    // 4. Construct lines for Shopify draftOrderCreate mutation
    const lineItemsInput = items.map(item => {
      const lineItem = {
        quantity: parseInt(item.quantity, 10)
      };

      if (item.variantId) {
        lineItem.variantId = item.variantId;
      } else {
        // Fallback for custom product
        lineItem.title = item.title || "Custom Product";
      }

      // Explicitly lock the unit price if provided to prevent mismatches
      if (item.price) {
        const itemPriceRupees = parseFloat((parseFloat(item.price) / (item.price < 10000 ? 1 : 100)).toFixed(2));
        // If price is passed as integer paise (e.g. 59900) or decimal rupees (e.g. 599), parse it properly
        const computedUnitPrice = item.price > 10000 ? (item.price / 100) : item.price;
        lineItem.originalUnitPrice = computedUnitPrice.toFixed(2);
      }

      return lineItem;
    });

    // Build the draft order input
    const draftOrderInput = {
      lineItems: lineItemsInput,
      note: note || "Custom discounted order created by App",
    };

    // Include customer details if provided
    if (customer && (customer.email || customer.phone)) {
      // In newer GraphQL APIs, customer can be linked via customerId or email/phone
      if (customer.email) draftOrderInput.email = customer.email;
    }

    if (shippingAddress) {
      draftOrderInput.shippingAddress = shippingAddress;
    }
    if (billingAddress) {
      draftOrderInput.billingAddress = billingAddress;
    }

    // Apply bundle discount if it exists
    if (pricing.discountDecimal > 0) {
      draftOrderInput.appliedDiscount = {
        title: pricing.activeDealName || "Bundle Deal",
        value: pricing.discountDecimal,
        valueType: "FIXED_AMOUNT",
        amount: pricing.discountDecimal
      };
    }

    // 5. Execute GraphQL mutation
    const query = `#graphql
      mutation createDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            subtotalPrice
            totalPrice
            totalTax
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await adminClient.graphql(query, {
      variables: {
        input: draftOrderInput
      }
    });

    const responseJson = await response.json();

    if (responseJson.errors) {
      console.error("Shopify GraphQL Errors:", responseJson.errors);
      return corsJsonResponse({
        error: "GraphQL Error from Shopify",
        details: responseJson.errors
      }, request, { status: 500 });
    }

    const { draftOrder, userErrors } = responseJson.data.draftOrderCreate;

    if (userErrors && userErrors.length > 0) {
      console.error("Shopify User Errors:", userErrors);
      return corsJsonResponse({
        error: "Failed to create Draft Order",
        details: userErrors
      }, request, { status: 400 });
    }

    // 6. Return normalized response
    const subtotal = parseFloat(draftOrder.subtotalPrice) || 0;
    const total = parseFloat(draftOrder.totalPrice) || 0;
    const computedDiscount = parseFloat(pricing.discountDecimal.toFixed(2));
    
    // Sometimes Shopify invoiceUrl is the secure checkout/payment URL
    const checkoutUrl = draftOrder.invoiceUrl;

    return corsJsonResponse({
      success: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        subtotal: subtotal,
        discount: computedDiscount,
        total: total,
        invoiceUrl: draftOrder.invoiceUrl,
        checkoutUrl: checkoutUrl
      }
    }, request);

  } catch (error) {
    console.error("Error in draft-order endpoint:", error);
    return corsJsonResponse({ error: "Internal server error", message: error.message }, request, { status: 500 });
  }
};

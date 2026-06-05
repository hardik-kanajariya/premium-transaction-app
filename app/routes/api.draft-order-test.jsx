import { createShopifyDraftOrder } from "../services/draft-order.server";
import { calculatePricing } from "../services/pricing.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";
import { formatError } from "../services/validation.server";

export const loader = async () => {
  return new Response("Method not allowed", { status: 405 });
};

export const action = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== "POST") {
    return corsJsonResponse(formatError("Method not allowed", 405), request, {
      status: 405,
    });
  }

  try {
    const body = await request.json();
    const { shop, prices, expectedUiTotal } = body;

    if (!shop) {
      return corsJsonResponse(
        formatError("Missing required field: 'shop'", 400),
        request,
        { status: 400 },
      );
    }
    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return corsJsonResponse(
        formatError("Missing or invalid 'prices' array.", 400),
        request,
        { status: 400 },
      );
    }

    const items = prices.map((price) => ({ price, quantity: 1 }));

    // 1. Calculate pricing via Backend Engine
    const backendPricing = calculatePricing(items);

    // 2. Call draft order service to create Draft Order in Shopify
    const draftOrderResult = await createShopifyDraftOrder(shop, {
      items,
      note: "Test comparison draft order",
    });

    if (!draftOrderResult.success) {
      return corsJsonResponse(
        formatError(
          "Failed to create comparison draft order",
          400,
          draftOrderResult.userErrors,
        ),
        request,
        { status: 400 },
      );
    }

    return corsJsonResponse(
      {
        success: true,
        shop,
        comparison: {
          expectedUiTotal: expectedUiTotal
            ? parseFloat(expectedUiTotal)
            : null,
          backendCalculatedTotal: backendPricing.finalTotal,
          shopifyReturnedTotal: draftOrderResult.total,
          matchesBackendAndShopify:
            backendPricing.finalTotal === draftOrderResult.total,
          matchesUiAndBackend: expectedUiTotal
            ? parseFloat(expectedUiTotal) === backendPricing.finalTotal
            : null,
        },
        draftOrderDetails: {
          id: draftOrderResult.draftOrderId,
          name: draftOrderResult.name,
          subtotal: draftOrderResult.subtotal,
          discount: draftOrderResult.discount,
          total: draftOrderResult.total,
          invoiceUrl: draftOrderResult.invoiceUrl,
        },
      },
      request,
    );
  } catch (error) {
    console.error("Error in draft-order-test route:", error);
    return corsJsonResponse(
      formatError("Internal server error", 500, error.message),
      request,
      { status: 500 },
    );
  }
};

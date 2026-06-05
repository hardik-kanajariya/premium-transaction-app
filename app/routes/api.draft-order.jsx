import { createShopifyDraftOrder } from "../services/draft-order.server";
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

    const result = await createShopifyDraftOrder(validation.cleanData.shop, validation.cleanData);

    if (!result.success) {
      return corsJsonResponse(formatError("Failed to create draft order", 400, result.userErrors), request, { status: 400 });
    }

    return corsJsonResponse(result, request);
  } catch (error) {
    console.error("Error in draft-order creation endpoint:", error);
    return corsJsonResponse(formatError("Internal server error", 500, error.message), request, { status: 500 });
  }
};

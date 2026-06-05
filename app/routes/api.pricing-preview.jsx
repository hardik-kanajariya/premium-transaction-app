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
    const { items } = body;

    // Validate request
    if (!items || !Array.isArray(items)) {
      return corsJsonResponse({ error: "Missing or invalid 'items' field. It must be an array." }, request, { status: 400 });
    }

    for (const item of items) {
      if (typeof item.price === "undefined" || typeof item.quantity === "undefined") {
        return corsJsonResponse({ error: "Each item must have a 'price' and 'quantity' field." }, request, { status: 400 });
      }
      if (isNaN(parseFloat(item.price)) || isNaN(parseInt(item.quantity, 10))) {
        return corsJsonResponse({ error: "Item 'price' and 'quantity' must be valid numbers." }, request, { status: 400 });
      }
    }

    // Calculate pricing
    const pricingResult = calculatePricing(items);

    return corsJsonResponse(pricingResult, request);
  } catch (error) {
    console.error("Error in pricing-preview endpoint:", error);
    return corsJsonResponse({ error: "Internal server error", message: error.message }, request, { status: 500 });
  }
};

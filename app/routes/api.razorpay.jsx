import { createRazorpayOrder } from "../services/razorpay.server";
import { formatError } from "../services/validation.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  return corsJsonResponse({
    keyId: process.env.RAZORPAY_KEY_ID || ""
  }, request);
};

export const action = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== "POST") {
    return corsJsonResponse(formatError("Method not allowed", 405), request, { status: 405 });
  }

  try {
    const body = await request.json();
    const { amount, currency, receipt } = body;

    if (typeof amount === "undefined" || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return corsJsonResponse(formatError("Missing or invalid 'amount' field. Must be a positive number.", 400), request, { status: 400 });
    }

    // Convert amount to paise. If it looks like decimal rupees (e.g. < 10000), multiply by 100.
    const amountFloat = parseFloat(amount);
    const amountPaise = amountFloat < 10000 ? Math.round(amountFloat * 100) : Math.round(amountFloat);

    // Call the isolated Razorpay service
    const razorpayOrder = await createRazorpayOrder(amountPaise, currency || "INR", receipt);

    return corsJsonResponse({
      success: true,
      order: razorpayOrder
    }, request);

  } catch (error) {
    console.error("Error in razorpay endpoint:", error);
    return corsJsonResponse(formatError("Internal server error", 500, error.message), request, { status: 500 });
  }
};

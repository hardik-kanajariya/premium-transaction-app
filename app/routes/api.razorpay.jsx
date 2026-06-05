import crypto from "crypto";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async ({ request }) => {
  // Handle preflight OPTIONS request
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  return corsJsonResponse({
    keyId: process.env.RAZORPAY_KEY_ID || ""
  }, request);
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
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return corsJsonResponse({
        error: "Missing required fields: razorpayOrderId, razorpayPaymentId, and razorpaySignature are required."
      }, request, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return corsJsonResponse({
        error: "Razorpay secret key is not configured on the server."
      }, request, { status: 500 });
    }

    // Verify the payment signature
    const hmac = crypto.createHmac("sha256", keySecret);
    hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
    const generatedSignature = hmac.digest("hex");

    const isValid = generatedSignature === razorpaySignature;

    return corsJsonResponse({
      success: isValid,
      message: isValid ? "Signature verified successfully" : "Invalid signature verification"
    }, request, { status: isValid ? 200 : 400 });

  } catch (error) {
    console.error("Error verifying Razorpay signature:", error);
    return corsJsonResponse({ error: "Internal server error", message: error.message }, request, { status: 500 });
  }
};

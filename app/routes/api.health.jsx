import prisma from "../db.server";
import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  let databaseHealthy = false;
  let errorMsg = null;

  try {
    // Basic Prisma connection validation
    await prisma.session.count();
    databaseHealthy = true;
  } catch (err) {
    errorMsg = err.message;
  }

  const shopifyConfigured = !!(
    process.env.SHOPIFY_API_KEY &&
    process.env.SHOPIFY_API_SECRET &&
    process.env.SHOPIFY_APP_URL
  );

  const razorpayConfigured = !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );

  const overallHealthy = databaseHealthy && shopifyConfigured;

  return corsJsonResponse({
    status: overallHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      database: {
        healthy: databaseHealthy,
        error: errorMsg
      },
      shopify: {
        configured: shopifyConfigured,
        apiVersion: "2026-07"
      },
      razorpay: {
        configured: razorpayConfigured
      }
    }
  }, request);
};

export const action = async () => {
  return new Response("Method not allowed", { status: 405 });
};

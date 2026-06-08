import { redirect } from "react-router";
import { prisma } from "../db.server";
import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SCOPES = process.env.SCOPES || "read_customers,read_orders,read_products,write_draft_orders,write_discounts";

/**
 * GET /auth/install?shop=vaahini-dev.myshopify.com
 *
 * Initiates the Shopify OAuth authorization code grant flow.
 * - Validates the shop parameter matches the configured single store
 * - Generates a cryptographic nonce for CSRF protection
 * - Stores the nonce in the database
 * - Redirects to Shopify's authorization page
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  // Validate shop parameter
  if (!shop || typeof shop !== "string" || !shop.includes(".myshopify.com")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid 'shop' parameter. Expected format: your-store.myshopify.com" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Enforce single-store restriction
  if (SHOPIFY_STORE_DOMAIN && shop !== SHOPIFY_STORE_DOMAIN) {
    return new Response(
      JSON.stringify({ error: `This app is restricted to ${SHOPIFY_STORE_DOMAIN}. Shop '${shop}' is not authorized.` }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!SHOPIFY_API_KEY) {
    return new Response(
      JSON.stringify({ error: "SHOPIFY_API_KEY is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Generate cryptographic nonce for state parameter (CSRF protection)
  const nonce = crypto.randomBytes(16).toString("hex");

  // Store nonce in database for later validation
  await prisma.oAuthState.create({ data: { nonce } });

  // Clean up old nonces (older than 10 minutes) to prevent table bloat
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.oAuthState.deleteMany({
    where: { createdAt: { lt: tenMinutesAgo } },
  }).catch(() => {
    // Non-critical cleanup, don't block the flow
  });

  const redirectUri = `${SHOPIFY_APP_URL}/auth/callback`;
  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  return redirect(authUrl);
};

export const action = async () => {
  return new Response("Method not allowed", { status: 405 });
};

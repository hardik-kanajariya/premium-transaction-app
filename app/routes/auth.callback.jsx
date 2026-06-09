import { prisma } from "../db.server";
import crypto from "crypto";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;

/**
 * GET /auth/callback?code=...&hmac=...&shop=...&state=...&timestamp=...
 *
 * Handles Shopify's OAuth callback after merchant authorization.
 * - Validates HMAC signature
 * - Validates state nonce (CSRF protection)
 * - Validates shop matches configured single store
 * - Exchanges authorization code for access token
 * - Persists token credentials in database
 * - Returns success confirmation
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  const shop = params.get("shop");
  const code = params.get("code");
  const hmac = params.get("hmac");
  const state = params.get("state");

  // ── 1. Basic parameter validation ──────────────────────────────────────────
  if (!shop || !code || !hmac || !state) {
    return errorResponse("Missing required OAuth callback parameters (shop, code, hmac, state).", 400);
  }

  // ── 2. Validate shop matches configured single store ───────────────────────
  if (SHOPIFY_STORE_DOMAIN && shop !== SHOPIFY_STORE_DOMAIN) {
    return errorResponse(
      `This app is restricted to ${SHOPIFY_STORE_DOMAIN}. Shop '${shop}' is not authorized.`,
      403
    );
  }

  // ── 3. Validate HMAC signature ─────────────────────────────────────────────
  if (!SHOPIFY_API_SECRET) {
    return errorResponse("SHOPIFY_API_SECRET is not configured.", 500);
  }

  const hmacValid = verifyHmac(params, SHOPIFY_API_SECRET);
  if (!hmacValid) {
    console.error("[Vaahini] HMAC validation failed for OAuth callback.");
    return errorResponse("HMAC validation failed. Request may have been tampered with.", 403);
  }

  // ── 4. Validate state nonce (CSRF protection) ──────────────────────────────
  const storedNonce = await prisma.oAuthState.findUnique({
    where: { nonce: state },
  });

  if (!storedNonce) {
    console.error("[Vaahini] State nonce not found in database. Possible CSRF attack or expired nonce.");
    return errorResponse("State validation failed. Please restart the installation process.", 403);
  }

  // Clean up the used nonce
  await prisma.oAuthState.delete({ where: { nonce: state } }).catch(() => {});

  // ── 5. Exchange authorization code for access token ─────────────────────────
  const tokenUrl = `https://${shop}/admin/oauth/access_token`;

  let tokenResponse;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });
  } catch (err) {
    console.error("[Vaahini] Network error exchanging OAuth code:", err.message);
    return errorResponse("Failed to exchange authorization code (network error).", 500);
  }

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text().catch(() => "");
    console.error(`[Vaahini] Token exchange failed with status ${tokenResponse.status}:`, errorBody);
    return errorResponse(`Token exchange failed (HTTP ${tokenResponse.status}).`, 500);
  }

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    console.error("[Vaahini] Token exchange response missing access_token:", tokenData);
    return errorResponse("Token exchange response did not include an access token.", 500);
  }

  // ── 6. Persist token credentials ───────────────────────────────────────────
  const now = new Date();

  const upsertData = {
    accessToken: tokenData.access_token,
    scope: tokenData.scope || null,
    updatedAt: now,
  };

  // Store refresh token if returned (expiring token model)
  if (tokenData.refresh_token) {
    upsertData.refreshToken = tokenData.refresh_token;
  }

  // Store expiration timestamps if returned
  if (tokenData.expires_in) {
    upsertData.accessTokenExpiresAt = new Date(
      now.getTime() + tokenData.expires_in * 1000
    );
  }

  if (tokenData.refresh_token_expires_in) {
    upsertData.refreshTokenExpiresAt = new Date(
      now.getTime() + tokenData.refresh_token_expires_in * 1000
    );
  }

  await prisma.shopToken.upsert({
    where: { shopDomain: shop },
    create: {
      shopDomain: shop,
      ...upsertData,
      installedAt: now,
    },
    update: upsertData,
  });

  // ── 7. Return success page ─────────────────────────────────────────────────
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>App Installed — Vaahini</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0;
      background: #f6f6f7;
    }
    .card {
      background: #fff; border-radius: 12px; padding: 3rem 2rem;
      max-width: 460px; text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      border: 1px solid #eaeaea;
    }
    .check { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: #1a1a1a; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; font-size: 0.95rem; line-height: 1.5; }
    .shop { color: #137333; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✅</div>
    <h1>App Installed Successfully</h1>
    <p>The Vaahini Custom Discount Gateway has been authorized for <span class="shop">${shop}</span>.</p>
    <p style="margin-top: 1rem; font-size: 0.85rem; color: #999;">You can close this tab. The app is now ready to process discount requests.</p>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
};

export const action = async () => {
  return new Response("Method not allowed", { status: 405 });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifies the HMAC signature from Shopify's OAuth callback query parameters.
 * @param {URLSearchParams} params
 * @param {string} secret
 * @returns {boolean}
 */
function verifyHmac(params, secret) {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  // Build the message string: sorted params excluding 'hmac'
  const entries = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hmac") {
      entries.push([key, value]);
    }
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const message = entries.map(([k, v]) => `${k}=${v}`).join("&");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(hmac, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Returns a JSON error response.
 * @param {string} message
 * @param {number} status
 * @returns {Response}
 */
function errorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

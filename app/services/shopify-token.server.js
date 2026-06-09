import { prisma } from "../db.server";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL;

/** Buffer before expiry to trigger proactive refresh (5 minutes). */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Returns a valid Shopify Admin API access token for the configured single store.
 *
 * - Loads token record from DB
 * - If token is expiring and near expiry, refreshes it automatically
 * - If refresh fails, throws with an actionable reauthorization message
 * - If no token record exists, throws with the install URL
 *
 * @returns {Promise<string>} A valid access token
 * @throws {Error} With a message indicating reauthorization is needed
 */
export async function getValidShopifyAccessToken() {
  if (!SHOPIFY_STORE_DOMAIN) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN environment variable is not configured."
    );
  }

  const record = await prisma.shopToken.findUnique({
    where: { shopDomain: SHOPIFY_STORE_DOMAIN },
  });

  if (!record) {
    const installUrl = `${SHOPIFY_APP_URL || ""}/auth/install?shop=${SHOPIFY_STORE_DOMAIN}`;
    throw new Error(
      `No Shopify token found for ${SHOPIFY_STORE_DOMAIN}. ` +
        `Please authorize the app: ${installUrl}`
    );
  }

  // Non-expiring token — return as-is
  if (!record.accessTokenExpiresAt) {
    return record.accessToken;
  }

  const now = Date.now();
  const expiresAt = new Date(record.accessTokenExpiresAt).getTime();

  // Token still valid (with buffer) — return as-is
  if (expiresAt - now > REFRESH_BUFFER_MS) {
    return record.accessToken;
  }

  // Token expired or near expiry — attempt refresh

  if (!record.refreshToken) {
    const installUrl = `${SHOPIFY_APP_URL || ""}/auth/install?shop=${SHOPIFY_STORE_DOMAIN}`;
    throw new Error(
      `Access token expired and no refresh token available for ${SHOPIFY_STORE_DOMAIN}. ` +
        `Please reauthorize the app: ${installUrl}`
    );
  }

  return await refreshAndPersistToken(record);
}

/**
 * Refreshes the access token using the stored refresh token,
 * persists the rotated credentials, and returns the new access token.
 *
 * @param {object} record - The current ShopToken record from DB
 * @returns {Promise<string>} The new access token
 * @throws {Error} If refresh fails
 */
async function refreshAndPersistToken(record) {
  const tokenUrl = `https://${record.shopDomain}/admin/oauth/access_token`;

  let response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: record.refreshToken,
      }),
    });
  } catch (err) {
    console.error("[Vaahini] Network error during token refresh:", err.message);
    const installUrl = `${SHOPIFY_APP_URL || ""}/auth/install?shop=${record.shopDomain}`;
    throw new Error(
      `Failed to refresh Shopify token (network error). Please reauthorize: ${installUrl}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(
      `[Vaahini] Token refresh failed with status ${response.status}:`,
      errorBody
    );
    const installUrl = `${SHOPIFY_APP_URL || ""}/auth/install?shop=${record.shopDomain}`;
    throw new Error(
      `Failed to refresh Shopify token (HTTP ${response.status}). ` +
        `Please reauthorize: ${installUrl}`
    );
  }

  const data = await response.json();
  const now = new Date();

  const updateData = {
    accessToken: data.access_token,
    updatedAt: now,
  };

  // Persist new refresh token if returned (token rotation)
  if (data.refresh_token) {
    updateData.refreshToken = data.refresh_token;
  }

  // Persist new expiration times if returned
  if (data.expires_in) {
    updateData.accessTokenExpiresAt = new Date(
      now.getTime() + data.expires_in * 1000
    );
  }

  if (data.refresh_token_expires_in) {
    updateData.refreshTokenExpiresAt = new Date(
      now.getTime() + data.refresh_token_expires_in * 1000
    );
  }

  await prisma.shopToken.update({
    where: { shopDomain: record.shopDomain },
    data: updateData,
  });

  return data.access_token;
}

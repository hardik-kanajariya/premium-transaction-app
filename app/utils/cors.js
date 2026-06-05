/**
 * Helper to generate CORS headers based on the request origin.
 * @param {Request} request 
 * @returns {Record<string, string>}
 */
export function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Access-Token, Authorization",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Creates a CORS-enabled JSON Response.
 * @param {any} data 
 * @param {Request} request 
 * @param {ResponseInit} [init] 
 * @returns {Response}
 */
export function corsJsonResponse(data, request, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...getCorsHeaders(request),
    ...(init.headers || {}),
  };

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

/**
 * Checks and handles preflight OPTIONS request.
 * Returns a Response if it is a preflight request, otherwise null.
 * @param {Request} request 
 * @returns {Response|null}
 */
export function handlePreflight(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  return null;
}

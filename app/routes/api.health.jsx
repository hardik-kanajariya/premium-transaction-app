import { corsJsonResponse, handlePreflight } from "../utils/cors";

export const loader = async ({ request }) => {
  const preflightResponse = handlePreflight(request);
  if (preflightResponse) return preflightResponse;

  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const shopifyTokenConfigured = !!token;

  let apiConnectivityHealthy = false;
  let shopName = null;
  let shopDomain = null;
  let errorMsg = null;

  if (shopifyTokenConfigured) {
    try {
      // Perform a lightweight GraphQL test query to check token validity and connection
      const shopQuery = `
        query {
          shop {
            name
            myshopifyDomain
          }
        }
      `;

      // Default to dev store hostname, or fallback
      const testShop = "vaahini-dev.myshopify.com";
      const graphQLUrl = `https://${testShop}/admin/api/2026-07/graphql.json`;

      const response = await fetch(graphQLUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        },
        body: JSON.stringify({ query: shopQuery })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.shop) {
          apiConnectivityHealthy = true;
          shopName = result.data.shop.name;
          shopDomain = result.data.shop.myshopifyDomain;
        } else if (result.errors) {
          errorMsg = JSON.stringify(result.errors);
        }
      } else {
        errorMsg = `Shopify API responded with status ${response.status}`;
      }
    } catch (err) {
      errorMsg = err.message;
    }
  } else {
    errorMsg = "SHOPIFY_ADMIN_API_ACCESS_TOKEN env variable is missing.";
  }

  const overallHealthy = shopifyTokenConfigured && apiConnectivityHealthy;

  return corsJsonResponse({
    status: overallHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    mode: "serverless-databaseless",
    services: {
      shopifyToken: {
        configured: shopifyTokenConfigured,
        healthy: apiConnectivityHealthy,
        error: errorMsg,
        shop: {
          name: shopName,
          domain: shopDomain
        }
      }
    }
  }, request);
};

export const action = async () => {
  return new Response("Method not allowed", { status: 405 });
};

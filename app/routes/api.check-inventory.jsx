import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "vaahini-dev.myshopify.com";

  try {
    const authSession = await unauthenticated.admin(shop);
    const admin = authSession.admin;

    const response = await admin.graphql(`#graphql
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                    inventoryItem {
                      tracked
                      inventoryLevels(first: 5) {
                        edges {
                          node {
                            quantities(names: ["available", "on_hand"]) {
                              name
                              quantity
                            }
                            location {
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const json = await response.json();
    return new Response(JSON.stringify(json, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

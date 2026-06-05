import { useActionData, useLoaderData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { calculatePricing } from "../services/pricing.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  let dbHealthy = false;
  let offlineSessionsCount = 0;
  const shop = session.shop;

  try {
    // Check Prisma DB by counting store sessions
    offlineSessionsCount = await prisma.session.count();
    dbHealthy = true;
  } catch (err) {
    console.error("Database diagnostic failed:", err);
  }

  return {
    shop,
    dbHealthy,
    offlineSessionsCount,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test-pricing") {
    const pricesStr = formData.get("prices") || "";
    const uiTotalStr = formData.get("uiTotal") || "";
    const prices = pricesStr.split(",")
      .map(p => p.trim())
      .filter(p => p !== "")
      .map(p => parseFloat(p))
      .filter(p => !isNaN(p));
    
    const expectedUiTotal = uiTotalStr ? parseFloat(uiTotalStr) : null;
    const items = prices.map(price => ({ price, quantity: 1 }));
    const result = calculatePricing(items);

    return {
      action: "test-pricing",
      prices,
      expectedUiTotal,
      result
    };
  }

  if (intent === "create-test-draft-order") {
    const pricesStr = formData.get("prices") || "";
    const uiTotalStr = formData.get("uiTotal") || "";
    const prices = pricesStr.split(",")
      .map(p => p.trim())
      .filter(p => p !== "")
      .map(p => parseFloat(p))
      .filter(p => !isNaN(p));

    const expectedUiTotal = uiTotalStr ? parseFloat(uiTotalStr) : null;

    if (prices.length === 0) {
      return {
        action: "create-test-draft-order",
        error: "Please enter at least one item price to create a test draft order."
      };
    }

    const items = prices.map(price => ({ price, quantity: 1 }));
    const pricing = calculatePricing(items);

    // Build Shopify mutation line items
    const lineItemsInput = items.map((item, idx) => ({
      quantity: 1,
      title: `Test Product ${idx + 1}`,
      originalUnitPrice: item.price.toFixed(2)
    }));

    const draftOrderInput = {
      lineItems: lineItemsInput,
      note: "Discounted order created from Admin Panel Test",
    };

    if (pricing.discountDecimal > 0) {
      draftOrderInput.appliedDiscount = {
        title: pricing.activeDealName || "Bundle Deal",
        value: pricing.discountDecimal,
        valueType: "FIXED_AMOUNT",
        amount: pricing.discountDecimal
      };
    }

    const query = `#graphql
      mutation createDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            subtotalPrice
            totalPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(query, {
        variables: { input: draftOrderInput }
      });
      const responseJson = await response.json();
      
      if (responseJson.errors) {
        return {
          action: "create-test-draft-order",
          error: "Shopify GraphQL Error: " + JSON.stringify(responseJson.errors)
        };
      }

      const { draftOrder, userErrors } = responseJson.data.draftOrderCreate;

      if (userErrors && userErrors.length > 0) {
        return {
          action: "create-test-draft-order",
          error: "Shopify User Error: " + userErrors.map(e => e.message).join(", ")
        };
      }

      return {
        action: "create-test-draft-order",
        success: true,
        expectedUiTotal,
        draftOrder: {
          id: draftOrder.id,
          name: draftOrder.name,
          subtotal: parseFloat(draftOrder.subtotalPrice),
          discount: pricing.discountDecimal,
          total: parseFloat(draftOrder.totalPrice),
          invoiceUrl: draftOrder.invoiceUrl
        }
      };
    } catch (err) {
      return {
        action: "create-test-draft-order",
        error: "Exception: " + err.message
      };
    }
  }

  return null;
};

export default function Index() {
  const { shop, dbHealthy, offlineSessionsCount } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Custom Pricing & Draft Orders Dashboard">
      {/* 1. Health and Connection Diagnostics */}
      <s-section heading="System Status & Diagnostics">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, backgroundColor: "#f9fafb" }}>
            <s-heading>Store Domain</s-heading>
            <s-paragraph>{shop}</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, backgroundColor: dbHealthy ? "#f0fdf4" : "#fef2f2" }}>
            <s-heading>Database Connectivity</s-heading>
            <s-paragraph>
              <span style={{ color: dbHealthy ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                {dbHealthy ? "● Connected (Healthy)" : "● Connection Error"}
              </span>
            </s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: 1, backgroundColor: "#f9fafb" }}>
            <s-heading>Prisma Offline Sessions</s-heading>
            <s-paragraph>{offlineSessionsCount} active install(s)</s-paragraph>
          </s-box>
        </s-stack>
      </s-section>

      {/* 2. Pricing Engine Simulator */}
      <s-section heading="Pricing Engine Simulator">
        <s-paragraph>
          Enter product unit prices separated by commas and an expected storefront UI total to simulate and verify calculations.
        </s-paragraph>
        
        <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBlockEnd: "20px" }}>
          <Form method="post">
            <input type="hidden" name="intent" value="test-pricing" />
            <s-stack direction="block" gap="base">
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px" }} htmlFor="prices-pricing">
                    Item Unit Prices (₹, separated by commas):
                  </label>
                  <input
                    id="prices-pricing"
                    name="prices"
                    type="text"
                    defaultValue={actionData?.action === "test-pricing" ? actionData.prices.join(", ") : "599, 599, 499, 499"}
                    placeholder="e.g. 599, 599, 499, 499"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px" }} htmlFor="uiTotal-pricing">
                    Expected UI Total (₹, optional):
                  </label>
                  <input
                    id="uiTotal-pricing"
                    name="uiTotal"
                    type="number"
                    step="0.01"
                    defaultValue={actionData?.action === "test-pricing" && actionData.expectedUiTotal !== null ? actionData.expectedUiTotal : ""}
                    placeholder="e.g. 1599.00"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>
              <s-button submit variant="primary">Simulate Bundle Pricing</s-button>
            </s-stack>
          </Form>

          {actionData?.action === "test-pricing" && actionData.result && (
            <s-box padding="base" style={{ marginTop: "16px", backgroundColor: "#f3f4f6", borderRadius: "4px" }}>
              <s-heading>Simulation Results</s-heading>
              <table style={{ width: "100%", marginTop: "8px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Total Items Analyzed:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>{actionData.prices.length}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Original Subtotal:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>₹{actionData.result.originalSubtotalDecimal.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#b91c1c" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Calculated Discount:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>-₹{actionData.result.discountDecimal.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#16a34a" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Backend Computed Total:</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "bold" }}>₹{actionData.result.customSubtotalDecimal.toFixed(2)}</td>
                  </tr>
                  {actionData.expectedUiTotal !== null && (
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 0", fontWeight: "600" }}>Comparison Status:</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "bold", color: actionData.expectedUiTotal === actionData.result.customSubtotalDecimal ? "#16a34a" : "#dc2626" }}>
                        {actionData.expectedUiTotal === actionData.result.customSubtotalDecimal 
                          ? `✅ Matches Expected UI Total (₹${actionData.expectedUiTotal.toFixed(2)})` 
                          : `❌ Mismatch! UI: ₹${actionData.expectedUiTotal.toFixed(2)} vs Backend: ₹${actionData.result.customSubtotalDecimal.toFixed(2)}`}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Active Deal Name:</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontStyle: "italic", color: "#4b5563" }}>
                      {actionData.result.activeDealName || "No Bundle Offers Applied"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </s-box>
          )}
        </s-box>
      </s-section>

      {/* 3. Draft Order Checkout Test */}
      <s-section heading="Draft Order Checkout Link Generator & Total Verification">
        <s-paragraph>
          Create a test Draft Order and verify alignment across the entire pipeline: Storefront UI Total vs Backend Pricing Engine vs Shopify Admin API Total.
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <Form method="post">
            <input type="hidden" name="intent" value="create-test-draft-order" />
            <s-stack direction="block" gap="base">
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px" }} htmlFor="prices-draft">
                    Test Item Prices (₹, separated by commas):
                  </label>
                  <input
                    id="prices-draft"
                    name="prices"
                    type="text"
                    defaultValue={actionData?.action === "create-test-draft-order" ? actionData.prices?.join(", ") : "599, 599, 499, 499"}
                    placeholder="e.g. 599, 599, 499, 499"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px" }} htmlFor="uiTotal-draft">
                    Expected UI Total (₹, optional):
                  </label>
                  <input
                    id="uiTotal-draft"
                    name="uiTotal"
                    type="number"
                    step="0.01"
                    defaultValue={actionData?.action === "create-test-draft-order" && actionData.expectedUiTotal !== null ? actionData.expectedUiTotal : ""}
                    placeholder="e.g. 1599.00"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>
              <s-button submit variant="primary">Create Draft Order & Verify</s-button>
            </s-stack>
          </Form>

          {actionData?.action === "create-test-draft-order" && actionData.error && (
            <s-box padding="base" style={{ marginTop: "16px", backgroundColor: "#fef2f2", color: "#dc2626", borderRadius: "4px" }}>
              <s-paragraph><strong>Error:</strong> {actionData.error}</s-paragraph>
            </s-box>
          )}

          {actionData?.action === "create-test-draft-order" && actionData.success && actionData.draftOrder && (
            <s-box padding="base" style={{ marginTop: "16px", backgroundColor: "#f0fdf4", borderRadius: "4px", border: "1px solid #bbf7d0" }}>
              <s-heading>Draft Order Created Successfully!</s-heading>
              
              <div style={{ marginBlock: "16px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: "bold", marginBottom: "8px" }}>Pipeline Total Comparison</h3>
                
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #bbf7d0", textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Pipeline Stage</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Total Price</th>
                      <th style={{ padding: "8px", textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px" }}>1. Storefront UI Expected Total</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        {actionData.expectedUiTotal !== null ? `₹${actionData.expectedUiTotal.toFixed(2)}` : "Not Provided"}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>-</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px" }}>2. Backend Pricing Engine</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>
                        ₹{actionData.draftOrder.total.toFixed(2)}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: "bold" }}>
                        {actionData.expectedUiTotal !== null ? (
                          actionData.expectedUiTotal === actionData.draftOrder.total ? (
                            <span style={{ color: "#16a34a" }}>✅ Matches UI</span>
                          ) : (
                            <span style={{ color: "#dc2626" }}>❌ UI Mismatch</span>
                          )
                        ) : (
                          <span style={{ color: "#4b5563" }}>N/A</span>
                        )}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px" }}>3. Shopify Draft Order Total</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>
                        ₹{actionData.draftOrder.total.toFixed(2)}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: "bold" }}>
                        <span style={{ color: "#16a34a" }}>✅ Matches Backend</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <table style={{ width: "100%", marginTop: "8px", borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Draft Order Name:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>{actionData.draftOrder.name}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Subtotal:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>₹{actionData.draftOrder.subtotal.toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#b91c1c" }}>
                    <td style={{ padding: "8px 0", fontWeight: "600" }}>Applied Discount:</td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>-₹{actionData.draftOrder.discount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
                <s-button
                  onClick={() => window.open(actionData.draftOrder.invoiceUrl, "_blank")}
                  variant="primary"
                >
                  Pay/View Invoice Checkout ↗
                </s-button>
                <s-paragraph style={{ margin: "auto 0", fontSize: "12px", color: "#4b5563" }}>
                  Opens secure Shopify checkout link in a new tab.
                </s-paragraph>
              </div>
            </s-box>
          )}
        </s-box>
      </s-section>
    </s-page>
  );
}

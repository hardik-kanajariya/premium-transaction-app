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
    offlineSessionsCount = await prisma.session.count();
    dbHealthy = true;
  } catch (err) {
    console.error("Database diagnostic failed:", err);
  }

  // Fetch recent draft orders for audit trail
  let recentDraftOrders = [];
  try {
    const draftOrdersResponse = await admin.graphql(`#graphql
      query {
        draftOrders(first: 5, reverse: true, query: "status:open") {
          edges {
            node {
              id
              name
              createdAt
              subtotalPrice
              totalPrice
              invoiceUrl
              status
            }
          }
        }
      }
    `);
    const draftOrdersJson = await draftOrdersResponse.json();
    recentDraftOrders = (draftOrdersJson.data?.draftOrders?.edges || []).map(
      (e) => ({
        id: e.node.id,
        name: e.node.name,
        createdAt: e.node.createdAt,
        subtotal: parseFloat(e.node.subtotalPrice) || 0,
        total: parseFloat(e.node.totalPrice) || 0,
        invoiceUrl: e.node.invoiceUrl,
        status: e.node.status,
      }),
    );
  } catch (err) {
    console.error("Failed to fetch recent draft orders:", err);
  }

  return {
    shop,
    dbHealthy,
    offlineSessionsCount,
    recentDraftOrders,
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
    const prices = pricesStr
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .map((p) => parseFloat(p))
      .filter((p) => !isNaN(p));

    const expectedUiTotal = uiTotalStr ? parseFloat(uiTotalStr) : null;
    const items = prices.map((price) => ({ price, quantity: 1 }));
    const result = calculatePricing(items);

    return {
      action: "test-pricing",
      prices,
      expectedUiTotal,
      result,
    };
  }

  if (intent === "create-test-draft-order") {
    const pricesStr = formData.get("prices") || "";
    const uiTotalStr = formData.get("uiTotal") || "";
    const prices = pricesStr
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .map((p) => parseFloat(p))
      .filter((p) => !isNaN(p));

    const expectedUiTotal = uiTotalStr ? parseFloat(uiTotalStr) : null;

    if (prices.length === 0) {
      return {
        action: "create-test-draft-order",
        error:
          "Please enter at least one item price to create a test draft order.",
      };
    }

    const items = prices.map((price) => ({ price, quantity: 1 }));
    const pricing = calculatePricing(items);

    // Build Shopify mutation line items
    const lineItemsInput = items.map((item, idx) => ({
      quantity: 1,
      title: `Test Product ${idx + 1}`,
      originalUnitPrice: item.price.toFixed(2),
    }));

    const draftOrderInput = {
      lineItems: lineItemsInput,
      note: "Discounted order created from Admin Panel Test",
    };

    if (pricing.discountAmount > 0) {
      draftOrderInput.appliedDiscount = {
        title: pricing.pricingBreakdown.activeDealName || "Bundle Deal",
        description: `Admin test: ${pricing.pricingBreakdown.activeDealName || "Custom discount"}`,
        value: pricing.discountAmount,
        valueType: "FIXED_AMOUNT",
        amount: pricing.discountAmount.toFixed(2),
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
        variables: { input: draftOrderInput },
      });
      const responseJson = await response.json();

      if (responseJson.errors) {
        return {
          action: "create-test-draft-order",
          error:
            "Shopify GraphQL Error: " + JSON.stringify(responseJson.errors),
        };
      }

      const { draftOrder, userErrors } = responseJson.data.draftOrderCreate;

      if (userErrors && userErrors.length > 0) {
        return {
          action: "create-test-draft-order",
          error:
            "Shopify User Error: " + userErrors.map((e) => e.message).join(", "),
        };
      }

      return {
        action: "create-test-draft-order",
        success: true,
        expectedUiTotal,
        pricing: {
          subtotal: pricing.subtotal,
          discountAmount: pricing.discountAmount,
          finalTotal: pricing.finalTotal,
          activeDealName: pricing.pricingBreakdown.activeDealName,
        },
        draftOrder: {
          id: draftOrder.id,
          name: draftOrder.name,
          subtotal: parseFloat(draftOrder.subtotalPrice),
          discount: pricing.discountAmount,
          total: parseFloat(draftOrder.totalPrice),
          invoiceUrl: draftOrder.invoiceUrl,
        },
      };
    } catch (err) {
      return {
        action: "create-test-draft-order",
        error: "Exception: " + err.message,
      };
    }
  }

  return null;
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  statusCard: {
    padding: "16px",
    borderRadius: "10px",
    border: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  statusLabel: {
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6b7280",
    marginBottom: "6px",
  },
  statusValue: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#111827",
  },
  sectionCard: {
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    marginBottom: "16px",
  },
  sectionTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "4px",
  },
  sectionDesc: {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "16px",
  },
  inputRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "12px",
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    color: "#374151",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  },
  resultsBox: {
    marginTop: "16px",
    padding: "16px",
    borderRadius: "10px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
  },
  errorBox: {
    marginTop: "16px",
    padding: "16px",
    borderRadius: "10px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    fontSize: "13px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontWeight: "600",
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    fontSize: "12px",
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #f3f4f6",
    color: "#374151",
  },
  tdRight: {
    padding: "8px 12px",
    borderBottom: "1px solid #f3f4f6",
    color: "#374151",
    textAlign: "right",
  },
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "9999px",
    fontSize: "11px",
    fontWeight: "600",
  },
  badgeGreen: {
    background: "#dcfce7",
    color: "#166534",
  },
  badgeRed: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  badgeGray: {
    background: "#f3f4f6",
    color: "#4b5563",
  },
  dealBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    background: "linear-gradient(135deg, #fef3c7, #fde68a)",
    color: "#92400e",
    border: "1px solid #fbbf24",
  },
  linkButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#ffffff",
    background: "#2563eb",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
  },
  draftOrderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #f3f4f6",
    fontSize: "13px",
  },
};

export default function Dashboard() {
  const { shop, dbHealthy, offlineSessionsCount, recentDraftOrders } =
    useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Premium Transaction Dashboard" style={styles.page}>
      {/* ──── 1. System Status ──────────────────────────────────────────── */}
      <s-section heading="System Status">
        <div style={styles.statusGrid}>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>Store</div>
            <div style={styles.statusValue}>{shop}</div>
          </div>
          <div
            style={{
              ...styles.statusCard,
              borderColor: dbHealthy ? "#86efac" : "#fca5a5",
              background: dbHealthy ? "#f0fdf4" : "#fef2f2",
            }}
          >
            <div style={styles.statusLabel}>Database</div>
            <div style={styles.statusValue}>
              <span
                style={{
                  ...styles.badge,
                  ...(dbHealthy ? styles.badgeGreen : styles.badgeRed),
                }}
              >
                {dbHealthy ? "● Healthy" : "● Error"}
              </span>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>Sessions</div>
            <div style={styles.statusValue}>
              {offlineSessionsCount} active
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>Active Rules</div>
            <div style={styles.statusValue}>
              <span style={styles.dealBadge}>3 Bundle Tiers</span>
            </div>
          </div>
        </div>
      </s-section>

      {/* ──── 2. Pricing Engine Simulator ───────────────────────────────── */}
      <s-section heading="Pricing Engine Simulator">
        <div style={styles.sectionCard}>
          <div style={styles.sectionTitle}>Test Bundle Pricing</div>
          <div style={styles.sectionDesc}>
            Enter item prices (₹) separated by commas. Each price is treated as
            one unit. The engine will calculate bundle discounts per the spec.
          </div>

          <Form method="post">
            <input type="hidden" name="intent" value="test-pricing" />
            <div style={styles.inputRow}>
              <div style={{ ...styles.inputGroup, flex: 2 }}>
                <label style={styles.inputLabel} htmlFor="prices-pricing">
                  Item Unit Prices (₹)
                </label>
                <input
                  id="prices-pricing"
                  name="prices"
                  type="text"
                  defaultValue={
                    actionData?.action === "test-pricing"
                      ? actionData.prices.join(", ")
                      : "849, 849, 849, 849"
                  }
                  placeholder="e.g. 849, 849, 849, 849"
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel} htmlFor="uiTotal-pricing">
                  Expected Total (₹, optional)
                </label>
                <input
                  id="uiTotal-pricing"
                  name="uiTotal"
                  type="number"
                  step="0.01"
                  defaultValue={
                    actionData?.action === "test-pricing" &&
                    actionData.expectedUiTotal !== null
                      ? actionData.expectedUiTotal
                      : ""
                  }
                  placeholder="e.g. 1599.00"
                  style={styles.input}
                />
              </div>
            </div>
            <s-button submit variant="primary">
              Simulate Bundle Pricing
            </s-button>
          </Form>

          {/* Simulation Results */}
          {actionData?.action === "test-pricing" && actionData.result && (
            <div style={styles.resultsBox}>
              <div
                style={{
                  ...styles.sectionTitle,
                  marginBottom: "12px",
                  color: "#166534",
                }}
              >
                Simulation Results
              </div>

              {/* Summary table */}
              <table style={styles.table}>
                <tbody>
                  <tr>
                    <td style={{ ...styles.td, fontWeight: "600" }}>
                      Total Units
                    </td>
                    <td style={styles.tdRight}>{actionData.prices.length}</td>
                  </tr>
                  <tr>
                    <td style={{ ...styles.td, fontWeight: "600" }}>
                      Original Subtotal
                    </td>
                    <td style={styles.tdRight}>
                      ₹{actionData.result.subtotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        ...styles.td,
                        fontWeight: "600",
                        color: "#dc2626",
                      }}
                    >
                      Bundle Discount
                    </td>
                    <td style={{ ...styles.tdRight, color: "#dc2626" }}>
                      -₹{actionData.result.discountAmount.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        ...styles.td,
                        fontWeight: "700",
                        color: "#166534",
                        fontSize: "14px",
                      }}
                    >
                      Final Total
                    </td>
                    <td
                      style={{
                        ...styles.tdRight,
                        fontWeight: "700",
                        color: "#166534",
                        fontSize: "14px",
                      }}
                    >
                      ₹{actionData.result.finalTotal.toFixed(2)}
                    </td>
                  </tr>
                  {actionData.expectedUiTotal !== null && (
                    <tr>
                      <td style={{ ...styles.td, fontWeight: "600" }}>
                        UI Match
                      </td>
                      <td style={styles.tdRight}>
                        {actionData.expectedUiTotal ===
                        actionData.result.finalTotal ? (
                          <span
                            style={{ ...styles.badge, ...styles.badgeGreen }}
                          >
                            ✅ Matches (₹
                            {actionData.expectedUiTotal.toFixed(2)})
                          </span>
                        ) : (
                          <span
                            style={{ ...styles.badge, ...styles.badgeRed }}
                          >
                            ❌ Mismatch: UI ₹
                            {actionData.expectedUiTotal.toFixed(2)} vs Backend ₹
                            {actionData.result.finalTotal.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ ...styles.td, fontWeight: "600" }}>
                      Active Deal
                    </td>
                    <td style={styles.tdRight}>
                      {actionData.result.pricingBreakdown.activeDealName ? (
                        <span style={styles.dealBadge}>
                          {actionData.result.pricingBreakdown.activeDealName}
                        </span>
                      ) : (
                        <span style={{ ...styles.badge, ...styles.badgeGray }}>
                          No discount
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Per-item breakdown */}
              {actionData.result.normalizedLines &&
                actionData.result.normalizedLines.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#374151",
                        marginBottom: "8px",
                      }}
                    >
                      Per-Item Discount Allocation
                    </div>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>#</th>
                          <th style={styles.th}>Unit Price</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>
                            Qty
                          </th>
                          <th style={{ ...styles.th, textAlign: "right" }}>
                            Subtotal
                          </th>
                          <th style={{ ...styles.th, textAlign: "right" }}>
                            Discount
                          </th>
                          <th style={{ ...styles.th, textAlign: "right" }}>
                            Line Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {actionData.result.normalizedLines.map((line, idx) => (
                          <tr key={idx}>
                            <td style={styles.td}>{idx + 1}</td>
                            <td style={styles.td}>₹{line.price.toFixed(2)}</td>
                            <td style={styles.tdRight}>{line.quantity}</td>
                            <td style={styles.tdRight}>
                              ₹{line.subtotal.toFixed(2)}
                            </td>
                            <td
                              style={{
                                ...styles.tdRight,
                                color:
                                  line.discount > 0 ? "#dc2626" : "#9ca3af",
                              }}
                            >
                              {line.discount > 0
                                ? `-₹${line.discount.toFixed(2)}`
                                : "—"}
                            </td>
                            <td
                              style={{ ...styles.tdRight, fontWeight: "600" }}
                            >
                              ₹{line.total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          )}
        </div>
      </s-section>

      {/* ──── 3. Draft Order Creator & Verifier ─────────────────────────── */}
      <s-section heading="Draft Order Creator">
        <div style={styles.sectionCard}>
          <div style={styles.sectionTitle}>Create & Verify Draft Order</div>
          <div style={styles.sectionDesc}>
            Create a real Shopify Draft Order with bundle discounts applied.
            Verify the total matches across: Theme UI → Backend Engine → Shopify
            API.
          </div>

          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="create-test-draft-order"
            />
            <div style={styles.inputRow}>
              <div style={{ ...styles.inputGroup, flex: 2 }}>
                <label style={styles.inputLabel} htmlFor="prices-draft">
                  Item Prices (₹, comma-separated)
                </label>
                <input
                  id="prices-draft"
                  name="prices"
                  type="text"
                  defaultValue={
                    actionData?.action === "create-test-draft-order"
                      ? actionData.prices?.join(", ")
                      : "849, 849, 849, 849"
                  }
                  placeholder="e.g. 849, 849, 849, 849"
                  style={styles.input}
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel} htmlFor="uiTotal-draft">
                  Expected UI Total (₹, optional)
                </label>
                <input
                  id="uiTotal-draft"
                  name="uiTotal"
                  type="number"
                  step="0.01"
                  defaultValue={
                    actionData?.action === "create-test-draft-order" &&
                    actionData.expectedUiTotal !== null
                      ? actionData.expectedUiTotal
                      : ""
                  }
                  placeholder="e.g. 1599.00"
                  style={styles.input}
                />
              </div>
            </div>
            <s-button submit variant="primary">
              Create Draft Order & Verify
            </s-button>
          </Form>

          {/* Error */}
          {actionData?.action === "create-test-draft-order" &&
            actionData.error && (
              <div style={styles.errorBox}>
                <strong>Error:</strong> {actionData.error}
              </div>
            )}

          {/* Success */}
          {actionData?.action === "create-test-draft-order" &&
            actionData.success &&
            actionData.draftOrder && (
              <div style={styles.resultsBox}>
                <div
                  style={{
                    ...styles.sectionTitle,
                    color: "#166534",
                    marginBottom: "12px",
                  }}
                >
                  ✅ Draft Order Created — {actionData.draftOrder.name}
                </div>

                {/* Pipeline comparison table */}
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Pipeline Stage</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>
                        Total
                      </th>
                      <th style={{ ...styles.th, textAlign: "center" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={styles.td}>1. Storefront UI Expected</td>
                      <td style={styles.tdRight}>
                        {actionData.expectedUiTotal !== null
                          ? `₹${actionData.expectedUiTotal.toFixed(2)}`
                          : "—"}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <span style={{ ...styles.badge, ...styles.badgeGray }}>
                          Reference
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.td}>2. Backend Pricing Engine</td>
                      <td style={{ ...styles.tdRight, fontWeight: "600" }}>
                        ₹{actionData.pricing.finalTotal.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        {actionData.expectedUiTotal !== null ? (
                          actionData.expectedUiTotal ===
                          actionData.pricing.finalTotal ? (
                            <span
                              style={{
                                ...styles.badge,
                                ...styles.badgeGreen,
                              }}
                            >
                              ✅ Matches UI
                            </span>
                          ) : (
                            <span
                              style={{ ...styles.badge, ...styles.badgeRed }}
                            >
                              ❌ Mismatch
                            </span>
                          )
                        ) : (
                          <span
                            style={{ ...styles.badge, ...styles.badgeGray }}
                          >
                            N/A
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={styles.td}>3. Shopify Draft Order</td>
                      <td style={{ ...styles.tdRight, fontWeight: "600" }}>
                        ₹{actionData.draftOrder.total.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        {actionData.pricing.finalTotal ===
                        actionData.draftOrder.total ? (
                          <span
                            style={{ ...styles.badge, ...styles.badgeGreen }}
                          >
                            ✅ Matches Backend
                          </span>
                        ) : (
                          <span
                            style={{ ...styles.badge, ...styles.badgeRed }}
                          >
                            ❌ Mismatch
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Details */}
                <div
                  style={{
                    marginTop: "12px",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <span style={{ color: "#6b7280" }}>Subtotal: </span>
                    <strong>₹{actionData.draftOrder.subtotal.toFixed(2)}</strong>
                  </div>
                  <div style={{ color: "#dc2626" }}>
                    <span>Discount: </span>
                    <strong>
                      -₹{actionData.draftOrder.discount.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    {actionData.pricing.activeDealName && (
                      <span style={styles.dealBadge}>
                        {actionData.pricing.activeDealName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Invoice link */}
                <div style={{ marginTop: "16px" }}>
                  <button
                    onClick={() =>
                      window.open(actionData.draftOrder.invoiceUrl, "_blank")
                    }
                    style={styles.linkButton}
                  >
                    Open Invoice Checkout ↗
                  </button>
                  <span
                    style={{
                      marginLeft: "12px",
                      fontSize: "11px",
                      color: "#6b7280",
                    }}
                  >
                    Razorpay should see ₹
                    {actionData.draftOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
        </div>
      </s-section>

      {/* ──── 4. Recent Draft Orders ────────────────────────────────────── */}
      <s-section heading="Recent Draft Orders">
        <div style={styles.sectionCard}>
          {recentDraftOrders.length === 0 ? (
            <div
              style={{ fontSize: "13px", color: "#6b7280", padding: "12px 0" }}
            >
              No open draft orders found.
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Order</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Subtotal</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Total</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>
                    Discount
                  </th>
                  <th style={{ ...styles.th, textAlign: "center" }}>Status</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentDraftOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={styles.td}>
                      <strong>{order.name}</strong>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#9ca3af",
                          marginTop: "2px",
                        }}
                      >
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td style={styles.tdRight}>
                      ₹{order.subtotal.toFixed(2)}
                    </td>
                    <td style={{ ...styles.tdRight, fontWeight: "600" }}>
                      ₹{order.total.toFixed(2)}
                    </td>
                    <td style={{ ...styles.tdRight, color: "#dc2626" }}>
                      {order.subtotal > order.total
                        ? `-₹${(order.subtotal - order.total).toFixed(2)}`
                        : "—"}
                    </td>
                    <td style={{ ...styles.td, textAlign: "center" }}>
                      <span style={{ ...styles.badge, ...styles.badgeGreen }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {order.invoiceUrl && (
                        <button
                          onClick={() =>
                            window.open(order.invoiceUrl, "_blank")
                          }
                          style={{
                            ...styles.linkButton,
                            fontSize: "11px",
                            padding: "4px 10px",
                          }}
                        >
                          Invoice ↗
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </s-section>
    </s-page>
  );
}

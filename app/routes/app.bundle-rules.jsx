import { useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import { calculatePricing } from "../services/pricing.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "simulate") {
    const unitPrice = parseFloat(formData.get("unitPrice") || "600");
    const quantity = parseInt(formData.get("quantity") || "4", 10);

    if (isNaN(unitPrice) || unitPrice <= 0 || isNaN(quantity) || quantity <= 0) {
      return { error: "Please enter valid unit price and quantity." };
    }

    const items = [{ price: unitPrice, quantity }];
    const result = calculatePricing(items);

    return {
      intent: "simulate",
      unitPrice,
      quantity,
      result,
    };
  }

  return null;
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  card: {
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    marginBottom: "16px",
  },
  title: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#111827",
    marginBottom: "4px",
  },
  desc: {
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "16px",
    lineHeight: "1.5",
  },
  tierCard: {
    padding: "16px",
    borderRadius: "10px",
    border: "1px solid",
    marginBottom: "12px",
  },
  tierTitle: {
    fontSize: "14px",
    fontWeight: "700",
    marginBottom: "6px",
  },
  tierDesc: {
    fontSize: "12px",
    lineHeight: "1.5",
    marginBottom: "0",
  },
  tierBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: "700",
    marginRight: "8px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
    marginTop: "8px",
  },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: "600",
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    fontSize: "12px",
    background: "#f9fafb",
  },
  thRight: {
    padding: "10px 12px",
    textAlign: "right",
    fontWeight: "600",
    color: "#374151",
    borderBottom: "2px solid #e5e7eb",
    fontSize: "12px",
    background: "#f9fafb",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    color: "#374151",
  },
  tdRight: {
    padding: "10px 12px",
    borderBottom: "1px solid #f3f4f6",
    color: "#374151",
    textAlign: "right",
  },
  inputRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "12px",
    alignItems: "flex-end",
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
  algorithmStep: {
    padding: "10px 16px",
    borderRadius: "8px",
    background: "#f3f4f6",
    marginBottom: "8px",
    fontSize: "13px",
    lineHeight: "1.5",
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
  },
  stepNumber: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "#2563eb",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: "700",
    flexShrink: 0,
    marginTop: "1px",
  },
};

// ─── Spec reference table data ───────────────────────────────────────────────
const specExamples = [
  {
    qty: 1,
    tier: "Full Price",
    calc: "1 × 600",
    subtotal: 600,
    total: 600,
    savings: 0,
    deal: "No discount",
  },
  {
    qty: 2,
    tier: "B1G1",
    calc: "1 paid + 1 free",
    subtotal: 1200,
    total: 600,
    savings: 600,
    deal: "B1G1 — Bundle Deal",
  },
  {
    qty: 3,
    tier: "3 @ ₹1,299",
    calc: "Target: ₹1,299",
    subtotal: 1800,
    total: 1299,
    savings: 501,
    deal: "3@₹1,299 — Bundle Deal",
  },
  {
    qty: 4,
    tier: "1× 4 @ ₹1,599",
    calc: "Target: ₹1,599",
    subtotal: 2400,
    total: 1599,
    savings: 801,
    deal: "1x 4@₹1,599 — Bundle Deal",
  },
  {
    qty: 5,
    tier: "1× 4@₹1,599 + Full",
    calc: "1599 + 600",
    subtotal: 3000,
    total: 2199,
    savings: 801,
    deal: "1x 4@₹1,599 — Bundle Deal",
  },
  {
    qty: 6,
    tier: "1× 4@₹1,599 + B1G1",
    calc: "1599 + (1+1 free)",
    subtotal: 3600,
    total: 2199,
    savings: 1401,
    deal: "1x 4@₹1,599 + B1G1 — Bundle Deal",
  },
  {
    qty: 7,
    tier: "1× 4@₹1,599 + 3@₹1,299",
    calc: "1599 + 1299",
    subtotal: 4200,
    total: 2898,
    savings: 1302,
    deal: "1x 4@₹1,599 + 3@₹1,299 — Bundle Deal",
  },
  {
    qty: 8,
    tier: "2× 4@₹1,599",
    calc: "2 × 1599",
    subtotal: 4800,
    total: 3198,
    savings: 1602,
    deal: "2x 4@₹1,599 — Bundle Deal",
  },
  {
    qty: 9,
    tier: "2× 4@₹1,599 + Full",
    calc: "(2 × 1599) + 600",
    subtotal: 5400,
    total: 3798,
    savings: 1602,
    deal: "2x 4@₹1,599 — Bundle Deal",
  },
  {
    qty: 10,
    tier: "2× 4@₹1,599 + B1G1",
    calc: "(2 × 1599) + free",
    subtotal: 6000,
    total: 3798,
    savings: 2202,
    deal: "2x 4@₹1,599 + B1G1 — Bundle Deal",
  },
];

export default function BundleRulesPage() {
  const actionData = useActionData();

  return (
    <s-page heading="Bundle Pricing Rules">
      {/* ──── Algorithm Overview ────────────────────────────────────────── */}
      <s-section heading="Discount Algorithm">
        <div style={s.card}>
          <div style={s.title}>Mixed-Tier Bundle Strategy</div>
          <div style={s.desc}>
            The engine uses a mixed-tier strategy combining Groups of 4, Buy 3 @
            ₹1,299, and B1G1 promotions in a single cart. Items are pooled
            across all products — mix-and-match is supported.
          </div>

          <div style={s.algorithmStep}>
            <span style={s.stepNumber}>1</span>
            <div>
              <strong>Flatten</strong> — Extract each individual item from cart
              lines into single units (qty 2 → two separate units).
            </div>
          </div>
          <div style={s.algorithmStep}>
            <span style={s.stepNumber}>2</span>
            <div>
              <strong>Sort Ascending</strong> — Sort all units by price
              (cheapest first). This ensures high-value items go to the ₹1,599
              groups.
            </div>
          </div>
          <div style={s.algorithmStep}>
            <span style={s.stepNumber}>3</span>
            <div>
              <strong>Partition</strong> — G = ⌊N/4⌋ groups, R = N mod 4
              remainder. Cheapest R items → remainder tier. Most expensive 4×G
              items → group-of-4 tier.
            </div>
          </div>
          <div style={s.algorithmStep}>
            <span style={s.stepNumber}>4</span>
            <div>
              <strong>Calculate</strong> — Apply tier-specific discount, allocate
              pro-rata per item, reconcile rounding on the final item.
            </div>
          </div>
        </div>
      </s-section>

      {/* ──── Discount Tiers ───────────────────────────────────────────── */}
      <s-section heading="Active Discount Tiers">
        <div
          style={{
            ...s.tierCard,
            borderColor: "#86efac",
            background: "#f0fdf4",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                ...s.tierBadge,
                background: "#dcfce7",
                color: "#166534",
              }}
            >
              TIER 1
            </span>
            <span style={s.tierTitle}>Groups of 4 — ₹1,599 flat</span>
          </div>
          <p style={s.tierDesc}>
            Every group of 4 items is priced at a flat rate of ₹1,599.
            Discount is allocated proportionally across items based on their
            original price. Applied to the most expensive items first.
          </p>
        </div>

        <div
          style={{
            ...s.tierCard,
            borderColor: "#93c5fd",
            background: "#eff6ff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                ...s.tierBadge,
                background: "#dbeafe",
                color: "#1e40af",
              }}
            >
              TIER 2
            </span>
            <span style={s.tierTitle}>
              Remainder 3 — Buy 3 @ ₹1,299
            </span>
          </div>
          <p style={s.tierDesc}>
            When 3 items remain after grouping, they are priced at a combined
            rate of ₹1,299. Discount is allocated proportionally. Applied to
            the cheapest 3 items.
          </p>
        </div>

        <div
          style={{
            ...s.tierCard,
            borderColor: "#c4b5fd",
            background: "#f5f3ff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                ...s.tierBadge,
                background: "#ede9fe",
                color: "#5b21b6",
              }}
            >
              TIER 3
            </span>
            <span style={s.tierTitle}>Remainder 2 — Buy 1 Get 1 Free</span>
          </div>
          <p style={s.tierDesc}>
            When 2 items remain, the cheaper of the two is 100% free. The more
            expensive item is charged at full price. Applied to the cheapest 2
            items.
          </p>
        </div>

        <div
          style={{
            ...s.tierCard,
            borderColor: "#e5e7eb",
            background: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                ...s.tierBadge,
                background: "#f3f4f6",
                color: "#6b7280",
              }}
            >
              FALLBACK
            </span>
            <span style={s.tierTitle}>Remainder 1 — Full Price</span>
          </div>
          <p style={s.tierDesc}>
            A single remaining item is sold at full original price. No discount
            applied.
          </p>
        </div>
      </s-section>

      {/* ──── Reference Table (Spec Examples) ──────────────────────────── */}
      <s-section heading="Spec Reference Table">
        <div style={s.card}>
          <div style={s.title}>Expected Outputs (₹600/unit)</div>
          <div style={s.desc}>
            Reference table from the bundle engine spec. All values assume a
            single product variant priced at ₹600.00 each.
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Qty</th>
                  <th style={s.th}>Tier Layout</th>
                  <th style={s.thRight}>Subtotal</th>
                  <th style={s.thRight}>Total</th>
                  <th style={s.thRight}>Savings</th>
                  <th style={s.th}>Deal</th>
                </tr>
              </thead>
              <tbody>
                {specExamples.map((ex) => (
                  <tr key={ex.qty}>
                    <td style={{ ...s.td, fontWeight: "700" }}>{ex.qty}</td>
                    <td style={s.td}>{ex.tier}</td>
                    <td style={s.tdRight}>
                      ₹{ex.subtotal.toLocaleString("en-IN")}
                    </td>
                    <td style={{ ...s.tdRight, fontWeight: "600" }}>
                      ₹{ex.total.toLocaleString("en-IN")}
                    </td>
                    <td
                      style={{
                        ...s.tdRight,
                        color: ex.savings > 0 ? "#dc2626" : "#9ca3af",
                      }}
                    >
                      {ex.savings > 0
                        ? `-₹${ex.savings.toLocaleString("en-IN")}`
                        : "—"}
                    </td>
                    <td style={s.td}>
                      {ex.deal !== "No discount" ? (
                        <span style={s.dealBadge}>{ex.deal}</span>
                      ) : (
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#9ca3af",
                            fontStyle: "italic",
                          }}
                        >
                          {ex.deal}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </s-section>

      {/* ──── Interactive Simulator ─────────────────────────────────────── */}
      <s-section heading="Interactive Pricing Calculator">
        <div style={s.card}>
          <div style={s.title}>Simulate Bundle Pricing</div>
          <div style={s.desc}>
            Enter a unit price and quantity to calculate the bundle discount.
            Uses the same engine as the backend API and theme cart.
          </div>

          <Form method="post">
            <input type="hidden" name="intent" value="simulate" />
            <div style={s.inputRow}>
              <div style={s.inputGroup}>
                <label style={s.inputLabel} htmlFor="unitPrice">
                  Unit Price (₹)
                </label>
                <input
                  id="unitPrice"
                  name="unitPrice"
                  type="number"
                  step="0.01"
                  defaultValue={
                    actionData?.intent === "simulate"
                      ? actionData.unitPrice
                      : "849"
                  }
                  placeholder="e.g. 849"
                  style={s.input}
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.inputLabel} htmlFor="quantity">
                  Quantity
                </label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  max="50"
                  defaultValue={
                    actionData?.intent === "simulate"
                      ? actionData.quantity
                      : "4"
                  }
                  placeholder="e.g. 4"
                  style={s.input}
                />
              </div>
            </div>
            <s-button submit variant="primary">
              Calculate
            </s-button>
          </Form>

          {actionData?.error && (
            <div style={s.errorBox}>
              <strong>Error:</strong> {actionData.error}
            </div>
          )}

          {actionData?.intent === "simulate" && actionData.result && (
            <div style={s.resultsBox}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#6b7280",
                      textTransform: "uppercase",
                      fontWeight: "600",
                    }}
                  >
                    Original
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "700" }}>
                    ₹{actionData.result.subtotal.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#dc2626",
                      textTransform: "uppercase",
                      fontWeight: "600",
                    }}
                  >
                    Discount
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#dc2626",
                    }}
                  >
                    -₹{actionData.result.discountAmount.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#166534",
                      textTransform: "uppercase",
                      fontWeight: "600",
                    }}
                  >
                    Final Total
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#166534",
                    }}
                  >
                    ₹{actionData.result.finalTotal.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#6b7280",
                      textTransform: "uppercase",
                      fontWeight: "600",
                    }}
                  >
                    Deal
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {actionData.result.pricingBreakdown.activeDealName ? (
                      <span style={s.dealBadge}>
                        {actionData.result.pricingBreakdown.activeDealName}
                      </span>
                    ) : (
                      <span style={{ fontSize: "13px", color: "#9ca3af" }}>
                        No discount
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tier breakdown */}
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Tier</th>
                    <th style={s.thRight}>Groups</th>
                    <th style={s.thRight}>Target</th>
                    <th style={s.thRight}>Discount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={s.td}>Groups of 4 (₹1,599)</td>
                    <td style={s.tdRight}>
                      {actionData.result.pricingBreakdown.groupsOf4.count}
                    </td>
                    <td style={s.tdRight}>
                      ₹
                      {actionData.result.pricingBreakdown.groupsOf4.targetPrice.toFixed(
                        2,
                      )}
                    </td>
                    <td
                      style={{
                        ...s.tdRight,
                        color:
                          actionData.result.pricingBreakdown.groupsOf4
                            .discount > 0
                            ? "#dc2626"
                            : "#9ca3af",
                      }}
                    >
                      {actionData.result.pricingBreakdown.groupsOf4.discount > 0
                        ? `-₹${actionData.result.pricingBreakdown.groupsOf4.discount.toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td style={s.td}>Buy 3 @ ₹1,299</td>
                    <td style={s.tdRight}>
                      {actionData.result.pricingBreakdown.groupsOf3.count}
                    </td>
                    <td style={s.tdRight}>
                      ₹
                      {actionData.result.pricingBreakdown.groupsOf3.targetPrice.toFixed(
                        2,
                      )}
                    </td>
                    <td
                      style={{
                        ...s.tdRight,
                        color:
                          actionData.result.pricingBreakdown.groupsOf3
                            .discount > 0
                            ? "#dc2626"
                            : "#9ca3af",
                      }}
                    >
                      {actionData.result.pricingBreakdown.groupsOf3.discount > 0
                        ? `-₹${actionData.result.pricingBreakdown.groupsOf3.discount.toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td style={s.td}>B1G1 (Buy 1 Get 1 Free)</td>
                    <td style={s.tdRight}>
                      {actionData.result.pricingBreakdown.b1g1.count}
                    </td>
                    <td style={s.tdRight}>—</td>
                    <td
                      style={{
                        ...s.tdRight,
                        color:
                          actionData.result.pricingBreakdown.b1g1.discount > 0
                            ? "#dc2626"
                            : "#9ca3af",
                      }}
                    >
                      {actionData.result.pricingBreakdown.b1g1.discount > 0
                        ? `-₹${actionData.result.pricingBreakdown.b1g1.discount.toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </s-section>
    </s-page>
  );
}

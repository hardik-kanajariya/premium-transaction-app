import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
        draftOrders(first: 10, reverse: true, query: "status:open") {
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
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
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
};

export default function Dashboard() {
  const { shop, dbHealthy, offlineSessionsCount, recentDraftOrders } =
    useLoaderData();

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

      {/* ──── 2. Recent Draft Orders ────────────────────────────────────── */}
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

import { useLoaderData } from "react-router";

export const loader = async () => {
  const tokenConfigured = !!process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  const appUrl = process.env.SHOPIFY_APP_URL || "Not configured";

  return {
    tokenConfigured,
    appUrl,
  };
};

export const action = async () => {
  return null;
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "16px",
    marginTop: "16px",
  },
  statusCard: {
    padding: "20px",
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
    fontSize: "15px",
    fontWeight: "600",
    color: "#111827",
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
  infoPanel: {
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    marginTop: "20px",
    lineHeight: "1.6",
  },
  paragraph: {
    fontSize: "13px",
    color: "#4b5563",
    margin: "8px 0 0 0",
  }
};

export default function Dashboard() {
  const { tokenConfigured, appUrl } = useLoaderData();

  return (
    <s-page heading="Vaahini Discount App Dashboard" style={styles.page}>
      <s-section heading="System Status">
        <div style={styles.statusGrid}>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>Mode</div>
            <div style={styles.statusValue}>Serverless & Databaseless</div>
          </div>
          <div
            style={{
              ...styles.statusCard,
              borderColor: tokenConfigured ? "#86efac" : "#fca5a5",
              background: tokenConfigured ? "#f0fdf4" : "#fef2f2",
            }}
          >
            <div style={styles.statusLabel}>Shopify API Token</div>
            <div style={styles.statusValue}>
              <span
                style={{
                  ...styles.badge,
                  ...(tokenConfigured ? styles.badgeGreen : styles.badgeRed),
                }}
              >
                {tokenConfigured ? "● Configured" : "● Missing Token"}
              </span>
            </div>
          </div>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>App Host URL</div>
            <div style={styles.statusValue}>{appUrl}</div>
          </div>
          <div style={styles.statusCard}>
            <div style={styles.statusLabel}>Active Rules</div>
            <div style={styles.statusValue}>
              <span style={styles.dealBadge}>B1G1 + Groups of 3/4</span>
            </div>
          </div>
        </div>
      </s-section>

      <s-section heading="Integration Status">
        <div style={styles.infoPanel}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", color: "#111827", margin: 0 }}>
            Headless Discount Code Microservice
          </h3>
          <p style={styles.paragraph}>
            This application is running in stateless serverless mode. All dynamic discount calculations
            and single-use coupons are generated directly via Shopify's GraphQL API using the permanent Admin API access token.
          </p>
          <p style={styles.paragraph}>
            <strong>Storefront hook:</strong> The theme's cart template intercepts the checkout button and communicates directly with the <code>/api/discount</code> endpoint.
          </p>
        </div>
      </s-section>
    </s-page>
  );
}

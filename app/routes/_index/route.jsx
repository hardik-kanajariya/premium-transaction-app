import { useLoaderData } from "react-router";
import { prisma } from "../../db.server";

export const loader = async () => {
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  
  if (!shopDomain) {
    return {
      error: "SHOPIFY_STORE_DOMAIN is not configured in environment variables.",
      isConnected: false,
      shopDomain: null,
      shopToken: null,
      installUrl: null,
    };
  }

  const shopToken = await prisma.shopToken.findUnique({
    where: { shopDomain },
    select: {
      shopDomain: true,
      createdAt: true,
      updatedAt: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
    },
  });

  return {
    error: null,
    shopDomain,
    isConnected: !!shopToken,
    shopToken: shopToken
      ? {
          shopDomain: shopToken.shopDomain,
          createdAt: shopToken.createdAt.toISOString(),
          updatedAt: shopToken.updatedAt.toISOString(),
          accessTokenExpiresAt: shopToken.accessTokenExpiresAt
            ? shopToken.accessTokenExpiresAt.toISOString()
            : null,
          refreshTokenExpiresAt: shopToken.refreshTokenExpiresAt
            ? shopToken.refreshTokenExpiresAt.toISOString()
            : null,
        }
      : null,
    installUrl: `/auth/install?shop=${shopDomain}`,
  };
};

export default function App() {
  const { error, shopDomain, isConnected, shopToken, installUrl } = useLoaderData();

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      background: "radial-gradient(circle at top left, #121829, #0a0d16)",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "#f3f4f6",
      padding: "2rem 1rem",
      margin: 0,
      boxSizing: "border-box"
    }}>
      <div style={{
        maxWidth: "600px",
        width: "100%",
        backgroundColor: "rgba(17, 24, 39, 0.7)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "20px",
        padding: "2.5rem",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "2rem"
      }}>
        {/* Header Section */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            fontSize: "2.25rem",
            fontWeight: "800",
            letterSpacing: "-0.025em",
            background: "linear-gradient(to right, #6366f1, #3b82f6, #10b981)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: "0 0 0.5rem 0"
          }}>
            Vaahini Discount Gateway
          </h1>
          <p style={{
            fontSize: "1rem",
            color: "#9ca3af",
            margin: 0
          }}>
            Automated checkout discounts API engine
          </p>
        </div>

        {/* Configuration Error */}
        {error && (
          <div style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            color: "#fca5a5",
            fontSize: "0.95rem",
            lineHeight: "1.5"
          }}>
            <strong style={{ display: "block", marginBottom: "0.25rem", color: "#ef4444" }}>
              Configuration Error
            </strong>
            {error}
          </div>
        )}

        {/* Status Indicator */}
        {!error && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            backgroundColor: isConnected ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
            border: isConnected ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(245, 158, 11, 0.2)",
            borderRadius: "12px"
          }}>
            <div>
              <div style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: isConnected ? "#a7f3d0" : "#fef3c7",
                marginBottom: "0.25rem"
              }}>
                Connection Status
              </div>
              <div style={{
                fontSize: "1.1rem",
                fontWeight: "600",
                color: isConnected ? "#10b981" : "#f59e0b"
              }}>
                {isConnected ? "Active & Authorized" : "Authentication Required"}
              </div>
            </div>
            <div style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#10b981" : "#f59e0b",
              boxShadow: isConnected ? "0 0 12px #10b981" : "0 0 12px #f59e0b"
            }}></div>
          </div>
        )}

        {/* Connection Details Cards */}
        {isConnected && shopToken && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{
              fontSize: "0.9rem",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#9ca3af",
              margin: "0 0 0.25rem 0"
            }}>
              Connected Store Settings
            </h3>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem"
            }}>
              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  Store Domain
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: "600", wordBreak: "break-all" }}>
                  {shopToken.shopDomain}
                </div>
              </div>

              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  Token Type
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: "600", color: "#818cf8" }}>
                  {shopToken.accessTokenExpiresAt ? "Online (Expiring)" : "Offline (Non-expiring)"}
                </div>
              </div>

              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  Last Authorized
                </div>
                <div style={{ fontSize: "0.9rem", color: "#e5e7eb" }}>
                  {formatDate(shopToken.updatedAt)}
                </div>
              </div>

              <div style={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "10px",
                padding: "1rem"
              }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  Token Expiration
                </div>
                <div style={{ fontSize: "0.9rem", color: shopToken.accessTokenExpiresAt ? "#f87171" : "#34d399" }}>
                  {shopToken.accessTokenExpiresAt ? formatDate(shopToken.accessTokenExpiresAt) : "Never (Auto-managed)"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call to Actions */}
        {!error && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            marginTop: "0.5rem"
          }}>
            {isConnected ? (
              <>
                <a
                  href={installUrl}
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "0.875rem 1.5rem",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "#ffffff",
                    borderRadius: "10px",
                    fontWeight: "600",
                    fontSize: "0.95rem",
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                    cursor: "pointer"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                  }}
                >
                  Re-Authenticate Store
                </a>
                <a
                  href={`https://${shopDomain}/admin/apps`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "0.875rem 1.5rem",
                    backgroundColor: "transparent",
                    border: "1px solid transparent",
                    color: "#9ca3af",
                    borderRadius: "10px",
                    fontWeight: "500",
                    fontSize: "0.9rem",
                    textDecoration: "underline",
                    transition: "color 0.2s ease"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.color = "#ffffff"}
                  onMouseOut={(e) => e.currentTarget.style.color = "#9ca3af"}
                >
                  Go to Shopify Admin Apps ↗
                </a>
              </>
            ) : (
              <a
                href={installUrl}
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "0.875rem 1.5rem",
                  background: "linear-gradient(135deg, #4f46e5, #3b82f6)",
                  boxShadow: "0 4px 14px rgba(79, 70, 229, 0.4)",
                  color: "#ffffff",
                  borderRadius: "10px",
                  fontWeight: "600",
                  fontSize: "0.95rem",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                  cursor: "pointer"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 20px rgba(79, 70, 229, 0.6)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 4px 14px rgba(79, 70, 229, 0.4)";
                }}
              >
                Authenticate with Shopify
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}



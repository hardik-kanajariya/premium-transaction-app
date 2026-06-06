export const loader = async () => {
  return { status: "active" };
};

export default function App() {
  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "3rem 2rem",
      maxWidth: "500px",
      margin: "4rem auto",
      textAlign: "center",
      backgroundColor: "#ffffff",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
      border: "1px solid #eaeaea"
    }}>
      <h1 style={{ color: "#1a1a1a", fontSize: "1.8rem", marginBottom: "0.5rem" }}>
        Vaahini Custom Discount Gateway
      </h1>
      <p style={{ color: "#666", fontSize: "1rem", marginBottom: "2rem" }}>
        Serverless API handler for automated checkout discounts.
      </p>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        backgroundColor: "#e6f4ea",
        color: "#137333",
        borderRadius: "20px",
        fontWeight: "500",
        fontSize: "0.9rem"
      }}>
        <span style={{
          width: "8px",
          height: "8px",
          backgroundColor: "#137333",
          borderRadius: "50%",
          display: "inline-block"
        }}></span>
        System Online
      </div>
    </div>
  );
}


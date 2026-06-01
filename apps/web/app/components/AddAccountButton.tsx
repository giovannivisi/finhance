"use client";

export default function AddAssetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "var(--color-primary)",
        color: "#fff",
        borderRadius: "50%",
        width: "56px",
        height: "56px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
        fontSize: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s",
      }}
      onMouseOver={(e) =>
        (e.currentTarget.style.background = "var(--color-primary-hover)")
      }
      onMouseOut={(e) =>
        (e.currentTarget.style.background = "var(--color-primary)")
      }
    >
      +
    </button>
  );
}

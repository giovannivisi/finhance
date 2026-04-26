"use client";

export default function HeaderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-secondary"
      style={{
        padding: "8px 16px",
        borderRadius: "100px",
        fontSize: "13px",
      }}
    >
      + Add
    </button>
  );
}

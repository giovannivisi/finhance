"use client";

export default function DisclosureIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: "transform 0.2s ease-in-out",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        color: "var(--text-tertiary)",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

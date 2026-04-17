"use client";

export default function DisclosureIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 8 8"
      width="14"
      height="14"
      className={`text-gray-500 transition-transform duration-200 ${
        open ? "rotate-90" : "rotate-0"
      }`}
    >
      <path d="M2 1 L6 4 L2 7 Z" fill="currentColor" />
    </svg>
  );
}

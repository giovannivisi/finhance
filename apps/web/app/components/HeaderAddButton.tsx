"use client";

export default function HeaderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700"
    >
      + Add
    </button>
  );
}
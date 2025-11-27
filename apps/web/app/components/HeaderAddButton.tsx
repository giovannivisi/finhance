"use client";

export default function HeaderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-blue-600 text-white px-4 py-2 rounded-2xl text-sm hover:bg-blue-700 border-gray-100 border shadow"
    >
      + Add
    </button>
  );
}
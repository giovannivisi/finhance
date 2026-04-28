"use client";

export default function HeaderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-secondary header-add-btn">
      + Add
    </button>
  );
}

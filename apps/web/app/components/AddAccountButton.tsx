"use client";

export default function AddAssetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full w-14 h-14 shadow-2xl text-3xl flex items-center justify-center hover:bg-blue-700 z-[9999]"
    >
      +
    </button>
  );
}
"use client";

export default function Modal({
  children,
  open,
  onClose,
}: {
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-black rounded-full p-1"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
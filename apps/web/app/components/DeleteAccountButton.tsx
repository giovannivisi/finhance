"use client";

interface DeleteAccountButtonProps {
  id: string;
}

export default function DeleteAccountButton({ id }: DeleteAccountButtonProps) {
  async function handleDelete() {
    const confirmed = confirm("Are you sure you want to delete this account?");
    if (!confirmed) return;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/accounts/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      alert("Error deleting account");
      return;
    }

    // Refresh the page
    window.location.reload();
  }

  return (
    <button
      onClick={handleDelete}
      style={{
        marginLeft: "10px",
        color: "red",
        cursor: "pointer",
        border: "none",
        background: "transparent",
      }}
    >
      ✕
    </button>
  );
}
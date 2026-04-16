"use client";

import { useRouter } from "next/navigation";
import { getApiUrl, readApiError } from "@lib/api";

interface DeleteAssetButtonProps {
  id: string;
}

export default function DeleteAssetButton({ id }: DeleteAssetButtonProps) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = confirm("Are you sure you want to delete this asset?");
    if (!confirmed) return;

    const res = await fetch(
      getApiUrl(`/assets/${id}`),
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      alert(await readApiError(res));
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      aria-label="Delete asset"
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface DeleteAssetButtonProps {
  id: string;
}

export default function DeleteAssetButton({ id }: DeleteAssetButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const actions = useSingleFlightActions<"delete">();

  async function handleDelete() {
    await actions.run("delete", async () => {
      setError(null);

      const confirmed = confirm("Are you sure you want to delete this asset?");
      if (!confirmed) return;

      try {
        await apiMutation<void>(`/assets/${id}`, {
          method: "DELETE",
        });
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to delete this asset.";
        setError(message);
        alert(message);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={actions.isRunning("delete")}
        aria-label="Delete asset"
        title={error ?? undefined}
        style={{
          marginLeft: "10px",
          color: "red",
          cursor: actions.isRunning("delete") ? "not-allowed" : "pointer",
          border: "none",
          background: "transparent",
          opacity: actions.isRunning("delete") ? 0.6 : 1,
        }}
      >
        ✕
      </button>
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@components/Modal";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface DeleteAssetButtonProps {
  id: string;
}

export default function DeleteAssetButton({ id }: DeleteAssetButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const actions = useSingleFlightActions<"delete">();

  function closeModal() {
    if (actions.isRunning("delete")) {
      return;
    }

    setIsConfirmOpen(false);
  }

  async function handleDelete() {
    await actions.run("delete", async () => {
      setError(null);

      try {
        await apiMutation<void>(`/assets/${id}`, {
          method: "DELETE",
        });
        setIsConfirmOpen(false);
        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to delete this asset.";
        setError(message);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsConfirmOpen(true);
        }}
        disabled={actions.isRunning("delete")}
        aria-label="Delete asset"
        title={error ?? undefined}
        className="asset-row-delete-btn"
      >
        ✕
      </button>
      <Modal
        open={isConfirmOpen}
        onClose={closeModal}
        title="Delete asset"
        maxWidth={520}
      >
        <div className="section-stack-tight">
          <p className="section-subtitle">
            Are you sure you want to delete this asset? This action cannot be
            undone.
          </p>
          {error ? (
            <p role="alert" className="page-inline-notice surface-danger">
              {error}
            </p>
          ) : null}
          <div className="app-form-actions">
            <button
              type="button"
              onClick={closeModal}
              disabled={actions.isRunning("delete")}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={actions.isRunning("delete")}
              className="btn-primary"
            >
              {actions.isRunning("delete") ? "Deleting..." : "Delete asset"}
            </button>
          </div>
        </div>
      </Modal>
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

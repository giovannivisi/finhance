"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmActionModal from "@components/ConfirmActionModal";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface DeleteAssetButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> {
  id: string;
  children?: ReactNode;
  onOpen?: () => void;
}

export default function DeleteAssetButton({
  id,
  className,
  children,
  disabled,
  onOpen,
  title,
  ...buttonProps
}: DeleteAssetButtonProps) {
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
        {...buttonProps}
        type="button"
        onClick={() => {
          onOpen?.();
          setError(null);
          setIsConfirmOpen(true);
        }}
        disabled={disabled || actions.isRunning("delete")}
        aria-label={buttonProps["aria-label"] ?? "Delete asset"}
        title={error ?? title ?? undefined}
        className={className ?? "asset-row-delete-btn"}
      >
        {children ?? "✕"}
      </button>
      <ConfirmActionModal
        open={isConfirmOpen}
        onClose={closeModal}
        onConfirm={() => void handleDelete()}
        title="Delete asset"
        description="Are you sure you want to delete this asset? This action cannot be undone."
        confirmLabel="Delete asset"
        pendingLabel="Deleting..."
        error={error}
        isPending={actions.isRunning("delete")}
      />
      {error ? (
        <span className="sr-only" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

"use client";

import Modal from "@components/Modal";

interface ConfirmActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  error?: string | null;
  isPending?: boolean;
  maxWidth?: number | string;
}

export default function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  error,
  isPending = false,
  maxWidth = 520,
}: ConfirmActionModalProps) {
  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : onClose}
      title={title}
      maxWidth={maxWidth}
    >
      <div className="section-stack-tight">
        <p className="section-subtitle">{description}</p>
        {error ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {error}
          </p>
        ) : null}
        <div className="app-form-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn-primary"
          >
            {isPending ? pendingLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

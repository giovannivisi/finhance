"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { signOut } from "next-auth/react";
import type { DeleteUserAccountRequest } from "@finhance/shared/users";
import Modal from "@components/Modal";
import { readApiError } from "@lib/api";

type DeletionStep = "warning" | "confirmation";

export default function AccountDeletionDialog({
  email,
  onClose,
  open,
}: {
  email: string;
  onClose: () => void;
  open: boolean;
}) {
  const [step, setStep] = useState<DeletionStep>("warning");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("warning");
      setConfirmationEmail("");
      setError(null);
      setIsPending(false);
    }
  }, [open]);

  function handleClose() {
    if (!isPending) {
      onClose();
    }
  }

  async function handleDelete() {
    if (confirmationEmail !== email || isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    const payload: DeleteUserAccountRequest = { email: confirmationEmail };

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      await signOut({ redirectTo: "/account-deleted" });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the account.",
      );
      setIsPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Delete your account?"
      maxWidth={560}
    >
      {step === "warning" ? (
        <div className="account-deletion-dialog">
          <div className="account-deletion-warning surface-danger">
            <AlertTriangle size={20} aria-hidden="true" />
            <p>This permanently deletes the account and cannot be undone.</p>
          </div>
          <div className="account-deletion-copy">
            <p>The following data will be permanently deleted:</p>
            <ul>
              <li>
                Transactions, recurring rules, overrides, transfer groups,
                budgets, categories, and validation rules
              </li>
              <li>
                Accounts, assets, liabilities, brokerage operations, and
                portfolio targets
              </li>
              <li>
                Imports, net-worth snapshots, FX rates, request-safety records,
                and user settings
              </li>
              <li>
                Linked sign-in providers, passkeys, mobile access, sessions, and
                the user record
              </li>
            </ul>
          </div>
          <div className="app-form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setStep("confirmation")}
            >
              Continue to deletion
            </button>
          </div>
        </div>
      ) : (
        <div className="account-deletion-dialog">
          <div className="account-deletion-copy">
            <p>
              To confirm, type <strong>{email}</strong> below.
            </p>
            <p>This is the final confirmation. The deletion is immediate.</p>
          </div>
          <label className="account-deletion-field">
            <span>Account email</span>
            <input
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={confirmationEmail}
              disabled={isPending}
              onChange={(event) => setConfirmationEmail(event.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="page-inline-notice surface-danger">
              {error}
            </p>
          ) : null}
          <div className="app-form-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setStep("warning");
              }}
            >
              Back
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={confirmationEmail !== email || isPending}
              onClick={() => void handleDelete()}
            >
              {isPending ? "Deleting account..." : "Permanently delete account"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

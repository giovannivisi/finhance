"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";
import {
  buildTransactionPayload,
  type TransactionFormValues,
} from "@lib/transaction-form";
import { formatAccountOptionLabel } from "@lib/accounts";
import { formatCategoryOptionLabel } from "@lib/categories";
import {
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_KIND_OPTIONS,
} from "@lib/transactions";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface TransactionFormProps {
  transactionId?: string;
  initialValues: TransactionFormValues;
  mode: "create" | "edit";
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  editingTransaction?: TransactionResponse | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function selectableAccounts(
  accounts: AccountResponse[],
  selectedId: string,
): AccountResponse[] {
  return accounts.filter(
    (account) => account.archivedAt === null || account.id === selectedId,
  );
}

function selectableCategories(
  categories: CategoryResponse[],
  type: CategoryResponse["type"],
  selectedId: string,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === type &&
      (category.archivedAt === null || category.id === selectedId),
  );
}

export default function TransactionForm({
  transactionId,
  initialValues,
  mode,
  accounts,
  categories,
  editingTransaction,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<TransactionFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isCreateMode = mode === "create";

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  const standardAccounts = useMemo(
    () => selectableAccounts(accounts, form.accountId),
    [accounts, form.accountId],
  );
  const sourceAccounts = useMemo(
    () => selectableAccounts(accounts, form.sourceAccountId),
    [accounts, form.sourceAccountId],
  );
  const destinationAccounts = useMemo(
    () => selectableAccounts(accounts, form.destinationAccountId),
    [accounts, form.destinationAccountId],
  );
  const visibleCategories = useMemo(() => {
    if (form.kind === "INCOME") {
      return selectableCategories(categories, "INCOME", form.categoryId);
    }

    if (form.kind === "EXPENSE") {
      return selectableCategories(categories, "EXPENSE", form.categoryId);
    }

    return [];
  }, [categories, form.categoryId, form.kind]);

  function updateField<Field extends keyof TransactionFormValues>(
    field: Field,
    value: TransactionFormValues[Field],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("submit", async () => {
      setError(null);

      const result = buildTransactionPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this transaction.");
        return;
      }

      if (!isCreateMode && !transactionId) {
        setError("Missing transaction id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/transactions" : `/transactions/${transactionId}`,
          {
            method: isCreateMode ? "POST" : "PUT",
            body: JSON.stringify(result.payload),
          },
        );

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Error creating transaction."
              : "Error updating transaction.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  const getLabelStyle = (required: boolean) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "12px",
    fontWeight: required ? 700 : 500,
    color: required ? "var(--text-primary)" : "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "8px",
  });

  const inputStyle = {
    width: "100%",
    background: "var(--bg-app)",
    border: "1px solid var(--border-glass-strong)",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  };

  const handleFocus = (
    e: React.FocusEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => (e.target.style.borderColor = "var(--text-secondary)");
  const handleBlur = (
    e: React.FocusEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => (e.target.style.borderColor = "var(--border-glass-strong)");

  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label
            htmlFor={`${fieldPrefix}-posted-at`}
            style={getLabelStyle(true)}
          >
            <span>Posted at</span>
          </label>
          <input
            id={`${fieldPrefix}-posted-at`}
            style={inputStyle}
            type="datetime-local"
            value={form.postedAt}
            onChange={(event) => updateField("postedAt", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          />
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-kind`} style={getLabelStyle(true)}>
            <span>Kind</span>
          </label>
          <select
            id={`${fieldPrefix}-kind`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.kind}
            disabled={!isCreateMode}
            onChange={(event) =>
              updateField(
                "kind",
                event.target.value as TransactionFormValues["kind"],
              )
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            {TRANSACTION_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {TRANSACTION_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label htmlFor={`${fieldPrefix}-amount`} style={getLabelStyle(true)}>
            <span>Amount</span>
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            style={inputStyle}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          />
        </div>

        {!isTransfer ? (
          <div>
            <label
              htmlFor={`${fieldPrefix}-account`}
              style={getLabelStyle(true)}
            >
              <span>Account</span>
            </label>
            <select
              id={`${fieldPrefix}-account`}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              value={form.accountId}
              onChange={(event) => updateField("accountId", event.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
            >
              <option value="">Select an account</option>
              {standardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              background: "rgba(59, 130, 246, 0.1)",
              fontSize: "13px",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Transfers create one outflow row and one inflow row underneath.
          </div>
        )}
      </div>

      {isTransfer ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <label
              htmlFor={`${fieldPrefix}-source-account`}
              style={getLabelStyle(true)}
            >
              <span>Source account</span>
            </label>
            <select
              id={`${fieldPrefix}-source-account`}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              value={form.sourceAccountId}
              onChange={(event) =>
                updateField("sourceAccountId", event.target.value)
              }
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
            >
              <option value="">Select a source account</option>
              {sourceAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${fieldPrefix}-destination-account`}
              style={getLabelStyle(true)}
            >
              <span>Destination account</span>
            </label>
            <select
              id={`${fieldPrefix}-destination-account`}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              value={form.destinationAccountId}
              onChange={(event) =>
                updateField("destinationAccountId", event.target.value)
              }
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
            >
              <option value="">Select a destination account</option>
              {destinationAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {!isTransfer && isAdjustment ? (
        <div>
          <label
            htmlFor={`${fieldPrefix}-direction`}
            style={getLabelStyle(true)}
          >
            <span>Direction</span>
          </label>
          <select
            id={`${fieldPrefix}-direction`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.direction}
            onChange={(event) =>
              updateField(
                "direction",
                event.target.value as TransactionFormValues["direction"],
              )
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            {TRANSACTION_DIRECTION_OPTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {TRANSACTION_DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!isTransfer ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          {!isAdjustment ? (
            <div>
              <label
                htmlFor={`${fieldPrefix}-category`}
                style={getLabelStyle(false)}
              >
                <span>Category</span>
                <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
              </label>
              <select
                id={`${fieldPrefix}-category`}
                style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
                onFocus={handleFocus}
                onBlur={handleBlur}
              >
                <option value="">No category</option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryOptionLabel(category)}
                  </option>
                ))}
              </select>
              {!visibleCategories.length ? (
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--text-tertiary)",
                    marginTop: "4px",
                  }}
                >
                  No matching categories available.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor={`${fieldPrefix}-counterparty`}
              style={getLabelStyle(false)}
            >
              <span>Counterparty</span>
              <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-counterparty`}
              style={inputStyle}
              value={form.counterparty}
              onChange={(event) =>
                updateField("counterparty", event.target.value)
              }
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </div>
      ) : null}

      <div>
        <label
          htmlFor={`${fieldPrefix}-description`}
          style={getLabelStyle(true)}
        >
          <span>Description</span>
        </label>
        <input
          id={`${fieldPrefix}-description`}
          style={inputStyle}
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          required
        />
      </div>

      <div>
        <label htmlFor={`${fieldPrefix}-notes`} style={getLabelStyle(false)}>
          <span>Notes</span>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      {editingTransaction?.kind === "TRANSFER" ? (
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          This transaction keeps its transfer identity. To convert it into a
          non-transfer entry, delete it and create a new one.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          style={{
            fontSize: "14px",
            color: "var(--color-expense)",
            background: "rgba(239, 68, 68, 0.1)",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            flex: 1,
            background: "var(--text-primary)",
            color: "var(--bg-app)",
            padding: "12px 24px",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "15px",
            border: "none",
            cursor: isSubmitting ? "not-allowed" : "pointer",
            opacity: isSubmitting ? 0.6 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {isSubmitting
            ? "Saving..."
            : isCreateMode
              ? "Create Transaction"
              : "Save Changes"}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              border: "1px solid var(--border-glass-strong)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontWeight: 500,
              fontSize: "15px",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.background = "var(--bg-card-hover)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountResponse } from "@finhance/shared";
import {
  ASSET_KIND_OPTIONS,
  EXCHANGE_SUFFIXES,
  LIABILITY_KIND_OPTIONS,
} from "@lib/asset-ui";
import { formatAccountOptionLabel } from "@lib/accounts";
import {
  buildAssetPayload,
  ensureKindForType,
  getKindConfig,
  normalizeExchangeInput,
  type AssetFormValues,
} from "@lib/asset-form";
import { api, apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface AssetFormProps {
  assetId?: string;
  initialValues: AssetFormValues;
  mode: "create" | "edit";
  onSuccess?: () => void;
}

export default function AssetForm({
  assetId,
  initialValues,
  mode,
  onSuccess,
}: AssetFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<AssetFormValues>(initialValues);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();

  const config = getKindConfig(form.type, form.kind);
  const isAsset = form.type === "ASSET";
  const isCreateMode = mode === "create";
  const kindOptions =
    form.type === "LIABILITY" ? LIABILITY_KIND_OPTIONS : ASSET_KIND_OPTIONS;

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      setAccountsError(null);

      try {
        const nextAccounts = await api<AccountResponse[]>("/accounts");
        const selectedAccountId = initialValues.accountId.trim();

        if (
          selectedAccountId &&
          !nextAccounts.some((account) => account.id === selectedAccountId)
        ) {
          const selectedAccount = await api<AccountResponse>(
            `/accounts/${selectedAccountId}`,
          );
          nextAccounts.push(selectedAccount);
        }

        nextAccounts.sort((left, right) => left.order - right.order);

        if (!cancelled) {
          setAccounts(nextAccounts);
        }
      } catch (loadError) {
        if (!cancelled) {
          setAccountsError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load accounts.",
          );
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [initialValues.accountId]);

  useEffect(() => {
    setForm((previous) => {
      const nextKind = ensureKindForType(previous.type, previous.kind);
      const nextExchange = normalizeExchangeInput(
        previous.type,
        nextKind,
        previous.exchange,
      );

      if (nextKind === previous.kind && nextExchange === previous.exchange) {
        return previous;
      }

      return {
        ...previous,
        kind: nextKind,
        exchange: nextExchange,
      };
    });
  }, [form.exchange, form.kind, form.type]);

  function updateField<Field extends keyof AssetFormValues>(
    field: Field,
    value: AssetFormValues[Field],
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

      const result = buildAssetPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this asset.");
        return;
      }

      if (!isCreateMode && !assetId) {
        setError("Missing asset id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(isCreateMode ? "/assets" : `/assets/${assetId}`, {
          method: isCreateMode ? "POST" : "PUT",
          body: JSON.stringify(result.payload),
        });

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Error creating asset."
              : "Error updating asset.",
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
    borderRadius: "var(--radius-md)",
    padding: "14px 20px",
    color: "var(--text-primary)",
    fontSize: "15px",
    outline: "none",
    transition: "all 0.2s",
    boxSizing: "border-box" as const,
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "20px" }}
    >
      <div>
        <label htmlFor={`${fieldPrefix}-name`} style={getLabelStyle(true)}>
          <span>Name</span>
        </label>
        <input
          id={`${fieldPrefix}-name`}
          style={inputStyle}
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          onFocus={(e) =>
            (e.target.style.borderColor = "var(--text-secondary)")
          }
          onBlur={(e) =>
            (e.target.style.borderColor = "var(--border-glass-strong)")
          }
          required
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label htmlFor={`${fieldPrefix}-type`} style={getLabelStyle(true)}>
            <span>Type</span>
          </label>
          <select
            id={`${fieldPrefix}-type`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.type}
            onChange={(event) =>
              updateField("type", event.target.value as AssetFormValues["type"])
            }
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--text-secondary)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-glass-strong)")
            }
            required
          >
            <option value="ASSET">ASSET</option>
            <option value="LIABILITY">LIABILITY</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-kind`} style={getLabelStyle(true)}>
            <span>Kind</span>
          </label>
          <select
            id={`${fieldPrefix}-kind`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.kind}
            onChange={(event) =>
              updateField("kind", event.target.value as AssetFormValues["kind"])
            }
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--text-secondary)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-glass-strong)")
            }
          >
            {kindOptions.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
      </div>

      {config.showBalance ? (
        <div>
          <label htmlFor={`${fieldPrefix}-balance`} style={getLabelStyle(true)}>
            <span>Amount</span>
          </label>
          <input
            id={`${fieldPrefix}-balance`}
            style={inputStyle}
            type="number"
            step="0.01"
            value={form.balance}
            onChange={(event) => updateField("balance", event.target.value)}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--text-secondary)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-glass-strong)")
            }
            required
          />
        </div>
      ) : null}

      {config.showQuantity || config.showUnitPrice ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          {config.showQuantity ? (
            <div>
              <label
                htmlFor={`${fieldPrefix}-quantity`}
                style={getLabelStyle(true)}
              >
                <span>Quantity</span>
              </label>
              <input
                id={`${fieldPrefix}-quantity`}
                style={inputStyle}
                type="number"
                step="0.0000001"
                value={form.quantity}
                onChange={(event) =>
                  updateField("quantity", event.target.value)
                }
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--text-secondary)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-glass-strong)")
                }
                required
              />
            </div>
          ) : null}

          {config.showUnitPrice ? (
            <div>
              <label
                htmlFor={`${fieldPrefix}-unit-price`}
                style={getLabelStyle(true)}
              >
                <span>Unit Price</span>
              </label>
              <input
                id={`${fieldPrefix}-unit-price`}
                style={inputStyle}
                type="number"
                step="0.0001"
                value={form.unitPrice}
                onChange={(event) =>
                  updateField("unitPrice", event.target.value)
                }
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--text-secondary)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-glass-strong)")
                }
                required
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {config.showTicker ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <label
              htmlFor={`${fieldPrefix}-ticker`}
              style={getLabelStyle(true)}
            >
              <span>Ticker</span>
            </label>
            <input
              id={`${fieldPrefix}-ticker`}
              style={inputStyle}
              value={form.ticker}
              onChange={(event) => updateField("ticker", event.target.value)}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--text-secondary)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-glass-strong)")
              }
              required
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldPrefix}-exchange`}
              style={getLabelStyle(true)}
            >
              <span>Exchange</span>
            </label>
            <select
              id={`${fieldPrefix}-exchange`}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
              value={form.exchange}
              onChange={(event) => updateField("exchange", event.target.value)}
              onFocus={(e) =>
                (e.target.style.borderColor = "var(--text-secondary)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "var(--border-glass-strong)")
              }
            >
              {EXCHANGE_SUFFIXES.map((exchange) => (
                <option key={exchange.value} value={exchange.value}>
                  {exchange.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label
            htmlFor={`${fieldPrefix}-currency`}
            style={getLabelStyle(false)}
          >
            <span>Currency</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-currency`}
            style={inputStyle}
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--text-secondary)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-glass-strong)")
            }
          />
        </div>

        <div>
          <label
            htmlFor={`${fieldPrefix}-account`}
            style={getLabelStyle(false)}
          >
            <span>Account</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <select
            id={`${fieldPrefix}-account`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.accountId}
            onChange={(event) => updateField("accountId", event.target.value)}
            onFocus={(e) =>
              (e.target.style.borderColor = "var(--text-secondary)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "var(--border-glass-strong)")
            }
          >
            <option value="">No account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {formatAccountOptionLabel(account)}
              </option>
            ))}
          </select>
          {accountsError ? (
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-expense)",
                marginTop: "4px",
              }}
            >
              {accountsError}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${fieldPrefix}-notes`} style={getLabelStyle(false)}>
          <span>Notes</span>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          onFocus={(e) =>
            (e.target.style.borderColor = "var(--text-secondary)")
          }
          onBlur={(e) =>
            (e.target.style.borderColor = "var(--border-glass-strong)")
          }
        />
      </div>

      <div style={{ display: "none" }}>
        <label htmlFor={`${fieldPrefix}-order`} style={getLabelStyle(false)}>
          Order
        </label>
        <input
          id={`${fieldPrefix}-order`}
          style={inputStyle}
          type="number"
          value={form.order}
          onChange={(event) => updateField("order", event.target.value)}
        />
      </div>

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

      <div
        style={{
          marginTop: "8px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            background: "var(--color-primary)",
            background:
              "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md)",
            padding: "14px 24px",
            fontSize: "16px",
            fontWeight: 700,
            cursor: isSubmitting ? "not-allowed" : "pointer",
            opacity: isSubmitting ? 0.7 : 1,
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            width: "100%",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
          }}
          onMouseDown={(e) => {
            if (!isSubmitting) e.currentTarget.style.transform = "scale(0.98)";
          }}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {isSubmitting
            ? "Saving..."
            : isCreateMode
              ? isAsset
                ? "Create Asset"
                : "Create Liability"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

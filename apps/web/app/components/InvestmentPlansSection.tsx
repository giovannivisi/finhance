"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Modal from "@components/Modal";
import MoneyValue from "@components/MoneyValue";
import SearchablePicker from "@components/SearchablePicker";
import { apiMutation } from "@lib/api";
import { getExchangeSuffixesForKind } from "@lib/asset-ui";
import { getCurrencyPickerOptions } from "@lib/currency-ui";
import { toRomeDateInputValue } from "@lib/transaction-form";
import { useRouter } from "next/navigation";
import type {
  AssetKind,
  BrokerageAccountSummaryResponse,
  CreateInvestmentPlanRequest,
  InvestmentPlanCadence,
  InvestmentPlanResponse,
} from "@finhance/shared";

type MarketKind = Extract<AssetKind, "STOCK" | "BOND" | "CRYPTO">;

type InvestmentPlanFormState = {
  accountId: string;
  name: string;
  securityName: string;
  securityKind: MarketKind;
  securityTicker: string;
  securityExchange: string;
  currency: string;
  contributionAmount: string;
  estimatedFeeAmount: string;
  cadence: InvestmentPlanCadence;
  dayOfMonth: string;
  secondDayOfMonth: string;
  nextScheduledDate: string;
  notes: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

function currentRomeDateKey(): string {
  return toRomeDateInputValue(new Date().toISOString());
}

function createEmptyPlanForm(
  accounts: BrokerageAccountSummaryResponse[],
  defaultAccountId: string,
): InvestmentPlanFormState {
  const nextScheduledDate = currentRomeDateKey();
  const dayOfMonth = String(Number(nextScheduledDate.slice(-2)));
  const account =
    accounts.find((candidate) => candidate.account.id === defaultAccountId) ??
    accounts[0];

  return {
    accountId: account?.account.id ?? "",
    name: "",
    securityName: "",
    securityKind: "STOCK",
    securityTicker: "",
    securityExchange: "",
    currency: account?.account.currency ?? "EUR",
    contributionAmount: "",
    estimatedFeeAmount: "",
    cadence: "MONTHLY",
    dayOfMonth,
    secondDayOfMonth: "",
    nextScheduledDate,
    notes: "",
  };
}

function planToFormValues(
  plan: InvestmentPlanResponse,
): InvestmentPlanFormState {
  return {
    accountId: plan.account.id,
    name: plan.name,
    securityName: plan.securityName,
    securityKind: plan.securityKind as MarketKind,
    securityTicker: plan.securityTicker,
    securityExchange: plan.securityExchange ?? "",
    currency: plan.currency,
    contributionAmount: String(plan.contributionAmount),
    estimatedFeeAmount:
      plan.estimatedFeeAmount === null ? "" : String(plan.estimatedFeeAmount),
    cadence: plan.cadence,
    dayOfMonth: String(plan.dayOfMonth),
    secondDayOfMonth:
      plan.secondDayOfMonth === null ? "" : String(plan.secondDayOfMonth),
    nextScheduledDate: plan.nextScheduledDate,
    notes: plan.notes ?? "",
  };
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDay(value: string): number | null {
  const parsed = parseNumber(value);
  return parsed !== null &&
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= 31
    ? parsed
    : null;
}

function formatPlanDate(dateKey: string): string {
  return DATE_FORMATTER.format(new Date(`${dateKey}T12:00:00.000Z`));
}

function formatSchedule(plan: InvestmentPlanResponse): string {
  if (plan.cadence === "MONTHLY") {
    return `Monthly on day ${plan.dayOfMonth}`;
  }

  return `Twice monthly on days ${plan.dayOfMonth} and ${plan.secondDayOfMonth}`;
}

function buildPlanPayload(form: InvestmentPlanFormState): {
  payload?: CreateInvestmentPlanRequest;
  error?: string;
} {
  const contributionAmount = parseNumber(form.contributionAmount);
  const estimatedFeeAmount = parseNumber(form.estimatedFeeAmount);
  const dayOfMonth = parseDay(form.dayOfMonth);
  const secondDayOfMonth = parseDay(form.secondDayOfMonth);
  const name = form.name.trim();
  const securityName = form.securityName.trim();
  const securityTicker = form.securityTicker.trim();

  if (!form.accountId) {
    return { error: "Choose a brokerage account." };
  }
  if (!name || !securityName || !securityTicker) {
    return { error: "Plan name, security name, and ticker are required." };
  }
  if (!form.currency) {
    return { error: "Choose the contribution currency." };
  }
  if (contributionAmount === null || contributionAmount <= 0) {
    return { error: "Enter a positive intended contribution." };
  }
  if (estimatedFeeAmount !== null && estimatedFeeAmount < 0) {
    return { error: "Estimated fee cannot be negative." };
  }
  if (dayOfMonth === null) {
    return { error: "Enter a schedule day between 1 and 31." };
  }
  if (
    form.cadence === "TWICE_MONTHLY" &&
    (secondDayOfMonth === null || secondDayOfMonth === dayOfMonth)
  ) {
    return { error: "Twice-monthly plans need two different schedule days." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.nextScheduledDate)) {
    return { error: "Enter a valid next scheduled date." };
  }

  return {
    payload: {
      accountId: form.accountId,
      name,
      securityName,
      securityKind: form.securityKind,
      securityTicker,
      securityExchange:
        form.securityKind === "CRYPTO"
          ? "_CRYPTO_"
          : form.securityExchange || null,
      currency: form.currency,
      contributionAmount,
      estimatedFeeAmount,
      cadence: form.cadence,
      dayOfMonth,
      secondDayOfMonth:
        form.cadence === "TWICE_MONTHLY" ? secondDayOfMonth : null,
      nextScheduledDate: form.nextScheduledDate,
      notes: form.notes.trim() || null,
    },
  };
}

export default function InvestmentPlansSection({
  plans,
  accounts,
  defaultAccountId,
  onRecordBuy,
}: {
  plans: InvestmentPlanResponse[];
  accounts: BrokerageAccountSummaryResponse[];
  defaultAccountId: string;
  onRecordBuy: (plan: InvestmentPlanResponse) => void;
}) {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<InvestmentPlanResponse | null>(
    null,
  );
  const [form, setForm] = useState<InvestmentPlanFormState>(() =>
    createEmptyPlanForm(accounts, defaultAccountId),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutatingPlanId, setMutatingPlanId] = useState<string | null>(null);
  const currencyOptions = useMemo(() => getCurrencyPickerOptions(), []);
  const exchangeOptions = useMemo(
    () => getExchangeSuffixesForKind(form.securityKind),
    [form.securityKind],
  );

  useEffect(() => {
    setForm((current) => {
      const securityExchange =
        current.securityKind === "CRYPTO"
          ? "_CRYPTO_"
          : current.securityExchange === "_CRYPTO_"
            ? ""
            : current.securityExchange;

      return securityExchange === current.securityExchange
        ? current
        : { ...current, securityExchange };
    });
  }, [form.securityKind]);

  function closeForm() {
    setIsFormOpen(false);
    setEditingPlan(null);
    setError(null);
  }

  function openCreateForm() {
    setEditingPlan(null);
    setForm(createEmptyPlanForm(accounts, defaultAccountId));
    setError(null);
    setIsFormOpen(true);
  }

  function openEditForm(plan: InvestmentPlanResponse) {
    setEditingPlan(plan);
    setForm(planToFormValues(plan));
    setError(null);
    setIsFormOpen(true);
  }

  function updateField<Field extends keyof InvestmentPlanFormState>(
    field: Field,
    value: InvestmentPlanFormState[Field],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildPlanPayload(form);
    if (!result.payload) {
      setError(result.error ?? "Unable to validate this investment plan.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await apiMutation(
        editingPlan
          ? `/investment-plans/${editingPlan.id}`
          : "/investment-plans",
        {
          method: editingPlan ? "PUT" : "POST",
          body: JSON.stringify(result.payload),
        },
      );
      closeForm();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save this investment plan.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runPlanAction(
    plan: InvestmentPlanResponse,
    action: "pause" | "resume" | "skip",
  ) {
    setMutatingPlanId(plan.id);
    setError(null);
    try {
      await apiMutation(`/investment-plans/${plan.id}/${action}`, {
        method: "POST",
      });
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this investment plan.",
      );
    } finally {
      setMutatingPlanId(null);
    }
  }

  return (
    <section className="page-section brokerage-section-card investment-plans-section">
      <div className="compact-toolbar">
        <div>
          <p className="page-kicker">Plan, then confirm</p>
          <h3 className="page-section-title">Investment plans</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Planned contributions never create trades automatically. Confirm the
            actual execution when it happens.
          </p>
        </div>
        <div className="compact-toolbar-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={openCreateForm}
          >
            New plan
          </button>
        </div>
      </div>

      {error ? (
        <p className="page-inline-notice surface-danger">{error}</p>
      ) : null}

      {plans.length === 0 ? (
        <div className="page-inline-notice surface-dashed">
          No investment plans yet. Create one to receive a due reminder here.
        </div>
      ) : (
        <div className="list-stack">
          {plans.map((plan) => {
            const isMutating = mutatingPlanId === plan.id;
            return (
              <article key={plan.id} className="list-card investment-plan-card">
                <div className="investment-plan-head">
                  <div>
                    <div className="investment-plan-title-row">
                      <h4 className="brokerage-position-title">{plan.name}</h4>
                      {plan.isDue ? (
                        <span className="status-chip is-warning">Due now</span>
                      ) : plan.isActive ? (
                        <span className="status-chip is-info">
                          Next {formatPlanDate(plan.nextScheduledDate)}
                        </span>
                      ) : (
                        <span className="status-chip is-neutral">Paused</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {plan.securityName} ({plan.securityTicker}
                      {plan.securityExchange ?? ""}) · {plan.account.name}
                    </p>
                  </div>
                  <div className="investment-plan-amount">
                    <p className="detail-metric-label">Intended contribution</p>
                    <p className="detail-metric-value">
                      <MoneyValue
                        value={plan.contributionAmount}
                        currency={plan.currency}
                      />
                    </p>
                  </div>
                </div>

                <div className="investment-plan-meta">
                  <span>{formatSchedule(plan)}</span>
                  {plan.estimatedFeeAmount !== null ? (
                    <span>
                      Est. fee {plan.estimatedFeeAmount.toFixed(2)}{" "}
                      {plan.currency}
                    </span>
                  ) : null}
                  {plan.notes ? <span>{plan.notes}</span> : null}
                </div>

                <div className="compact-toolbar-actions investment-plan-actions">
                  {plan.isDue ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => onRecordBuy(plan)}
                        disabled={isMutating}
                      >
                        Record buy
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void runPlanAction(plan, "skip")}
                        disabled={isMutating}
                      >
                        {isMutating ? "Updating..." : "Skip instalment"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openEditForm(plan)}
                    disabled={isMutating}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void runPlanAction(
                        plan,
                        plan.isActive ? "pause" : "resume",
                      )
                    }
                    disabled={isMutating}
                  >
                    {isMutating
                      ? "Updating..."
                      : plan.isActive
                        ? "Pause"
                        : "Resume"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={isFormOpen}
        onClose={closeForm}
        title={
          editingPlan ? `Edit ${editingPlan.name}` : "Create investment plan"
        }
        maxWidth={760}
      >
        <form className="app-form" onSubmit={handleSubmit}>
          <div className="app-form-grid brokerage-form-grid">
            <div className="app-form-field">
              <label htmlFor="investment-plan-name">Plan name</label>
              <input
                id="investment-plan-name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                required
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-account">Brokerage account</label>
              <select
                id="investment-plan-account"
                value={form.accountId}
                onChange={(event) =>
                  updateField("accountId", event.target.value)
                }
                required
              >
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.account.id} value={account.account.id}>
                    {account.account.name} · {account.account.currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-security-name">
                Security name
              </label>
              <input
                id="investment-plan-security-name"
                value={form.securityName}
                onChange={(event) =>
                  updateField("securityName", event.target.value)
                }
                required
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-security-kind">
                Security type
              </label>
              <select
                id="investment-plan-security-kind"
                value={form.securityKind}
                onChange={(event) =>
                  updateField("securityKind", event.target.value as MarketKind)
                }
              >
                <option value="STOCK">Stock or ETF</option>
                <option value="BOND">Bond</option>
                <option value="CRYPTO">Crypto</option>
              </select>
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-ticker">Ticker</label>
              <input
                id="investment-plan-ticker"
                value={form.securityTicker}
                onChange={(event) =>
                  updateField("securityTicker", event.target.value)
                }
                required
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-exchange" className="is-optional">
                <span>Exchange</span>
                <span>Optional</span>
              </label>
              <SearchablePicker
                id="investment-plan-exchange"
                value={form.securityExchange}
                onChange={(value) => updateField("securityExchange", value)}
                options={exchangeOptions}
                placeholder="Choose an exchange"
                searchPlaceholder="Search exchanges…"
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-currency">
                Contribution currency
              </label>
              <SearchablePicker
                id="investment-plan-currency"
                value={form.currency}
                onChange={(value) => updateField("currency", value)}
                options={currencyOptions}
                placeholder="Choose a currency"
                searchPlaceholder="Search currencies…"
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-contribution">
                Intended contribution
              </label>
              <input
                id="investment-plan-contribution"
                type="number"
                min="0"
                step="0.01"
                value={form.contributionAmount}
                onChange={(event) =>
                  updateField("contributionAmount", event.target.value)
                }
                required
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-cadence">Cadence</label>
              <select
                id="investment-plan-cadence"
                value={form.cadence}
                onChange={(event) =>
                  updateField(
                    "cadence",
                    event.target.value as InvestmentPlanCadence,
                  )
                }
              >
                <option value="MONTHLY">Monthly</option>
                <option value="TWICE_MONTHLY">Twice monthly</option>
              </select>
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-day">Schedule day</label>
              <input
                id="investment-plan-day"
                type="number"
                min="1"
                max="31"
                value={form.dayOfMonth}
                onChange={(event) =>
                  updateField("dayOfMonth", event.target.value)
                }
                required
              />
            </div>
            {form.cadence === "TWICE_MONTHLY" ? (
              <div className="app-form-field">
                <label htmlFor="investment-plan-second-day">
                  Second schedule day
                </label>
                <input
                  id="investment-plan-second-day"
                  type="number"
                  min="1"
                  max="31"
                  value={form.secondDayOfMonth}
                  onChange={(event) =>
                    updateField("secondDayOfMonth", event.target.value)
                  }
                  required
                />
              </div>
            ) : null}
            <div className="app-form-field">
              <label htmlFor="investment-plan-next-date">
                Next scheduled date
              </label>
              <input
                id="investment-plan-next-date"
                type="date"
                value={form.nextScheduledDate}
                onChange={(event) =>
                  updateField("nextScheduledDate", event.target.value)
                }
                required
              />
            </div>
            <div className="app-form-field">
              <label htmlFor="investment-plan-fee" className="is-optional">
                <span>Estimated fee</span>
                <span>Optional</span>
              </label>
              <input
                id="investment-plan-fee"
                type="number"
                min="0"
                step="0.01"
                value={form.estimatedFeeAmount}
                onChange={(event) =>
                  updateField("estimatedFeeAmount", event.target.value)
                }
              />
            </div>
            <div className="app-form-field app-form-field-span-2">
              <label htmlFor="investment-plan-notes" className="is-optional">
                <span>Notes</span>
                <span>Optional</span>
              </label>
              <textarea
                id="investment-plan-notes"
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
              />
            </div>
          </div>

          <p className="page-inline-notice surface-info mt-4">
            Schedule days that do not exist in a month use that month&apos;s
            last day. You can use the next date for a one-off delay; later
            instalments return to this cadence. A due reminder only prepares a
            buy; it never creates a trade on its own.
          </p>

          {error ? (
            <p className="page-inline-notice surface-danger mt-4">{error}</p>
          ) : null}

          <div className="modal-action-row">
            <button type="button" className="btn-secondary" onClick={closeForm}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Saving..."
                : editingPlan
                  ? "Save changes"
                  : "Create plan"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  MaterializeRecurringRulesResponse,
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import CooldownNotice from "@components/CooldownNotice";
import Modal from "@components/Modal";
import RecurringOccurrenceForm from "@components/RecurringOccurrenceForm";
import RecurringRuleForm from "@components/RecurringRuleForm";
import { createRecurringOccurrenceFormValuesFromRule } from "@lib/recurring-occurrence-form";
import {
  createEmptyRecurringRuleFormValues,
  recurringRuleToFormValues,
} from "@lib/recurring-rule-form";
import { formatCurrency } from "@lib/format";
import { requestRecurringMaterialization } from "@lib/recurring-materialization";
import {
  getRecurringMaterializationNoticeText,
  getRepeatedActionNotice,
} from "@lib/request-safety";
import { TRANSACTION_KIND_LABELS } from "@lib/transactions";
import { api, apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

export default function RecurringPageClient({
  rules,
  accounts,
  categories,
  expenseValidationRules,
}: {
  rules: RecurringTransactionRuleResponse[];
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  expenseValidationRules: ExpenseValidationRuleResponse[];
}) {
  const router = useRouter();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [occurrenceRuleId, setOccurrenceRuleId] = useState<string | null>(null);
  const [occurrenceMonth, setOccurrenceMonth] = useState<string>(
    MONTH_FORMATTER.format(new Date()),
  );
  const [occurrences, setOccurrences] = useState<RecurringOccurrenceResponse[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] =
    useState<MaterializeRecurringRulesResponse | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [busyOccurrenceKey, setBusyOccurrenceKey] = useState<string | null>(
    null,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingOccurrences, setIsLoadingOccurrences] = useState(false);
  const actions = useSingleFlightActions<string>();

  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;
  const occurrenceRule =
    rules.find((rule) => rule.id === occurrenceRuleId) ?? null;
  const selectedOccurrence =
    occurrences.find(
      (occurrence) => occurrence.occurrenceMonth === occurrenceMonth,
    ) ?? null;
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  async function loadOccurrences(ruleId: string) {
    await actions.run(`load:${ruleId}`, async () => {
      setIsLoadingOccurrences(true);

      try {
        setOccurrences(
          await api<RecurringOccurrenceResponse[]>(
            `/recurring-rules/${ruleId}/occurrences`,
          ),
        );
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to load recurring exceptions.",
        );
        setOccurrences([]);
      } finally {
        setIsLoadingOccurrences(false);
      }
    });
  }

  async function handleSync() {
    await actions.run("sync", async () => {
      setActionError(null);
      setActionNotice(null);
      setSyncSummary(null);
      setIsSyncing(true);

      try {
        const result = await requestRecurringMaterialization();
        if (!result.ok) {
          const repeatedActionNotice = getRepeatedActionNotice({
            status: result.status,
            error: result.error,
          });

          if (repeatedActionNotice) {
            setActionNotice(
              getRecurringMaterializationNoticeText(repeatedActionNotice),
            );
            return;
          }
          setActionError(result.error);
          return;
        }

        setSyncSummary(result.summary);
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to sync due transactions.",
        );
      } finally {
        setIsSyncing(false);
      }
    });
  }

  async function handleDisable(ruleId: string) {
    await actions.run(`disable:${ruleId}`, async () => {
      setActionError(null);
      setActionNotice(null);
      setSyncSummary(null);
      setBusyRuleId(ruleId);

      try {
        await apiMutation<void>(`/recurring-rules/${ruleId}`, {
          method: "DELETE",
        });

        if (editingRuleId === ruleId) {
          setEditingRuleId(null);
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to disable this recurring rule.",
        );
      } finally {
        setBusyRuleId(null);
      }
    });
  }

  async function handleSkipOccurrence(ruleId: string, month: string) {
    await actions.run(`skip:${ruleId}:${month}`, async () => {
      setActionError(null);
      setActionNotice(null);
      setSyncSummary(null);
      setBusyOccurrenceKey(`${ruleId}:${month}:skip`);

      try {
        await apiMutation(`/recurring-rules/${ruleId}/occurrences/${month}`, {
          method: "PUT",
          body: JSON.stringify({ status: "SKIPPED" }),
        });

        await loadOccurrences(ruleId);
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to skip this recurring month.",
        );
      } finally {
        setBusyOccurrenceKey(null);
      }
    });
  }

  async function handleClearOccurrence(ruleId: string, month: string) {
    await actions.run(`clear:${ruleId}:${month}`, async () => {
      setActionError(null);
      setActionNotice(null);
      setSyncSummary(null);
      setBusyOccurrenceKey(`${ruleId}:${month}:clear`);

      try {
        await apiMutation<void>(
          `/recurring-rules/${ruleId}/occurrences/${month}`,
          {
            method: "DELETE",
          },
        );

        await loadOccurrences(ruleId);
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to clear this recurring exception.",
        );
      } finally {
        setBusyOccurrenceKey(null);
      }
    });
  }

  function openOccurrenceManager(ruleId: string) {
    setActionError(null);
    setActionNotice(null);
    setSyncSummary(null);
    setEditingRuleId(null);
    setOccurrenceRuleId(ruleId);
    setOccurrenceMonth(MONTH_FORMATTER.format(new Date()));
    void loadOccurrences(ruleId);
  }

  function describeRule(rule: RecurringTransactionRuleResponse): string {
    if (rule.kind === "TRANSFER") {
      const source = rule.sourceAccountId
        ? (accountById.get(rule.sourceAccountId)?.name ?? rule.sourceAccountId)
        : "unknown";
      const destination = rule.destinationAccountId
        ? (accountById.get(rule.destinationAccountId)?.name ??
          rule.destinationAccountId)
        : "unknown";
      return `${source} -> ${destination}`;
    }

    return rule.accountId
      ? (accountById.get(rule.accountId)?.name ?? rule.accountId)
      : "Unassigned";
  }

  function ruleCurrency(rule: RecurringTransactionRuleResponse): string {
    if (rule.kind === "TRANSFER") {
      return rule.sourceAccountId
        ? (accountById.get(rule.sourceAccountId)?.currency ?? "EUR")
        : "EUR";
    }

    return rule.accountId
      ? (accountById.get(rule.accountId)?.currency ?? "EUR")
      : "EUR";
  }

  function ruleAppliesToMonth(
    rule: RecurringTransactionRuleResponse,
    month: string,
  ): boolean {
    const occurrenceDate = clampDateToMonth(month, rule.dayOfMonth);
    return (
      occurrenceDate >= rule.startDate &&
      (!rule.endDate || occurrenceDate <= rule.endDate)
    );
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-hero">
          <div className="page-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Automation</p>
              <h2 className="page-title is-compact">Recurring rules</h2>
              <p className="page-description">
                Monthly templates that create real due transactions on demand.
              </p>
            </div>

            <div className="page-hero-actions">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(true);
                  setOccurrenceRuleId(null);
                  setEditingRuleId(null);
                }}
                className="btn-primary"
              >
                New rule
              </button>
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={isSyncing}
                className="btn-primary"
              >
                {isSyncing ? "Syncing..." : "Sync due transactions"}
              </button>
            </div>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}
        {actionNotice ? (
          <CooldownNotice
            key={actionNotice}
            notice={actionNotice}
            className="page-inline-notice surface-warning"
          />
        ) : null}

        {syncSummary ? (
          <p className="page-inline-notice surface-success">
            Synced due transactions: created {syncSummary.createdCount},
            processed {syncSummary.processedRuleCount}, failed{" "}
            {syncSummary.failedRuleCount}.
          </p>
        ) : null}

        {rules.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No recurring rules yet.
          </div>
        ) : (
          <div className="list-stack is-loose">
            {rules.map((rule) => (
              <article key={rule.id} className="list-card is-roomy">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="section-stack-tight">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                        {rule.name}
                      </h3>
                      <span className="status-chip is-neutral">
                        {TRANSACTION_KIND_LABELS[rule.kind]}
                      </span>
                      <span
                        className={`status-chip ${rule.isActive ? "is-success" : "is-warning"}`}
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <p className="text-sm text-[var(--text-secondary)]">
                      Every month on day {rule.dayOfMonth}
                      {rule.endDate
                        ? ` · ${rule.startDate} to ${rule.endDate}`
                        : ` · from ${rule.startDate}`}
                    </p>

                    <p className="text-sm text-[var(--text-secondary)]">
                      {describeRule(rule)} ·{" "}
                      {formatCurrency(rule.amount, ruleCurrency(rule))}
                    </p>

                    {rule.description ? (
                      <p className="text-sm text-[var(--text-tertiary)]">
                        {rule.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOccurrenceRuleId(null);
                        setEditingRuleId(rule.id);
                      }}
                      className="link-button mobile-hit-target"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openOccurrenceManager(rule.id)}
                      className="link-button is-warning mobile-hit-target"
                    >
                      Exceptions
                    </button>
                    {rule.isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleDisable(rule.id)}
                        disabled={busyRuleId === rule.id}
                        className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyRuleId === rule.id ? "Disabling..." : "Disable"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {rule.lastMaterializationError ? (
                  <div className="mt-4 page-inline-notice surface-danger">
                    <p className="font-medium">Last materialization error</p>
                    <p className="mt-1">{rule.lastMaterializationError}</p>
                    {rule.lastMaterializationErrorAt ? (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {new Date(
                          rule.lastMaterializationErrorAt,
                        ).toLocaleString("it-IT")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create recurring rule"
        maxWidth={720}
      >
        <p className="section-subtitle">
          Define a monthly transaction or transfer that can materialize due
          rows.
        </p>
        <div className="mt-6">
          <RecurringRuleForm
            mode="create"
            accounts={accounts}
            categories={categories}
            expenseValidationRules={expenseValidationRules}
            initialValues={createEmptyRecurringRuleFormValues()}
            onSuccess={() => setIsCreateModalOpen(false)}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={editingRule !== null}
        onClose={() => setEditingRuleId(null)}
        title={editingRule ? `Edit ${editingRule.name}` : "Edit recurring rule"}
        maxWidth={720}
      >
        {editingRule ? (
          <>
            <p className="section-subtitle">
              Update cadence, accounts, or the active state.
            </p>
            <div className="mt-6">
              <RecurringRuleForm
                mode="edit"
                ruleId={editingRule.id}
                accounts={accounts}
                categories={categories}
                expenseValidationRules={expenseValidationRules}
                initialValues={recurringRuleToFormValues(editingRule)}
                onSuccess={() => setEditingRuleId(null)}
                onCancel={() => setEditingRuleId(null)}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={occurrenceRule !== null}
        onClose={() => setOccurrenceRuleId(null)}
        title={
          occurrenceRule
            ? `Occurrence exceptions · ${occurrenceRule.name}`
            : "Occurrence exceptions"
        }
        maxWidth={860}
      >
        {occurrenceRule ? (
          <div className="section-stack-relaxed">
            <p className="section-subtitle">
              Skip one month or save a linked override without detaching it from
              the rule.
            </p>

            <div className="page-section section-stack-relaxed">
              <div className="compact-toolbar">
                <div className="app-form-field">
                  <label htmlFor="occurrence-month">Month</label>
                  <input
                    id="occurrence-month"
                    type="month"
                    min={occurrenceRule.startDate.slice(0, 7)}
                    max={occurrenceRule.endDate?.slice(0, 7)}
                    value={occurrenceMonth}
                    onChange={(event) => setOccurrenceMonth(event.target.value)}
                  />
                </div>
                <div className="compact-toolbar-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void handleSkipOccurrence(
                        occurrenceRule.id,
                        occurrenceMonth,
                      )
                    }
                    disabled={
                      !ruleAppliesToMonth(occurrenceRule, occurrenceMonth) ||
                      busyOccurrenceKey ===
                        `${occurrenceRule.id}:${occurrenceMonth}:skip`
                    }
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyOccurrenceKey ===
                    `${occurrenceRule.id}:${occurrenceMonth}:skip`
                      ? "Skipping..."
                      : "Skip month"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void handleClearOccurrence(
                        occurrenceRule.id,
                        occurrenceMonth,
                      )
                    }
                    disabled={
                      !selectedOccurrence ||
                      busyOccurrenceKey ===
                        `${occurrenceRule.id}:${occurrenceMonth}:clear`
                    }
                    className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyOccurrenceKey ===
                    `${occurrenceRule.id}:${occurrenceMonth}:clear`
                      ? "Clearing..."
                      : "Use rule defaults"}
                  </button>
                </div>
              </div>

              {!ruleAppliesToMonth(occurrenceRule, occurrenceMonth) ? (
                <div className="page-inline-notice surface-warning">
                  This rule does not apply to {occurrenceMonth}. Pick a month
                  inside the rule schedule.
                </div>
              ) : (
                <RecurringOccurrenceForm
                  ruleId={occurrenceRule.id}
                  accounts={accounts}
                  categories={categories}
                  expenseValidationRules={expenseValidationRules}
                  initialValues={createRecurringOccurrenceFormValuesFromRule(
                    occurrenceRule,
                    occurrenceMonth,
                    selectedOccurrence,
                  )}
                  onSuccess={() => {
                    void loadOccurrences(occurrenceRule.id);
                  }}
                  onCancel={() => setOccurrenceRuleId(null)}
                />
              )}
            </div>

            <div className="page-section section-stack-tight">
              <h3 className="section-title">Exception history</h3>
              {isLoadingOccurrences ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Loading...
                </p>
              ) : occurrences.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  No saved exceptions for this rule yet.
                </p>
              ) : (
                <div className="list-stack is-relaxed">
                  {occurrences.map((occurrence) => (
                    <button
                      key={`${occurrence.recurringRuleId}:${occurrence.occurrenceMonth}`}
                      type="button"
                      onClick={() =>
                        setOccurrenceMonth(occurrence.occurrenceMonth)
                      }
                      className={`detail-panel is-roomy flex w-full items-center justify-between gap-3 text-left ${
                        occurrence.occurrenceMonth === occurrenceMonth
                          ? "surface-info"
                          : "surface-muted"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {occurrence.occurrenceMonth}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {occurrence.status === "SKIPPED"
                            ? "Skipped occurrence"
                            : (occurrence.description ??
                              "Overridden occurrence")}
                        </p>
                      </div>
                      <span
                        className={`status-chip ${
                          occurrence.status === "SKIPPED"
                            ? "is-warning"
                            : "is-info"
                        }`}
                      >
                        {occurrence.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function clampDateToMonth(month: string, dayOfMonth: number): string {
  const [year, numericMonth] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

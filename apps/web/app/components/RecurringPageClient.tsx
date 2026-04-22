"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  MaterializeRecurringRulesResponse,
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import RecurringOccurrenceForm from "@components/RecurringOccurrenceForm";
import RecurringRuleForm from "@components/RecurringRuleForm";
import { createRecurringOccurrenceFormValuesFromRule } from "@lib/recurring-occurrence-form";
import {
  createEmptyRecurringRuleFormValues,
  recurringRuleToFormValues,
} from "@lib/recurring-rule-form";
import { formatCurrency } from "@lib/format";
import { requestRecurringMaterialization } from "@lib/recurring-materialization";
import { TRANSACTION_KIND_LABELS } from "@lib/transactions";
import { getApiUrl, readApiError } from "@lib/api";

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

export default function RecurringPageClient({
  rules,
  accounts,
  categories,
}: {
  rules: RecurringTransactionRuleResponse[];
  accounts: AccountResponse[];
  categories: CategoryResponse[];
}) {
  const router = useRouter();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [occurrenceRuleId, setOccurrenceRuleId] = useState<string | null>(null);
  const [occurrenceMonth, setOccurrenceMonth] = useState<string>(
    MONTH_FORMATTER.format(new Date()),
  );
  const [occurrences, setOccurrences] = useState<RecurringOccurrenceResponse[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] =
    useState<MaterializeRecurringRulesResponse | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [busyOccurrenceKey, setBusyOccurrenceKey] = useState<string | null>(
    null,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingOccurrences, setIsLoadingOccurrences] = useState(false);

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
    setIsLoadingOccurrences(true);

    try {
      const response = await fetch(
        getApiUrl(`/recurring-rules/${ruleId}/occurrences`),
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        setActionError(await readApiError(response));
        setOccurrences([]);
        return;
      }

      setOccurrences((await response.json()) as RecurringOccurrenceResponse[]);
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
  }

  async function handleSync() {
    setActionError(null);
    setSyncSummary(null);
    setIsSyncing(true);

    try {
      const result = await requestRecurringMaterialization();
      if (!result.ok) {
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
  }

  async function handleDisable(ruleId: string) {
    setActionError(null);
    setSyncSummary(null);
    setBusyRuleId(ruleId);

    try {
      const response = await fetch(getApiUrl(`/recurring-rules/${ruleId}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setActionError(await readApiError(response));
        return;
      }

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
  }

  async function handleSkipOccurrence(ruleId: string, month: string) {
    setActionError(null);
    setSyncSummary(null);
    setBusyOccurrenceKey(`${ruleId}:${month}:skip`);

    try {
      const response = await fetch(
        getApiUrl(`/recurring-rules/${ruleId}/occurrences/${month}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SKIPPED" }),
        },
      );

      if (!response.ok) {
        setActionError(await readApiError(response));
        return;
      }

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
  }

  async function handleClearOccurrence(ruleId: string, month: string) {
    setActionError(null);
    setSyncSummary(null);
    setBusyOccurrenceKey(`${ruleId}:${month}:clear`);

    try {
      const response = await fetch(
        getApiUrl(`/recurring-rules/${ruleId}/occurrences/${month}`),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        setActionError(await readApiError(response));
        return;
      }

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
  }

  function openOccurrenceManager(ruleId: string) {
    setActionError(null);
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Recurring rules
            </h2>
            <p className="text-sm text-gray-500">
              Monthly templates that create real due transactions on demand.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setOccurrenceRuleId(null);
                setEditingRuleId(null);
              }}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              New rule
            </button>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={isSyncing}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncing ? "Syncing..." : "Sync due transactions"}
            </button>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-red-600">
            {actionError}
          </p>
        ) : null}

        {syncSummary ? (
          <p className="text-sm text-emerald-700">
            Synced due transactions: created {syncSummary.createdCount},
            processed {syncSummary.processedRuleCount}, failed{" "}
            {syncSummary.failedRuleCount}.
          </p>
        ) : null}

        {rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No recurring rules yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <article
                key={rule.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {rule.name}
                      </h3>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {TRANSACTION_KIND_LABELS[rule.kind]}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          rule.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600">
                      Every month on day {rule.dayOfMonth}
                      {rule.endDate
                        ? ` · ${rule.startDate} to ${rule.endDate}`
                        : ` · from ${rule.startDate}`}
                    </p>

                    <p className="text-sm text-gray-500">
                      {describeRule(rule)} ·{" "}
                      {formatCurrency(rule.amount, ruleCurrency(rule))}
                    </p>

                    <p className="text-sm text-gray-500">{rule.description}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOccurrenceRuleId(null);
                        setEditingRuleId(rule.id);
                      }}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openOccurrenceManager(rule.id)}
                      className="text-sm font-medium text-amber-700 hover:underline"
                    >
                      Exceptions
                    </button>
                    {rule.isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleDisable(rule.id)}
                        disabled={busyRuleId === rule.id}
                        className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyRuleId === rule.id ? "Disabling..." : "Disable"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {rule.lastMaterializationError ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <p className="font-medium">Last materialization error</p>
                    <p className="mt-1">{rule.lastMaterializationError}</p>
                    {rule.lastMaterializationErrorAt ? (
                      <p className="mt-1 text-xs text-red-600">
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

      <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">
          {occurrenceRule
            ? `Occurrence exceptions · ${occurrenceRule.name}`
            : editingRule
              ? "Edit recurring rule"
              : "Create recurring rule"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {occurrenceRule
            ? "Skip one month or save a linked override without detaching it from the rule."
            : editingRule
              ? "Update cadence, accounts, or the active state."
              : "Define a monthly transaction or transfer that can materialize due rows."}
        </p>

        <div className="mt-6">
          {occurrenceRule ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    Month
                  </label>
                  <input
                    className="rounded-lg border px-3 py-2"
                    type="month"
                    min={occurrenceRule.startDate.slice(0, 7)}
                    max={occurrenceRule.endDate?.slice(0, 7)}
                    value={occurrenceMonth}
                    onChange={(event) => setOccurrenceMonth(event.target.value)}
                  />
                </div>
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
                  className="self-end rounded-lg border border-amber-200 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="self-end rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyOccurrenceKey ===
                  `${occurrenceRule.id}:${occurrenceMonth}:clear`
                    ? "Clearing..."
                    : "Use rule defaults"}
                </button>
              </div>

              {!ruleAppliesToMonth(occurrenceRule, occurrenceMonth) ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  This rule does not apply to {occurrenceMonth}. Pick a month
                  inside the rule schedule.
                </div>
              ) : (
                <RecurringOccurrenceForm
                  ruleId={occurrenceRule.id}
                  accounts={accounts}
                  categories={categories}
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

              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Exception history
                </h3>
                {isLoadingOccurrences ? (
                  <p className="mt-2 text-sm text-gray-500">Loading...</p>
                ) : occurrences.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">
                    No saved exceptions for this rule yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {occurrences.map((occurrence) => (
                      <button
                        key={`${occurrence.recurringRuleId}:${occurrence.occurrenceMonth}`}
                        type="button"
                        onClick={() =>
                          setOccurrenceMonth(occurrence.occurrenceMonth)
                        }
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm ${
                          occurrence.occurrenceMonth === occurrenceMonth
                            ? "bg-blue-50 text-blue-950 ring-1 ring-blue-200"
                            : "bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div>
                          <p className="font-medium">
                            {occurrence.occurrenceMonth}
                          </p>
                          <p className="text-xs text-gray-500">
                            {occurrence.status === "SKIPPED"
                              ? "Skipped occurrence"
                              : (occurrence.description ??
                                "Overridden occurrence")}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            occurrence.status === "SKIPPED"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
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
          ) : (
            <RecurringRuleForm
              mode={editingRule ? "edit" : "create"}
              ruleId={editingRule?.id}
              accounts={accounts}
              categories={categories}
              initialValues={
                editingRule
                  ? recurringRuleToFormValues(editingRule)
                  : createEmptyRecurringRuleFormValues()
              }
              onSuccess={() => setEditingRuleId(null)}
              onCancel={editingRule ? () => setEditingRuleId(null) : undefined}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function clampDateToMonth(month: string, dayOfMonth: number): string {
  const [year, numericMonth] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

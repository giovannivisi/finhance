"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  MaterializeRecurringRulesResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import RecurringRuleForm from "@components/RecurringRuleForm";
import {
  createEmptyRecurringRuleFormValues,
  recurringRuleToFormValues,
} from "@lib/recurring-rule-form";
import { formatCurrency } from "@lib/format";
import { TRANSACTION_KIND_LABELS } from "@lib/transactions";
import { getApiUrl, readApiError } from "@lib/api";

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] =
    useState<MaterializeRecurringRulesResponse | null>(null);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  async function handleSync() {
    setActionError(null);
    setSyncSummary(null);
    setIsSyncing(true);

    try {
      const response = await fetch(getApiUrl("/recurring-rules/materialize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setActionError(await readApiError(response));
        return;
      }

      setSyncSummary(
        (await response.json()) as MaterializeRecurringRulesResponse,
      );
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
              onClick={() => setEditingRuleId(null)}
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
                      onClick={() => setEditingRuleId(rule.id)}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Edit
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
          {editingRule ? "Edit recurring rule" : "Create recurring rule"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {editingRule
            ? "Update cadence, accounts, or the active state."
            : "Define a monthly transaction or transfer that can materialize due rows."}
        </p>

        <div className="mt-6">
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
        </div>
      </aside>
    </div>
  );
}

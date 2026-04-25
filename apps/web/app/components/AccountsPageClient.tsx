"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "@finhance/shared";
import AccountForm from "@components/AccountForm";
import {
  accountToFormValues,
  createEmptyAccountFormValues,
} from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS } from "@lib/accounts";
import { apiMutation } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { useSingleFlightActions } from "@lib/single-flight";

const STATUS_STYLES: Record<string, string> = {
  CLEAN: "bg-emerald-100 text-emerald-800",
  MISMATCH: "bg-amber-100 text-amber-800",
  UNSUPPORTED: "bg-red-100 text-red-800",
};

const DIAGNOSTIC_STYLES: Record<string, string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-950",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
};

const GUIDANCE_STYLES: Record<string, string> = {
  SAFE: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  SUSPICIOUS: "bg-amber-50 text-amber-950 ring-amber-200",
  BLOCKED: "bg-gray-100 text-gray-800 ring-gray-200",
};

export default function AccountsPageClient({
  accounts,
  reconciliations,
}: {
  accounts: AccountResponse[];
  reconciliations: AccountReconciliationResponse[];
}) {
  const router = useRouter();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(
    null,
  );
  const [archivingAccountId, setArchivingAccountId] = useState<string | null>(
    null,
  );
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(
    null,
  );
  const actions = useSingleFlightActions<string>();

  const editingAccount =
    accounts.find((account) => account.id === editingAccountId) ?? null;

  const visibleAccounts = useMemo(
    () =>
      showArchived
        ? accounts
        : accounts.filter((account) => account.archivedAt === null),
    [accounts, showArchived],
  );
  const reconciliationByAccountId = useMemo(
    () =>
      new Map(
        reconciliations.map((reconciliation) => [
          reconciliation.accountId,
          reconciliation,
        ]),
      ),
    [reconciliations],
  );

  async function handleArchive(accountId: string) {
    await actions.run(`archive:${accountId}`, async () => {
      setArchiveError(null);
      setReconciliationError(null);
      setArchivingAccountId(accountId);

      try {
        await apiMutation<void>(`/accounts/${accountId}`, {
          method: "DELETE",
        });

        if (editingAccountId === accountId) {
          setEditingAccountId(null);
        }

        router.refresh();
      } catch (error) {
        setArchiveError(
          error instanceof Error ? error.message : "Unable to archive account.",
        );
      } finally {
        setArchivingAccountId(null);
      }
    });
  }

  async function handleCreateAdjustment(accountId: string) {
    await actions.run(`adjust:${accountId}`, async () => {
      setArchiveError(null);
      setReconciliationError(null);
      setAdjustingAccountId(accountId);

      try {
        await apiMutation(`/accounts/${accountId}/reconciliation/adjust`, {
          method: "POST",
        });

        router.refresh();
      } catch (error) {
        setReconciliationError(
          error instanceof Error
            ? error.message
            : "Unable to create reconciliation adjustment.",
        );
      } finally {
        setAdjustingAccountId(null);
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Accounts</h2>
            <p className="text-sm text-gray-500">
              Accounts organize assets and liabilities without affecting totals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>

            <button
              type="button"
              onClick={() => setEditingAccountId(null)}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              New account
            </button>
          </div>
        </div>

        {archiveError ? (
          <p role="alert" className="text-sm text-red-600">
            {archiveError}
          </p>
        ) : null}

        {reconciliationError ? (
          <p role="alert" className="text-sm text-red-600">
            {reconciliationError}
          </p>
        ) : null}

        {visibleAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No accounts yet.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAccounts.map((account) =>
              (() => {
                const reconciliation =
                  reconciliationByAccountId.get(account.id) ?? null;

                return (
                  <article
                    key={account.id}
                    className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {account.name}
                          </h3>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </span>
                          {account.archivedAt ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                              Archived
                            </span>
                          ) : null}
                          {reconciliation ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[reconciliation.status]}`}
                            >
                              {reconciliation.status}
                            </span>
                          ) : null}
                        </div>

                        <p className="text-sm text-gray-600">
                          {account.currency}
                          {account.institution
                            ? ` • ${account.institution}`
                            : ""}
                        </p>

                        {account.notes ? (
                          <p className="text-sm text-gray-500">
                            {account.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3">
                        {reconciliation?.canCreateAdjustment ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCreateAdjustment(account.id)
                            }
                            disabled={adjustingAccountId === account.id}
                            className="text-sm font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adjustingAccountId === account.id
                              ? "Adjusting..."
                              : "Create adjustment"}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setEditingAccountId(account.id)}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Edit
                        </button>

                        {!account.archivedAt ? (
                          <button
                            type="button"
                            onClick={() => void handleArchive(account.id)}
                            disabled={archivingAccountId === account.id}
                            className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {archivingAccountId === account.id
                              ? "Archiving..."
                              : "Archive"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {reconciliation ? (
                      <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs text-gray-600">
                          {account.openingBalanceDate
                            ? `Baseline: ${formatCurrency(
                                account.openingBalance,
                                account.currency,
                              )} from ${account.openingBalanceDate}`
                            : "Baseline: full transaction history"}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Mode:{" "}
                          {reconciliation.baselineMode === "OPENING_BALANCE"
                            ? "Opening balance baseline"
                            : "Full history baseline"}
                        </p>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              Tracked
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {reconciliation.trackedBalance === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.trackedBalance,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              Expected
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {reconciliation.expectedBalance === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.expectedBalance,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              Delta
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">
                              {reconciliation.delta === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.delta,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                          <span>
                            {reconciliation.assetCount} assets assigned
                          </span>
                          <span>
                            {reconciliation.transactionCount} transactions
                          </span>
                        </div>

                        <div
                          className={`mt-4 rounded-2xl px-4 py-3 text-sm ring-1 ${GUIDANCE_STYLES[reconciliation.adjustmentGuidance.status]}`}
                        >
                          <p className="font-medium">
                            Adjustment guidance:{" "}
                            {reconciliation.adjustmentGuidance.status}
                          </p>
                          <p className="mt-1">
                            {reconciliation.adjustmentGuidance.message}
                          </p>
                        </div>

                        {reconciliation.diagnostics.length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {reconciliation.diagnostics.map((diagnostic) => (
                              <article
                                key={`${account.id}:${diagnostic.code}`}
                                className={`rounded-2xl border px-4 py-3 text-sm ${DIAGNOSTIC_STYLES[diagnostic.severity]}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-medium">
                                    {diagnostic.summary}
                                  </p>
                                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium">
                                    {diagnostic.code}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm">
                                  Likely cause: {diagnostic.likelyCause}
                                </p>
                                <p className="mt-1 text-sm">
                                  Recommended action:{" "}
                                  {diagnostic.recommendedAction}
                                </p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-gray-500">
                            No structural reconciliation warnings for this
                            account.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })(),
            )}
          </div>
        )}
      </section>

      <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">
          {editingAccount ? "Edit account" : "Create account"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {editingAccount
            ? "Update account details or ordering."
            : "Add a new container for assets and liabilities."}
        </p>

        <div className="mt-6">
          <AccountForm
            mode={editingAccount ? "edit" : "create"}
            accountId={editingAccount?.id}
            initialValues={
              editingAccount
                ? accountToFormValues(editingAccount)
                : createEmptyAccountFormValues()
            }
            onSuccess={() => setEditingAccountId(null)}
            onCancel={
              editingAccount ? () => setEditingAccountId(null) : undefined
            }
          />
        </div>
      </aside>
    </div>
  );
}

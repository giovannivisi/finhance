"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountResponse } from "@finhance/shared";
import AccountForm from "@components/AccountForm";
import {
  accountToFormValues,
  createEmptyAccountFormValues,
} from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS } from "@lib/accounts";
import { getApiUrl, readApiError } from "@lib/api";

export default function AccountsPageClient({
  accounts,
}: {
  accounts: AccountResponse[];
}) {
  const router = useRouter();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archivingAccountId, setArchivingAccountId] = useState<string | null>(
    null,
  );

  const editingAccount =
    accounts.find((account) => account.id === editingAccountId) ?? null;

  const visibleAccounts = useMemo(
    () =>
      showArchived
        ? accounts
        : accounts.filter((account) => account.archivedAt === null),
    [accounts, showArchived],
  );

  async function handleArchive(accountId: string) {
    setArchiveError(null);
    setArchivingAccountId(accountId);

    try {
      const response = await fetch(getApiUrl(`/accounts/${accountId}`), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setArchiveError(await readApiError(response));
        return;
      }

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

        {visibleAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No accounts yet.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAccounts.map((account) => (
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
                    </div>

                    <p className="text-sm text-gray-600">
                      {account.currency}
                      {account.institution ? ` • ${account.institution}` : ""}
                    </p>

                    {account.notes ? (
                      <p className="text-sm text-gray-500">{account.notes}</p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
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
              </article>
            ))}
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

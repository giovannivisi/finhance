"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "@finhance/shared";
import AccountForm from "@components/AccountForm";
import Modal from "@components/Modal";
import {
  accountToFormValues,
  createEmptyAccountFormValues,
} from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS } from "@lib/accounts";
import { apiMutation } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { useSingleFlightActions } from "@lib/single-flight";

const STATUS_STYLES: Record<string, string> = {
  CLEAN: "status-chip is-success",
  MISMATCH: "status-chip is-warning",
  UNSUPPORTED: "status-chip is-danger",
};

const DIAGNOSTIC_STYLES: Record<string, string> = {
  INFO: "page-inline-notice surface-info",
  WARNING: "page-inline-notice surface-warning",
};

const GUIDANCE_STYLES: Record<string, string> = {
  SAFE: "page-inline-notice surface-success",
  SUSPICIOUS: "page-inline-notice surface-warning",
  BLOCKED: "page-inline-notice",
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(
    null,
  );
  const [pendingArchiveAccountId, setPendingArchiveAccountId] = useState<
    string | null
  >(null);
  const [pendingUnarchiveAccountId, setPendingUnarchiveAccountId] = useState<
    string | null
  >(null);
  const [pendingDeleteAccountId, setPendingDeleteAccountId] = useState<
    string | null
  >(null);
  const [pendingBaselineAccountId, setPendingBaselineAccountId] = useState<
    string | null
  >(null);
  const [adjustingAccountId, setAdjustingAccountId] = useState<string | null>(
    null,
  );
  const [expandedReconciliationInfoById, setExpandedReconciliationInfoById] =
    useState<Record<string, boolean>>({});
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
      setActionError(null);
      setReconciliationError(null);
      setPendingArchiveAccountId(accountId);

      try {
        await apiMutation<void>(`/accounts/${accountId}`, {
          method: "DELETE",
        });

        if (editingAccountId === accountId) {
          setEditingAccountId(null);
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to archive account.",
        );
      } finally {
        setPendingArchiveAccountId(null);
      }
    });
  }

  async function handleUnarchive(accountId: string) {
    await actions.run(`unarchive:${accountId}`, async () => {
      setActionError(null);
      setReconciliationError(null);
      setPendingUnarchiveAccountId(accountId);

      try {
        await apiMutation<void>(`/accounts/${accountId}/unarchive`, {
          method: "POST",
        });
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to unarchive account.",
        );
      } finally {
        setPendingUnarchiveAccountId(null);
      }
    });
  }

  async function handleDeletePermanently(accountId: string) {
    await actions.run(`delete:${accountId}`, async () => {
      setActionError(null);
      setReconciliationError(null);
      setPendingDeleteAccountId(accountId);

      const confirmed = confirm(
        "Delete this archived account permanently? This cannot be undone.",
      );
      if (!confirmed) {
        setPendingDeleteAccountId(null);
        return;
      }

      try {
        await apiMutation<void>(`/accounts/${accountId}/permanent`, {
          method: "DELETE",
        });

        if (editingAccountId === accountId) {
          setEditingAccountId(null);
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to delete this account permanently.",
        );
      } finally {
        setPendingDeleteAccountId(null);
      }
    });
  }

  async function handleEstablishBaseline(accountId: string) {
    await actions.run(`baseline:${accountId}`, async () => {
      setActionError(null);
      setReconciliationError(null);
      setPendingBaselineAccountId(accountId);

      try {
        await apiMutation<void>(
          `/accounts/${accountId}/opening-balance-baseline`,
          {
            method: "POST",
          },
        );
        router.refresh();
      } catch (error) {
        setReconciliationError(
          error instanceof Error
            ? error.message
            : "Unable to establish an opening balance baseline.",
        );
      } finally {
        setPendingBaselineAccountId(null);
      }
    });
  }

  async function handleCreateAdjustment(accountId: string) {
    await actions.run(`adjust:${accountId}`, async () => {
      setActionError(null);
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

  function toggleReconciliationInfo(accountId: string) {
    setExpandedReconciliationInfoById((current) => ({
      ...current,
      [accountId]: !current[accountId],
    }));
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-hero">
          <div className="page-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Structure</p>
              <h2 className="page-title is-compact">Accounts</h2>
              <p className="page-description">
                Accounts organize assets and liabilities without affecting
                totals.
              </p>
            </div>

            <div className="page-hero-actions">
              <label className="page-pill">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Show archived
              </label>

              <button
                type="button"
                onClick={() => {
                  setEditingAccountId(null);
                  setIsCreateModalOpen(true);
                }}
                className="btn-primary"
              >
                New account
              </button>
            </div>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

        {reconciliationError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {reconciliationError}
          </p>
        ) : null}

        {visibleAccounts.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No accounts yet.
          </div>
        ) : (
          <div className="list-stack is-loose">
            {visibleAccounts.map((account) =>
              (() => {
                const reconciliation =
                  reconciliationByAccountId.get(account.id) ?? null;
                const institution = account.institution?.trim() ?? "";
                const institutionLabel =
                  institution &&
                  institution.toLocaleLowerCase() !==
                    account.name.trim().toLocaleLowerCase()
                    ? institution
                    : null;
                const isReconciliationInfoExpanded =
                  expandedReconciliationInfoById[account.id] ?? false;

                return (
                  <article key={account.id} className="list-card is-roomy">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      <div className="account-header-copy">
                        <div className="account-title-row">
                          <h3 className="account-title text-lg font-semibold text-[var(--text-primary)]">
                            {account.name}
                          </h3>
                          <span className="account-currency-inline">
                            ({account.currency})
                          </span>
                          <span className="status-chip is-neutral">
                            {ACCOUNT_TYPE_LABELS[account.type]}
                          </span>
                          {account.archivedAt ? (
                            <span className="status-chip is-warning">
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

                        {institutionLabel ? (
                          <p className="account-institution-meta">
                            {institutionLabel}
                          </p>
                        ) : null}

                        {account.notes ? (
                          <p className="text-sm text-[var(--text-secondary)]">
                            {account.notes}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        {reconciliation?.canCreateAdjustment ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCreateAdjustment(account.id)
                            }
                            disabled={adjustingAccountId === account.id}
                            className="link-button mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adjustingAccountId === account.id
                              ? "Adjusting..."
                              : "Create adjustment"}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setEditingAccountId(account.id)}
                          className="link-button mobile-hit-target"
                        >
                          Edit
                        </button>

                        {account.type === "BROKER" && !account.archivedAt ? (
                          <Link
                            href={`/brokerage/${account.id}`}
                            className="link-button mobile-hit-target"
                          >
                            Open brokerage
                          </Link>
                        ) : null}

                        {!account.archivedAt ? (
                          <button
                            type="button"
                            onClick={() => void handleArchive(account.id)}
                            disabled={pendingArchiveAccountId === account.id}
                            className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {pendingArchiveAccountId === account.id
                              ? "Archiving..."
                              : "Archive"}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleUnarchive(account.id)}
                              disabled={
                                pendingUnarchiveAccountId === account.id
                              }
                              className="link-button mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {pendingUnarchiveAccountId === account.id
                                ? "Unarchiving..."
                                : "Unarchive"}
                            </button>
                            {account.canDeletePermanently ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeletePermanently(account.id)
                                }
                                disabled={pendingDeleteAccountId === account.id}
                                className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {pendingDeleteAccountId === account.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                    {reconciliation ? (
                      <div className="detail-panel is-roomy section-stack-relaxed">
                        <div className="metric-strip is-relaxed">
                          <div className="detail-panel is-roomy">
                            <p className="detail-metric-label">
                              {account.type === "BROKER"
                                ? "Tracked cash"
                                : "Tracked"}
                            </p>
                            <p className="detail-metric-value">
                              {reconciliation.trackedBalance === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.trackedBalance,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>

                          <div className="detail-panel is-roomy">
                            <p className="detail-metric-label">
                              {account.type === "BROKER"
                                ? "Expected cash"
                                : "Expected"}
                            </p>
                            <p className="detail-metric-value">
                              {reconciliation.expectedBalance === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.expectedBalance,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>

                          <div className="detail-panel is-roomy">
                            <p className="detail-metric-label">Delta</p>
                            <p className="detail-metric-value">
                              {reconciliation.delta === null
                                ? "Unavailable"
                                : formatCurrency(
                                    reconciliation.delta,
                                    reconciliation.currency,
                                  )}
                            </p>
                          </div>
                        </div>

                        <div className="account-reconciliation-disclosure">
                          <button
                            type="button"
                            aria-expanded={isReconciliationInfoExpanded}
                            aria-controls={`account-reconciliation-extra-${account.id}`}
                            onClick={() => toggleReconciliationInfo(account.id)}
                            className="account-reconciliation-toggle"
                          >
                            <span
                              aria-hidden="true"
                              className={`account-reconciliation-toggle-indicator${
                                isReconciliationInfoExpanded ? " is-open" : ""
                              }`}
                            >
                              {isReconciliationInfoExpanded ? "−" : "+"}
                            </span>
                            <span>
                              {isReconciliationInfoExpanded
                                ? "Hide info"
                                : "More info"}
                            </span>
                          </button>

                          {isReconciliationInfoExpanded ? (
                            <div
                              id={`account-reconciliation-extra-${account.id}`}
                              className="account-reconciliation-details"
                            >
                              <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                                {account.type === "BROKER" ? (
                                  <p>
                                    Brokerage reconciliation tracks cash
                                    movements only. Open positions are excluded
                                    from this balance check.
                                  </p>
                                ) : null}
                                <p>
                                  {account.openingBalanceDate
                                    ? `Baseline: ${formatCurrency(
                                        account.openingBalance,
                                        account.currency,
                                      )} from ${account.openingBalanceDate}`
                                    : "Baseline: full transaction history"}
                                </p>
                                <p>
                                  Mode:{" "}
                                  {reconciliation.baselineMode ===
                                  "OPENING_BALANCE"
                                    ? "Opening balance baseline"
                                    : "Full history baseline"}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                                <span>
                                  {reconciliation.assetCount} assets assigned
                                </span>
                                <span>
                                  {reconciliation.transactionCount} transactions
                                </span>
                              </div>

                              <div
                                className={`${GUIDANCE_STYLES[reconciliation.adjustmentGuidance.status]}`}
                              >
                                <p className="font-medium">
                                  Adjustment guidance:{" "}
                                  {reconciliation.adjustmentGuidance.status}
                                </p>
                                <p className="mt-1">
                                  {reconciliation.adjustmentGuidance.message}
                                </p>
                              </div>

                              {reconciliation.openingBalanceBaselineGuidance ? (
                                <div className="page-inline-notice surface-info">
                                  <p className="font-medium">
                                    Opening balance baseline
                                  </p>
                                  <p className="mt-1">
                                    {
                                      reconciliation.openingBalanceBaselineGuidance
                                    }
                                  </p>
                                  {reconciliation.canEstablishOpeningBalanceBaseline ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleEstablishBaseline(account.id)
                                      }
                                      disabled={
                                        pendingBaselineAccountId === account.id
                                      }
                                      className="mt-3 link-button disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {pendingBaselineAccountId === account.id
                                        ? "Setting baseline..."
                                        : "Set opening balance from current state"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}

                              {reconciliation.diagnostics.length > 0 ? (
                                <div className="space-y-3">
                                  {reconciliation.diagnostics.map(
                                    (diagnostic) => (
                                      <article
                                        key={`${account.id}:${diagnostic.code}`}
                                        className={
                                          DIAGNOSTIC_STYLES[diagnostic.severity]
                                        }
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="font-medium">
                                            {diagnostic.summary}
                                          </p>
                                          <span className="status-chip is-neutral">
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
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-[var(--text-secondary)]">
                                  No structural reconciliation warnings for this
                                  account.
                                </p>
                              )}

                              {account.archivedAt &&
                              account.deleteBlockReason ? (
                                <p className="text-sm text-[var(--text-secondary)]">
                                  Permanent delete blocked:{" "}
                                  {account.deleteBlockReason}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })(),
            )}
          </div>
        )}
      </section>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create account"
        maxWidth={640}
      >
        <p className="section-subtitle">
          Add a new container for assets and liabilities.
        </p>
        <div className="mt-6">
          <AccountForm
            mode="create"
            initialValues={createEmptyAccountFormValues()}
            onSuccess={() => setIsCreateModalOpen(false)}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={editingAccount !== null}
        onClose={() => setEditingAccountId(null)}
        title={editingAccount ? `Edit ${editingAccount.name}` : "Edit account"}
        maxWidth={640}
      >
        {editingAccount ? (
          <>
            <p className="section-subtitle">
              Update account details or reconciliation context.
            </p>
            <div className="mt-6">
              <AccountForm
                mode="edit"
                accountId={editingAccount.id}
                initialValues={accountToFormValues(editingAccount)}
                onSuccess={() => setEditingAccountId(null)}
                onCancel={() => setEditingAccountId(null)}
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

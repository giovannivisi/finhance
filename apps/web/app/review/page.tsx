import Link from "next/link";
import type {
  MonthlyReviewResponse,
  MonthlyReviewWarningResponse,
  RecurringPendingStatusResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";

import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import ReviewBudgetStatusChart from "@components/ReviewBudgetStatusChart";
import ReviewMonthPicker from "@components/ReviewMonthPicker";
import ReviewCaptureSnapshotButton from "@components/ReviewCaptureSnapshotButton";
import WorkflowSection from "@components/WorkflowSection";
import MoneyValue from "@components/MoneyValue";
import { api } from "@lib/server-api";
import { formatCurrency } from "@lib/format";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
import {
  formatHierarchyName,
  groupRowsByPrimary,
} from "@lib/hierarchical-categories";
import { TRANSACTION_KIND_LABELS } from "@lib/transactions";
import { getReviewWarningLink, shouldOfferSnapshotCapture } from "@lib/review";
import { getWorkflowCards } from "@lib/workflow";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

function getMonthParam(
  value: string | string[] | undefined,
  fallback: string,
): string {
  const resolved = Array.isArray(value)
    ? (value[0] ?? fallback)
    : (value ?? fallback);
  return /^\d{4}-\d{2}$/.test(resolved) ? resolved : fallback;
}

function renderWarningMeta(
  warning: MonthlyReviewWarningResponse,
): string | null {
  if (warning.amount !== null && warning.currency) {
    return formatCurrency(warning.amount, warning.currency);
  }

  if (warning.count !== null) {
    return `${warning.count} item${warning.count === 1 ? "" : "s"}`;
  }

  return null;
}

function getDriverBarWidth(total: number, maxTotal: number): string {
  if (maxTotal <= 0) {
    return "0%";
  }

  return `${Math.max(12, Math.min(100, (total / maxTotal) * 100))}%`;
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const fallbackMonth = MONTH_FORMATTER.format(new Date());
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const month = getMonthParam(resolvedSearchParams.month, fallbackMonth);

  let review: MonthlyReviewResponse | null = null;
  let setup: SetupStatusResponse | null = null;
  let errorMessage: string | null = null;

  try {
    review = await api<MonthlyReviewResponse>(
      `/monthly-review?month=${encodeURIComponent(month)}`,
    );
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Monthly review data is currently unavailable.";
  }

  let hasPendingSync = false;

  if (review) {
    const [resolvedSetup, pendingStatus] = await Promise.all([
      api<SetupStatusResponse>("/setup/status?includeWarnings=false").catch(
        () => null,
      ),
      api<RecurringPendingStatusResponse>("/recurring-rules/has-pending").catch(
        () => null,
      ),
    ]);
    setup = resolvedSetup;
    hasPendingSync = pendingStatus?.hasPending ?? false;
  }

  if (!review) {
    return (
      <>
        <Container>
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Monthly close</p>
              <h1 className="page-title is-compact">Review</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        </Container>
      </>
    );
  }

  const cashflowByCurrency = new Map(
    review.cashflow.map((bucket) => [bucket.currency, bucket]),
  );
  const reconciliationIssueCount = review.reconciliationHighlights.reduce(
    (sum, item) => sum + Math.max(item.diagnostics.length, 1),
    0,
  );
  const offerSnapshotCapture = shouldOfferSnapshotCapture(
    review.month,
    review.warnings,
  );
  const workflowCards = getWorkflowCards({
    currentPage: "review",
    month: review.month,
    setup,
  });

  return (
    <>
      <Container>
        <div className="page-shell is-relaxed route-stack-desktop-xl">
          <section className="page-hero">
            <div className="section-stack-desktop-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="page-kicker">Monthly close</p>
                  <h1 className="page-title is-compact">Monthly review</h1>
                  <p className="page-description">
                    Explain what happened in {review.month}, what still needs
                    attention, and what changed your trajectory.
                  </p>
                </div>

                <ReviewMonthPicker currentMonth={review.month} />
              </div>

              <div className="summary-grid is-loose md:grid-cols-2 xl:grid-cols-3">
                <div className="summary-card">
                  <p className="summary-card-label">Opening net worth</p>
                  <p className="summary-card-value">
                    {review.openingNetWorth === null ? (
                      "Unavailable"
                    ) : (
                      <MoneyValue value={review.openingNetWorth} />
                    )}
                  </p>
                  <p className="summary-card-note">
                    {review.openingSnapshotDate
                      ? `Snapshot ${review.openingSnapshotDate}`
                      : "No opening snapshot boundary"}
                  </p>
                </div>

                <div className="summary-card">
                  <p className="summary-card-label">Closing net worth</p>
                  <p className="summary-card-value">
                    {review.closingNetWorth === null ? (
                      "Unavailable"
                    ) : (
                      <MoneyValue value={review.closingNetWorth} />
                    )}
                  </p>
                  <p className="summary-card-note">
                    {review.closingSnapshotDate
                      ? `Snapshot ${review.closingSnapshotDate}`
                      : "No closing snapshot boundary"}
                  </p>
                </div>

                <div className="summary-card">
                  <p className="summary-card-label">Net worth delta</p>
                  <p className="summary-card-value">
                    {review.netWorthDelta === null ? (
                      "Unavailable"
                    ) : (
                      <MoneyValue value={review.netWorthDelta} />
                    )}
                  </p>
                  <p className="summary-card-note">
                    Based on the nearest available snapshots around the month.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="page-section is-spacious section-stack-desktop-xl">
            <div className="summary-grid is-loose md:grid-cols-2 xl:grid-cols-3">
              <div className="summary-card">
                <p className="summary-card-label">Review warnings</p>
                <p className="summary-card-value">{review.warnings.length}</p>
                <p className="summary-card-note">
                  {review.warnings.length === 0
                    ? "No open warning cards."
                    : "Use the actions below before trusting the month fully."}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-card-label">Budget highlights</p>
                <p className="summary-card-value">
                  {review.budgetHighlights.length}
                </p>
                <p className="summary-card-note">
                  {review.budgetHighlights.length === 0
                    ? "No categories are currently over budget."
                    : "Most important over-budget categories are highlighted below."}
                </p>
              </div>
              <div className="summary-card">
                <p className="summary-card-label">Reconciliation issues</p>
                <p className="summary-card-value">{reconciliationIssueCount}</p>
                <p className="summary-card-note">
                  {reconciliationIssueCount === 0
                    ? "All active accounts reconcile cleanly."
                    : "Diagnostics below explain the accounts still weakening trust."}
                </p>
              </div>
            </div>

            <div className="page-inline-notice surface-info section-stack-desktop-xl">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="section-title">Why net worth moved</h2>
                  <p className="section-subtitle">
                    {review.netWorthExplanation.note ??
                      "No additional explanation is available for this month."}
                  </p>
                </div>
                <span
                  className={`status-chip ${
                    review.netWorthExplanation.isComparableInEur
                      ? "is-success"
                      : "is-warning"
                  }`}
                >
                  {review.netWorthExplanation.isComparableInEur
                    ? "Comparable in EUR"
                    : "Limited explanation"}
                </span>
              </div>

              {hasPendingSync ? (
                <div className="mt-4 detail-panel is-roomy">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Recurring sync
                      </h3>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        There are recurring transactions due that haven&apos;t
                        been added to the ledger yet. Sync to include them
                        before reviewing the month.
                      </p>
                    </div>
                    <RecurringMaterializeButton />
                  </div>
                </div>
              ) : null}

              <div className="summary-grid is-loose md:grid-cols-2">
                <div className="summary-card">
                  <p className="summary-card-label">Cashflow contribution</p>
                  <p className="summary-card-value">
                    {review.netWorthExplanation.cashflowContributionEur === null
                      ? "Unavailable"
                      : formatCurrency(
                          review.netWorthExplanation.cashflowContributionEur,
                        )}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-card-label">Valuation movement</p>
                  <p className="summary-card-value">
                    {review.netWorthExplanation.valuationMovementEur === null
                      ? "Unavailable"
                      : formatCurrency(
                          review.netWorthExplanation.valuationMovementEur,
                        )}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <WorkflowSection
            title="Continue the workflow"
            description="Once this month makes sense, move into budgets and multi-month analytics without losing the same month context."
            className="is-roomy"
            cards={workflowCards}
          />

          <section className="page-section is-spacious section-stack-relaxed">
            <h2 className="section-title">Warnings and actions</h2>
            <p className="section-subtitle">
              Use these as your checklist before you trust the monthly story.
            </p>

            {review.warnings.length === 0 ? (
              <div className="mt-4 page-inline-notice surface-success">
                No review warnings for this month.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {review.warnings.map((warning) => {
                  const linkAction = getReviewWarningLink(
                    warning.code,
                    review.month,
                  );
                  const warningMeta = renderWarningMeta(warning);

                  return (
                    <article
                      key={`${warning.code}:${warning.currency ?? "global"}:${warning.count ?? "na"}:${warning.amount ?? "na"}`}
                      className={`page-inline-notice ${
                        warning.severity === "WARNING"
                          ? "surface-warning"
                          : "surface-info"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            {warning.title}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {warning.detail}
                          </p>
                        </div>
                        <span
                          className={`status-chip ${
                            warning.severity === "WARNING"
                              ? "is-warning"
                              : "is-info"
                          }`}
                        >
                          {warning.severity}
                        </span>
                      </div>

                      {warningMeta ? (
                        <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                          {warningMeta}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {offerSnapshotCapture &&
                        warning.code === "MISSING_CLOSING_SNAPSHOT" ? (
                          <ReviewCaptureSnapshotButton />
                        ) : null}
                        {linkAction ? (
                          <Link href={linkAction.href} className="link-button">
                            {linkAction.label}
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Reconciliation highlights
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {review.reconciliationHighlights.length === 0
                      ? "All active accounts reconcile cleanly."
                      : `${review.reconciliationHighlights.length} account${
                          review.reconciliationHighlights.length === 1
                            ? ""
                            : "s"
                        } need attention across ${reconciliationIssueCount} issue${
                          reconciliationIssueCount === 1 ? "" : "s"
                        }.`}
                  </p>
                </div>
                {review.reconciliationHighlights.length > 0 ? (
                  <Link href="/accounts" className="link-button">
                    Open accounts
                  </Link>
                ) : null}
              </div>

              {review.reconciliationHighlights.length === 0 ? null : (
                <div className="mt-4 subcard-stack is-loose">
                  {review.reconciliationHighlights.map((item) => (
                    <div
                      key={item.accountId}
                      className="detail-panel is-roomy text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">
                            {item.accountName}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Delta{" "}
                            {item.delta === null
                              ? "Unavailable"
                              : formatCurrency(item.delta, item.currency)}
                          </p>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            {item.adjustmentGuidance.message}
                          </p>
                        </div>
                        <span
                          className={`status-chip ${
                            item.status === "UNSUPPORTED"
                              ? "is-danger"
                              : "is-warning"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-4 subcard-stack is-loose">
                        {item.diagnostics.length === 0 ? (
                          <p className="text-xs text-[var(--text-secondary)]">
                            No structural diagnostics were recorded for this
                            account.
                          </p>
                        ) : (
                          item.diagnostics.map((diagnostic) => (
                            <div
                              key={`${item.accountId}:${diagnostic.code}`}
                              className="detail-panel is-roomy text-xs"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-[var(--text-primary)]">
                                  {diagnostic.summary}
                                </p>
                                <span className="status-chip is-neutral">
                                  {diagnostic.code}
                                </span>
                              </div>
                              <p className="mt-1 text-[var(--text-secondary)]">
                                {diagnostic.likelyCause}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="page-section is-spacious section-stack-relaxed">
            <h2 className="text-xl font-semibold text-gray-900">
              Budget status
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Compare planned expense limits with categorized spend in{" "}
              {review.month}.
            </p>

            {review.budgetSummary.length === 0 ? (
              <div className="page-inline-notice surface-dashed">
                No budget data is available for this month.
              </div>
            ) : (
              <div className="section-stack-desktop-xl">
                <div className="detail-panel">
                  <ReviewBudgetStatusChart summaries={review.budgetSummary} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {review.budgetSummary.map((summary) => (
                    <article
                      key={summary.currency}
                      className="list-card is-roomy"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {summary.currency}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {summary.budgetedCategoryCount} budgeted categor
                            {summary.budgetedCategoryCount === 1 ? "y" : "ies"}
                          </p>
                        </div>
                        <Link
                          href={`/budgets?month=${encodeURIComponent(review.month)}`}
                          className="text-sm font-medium text-blue-700 hover:underline"
                        >
                          Open budgets
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Spent vs budget
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {formatCurrency(
                              summary.spentTotal,
                              summary.currency,
                            )}{" "}
                            /{" "}
                            {formatCurrency(
                              summary.budgetTotal,
                              summary.currency,
                            )}
                          </p>
                        </div>

                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Remaining
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {formatCurrency(
                              summary.remainingTotal,
                              summary.currency,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
                        <span>
                          Over budget: {summary.overBudgetCount} categor
                          {summary.overBudgetCount === 1 ? "y" : "ies"}
                        </span>
                        <span>
                          Unbudgeted:{" "}
                          {formatCurrency(
                            summary.unbudgetedExpenseTotal,
                            summary.currency,
                          )}
                        </span>
                        <span>
                          Uncategorized:{" "}
                          {formatCurrency(
                            summary.uncategorizedExpenseTotal,
                            summary.currency,
                          )}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                {review.budgetHighlights.length > 0 ? (
                  <div className="page-inline-notice surface-warning">
                    <h3 className="text-sm font-semibold text-amber-950">
                      Most important over-budget categories
                    </h3>
                    <div className="mt-4 section-stack-tight">
                      {groupRowsByPrimary(
                        review.budgetHighlights,
                        (item) => item.categoryName,
                      ).map((group) => (
                        <div key={group.key} className="section-stack-tight">
                          <h4 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900/70">
                            {group.label}
                          </h4>
                          <div className="subcard-stack is-loose">
                            {group.items.map((item) => (
                              <div
                                key={item.budgetId}
                                className="detail-panel is-roomy flex flex-wrap items-center justify-between gap-3 text-sm"
                              >
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {item.secondaryCategoryName ??
                                      formatHierarchyName(
                                        item,
                                        item.categoryName,
                                      )}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {formatCurrency(
                                      item.spentAmount,
                                      item.currency,
                                    )}{" "}
                                    spent against{" "}
                                    {formatCurrency(
                                      item.budgetAmount,
                                      item.currency,
                                    )}
                                  </p>
                                </div>
                                <span className="font-medium text-amber-900">
                                  {formatCurrency(
                                    item.spentAmount - item.budgetAmount,
                                    item.currency,
                                  )}{" "}
                                  over
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="page-inline-notice surface-success">
                    No budgeted categories are over limit in this review month.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="page-section is-spacious section-stack-desktop-xl">
            <h2 className="text-xl font-semibold text-gray-900">
              Recurring vs actual
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Compare the scheduled recurring plan with what actually landed in
              the month.
            </p>

            {review.recurringComparison.length === 0 ? (
              <div className="page-inline-notice surface-dashed">
                No recurring rules were due in {review.month}.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {review.recurringComparison.map((comparison) => (
                  <article
                    key={comparison.currency}
                    className="list-card is-muted is-roomy"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {comparison.currency}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {comparison.dueRuleCount} due,{" "}
                          {comparison.realizedRuleCount} realized
                        </p>
                      </div>
                      {comparison.transferRulesExcludedCount > 0 ? (
                        <span className="status-chip is-neutral">
                          {comparison.transferRulesExcludedCount} transfer
                          {comparison.transferRulesExcludedCount === 1
                            ? ""
                            : "s"}{" "}
                          excluded
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="detail-panel is-roomy">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Expected income
                        </p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {formatCurrency(
                            comparison.expectedIncomeTotal,
                            comparison.currency,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Actual{" "}
                          {formatCurrency(
                            comparison.actualIncomeTotal,
                            comparison.currency,
                          )}
                        </p>
                      </div>

                      <div className="detail-panel is-roomy">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Expected expenses
                        </p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {formatCurrency(
                            comparison.expectedExpenseTotal,
                            comparison.currency,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Actual{" "}
                          {formatCurrency(
                            comparison.actualExpenseTotal,
                            comparison.currency,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                      <span className="status-chip is-neutral">
                        {comparison.skippedCount} skipped
                      </span>
                      <span className="status-chip is-neutral">
                        {comparison.overriddenCount} overridden
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Recurring exceptions this month
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Saved skips and overrides that changed the default schedule.
                  </p>
                </div>
                {review.recurringExceptions.length > 0 ? (
                  <Link
                    href="/recurring"
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    Open recurring rules
                  </Link>
                ) : null}
              </div>

              {review.recurringExceptions.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">
                  No recurring skips or overrides were saved for this month.
                </p>
              ) : (
                <div className="mt-4 subcard-stack is-loose">
                  {review.recurringExceptions.map((item) => (
                    <div
                      key={`${item.recurringRuleId}:${item.occurrenceMonth}`}
                      className="detail-panel is-roomy text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.recurringRuleName}
                          </p>
                          <p className="text-gray-500">
                            {TRANSACTION_KIND_LABELS[item.kind]}
                          </p>
                        </div>
                        <span
                          className={`status-chip ${
                            item.status === "SKIPPED" ? "is-warning" : "is-info"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      {item.status === "OVERRIDDEN" ? (
                        <p className="mt-1 text-gray-500">
                          {item.description ?? "Override"}
                        </p>
                      ) : (
                        <p className="mt-1 text-gray-500">
                          Skipped for {item.occurrenceMonth}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="page-section is-spacious section-stack-desktop-xl">
            <h2 className="text-xl font-semibold text-gray-900">Drivers</h2>
            <p className="mt-1 text-sm text-gray-500">
              The biggest category and account movements behind this month’s
              cashflow.
            </p>

            {review.currencyInsights.length === 0 ? (
              <div className="page-inline-notice surface-dashed">
                No income or expense drivers were recorded in {review.month}.
              </div>
            ) : (
              <div className="list-stack is-loose">
                {review.currencyInsights.map((insight) => {
                  const cashflowBucket = cashflowByCurrency.get(
                    insight.currency,
                  );
                  const expenseDriverMax = Math.max(
                    1,
                    ...insight.topExpenseCategories.map((item) => item.total),
                  );
                  const incomeDriverMax = Math.max(
                    1,
                    ...insight.topIncomeCategories.map((item) => item.total),
                  );
                  const accountDriverMax = Math.max(
                    1,
                    ...insight.topAccounts.map((item) =>
                      Math.abs(item.netCashflow),
                    ),
                  );

                  return (
                    <article
                      key={insight.currency}
                      className="list-card is-muted is-roomy section-stack-desktop-xl"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900">
                            {insight.currency}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            Cashflow totals, top categories, and account flows
                            for {review.month}.
                          </p>
                        </div>
                        <div className="page-pill">
                          Net{" "}
                          {formatCurrency(
                            cashflowBucket?.netCashflow ?? 0,
                            insight.currency,
                          )}
                        </div>
                      </div>

                      <div className="summary-grid is-loose mt-5 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Income
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {formatCurrency(
                              cashflowBucket?.incomeTotal ?? 0,
                              insight.currency,
                            )}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Expenses
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {formatCurrency(
                              cashflowBucket?.expenseTotal ?? 0,
                              insight.currency,
                            )}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Savings rate
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {insight.savingsRate === null
                              ? "Unavailable"
                              : `${(insight.savingsRate * 100).toFixed(1)}%`}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Uncategorized
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            Expenses{" "}
                            {formatCurrency(
                              insight.uncategorizedExpenseTotal,
                              insight.currency,
                            )}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">
                            Income{" "}
                            {formatCurrency(
                              insight.uncategorizedIncomeTotal,
                              insight.currency,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 grid gap-10 lg:grid-cols-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Top expense categories
                          </h4>
                          {insight.topExpenseCategories.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No expense drivers.
                            </p>
                          ) : (
                            <div className="mt-3 section-stack-tight">
                              {groupRowsByPrimary(
                                insight.topExpenseCategories,
                                (item) => item.name,
                              ).map((group) => (
                                <div
                                  key={group.key}
                                  className="section-stack-tight"
                                >
                                  <h5 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                                    {group.label}
                                  </h5>
                                  <div className="subcard-stack is-loose">
                                    {group.items.map((item) => (
                                      <div
                                        key={item.categoryId ?? item.name}
                                        className="detail-panel is-roomy flex items-center justify-between text-sm"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium text-gray-900">
                                            {item.secondaryCategoryName ??
                                              formatHierarchyName(
                                                item,
                                                item.name,
                                              )}
                                          </p>
                                          <p className="text-gray-500">
                                            {CATEGORY_TYPE_LABELS.EXPENSE}
                                          </p>
                                          <div className="mt-2 h-2 rounded-full bg-gray-100">
                                            <div
                                              className="h-2 rounded-full bg-rose-500"
                                              style={{
                                                width: getDriverBarWidth(
                                                  item.total,
                                                  expenseDriverMax,
                                                ),
                                              }}
                                            />
                                          </div>
                                        </div>
                                        <span className="font-medium text-gray-900">
                                          {formatCurrency(
                                            item.total,
                                            insight.currency,
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Top income categories
                          </h4>
                          {insight.topIncomeCategories.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No income drivers.
                            </p>
                          ) : (
                            <div className="mt-3 subcard-stack is-loose">
                              {insight.topIncomeCategories.map((item) => (
                                <div
                                  key={item.categoryId ?? item.name}
                                  className="detail-panel is-roomy flex items-center justify-between text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900">
                                      {formatHierarchyName(item, item.name)}
                                    </p>
                                    <p className="text-gray-500">
                                      {CATEGORY_TYPE_LABELS.INCOME}
                                    </p>
                                    <div className="mt-2 h-2 rounded-full bg-gray-100">
                                      <div
                                        className="h-2 rounded-full bg-emerald-500"
                                        style={{
                                          width: getDriverBarWidth(
                                            item.total,
                                            incomeDriverMax,
                                          ),
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <span className="font-medium text-gray-900">
                                    {formatCurrency(
                                      item.total,
                                      insight.currency,
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Top account flows
                          </h4>
                          {insight.topAccounts.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No account drivers.
                            </p>
                          ) : (
                            <div className="mt-3 subcard-stack is-loose">
                              {insight.topAccounts.map((item) => (
                                <div
                                  key={item.accountId}
                                  className="detail-panel is-roomy text-sm"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-medium text-gray-900">
                                      {item.name}
                                    </p>
                                    <span className="font-medium text-gray-900">
                                      {formatCurrency(
                                        item.netCashflow,
                                        insight.currency,
                                      )}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-2 rounded-full bg-gray-100">
                                    <div
                                      className={`h-2 rounded-full ${
                                        item.netCashflow >= 0
                                          ? "bg-emerald-500"
                                          : "bg-amber-500"
                                      }`}
                                      style={{
                                        width: getDriverBarWidth(
                                          Math.abs(item.netCashflow),
                                          accountDriverMax,
                                        ),
                                      }}
                                    />
                                  </div>
                                  <p className="mt-1 text-gray-500">
                                    In{" "}
                                    {formatCurrency(
                                      item.inflowTotal,
                                      insight.currency,
                                    )}{" "}
                                    • Out{" "}
                                    {formatCurrency(
                                      item.outflowTotal,
                                      insight.currency,
                                    )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </Container>
    </>
  );
}

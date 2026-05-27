"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  MonthlyBudgetItemResponse,
  MonthlyReviewResponse,
  MonthlyReviewWarningResponse,
  RecurringPendingStatusResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import MoneyValue from "@components/MoneyValue";
import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import ReviewCaptureSnapshotButton from "@components/ReviewCaptureSnapshotButton";
import ReviewMonthPicker from "@components/ReviewMonthPicker";
import RouteLoadingShell from "@components/RouteLoadingShell";
import WorkflowSection from "@components/WorkflowSection";
import { formatCurrency } from "@lib/format";
import { formatHierarchyName } from "@lib/hierarchical-categories";
import { getReviewWarningLink, shouldOfferSnapshotCapture } from "@lib/review";
import { api } from "@lib/api";
import { getWorkflowCards } from "@lib/workflow";

type RawSearchParams = Record<string, string | string[] | undefined>;

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

function getTopBudgetHighlights(items: MonthlyBudgetItemResponse[]) {
  return [...items]
    .sort(
      (left, right) =>
        right.spentAmount -
        right.budgetAmount -
        (left.spentAmount - left.budgetAmount),
    )
    .slice(0, 3);
}

function formatRecurringExceptionsSummary(
  count: number,
  month: string,
): string {
  if (count === 0) {
    return `No recurring skips or overrides were saved for ${month}.`;
  }

  return `${count} recurring exception${count === 1 ? "" : "s"} changed the default schedule in ${month}.`;
}

function formatBudgetSummaryDetail(currencyCount: number): string {
  if (currencyCount === 0) {
    return "No budget signals recorded for this month.";
  }

  return `${currencyCount} currenc${currencyCount === 1 ? "y" : "ies"} with budget context for this month.`;
}

function formatRecurringSummaryDetail(
  recurringCount: number,
  exceptionCount: number,
): string {
  if (recurringCount === 0 && exceptionCount === 0) {
    return "No recurring activity changed this month.";
  }

  return `${recurringCount} currenc${recurringCount === 1 ? "y" : "ies"} with due rules, ${exceptionCount} exception${exceptionCount === 1 ? "" : "s"}.`;
}

function formatCashflowSummaryDetail(currencyCount: number): string {
  if (currencyCount === 0) {
    return "No cashflow highlights recorded for this month.";
  }

  return `${currencyCount} currenc${currencyCount === 1 ? "y" : "ies"} with income and expense totals.`;
}

export default function ReviewRouteClient({
  rawSearchParams,
}: {
  rawSearchParams: RawSearchParams;
}) {
  const fallbackMonth = useMemo(() => MONTH_FORMATTER.format(new Date()), []);
  const month = useMemo(
    () => getMonthParam(rawSearchParams.month, fallbackMonth),
    [fallbackMonth, rawSearchParams.month],
  );
  const [review, setReview] = useState<MonthlyReviewResponse | null>(null);
  const [setup, setSetup] = useState<SetupStatusResponse | null>(null);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<MonthlyReviewResponse>(
        `/monthly-review?month=${encodeURIComponent(month)}`,
      ),
      api<SetupStatusResponse>("/setup/status?includeWarnings=false").catch(
        () => null,
      ),
      api<RecurringPendingStatusResponse>("/recurring-rules/has-pending").catch(
        () => null,
      ),
    ])
      .then(([nextReview, nextSetup, pendingStatus]) => {
        if (!isActive) {
          return;
        }

        setReview(nextReview);
        setSetup(nextSetup);
        setHasPendingSync(pendingStatus?.hasPending ?? false);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Monthly close data is currently unavailable.",
        );
      });

    return () => {
      isActive = false;
    };
  }, [month]);

  if (errorMessage) {
    return (
      <Container>
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Monthly close</p>
            <h1 className="page-title is-compact">Monthly close</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </section>
      </Container>
    );
  }

  if (!review) {
    return <RouteLoadingShell kicker="Monthly close" title="Monthly close" />;
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
  const topBudgetHighlights = getTopBudgetHighlights(review.budgetHighlights);

  return (
    <Container>
      <div className="page-shell is-relaxed route-stack-desktop-xl">
        <section className="page-hero">
          <div className="section-stack-desktop-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="page-kicker">Monthly close</p>
                <h1 className="page-title is-compact">Monthly close</h1>
                <p className="page-description">
                  Check whether {review.month} is trustworthy, then hand deeper
                  analysis off to the right workspace.
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="section-title">Close status</h2>
              <p className="section-subtitle">
                Focus on the checks that determine whether this month can be
                trusted.
              </p>
            </div>
            <span
              className={`status-chip ${
                review.netWorthExplanation.isComparableInReportingCurrency
                  ? "is-success"
                  : "is-warning"
              }`}
            >
              {review.netWorthExplanation.isComparableInReportingCurrency
                ? `Comparable in ${review.netWorthExplanation.reportingCurrency}`
                : "Limited explanation"}
            </span>
          </div>

          <div className="summary-grid is-loose md:grid-cols-2 xl:grid-cols-3">
            <div className="summary-card">
              <p className="summary-card-label">Warnings</p>
              <p className="summary-card-value">{review.warnings.length}</p>
              <p className="summary-card-note">
                {review.warnings.length === 0
                  ? "No open warning cards."
                  : "Use the actions below before closing the month."}
              </p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Reconciliation issues</p>
              <p className="summary-card-value">{reconciliationIssueCount}</p>
              <p className="summary-card-note">
                {reconciliationIssueCount === 0
                  ? "All active accounts reconcile cleanly."
                  : "Resolve account deltas before trusting the month."}
              </p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Recurring sync</p>
              <p className="summary-card-value">
                {hasPendingSync ? "Pending" : "Up to date"}
              </p>
              <p className="summary-card-note">
                {hasPendingSync
                  ? "Recurring entries still need to be synced into the ledger."
                  : "No due recurring entries are waiting to be synced."}
              </p>
              {hasPendingSync ? (
                <div className="mt-4">
                  <RecurringMaterializeButton />
                </div>
              ) : null}
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Comparability</p>
              <p className="summary-card-value">
                {review.netWorthExplanation.isComparableInReportingCurrency
                  ? "Comparable"
                  : "Limited"}
              </p>
              <p className="summary-card-note">
                {review.netWorthExplanation.note ??
                  "No extra explanation is available for this month."}
              </p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Cashflow contribution</p>
              <p className="summary-card-value">
                {review.netWorthExplanation.cashflowContribution === null
                  ? "Unavailable"
                  : formatCurrency(
                      review.netWorthExplanation.cashflowContribution,
                      review.netWorthExplanation.reportingCurrency,
                    )}
              </p>
              <p className="summary-card-note">
                Net worth change attributed to month cashflow.
              </p>
            </div>
            <div className="summary-card">
              <p className="summary-card-label">Market and FX movement</p>
              <p className="summary-card-value">
                {review.netWorthExplanation.marketAndFxMovement === null
                  ? "Unavailable"
                  : formatCurrency(
                      review.netWorthExplanation.marketAndFxMovement,
                      review.netWorthExplanation.reportingCurrency,
                    )}
              </p>
              <p className="summary-card-note">
                Market or valuation movement outside direct cashflow.
              </p>
            </div>
          </div>
        </section>

        <section className="page-section is-spacious section-stack-relaxed">
          <h2 className="section-title">Warnings and actions</h2>
          <p className="section-subtitle">
            Clear these first, then use the highlight sections only as handoffs.
          </p>

          {review.warnings.length === 0 ? (
            <div className="mt-4 page-inline-notice surface-success">
              No monthly close warnings for this month.
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
        </section>

        <section className="page-section is-spacious section-stack-desktop-xl">
          <div>
            <h2 className="section-title">Highlights</h2>
            <p className="section-subtitle">
              Keep these deeper month summaries collapsed until you need them.
            </p>
          </div>

          <div className="section-stack-tight">
            <details className="analytics-filter-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Reconciliation highlights
                  </span>
                  <span className="analytics-filter-summary-detail">
                    {review.reconciliationHighlights.length === 0
                      ? "All active accounts reconcile cleanly."
                      : `${review.reconciliationHighlights.length} account${
                          review.reconciliationHighlights.length === 1
                            ? ""
                            : "s"
                        } need attention across ${reconciliationIssueCount} issue${
                          reconciliationIssueCount === 1 ? "" : "s"
                        }.`}
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {reconciliationIssueCount} issue
                    {reconciliationIssueCount === 1 ? "" : "s"}
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="review-highlights-details">
                {review.reconciliationHighlights.length === 0 ? (
                  <div className="page-inline-notice surface-success">
                    All active accounts reconcile cleanly.
                  </div>
                ) : (
                  <>
                    <div className="compact-toolbar-actions">
                      <Link href="/accounts" className="link-button">
                        Open accounts
                      </Link>
                    </div>
                    <div className="subcard-stack is-loose">
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
                          {item.diagnostics.length > 0 ? (
                            <ul className="mt-4 section-stack-tight text-xs text-[var(--text-secondary)]">
                              {item.diagnostics.map((diagnostic) => (
                                <li
                                  key={`${item.accountId}:${diagnostic.code}`}
                                >
                                  <span className="font-medium text-[var(--text-primary)]">
                                    {diagnostic.summary}
                                  </span>
                                  {": "}
                                  {diagnostic.likelyCause}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </details>

            <details className="analytics-filter-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Budget highlights
                  </span>
                  <span className="analytics-filter-summary-detail">
                    {formatBudgetSummaryDetail(review.budgetSummary.length)}
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {topBudgetHighlights.length} highlight
                    {topBudgetHighlights.length === 1 ? "" : "s"}
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="review-highlights-details">
                <div className="compact-toolbar-actions">
                  <Link
                    href={`/budgets?month=${encodeURIComponent(review.month)}`}
                    className="link-button"
                  >
                    Open budgets
                  </Link>
                </div>

                {review.budgetSummary.length === 0 ? (
                  <div className="page-inline-notice surface-dashed">
                    No budget data is available for this month.
                  </div>
                ) : (
                  <>
                    <div className="subcard-stack is-loose">
                      {review.budgetSummary.map((summary) => (
                        <div
                          key={summary.currency}
                          className="detail-panel is-roomy text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">
                                {summary.currency}
                              </p>
                              <p className="mt-1 text-[var(--text-secondary)]">
                                {formatCurrency(
                                  summary.spentTotal,
                                  summary.currency,
                                )}{" "}
                                spent against{" "}
                                {formatCurrency(
                                  summary.budgetTotal,
                                  summary.currency,
                                )}
                              </p>
                            </div>
                            <p className="font-medium text-[var(--text-primary)]">
                              Remaining{" "}
                              {formatCurrency(
                                summary.remainingTotal,
                                summary.currency,
                              )}
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
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
                        </div>
                      ))}
                    </div>

                    {topBudgetHighlights.length > 0 ? (
                      <div className="page-inline-notice surface-warning">
                        <h3 className="text-sm font-semibold text-amber-950">
                          Top over-budget categories
                        </h3>
                        <div className="mt-4 subcard-stack is-loose">
                          {topBudgetHighlights.map((item) => (
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
                    ) : (
                      <div className="page-inline-notice surface-success">
                        No budgeted categories are over limit in this month.
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>

            <details className="analytics-filter-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Recurring highlights
                  </span>
                  <span className="analytics-filter-summary-detail">
                    {formatRecurringSummaryDetail(
                      review.recurringComparison.length,
                      review.recurringExceptions.length,
                    )}
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {review.recurringExceptions.length} exception
                    {review.recurringExceptions.length === 1 ? "" : "s"}
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="review-highlights-details">
                <div className="compact-toolbar-actions">
                  <Link href="/recurring" className="link-button">
                    Open recurring rules
                  </Link>
                </div>

                {review.recurringComparison.length === 0 &&
                review.recurringExceptions.length === 0 ? (
                  <div className="page-inline-notice surface-dashed">
                    No recurring rules or exceptions affected this month.
                  </div>
                ) : (
                  <>
                    {review.recurringComparison.length === 0 ? null : (
                      <div className="subcard-stack is-loose">
                        {review.recurringComparison.map((comparison) => (
                          <div
                            key={comparison.currency}
                            className="detail-panel is-roomy text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-gray-900">
                                  {comparison.currency}
                                </p>
                                <p className="mt-1 text-gray-500">
                                  {comparison.dueRuleCount} due,{" "}
                                  {comparison.realizedRuleCount} realized
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                                <span className="status-chip is-neutral">
                                  {comparison.skippedCount} skipped
                                </span>
                                <span className="status-chip is-neutral">
                                  {comparison.overriddenCount} overridden
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500">
                                  Expected income
                                </p>
                                <p className="mt-1 font-medium text-gray-900">
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
                              <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500">
                                  Expected expenses
                                </p>
                                <p className="mt-1 font-medium text-gray-900">
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
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="page-inline-notice surface-info">
                      {formatRecurringExceptionsSummary(
                        review.recurringExceptions.length,
                        review.month,
                      )}
                    </div>
                  </>
                )}
              </div>
            </details>

            <details className="analytics-filter-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Cashflow highlights
                  </span>
                  <span className="analytics-filter-summary-detail">
                    {formatCashflowSummaryDetail(
                      review.currencyInsights.length,
                    )}
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {review.currencyInsights.length} currenc
                    {review.currencyInsights.length === 1 ? "y" : "ies"}
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="review-highlights-details">
                <div className="compact-toolbar-actions">
                  <Link
                    href={
                      workflowCards.find((card) => card.code === "ANALYTICS")
                        ?.href ?? "/analytics"
                    }
                    className="link-button"
                  >
                    Open analytics
                  </Link>
                </div>

                {review.currencyInsights.length === 0 ? (
                  <div className="page-inline-notice surface-dashed">
                    No income or expense drivers were recorded in {review.month}
                    .
                  </div>
                ) : (
                  <div className="subcard-stack is-loose">
                    {review.currencyInsights.map((insight) => {
                      const cashflowBucket = cashflowByCurrency.get(
                        insight.currency,
                      );

                      return (
                        <div
                          key={insight.currency}
                          className="detail-panel is-roomy text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-gray-900">
                                {insight.currency}
                              </p>
                              <p className="mt-1 text-gray-500">
                                Net{" "}
                                {formatCurrency(
                                  cashflowBucket?.netCashflow ?? 0,
                                  insight.currency,
                                )}
                              </p>
                            </div>
                            <p className="font-medium text-gray-900">
                              Savings rate{" "}
                              {insight.savingsRate === null
                                ? "Unavailable"
                                : `${(insight.savingsRate * 100).toFixed(1)}%`}
                            </p>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Income
                              </p>
                              <p className="mt-1 font-medium text-gray-900">
                                {formatCurrency(
                                  cashflowBucket?.incomeTotal ?? 0,
                                  insight.currency,
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Expenses
                              </p>
                              <p className="mt-1 font-medium text-gray-900">
                                {formatCurrency(
                                  cashflowBucket?.expenseTotal ?? 0,
                                  insight.currency,
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Uncategorized expenses
                              </p>
                              <p className="mt-1 font-medium text-gray-900">
                                {formatCurrency(
                                  insight.uncategorizedExpenseTotal,
                                  insight.currency,
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-500">
                                Uncategorized income
                              </p>
                              <p className="mt-1 font-medium text-gray-900">
                                {formatCurrency(
                                  insight.uncategorizedIncomeTotal,
                                  insight.currency,
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          </div>
        </section>

        <WorkflowSection
          title="Continue the workflow"
          description="Once the month is trustworthy, move into budgets and analytics without losing the same month context."
          className="is-roomy"
          cards={workflowCards}
        />
      </div>
    </Container>
  );
}

import Link from "next/link";
import type {
  MonthlyReviewResponse,
  MonthlyReviewWarningResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import ReviewBudgetStatusChart from "@components/ReviewBudgetStatusChart";
import ReviewMonthPicker from "@components/ReviewMonthPicker";
import ReviewCaptureSnapshotButton from "@components/ReviewCaptureSnapshotButton";
import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
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

  if (review) {
    try {
      setup = await api<SetupStatusResponse>(
        "/setup/status?includeWarnings=false",
      );
    } catch {
      setup = null;
    }
  }

  if (!review) {
    return (
      <>
        <Header />
        <Container>
          <h1 className="text-3xl font-semibold text-gray-900">Review</h1>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm text-amber-900/80">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
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
      <Header />
      <Container>
        <div className="space-y-8">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-gray-900">
                  Monthly review
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Explain what happened in {review.month}, what still needs
                  attention, and what changed your trajectory.
                </p>
              </div>

              <ReviewMonthPicker currentMonth={review.month} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Opening net worth
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {review.openingNetWorth === null
                    ? "Unavailable"
                    : formatCurrency(review.openingNetWorth)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {review.openingSnapshotDate
                    ? `Snapshot ${review.openingSnapshotDate}`
                    : "No opening snapshot boundary"}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Closing net worth
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {review.closingNetWorth === null
                    ? "Unavailable"
                    : formatCurrency(review.closingNetWorth)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {review.closingSnapshotDate
                    ? `Snapshot ${review.closingSnapshotDate}`
                    : "No closing snapshot boundary"}
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Net worth delta
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {review.netWorthDelta === null
                    ? "Unavailable"
                    : formatCurrency(review.netWorthDelta)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Based on the nearest available snapshots around the month.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Review warnings
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {review.warnings.length}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {review.warnings.length === 0
                    ? "No open warning cards."
                    : "Use the actions below before trusting the month fully."}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Budget highlights
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {review.budgetHighlights.length}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {review.budgetHighlights.length === 0
                    ? "No categories are currently over budget."
                    : "Most important over-budget categories are highlighted below."}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Reconciliation issues
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {reconciliationIssueCount}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {reconciliationIssueCount === 0
                    ? "All active accounts reconcile cleanly."
                    : "Diagnostics below explain the accounts still weakening trust."}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Why net worth moved
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {review.netWorthExplanation.note ??
                      "No additional explanation is available for this month."}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    review.netWorthExplanation.isComparableInEur
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {review.netWorthExplanation.isComparableInEur
                    ? "Comparable in EUR"
                    : "Limited explanation"}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Recurring sync
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      This review no longer creates transactions while the page
                      renders. Sync due transactions only when you want any
                      missing recurring entries materialized before reviewing
                      the month.
                    </p>
                  </div>
                  <RecurringMaterializeButton />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Cashflow contribution
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {review.netWorthExplanation.cashflowContributionEur === null
                      ? "Unavailable"
                      : formatCurrency(
                          review.netWorthExplanation.cashflowContributionEur,
                        )}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Valuation movement
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
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
            cards={workflowCards}
          />

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">
              Warnings and actions
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Use these as your checklist before you trust the monthly story.
            </p>

            {review.warnings.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
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
                      className={`rounded-2xl border p-4 ${
                        warning.severity === "WARNING"
                          ? "border-amber-200 bg-amber-50"
                          : "border-blue-200 bg-blue-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            {warning.title}
                          </h3>
                          <p className="mt-1 text-sm text-gray-600">
                            {warning.detail}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            warning.severity === "WARNING"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {warning.severity}
                        </span>
                      </div>

                      {warningMeta ? (
                        <p className="mt-3 text-sm font-medium text-gray-900">
                          {warningMeta}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {offerSnapshotCapture &&
                        warning.code === "MISSING_CLOSING_SNAPSHOT" ? (
                          <ReviewCaptureSnapshotButton />
                        ) : null}
                        {linkAction ? (
                          <Link
                            href={linkAction.href}
                            className="text-sm font-medium text-blue-700 hover:underline"
                          >
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
                  <h3 className="text-sm font-semibold text-gray-900">
                    Reconciliation highlights
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
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
                  <Link
                    href="/accounts"
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    Open accounts
                  </Link>
                ) : null}
              </div>

              {review.reconciliationHighlights.length === 0 ? null : (
                <div className="mt-3 space-y-2">
                  {review.reconciliationHighlights.map((item) => (
                    <div
                      key={item.accountId}
                      className="rounded-2xl bg-gray-50 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.accountName}
                          </p>
                          <p className="mt-1 text-gray-500">
                            Delta{" "}
                            {item.delta === null
                              ? "Unavailable"
                              : formatCurrency(item.delta, item.currency)}
                          </p>
                          <p className="mt-1 text-gray-500">
                            {item.adjustmentGuidance.message}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.status === "UNSUPPORTED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {item.diagnostics.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            No structural diagnostics were recorded for this
                            account.
                          </p>
                        ) : (
                          item.diagnostics.map((diagnostic) => (
                            <div
                              key={`${item.accountId}:${diagnostic.code}`}
                              className="rounded-2xl bg-white px-3 py-2 text-xs ring-1 ring-gray-200"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-gray-900">
                                  {diagnostic.summary}
                                </p>
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                                  {diagnostic.code}
                                </span>
                              </div>
                              <p className="mt-1 text-gray-600">
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

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">
              Budget status
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Compare planned expense limits with categorized spend in{" "}
              {review.month}.
            </p>

            {review.budgetSummary.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                No budget data is available for this month.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <ReviewBudgetStatusChart summaries={review.budgetSummary} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {review.budgetSummary.map((summary) => (
                    <article
                      key={summary.currency}
                      className="rounded-2xl border border-gray-200 p-4"
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
                        <div className="rounded-2xl bg-gray-50 p-4">
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

                        <div className="rounded-2xl bg-gray-50 p-4">
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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-950">
                      Most important over-budget categories
                    </h3>
                    <div className="mt-3 space-y-2">
                      {review.budgetHighlights.map((item) => (
                        <div
                          key={item.budgetId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.categoryName}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {formatCurrency(item.spentAmount, item.currency)}{" "}
                              spent against{" "}
                              {formatCurrency(item.budgetAmount, item.currency)}
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
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    No budgeted categories are over limit in this review month.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">
              Recurring vs actual
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Compare the scheduled recurring plan with what actually landed in
              the month.
            </p>

            {review.recurringComparison.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                No recurring rules were due in {review.month}.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {review.recurringComparison.map((comparison) => (
                  <article
                    key={comparison.currency}
                    className="rounded-2xl bg-gray-50 p-5"
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
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                          {comparison.transferRulesExcludedCount} transfer
                          {comparison.transferRulesExcludedCount === 1
                            ? ""
                            : "s"}{" "}
                          excluded
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4">
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

                      <div className="rounded-2xl bg-white p-4">
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
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
                        {comparison.skippedCount} skipped
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
                        {comparison.overriddenCount} overridden
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-8">
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
                <div className="mt-3 space-y-2">
                  {review.recurringExceptions.map((item) => (
                    <div
                      key={`${item.recurringRuleId}:${item.occurrenceMonth}`}
                      className="rounded-2xl bg-gray-50 px-4 py-3 text-sm"
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
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.status === "SKIPPED"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
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

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-xl font-semibold text-gray-900">Drivers</h2>
            <p className="mt-1 text-sm text-gray-500">
              The biggest category and account movements behind this month’s
              cashflow.
            </p>

            {review.currencyInsights.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                No income or expense drivers were recorded in {review.month}.
              </div>
            ) : (
              <div className="mt-4 space-y-6">
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
                      className="rounded-3xl bg-gray-50 p-6"
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
                        <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-700 ring-1 ring-gray-200">
                          Net{" "}
                          {formatCurrency(
                            cashflowBucket?.netCashflow ?? 0,
                            insight.currency,
                          )}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-white p-4">
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
                        <div className="rounded-2xl bg-white p-4">
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
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Savings rate
                          </p>
                          <p className="mt-1 text-lg font-semibold text-gray-900">
                            {insight.savingsRate === null
                              ? "Unavailable"
                              : `${(insight.savingsRate * 100).toFixed(1)}%`}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white p-4">
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

                      <div className="mt-6 grid gap-6 lg:grid-cols-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Top expense categories
                          </h4>
                          {insight.topExpenseCategories.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No expense drivers.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {insight.topExpenseCategories.map((item) => (
                                <div
                                  key={item.categoryId ?? item.name}
                                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900">
                                      {item.name}
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
                            <div className="mt-2 space-y-2">
                              {insight.topIncomeCategories.map((item) => (
                                <div
                                  key={item.categoryId ?? item.name}
                                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900">
                                      {item.name}
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
                            <div className="mt-2 space-y-2">
                              {insight.topAccounts.map((item) => (
                                <div
                                  key={item.accountId}
                                  className="rounded-2xl bg-white px-4 py-3 text-sm"
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
                                          ? "bg-sky-500"
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

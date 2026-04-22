import Link from "next/link";
import type {
  AccountReconciliationIssueCode,
  MonthlyReviewResponse,
  MonthlyReviewWarningResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import ReviewCaptureSnapshotButton from "@components/ReviewCaptureSnapshotButton";
import { api } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
import { TRANSACTION_KIND_LABELS } from "@lib/transactions";
import { getReviewWarningLink, shouldOfferSnapshotCapture } from "@lib/review";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

const RECONCILIATION_ISSUE_LABELS: Record<
  AccountReconciliationIssueCode,
  string
> = {
  FX_UNAVAILABLE: "FX unavailable",
  TRANSFER_GROUP_INCOMPLETE: "Broken transfer",
};

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

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const fallbackMonth = MONTH_FORMATTER.format(new Date());
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const month = getMonthParam(resolvedSearchParams.month, fallbackMonth);

  let review: MonthlyReviewResponse | null = null;
  let errorMessage: string | null = null;

  try {
    try {
      await api("/recurring-rules/materialize", {
        method: "POST",
      });
    } catch {
      // Keep review available even if best-effort sync fails.
    }

    review = await api<MonthlyReviewResponse>(
      `/monthly-review?month=${encodeURIComponent(month)}`,
    );
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Monthly review data is currently unavailable.";
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
    (sum, item) => sum + Math.max(item.issueCodes.length, 1),
    0,
  );
  const offerSnapshotCapture = shouldOfferSnapshotCapture(
    review.month,
    review.warnings,
  );

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

              <form action="/review" className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="review-month"
                    className="text-sm font-medium text-gray-600"
                  >
                    Month
                  </label>
                  <input
                    id="review-month"
                    name="month"
                    type="month"
                    defaultValue={review.month}
                    className="rounded-lg border px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Load
                </button>
              </form>
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
                      {item.issueCodes.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.issueCodes.map((issueCode) => (
                            <span
                              key={`${item.accountId}:${issueCode}`}
                              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200"
                            >
                              {RECONCILIATION_ISSUE_LABELS[issueCode]}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                                  <div>
                                    <p className="font-medium text-gray-900">
                                      {item.name}
                                    </p>
                                    <p className="text-gray-500">
                                      {CATEGORY_TYPE_LABELS.EXPENSE}
                                    </p>
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
                                  <div>
                                    <p className="font-medium text-gray-900">
                                      {item.name}
                                    </p>
                                    <p className="text-gray-500">
                                      {CATEGORY_TYPE_LABELS.INCOME}
                                    </p>
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

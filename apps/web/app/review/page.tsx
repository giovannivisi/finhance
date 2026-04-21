import type { MonthlyReviewResponse } from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";

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

  return (
    <>
      <Header />
      <Container>
        {!review ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Review</h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-8">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">
                    Monthly review
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Cashflow, net worth boundaries, and reconciliation warnings
                    for one month.
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
            </section>

            {review.cashflow.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
                No cashflow recorded in {review.month}.
              </div>
            ) : (
              review.cashflow.map((bucket) => (
                <article
                  key={bucket.currency}
                  className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {bucket.currency} cashflow
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Income, expenses, and adjustments for {review.month}.
                      </p>
                    </div>

                    <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                      Net {formatCurrency(bucket.netCashflow, bucket.currency)}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Income
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {formatCurrency(bucket.incomeTotal, bucket.currency)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Expenses
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {formatCurrency(bucket.expenseTotal, bucket.currency)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Adjustment in
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {formatCurrency(
                          bucket.adjustmentInTotal,
                          bucket.currency,
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Adjustment out
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {formatCurrency(
                          bucket.adjustmentOutTotal,
                          bucket.currency,
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-gray-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Net
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">
                        {formatCurrency(bucket.netCashflow, bucket.currency)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        By category
                      </h3>
                      {bucket.byCategory.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-500">
                          No categorized income or expenses in this bucket.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {bucket.byCategory.map((item) => (
                            <div
                              key={`${item.type}:${item.categoryId ?? "uncategorized"}`}
                              className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-medium text-gray-900">
                                  {item.name}
                                </p>
                                <p className="text-gray-500">
                                  {CATEGORY_TYPE_LABELS[item.type]}
                                </p>
                              </div>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(item.total, bucket.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        Reconciliation highlights
                      </h3>
                      {review.reconciliationHighlights.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-500">
                          All active accounts reconcile cleanly.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {review.reconciliationHighlights.map((item) => (
                            <div
                              key={item.accountId}
                              className="rounded-2xl bg-gray-50 px-4 py-3 text-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-medium text-gray-900">
                                  {item.accountName}
                                </p>
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
                              <p className="mt-1 text-gray-500">
                                Delta{" "}
                                {item.delta === null
                                  ? "Unavailable"
                                  : formatCurrency(item.delta, item.currency)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </Container>
    </>
  );
}

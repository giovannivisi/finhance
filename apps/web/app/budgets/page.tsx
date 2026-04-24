import Link from "next/link";
import type { CategoryResponse, MonthlyBudgetResponse } from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";
import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import { buildBudgetsQueryString, getBudgetFilters } from "@lib/budgets";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = getBudgetFilters(resolvedSearchParams);
  const queryString = buildBudgetsQueryString(filters);

  let budgetView: MonthlyBudgetResponse | null = null;
  let categories: CategoryResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    [budgetView, categories] = await Promise.all([
      api<MonthlyBudgetResponse>(`/budgets?${queryString}`),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Budget data is currently unavailable.";
  }

  return (
    <>
      <Header />
      <Container>
        {!budgetView || !categories ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Budgets</h1>
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
                    Budgets
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Monthly expense plans with manual month overrides and clear
                    visibility into uncovered spend.
                  </p>
                </div>
                <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                  Month {budgetView.month}
                </div>
              </div>

              <form className="mt-6 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    Month
                  </label>
                  <input
                    className="rounded-lg border px-3 py-2"
                    type="month"
                    name="month"
                    defaultValue={filters.month}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    name="includeArchivedCategories"
                    value="true"
                    defaultChecked={filters.includeArchivedCategories}
                  />
                  Include archived categories
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Apply
                  </button>
                  <Link
                    href="/budgets"
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Clear
                  </Link>
                </div>
              </form>
            </section>

            <BudgetsPageClient
              budgetView={budgetView}
              categories={categories}
            />
          </div>
        )}
      </Container>
    </>
  );
}

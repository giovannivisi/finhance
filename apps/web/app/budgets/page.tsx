import Link from "next/link";
import type {
  CategoryResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";
import Container from "@components/Container";

import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/api";
import {
  buildBudgetMonthNavigationLink,
  buildBudgetsQueryString,
  getBudgetFilters,
} from "@lib/budgets";
import { getWorkflowCards } from "@lib/workflow";

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
  let setup: SetupStatusResponse | null = null;
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

  if (budgetView) {
    try {
      setup = await api<SetupStatusResponse>(
        "/setup/status?includeWarnings=false",
      );
    } catch {
      setup = null;
    }
  }

  return (
    <>
      <Container>
        {!budgetView || !categories ? (
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Planning</p>
              <h1 className="page-title is-compact">Budgets</h1>
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
        ) : (
          <div className="route-stack-desktop-xl">
            <section className="page-hero">
              <div className="section-stack-relaxed">
                <div className="page-hero-row">
                  <div className="page-hero-copy">
                    <p className="page-kicker">Planning</p>
                    <h1 className="page-title is-compact">Budgets</h1>
                    <p className="page-description">
                      Monthly expense plans with manual month overrides and
                      clear visibility into uncovered spend.
                    </p>
                  </div>
                </div>

                <div className="page-hero-actions">
                  <Link
                    href={buildBudgetMonthNavigationLink({
                      month: budgetView.month,
                      delta: -1,
                      includeArchivedCategories:
                        filters.includeArchivedCategories,
                    })}
                    className="btn-secondary"
                  >
                    Previous month
                  </Link>
                  <div className="page-pill">Month {budgetView.month}</div>
                  <Link
                    href={buildBudgetMonthNavigationLink({
                      month: budgetView.month,
                      delta: 1,
                      includeArchivedCategories:
                        filters.includeArchivedCategories,
                    })}
                    className="btn-secondary"
                  >
                    Next month
                  </Link>
                </div>

                <form className="filter-grid is-relaxed budget-filter-grid lg:grid-cols-[minmax(0,220px)_minmax(280px,1fr)_auto]">
                  <div className="app-form-field">
                    <label htmlFor="budget-month">Month</label>
                    <input
                      id="budget-month"
                      type="month"
                      name="month"
                      defaultValue={filters.month}
                    />
                  </div>

                  <label className="page-pill budget-toggle-pill">
                    <input
                      type="checkbox"
                      name="includeArchivedCategories"
                      value="true"
                      defaultChecked={filters.includeArchivedCategories}
                    />
                    Include archived categories
                  </label>

                  <div className="filter-actions is-equal">
                    <button type="submit" className="btn-primary">
                      Apply
                    </button>
                    <Link href="/budgets" className="btn-secondary">
                      Clear
                    </Link>
                  </div>
                </form>
              </div>
            </section>

            <WorkflowSection
              title="Use this month in context"
              description={`Keep ${budgetView.month} connected to review and trend analysis instead of treating budgets as a standalone page.`}
              className="is-roomy"
              cards={getWorkflowCards({
                currentPage: "budgets",
                month: budgetView.month,
                setup,
              })}
            />

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

import type {
  CategoryResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";
import Container from "@components/Container";
import { api } from "@lib/server-api";
import { buildBudgetsQueryString, getBudgetFilters } from "@lib/budgets";
import { getWorkflowCards } from "@lib/workflow";

export const dynamic = "force-dynamic";

const BUDGET_MONTH_PILL_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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
  let budgetMonthPillLabel: string | null = null;

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
    budgetMonthPillLabel = BUDGET_MONTH_PILL_FORMATTER.format(
      new Date(`${budgetView.month}-01T00:00:00Z`),
    );

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
            <BudgetsPageClient
              budgetView={budgetView}
              categories={categories}
              filters={filters}
              budgetMonthPillLabel={budgetMonthPillLabel ?? budgetView.month}
              workflowCards={getWorkflowCards({
                currentPage: "budgets",
                month: budgetView.month,
                setup,
              })}
            />
          </div>
        )}
      </Container>
    </>
  );
}

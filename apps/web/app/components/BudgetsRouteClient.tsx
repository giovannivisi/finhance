"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CategoryResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";
import Container from "@components/Container";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";
import type { BudgetFilters } from "@lib/budgets";
import { buildBudgetsQueryString } from "@lib/budgets";
import { getWorkflowCards } from "@lib/workflow";

const BUDGET_MONTH_PILL_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default function BudgetsRouteClient({
  filters,
}: {
  filters: BudgetFilters;
}) {
  const [budgetView, setBudgetView] = useState<MonthlyBudgetResponse | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryResponse[] | null>(null);
  const [setup, setSetup] = useState<SetupStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryString = useMemo(
    () => buildBudgetsQueryString(filters),
    [filters],
  );

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<MonthlyBudgetResponse>(`/budgets?${queryString}`),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
      api<SetupStatusResponse>("/setup/status?includeWarnings=false").catch(
        () => null,
      ),
    ])
      .then(([nextBudgetView, nextCategories, nextSetup]) => {
        if (!isActive) {
          return;
        }

        setBudgetView(nextBudgetView);
        setCategories(nextCategories);
        setSetup(nextSetup);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Budget data is currently unavailable.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [queryString]);

  if (errorMessage) {
    return (
      <Container>
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Planning</p>
            <h1 className="page-title is-compact">Budgets</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!budgetView || !categories) {
    return <RouteLoadingShell kicker="Planning" title="Budgets" />;
  }

  const budgetMonthPillLabel = BUDGET_MONTH_PILL_FORMATTER.format(
    new Date(`${budgetView.month}-01T00:00:00Z`),
  );

  return (
    <Container>
      <BudgetsPageClient
        budgetView={budgetView}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel={budgetMonthPillLabel}
        workflowCards={getWorkflowCards({
          currentPage: "budgets",
          month: budgetView.month,
          setup,
        })}
      />
    </Container>
  );
}

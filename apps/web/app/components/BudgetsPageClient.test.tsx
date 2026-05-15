import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryResponse, MonthlyBudgetResponse } from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";
import type { BudgetFilters } from "@lib/budgets";
import type { WorkflowCard } from "@lib/workflow";

const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    hideMoney: false,
    isHydrated: true,
  }),
}));

vi.mock("@lib/api", () => ({
  api: vi.fn(),
  apiMutation: vi.fn(),
}));

const categories: CategoryResponse[] = [
  {
    id: "category-food",
    name: "Food",
    type: "EXPENSE",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 0,
    archivedAt: null,
    canDeletePermanently: false,
    deleteBlockReason: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
  {
    id: "category-groceries",
    name: "Groceries",
    type: "EXPENSE",
    parentCategoryId: "category-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
    order: 1,
    archivedAt: null,
    canDeletePermanently: false,
    deleteBlockReason: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  },
];

const budgetView: MonthlyBudgetResponse = {
  month: "2026-04",
  includeArchivedCategories: false,
  currencies: [
    {
      currency: "EUR",
      budgetTotal: 0,
      spentTotal: 48,
      remainingTotal: -48,
      overBudgetTotal: 0,
      overBudgetCount: 0,
      budgetedCategoryCount: 0,
      unbudgetedExpenseTotal: 48,
      uncategorizedExpenseTotal: 0,
      items: [],
      overBudgetHighlights: [],
      unbudgetedCategories: [
        {
          categoryId: "category-groceries",
          categoryName: "Groceries",
          primaryCategoryId: "category-food",
          primaryCategoryName: "Food",
          secondaryCategoryId: "category-groceries",
          secondaryCategoryName: "Groceries",
          categoryArchivedAt: null,
          currency: "EUR",
          spentAmount: 48,
          previousMonthExpense: 42,
          averageExpenseLast3Months: 45.5,
        },
      ],
    },
  ],
};

const budgetViewWithWarning: MonthlyBudgetResponse = {
  month: "2026-04",
  includeArchivedCategories: false,
  currencies: [
    {
      currency: "EUR",
      budgetTotal: 120,
      spentTotal: 180,
      remainingTotal: -60,
      overBudgetTotal: 60,
      overBudgetCount: 1,
      budgetedCategoryCount: 1,
      unbudgetedExpenseTotal: 0,
      uncategorizedExpenseTotal: 25,
      items: [
        {
          budgetId: "budget-groceries",
          categoryId: "category-groceries",
          categoryName: "Groceries",
          primaryCategoryId: "category-food",
          primaryCategoryName: "Food",
          secondaryCategoryId: "category-groceries",
          secondaryCategoryName: "Groceries",
          categoryArchivedAt: null,
          currency: "EUR",
          budgetAmount: 120,
          spentAmount: 180,
          remainingAmount: -60,
          usageRatio: 1.5,
          status: "OVER_BUDGET",
          previousMonthExpense: 110,
          averageExpenseLast3Months: 115,
          startMonth: "2026-01",
          endMonth: null,
          override: null,
        },
      ],
      overBudgetHighlights: [
        {
          budgetId: "budget-groceries",
          categoryId: "category-groceries",
          categoryName: "Groceries",
          primaryCategoryId: "category-food",
          primaryCategoryName: "Food",
          secondaryCategoryId: "category-groceries",
          secondaryCategoryName: "Groceries",
          categoryArchivedAt: null,
          currency: "EUR",
          budgetAmount: 120,
          spentAmount: 180,
          remainingAmount: -60,
          usageRatio: 1.5,
          status: "OVER_BUDGET",
          previousMonthExpense: 110,
          averageExpenseLast3Months: 115,
          startMonth: "2026-01",
          endMonth: null,
          override: null,
        },
      ],
      unbudgetedCategories: [],
    },
  ],
};

const filters: BudgetFilters = {
  month: "2026-04",
  includeArchivedCategories: false,
};

const workflowCards: WorkflowCard[] = [];

describe("BudgetsPageClient", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-hide-money", "false");
  });

  it("opens a prefilled create-budget flow from an unbudgeted category", async () => {
    const user = userEvent.setup();
    render(
      <BudgetsPageClient
        budgetView={budgetView}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel="April 2026"
        workflowCards={workflowCards}
      />,
    );

    await user.click(screen.getByText("Budget coverage is incomplete"));

    await user.click(screen.getByRole("button", { name: "Create budget" }));

    const dialog = await screen.findByRole("dialog", {
      name: /create budget/i,
    });
    const categorySelect = within(dialog).getByLabelText(/expense category/i);
    const currencyInput = within(dialog).getByLabelText(/currency/i);
    const amountInput = within(dialog).getByLabelText(/monthly budget/i);

    expect(categorySelect).toHaveValue("category-groceries");
    expect(currencyInput).toHaveValue("EUR");
    expect(
      within(dialog).getByText(/quick-fill from recent spending/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: /use previous month: 42\.00/i,
      }),
    );

    expect(amountInput).toHaveValue(42);
  });

  it("renders the new hero controls and opens create budget from the header", async () => {
    const user = userEvent.setup();
    render(
      <BudgetsPageClient
        budgetView={budgetView}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel="April 2026"
        workflowCards={workflowCards}
      />,
    );

    expect(screen.queryByText("Budget workspace")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New budget" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Current month April 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("Filter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New budget" }));

    expect(
      await screen.findByRole("dialog", { name: /create budget/i }),
    ).toBeInTheDocument();
  });

  it("treats unbudgeted spend as info instead of warning", () => {
    render(
      <BudgetsPageClient
        budgetView={budgetView}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel="April 2026"
        workflowCards={workflowCards}
      />,
    );

    expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
    expect(screen.queryByText("Warnings to review")).not.toBeInTheDocument();
    expect(
      screen.getByText("Budget coverage is incomplete"),
    ).toBeInTheDocument();
    expect(screen.getByText("Groceries")).not.toBeVisible();
  });

  it("reveals unbudgeted categories behind a disclosure", async () => {
    const user = userEvent.setup();
    render(
      <BudgetsPageClient
        budgetView={budgetView}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel="April 2026"
        workflowCards={workflowCards}
      />,
    );

    await user.click(screen.getByText("Budget coverage is incomplete"));

    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Prev", { selector: "strong" })).toBeInTheDocument();
    expect(
      screen.getByText("3m avg", { selector: "strong" }),
    ).toBeInTheDocument();
  });

  it("hides budget warnings behind a disclosure and shows a warning pill", async () => {
    const user = userEvent.setup();
    render(
      <BudgetsPageClient
        budgetView={budgetViewWithWarning}
        categories={categories}
        filters={filters}
        budgetMonthPillLabel="April 2026"
        workflowCards={workflowCards}
      />,
    );

    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("Warnings to review")).toBeInTheDocument();
    expect(screen.getByText(/2 warnings hidden/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show 2 warnings/i }));

    expect(screen.getByText(/over-budget category/i)).toBeInTheDocument();
    expect(screen.getByText(/uncategorized expenses need review/i)).toBeInTheDocument();
  });
});

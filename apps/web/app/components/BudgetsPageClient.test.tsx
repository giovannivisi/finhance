import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryResponse, MonthlyBudgetResponse } from "@finhance/shared";
import BudgetsPageClient from "@components/BudgetsPageClient";

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

describe("BudgetsPageClient", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.setAttribute("data-hide-money", "false");
  });

  it("opens a prefilled create-budget flow from an unbudgeted category", async () => {
    const user = userEvent.setup();
    render(
      <BudgetsPageClient budgetView={budgetView} categories={categories} />,
    );

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
});

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AccountResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  TransactionResponse,
} from "@finhance/shared";
import TransactionsPageClient from "@components/TransactionsPageClient";
import type { ActivityFilters } from "@lib/activity";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("@components/ThemeProvider", () => ({
  useAppPreferences: () => ({
    hideMoney: false,
    isHydrated: true,
  }),
}));

vi.mock("@components/AnalyticsCategoryBarChart", () => ({
  default: ({
    data,
    onBarSelect,
  }: {
    data: Array<{ name: string; selectionKey?: string }>;
    onBarSelect?: (key: string) => void;
  }) => (
    <div>
      {data.map((item) => (
        <button
          key={item.selectionKey ?? item.name}
          type="button"
          onClick={() => {
            if (item.selectionKey && onBarSelect) {
              onBarSelect(item.selectionKey);
            }
          }}
        >
          {item.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@components/Modal", () => ({
  default: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@components/TransactionForm", () => ({
  default: () => <div>Transaction form</div>,
}));

vi.mock("@components/RecurringOccurrenceForm", () => ({
  default: () => <div>Recurring occurrence form</div>,
}));

vi.mock("@components/RecurringMaterializeButton", () => ({
  default: () => <button type="button">Sync due transactions</button>,
}));

function buildAccount(
  overrides: Partial<AccountResponse>,
): AccountResponse {
  return {
    id: overrides.id ?? "account-1",
    name: overrides.name ?? "Account",
    type: overrides.type ?? "BANK",
    currency: overrides.currency ?? "EUR",
    archivedAt: overrides.archivedAt ?? null,
    institution: overrides.institution ?? null,
    notes: overrides.notes ?? null,
    order: overrides.order ?? 1,
    openingBalance: overrides.openingBalance ?? 0,
    openingBalanceDate: overrides.openingBalanceDate ?? null,
    canDeletePermanently: overrides.canDeletePermanently ?? true,
    deleteBlockReason: overrides.deleteBlockReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-15T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-15T10:00:00.000Z",
  };
}

function buildCategory(
  overrides: Partial<CategoryResponse>,
): CategoryResponse {
  return {
    id: overrides.id ?? "category-1",
    name: overrides.name ?? "Category",
    type: overrides.type ?? "EXPENSE",
    parentCategoryId: overrides.parentCategoryId ?? null,
    parentCategoryName: overrides.parentCategoryName ?? null,
    isPrimary: overrides.isPrimary ?? true,
    isSecondary: overrides.isSecondary ?? false,
    order: overrides.order ?? 1,
    archivedAt: overrides.archivedAt ?? null,
    canDeletePermanently: overrides.canDeletePermanently ?? true,
    deleteBlockReason: overrides.deleteBlockReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-15T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-15T10:00:00.000Z",
  };
}

const accounts: AccountResponse[] = [
  buildAccount({
    id: "account-main",
    name: "Main account",
  }),
  buildAccount({
    id: "account-savings",
    name: "Savings",
  }),
];

const categories: CategoryResponse[] = [
  buildCategory({
    id: "primary-food",
    name: "Food",
    isPrimary: true,
  }),
  buildCategory({
    id: "secondary-bars",
    name: "Bars",
    parentCategoryId: "primary-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
  }),
  buildCategory({
    id: "secondary-grocery",
    name: "Groceries",
    parentCategoryId: "primary-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
  }),
];

const rules: ExpenseValidationRuleResponse[] = [];
const transactions: TransactionResponse[] = [];
const initialFilters: ActivityFilters = {
  from: "2026-05-01",
  to: "2026-05-31",
  kind: "",
  accountId: "",
  categoryId: "",
  primaryCategoryId: "",
  secondaryCategoryId: "",
  includeArchivedAccounts: false,
};

const baseCashflow: CashflowSummaryResponse = [
  {
    currency: "EUR",
    incomeTotal: 1200,
    expenseTotal: 880,
    adjustmentInTotal: 0,
    adjustmentOutTotal: 0,
    netCashflow: 320,
    byAccount: [
      {
        accountId: "account-main",
        name: "Main account",
        inflowTotal: 1200,
        outflowTotal: 880,
        netCashflow: 320,
      },
    ],
    byCategory: [
      {
        categoryId: "secondary-bars",
        name: "Bars",
        type: "EXPENSE",
        primaryCategoryId: "primary-food",
        primaryCategoryName: "Food",
        secondaryCategoryId: "secondary-bars",
        secondaryCategoryName: "Bars",
        total: 80,
      },
      {
        categoryId: "secondary-grocery",
        name: "Groceries",
        type: "EXPENSE",
        primaryCategoryId: "primary-food",
        primaryCategoryName: "Food",
        secondaryCategoryId: "secondary-grocery",
        secondaryCategoryName: "Groceries",
        total: 800,
      },
    ],
  },
];

function renderPage(
  cashflow = baseCashflow,
  entries: TransactionResponse[] = transactions,
) {
  return render(
    <TransactionsPageClient
      transactions={entries}
      cashflow={cashflow}
      accounts={accounts}
      categories={categories}
      expenseValidationRules={rules}
      initialFilters={initialFilters}
      hasPendingSync={false}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TransactionsPageClient cashflow drill-down", () => {
  it("renders chart-first account and category sections with no detail panel open by default", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: "Main account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(
      screen.queryByText("Net cashflow for this account in the selected range."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open in Activity" }),
    ).not.toBeInTheDocument();
  });

  it("opens and closes the selected category detail panel from the chart bar", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    expect(screen.getByText("2 secondary categories")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Food" }));

    expect(
      screen.queryByText("2 secondary categories"),
    ).not.toBeInTheDocument();
  });

  it("opens the selected account detail panel and drills into the filtered Activity view", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Main account" }));

    expect(
      screen.getByText("Net cashflow for this account in the selected range."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open in Activity" }));

    expect(push).toHaveBeenCalledWith(
      "/transactions?from=2026-05-01&to=2026-05-31&accountId=account-main",
    );
  });

  it("opens the selected category detail panel and drills into the filtered Activity view", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in Activity" }));

    expect(push).toHaveBeenCalledWith(
      "/transactions?from=2026-05-01&to=2026-05-31&primaryCategoryId=primary-food",
    );
  });

  it("does not open a detail panel for the synthetic Other category bar", () => {
    const otherCashflow: CashflowSummaryResponse = [
      {
        ...baseCashflow[0],
        byCategory: Array.from({ length: 9 }, (_, index) => ({
          categoryId: `secondary-${index + 1}`,
          name: `Secondary ${index + 1}`,
          type: "EXPENSE" as const,
          primaryCategoryId: `primary-${index + 1}`,
          primaryCategoryName: `Primary ${index + 1}`,
          secondaryCategoryId: `secondary-${index + 1}`,
          secondaryCategoryName: `Secondary ${index + 1}`,
          total: 100 - index,
        })),
      },
    ];

    renderPage(otherCashflow);

    fireEvent.click(screen.getByRole("button", { name: "Other" }));

    expect(
      screen.queryByRole("button", { name: "Open in Activity" }),
    ).not.toBeInTheDocument();
  });

  it("renders split-funded expenses as one expandable logical row", () => {
    renderPage(baseCashflow, [
      {
        id: "split-1",
        postedAt: "2026-05-20T10:30:00.000Z",
        amount: 12,
        currency: "EUR",
        kind: "EXPENSE",
        accountId: null,
        direction: "OUTFLOW",
        categoryId: "secondary-bars",
        primaryCategoryId: "primary-food",
        primaryCategoryName: "Food",
        secondaryCategoryId: "secondary-bars",
        secondaryCategoryName: "Bars",
        description: "Lunch",
        notes: null,
        counterparty: "Cafe",
        sourceAccountId: null,
        destinationAccountId: null,
        splitGroupId: "split-1",
        fundingLegs: [
          { accountId: "account-main", amount: 7, currency: "EUR" },
          { accountId: "account-savings", amount: 5, currency: "EUR" },
        ],
        recurringRuleId: null,
        recurringOccurrenceMonth: null,
        isRecurringGenerated: false,
        createdAt: "2026-05-20T10:30:00.000Z",
        updatedAt: "2026-05-20T10:30:00.000Z",
      },
    ]);

    expect(screen.getByText("Split")).toBeInTheDocument();
    expect(
      screen.getByText("Split across 2 accounts"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Split across 2 accounts"));

    expect(screen.getByText(/Main account: .*7,00/)).toBeInTheDocument();
    expect(screen.getByText(/Savings: .*5,00/)).toBeInTheDocument();
  });
});

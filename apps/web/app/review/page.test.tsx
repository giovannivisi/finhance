import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MonthlyReviewResponse } from "@finhance/shared";
import ReviewPage from "@/review/page";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
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

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/MoneyValue", () => ({
  default: ({
    value,
    currency,
  }: {
    value: number;
    currency?: string;
  }) => <span>{currency ? `${currency} ${value}` : `EUR ${value}`}</span>,
}));

vi.mock("@components/RecurringMaterializeButton", () => ({
  default: () => <button type="button">Sync recurring</button>,
}));

vi.mock("@components/ReviewCaptureSnapshotButton", () => ({
  default: () => <button type="button">Capture snapshot</button>,
}));

vi.mock("@components/ReviewMonthPicker", () => ({
  default: ({ currentMonth }: { currentMonth: string }) => (
    <a href={`/review?month=${encodeURIComponent(currentMonth)}`}>
      Month picker {currentMonth}
    </a>
  ),
}));

vi.mock("@components/WorkflowSection", () => ({
  default: ({
    title,
    cards,
  }: {
    title: string;
    cards: Array<{ code: string; href: string; actionLabel: string }>;
  }) => (
    <div>
      <h2>{title}</h2>
      {cards.map((card) => (
        <a key={card.code} href={card.href}>
          {card.actionLabel}
        </a>
      ))}
    </div>
  ),
}));

function buildReviewResponse(): MonthlyReviewResponse {
  return {
    month: "2026-04",
    cashflow: [
      {
        currency: "EUR",
        incomeTotal: 4000,
        expenseTotal: 2500,
        adjustmentInTotal: 0,
        adjustmentOutTotal: 0,
        netCashflow: 1500,
        byCategory: [],
        byAccount: [],
      },
    ],
    openingNetWorth: 10000,
    closingNetWorth: 11200,
    netWorthDelta: 1200,
    reportingCurrency: "EUR",
    openingSnapshotDate: "2026-04-01",
    closingSnapshotDate: null,
    warnings: [
      {
        code: "MISSING_CLOSING_SNAPSHOT",
        severity: "WARNING",
        title: "Closing snapshot missing",
        detail: "Capture the end-of-month snapshot before closing the month.",
        count: null,
        amount: null,
        currency: null,
      },
      {
        code: "OVER_BUDGET_CATEGORIES",
        severity: "INFO",
        title: "Over budget categories",
        detail: "A few categories are above plan.",
        count: 2,
        amount: null,
        currency: null,
      },
    ],
    netWorthExplanation: {
      reportingCurrency: "EUR",
      isComparableInReportingCurrency: false,
      cashflowContribution: 900,
      marketAndFxMovement: 300,
      note: "One non-EUR account still limits direct comparison.",
    },
    recurringComparison: [
      {
        currency: "EUR",
        expectedIncomeTotal: 2000,
        actualIncomeTotal: 1950,
        expectedExpenseTotal: 800,
        actualExpenseTotal: 820,
        dueRuleCount: 3,
        realizedRuleCount: 2,
        skippedCount: 1,
        overriddenCount: 1,
        transferRulesExcludedCount: 0,
      },
    ],
    currencyInsights: [
      {
        currency: "EUR",
        savingsRate: 0.375,
        uncategorizedExpenseTotal: 25,
        uncategorizedIncomeTotal: 0,
        topExpenseCategories: [
          {
            categoryId: "expense-1",
            name: "Groceries",
            primaryCategoryId: "food",
            primaryCategoryName: "Food",
            secondaryCategoryId: "groceries",
            secondaryCategoryName: "Groceries",
            total: 300,
          },
        ],
        topIncomeCategories: [
          {
            categoryId: "income-1",
            name: "Salary",
            primaryCategoryId: null,
            primaryCategoryName: null,
            secondaryCategoryId: null,
            secondaryCategoryName: null,
            total: 4000,
          },
        ],
        topAccounts: [
          {
            accountId: "account-1",
            name: "Main account",
            inflowTotal: 4000,
            outflowTotal: 2500,
            netCashflow: 1500,
          },
        ],
      },
    ],
    budgetSummary: [
      {
        currency: "EUR",
        budgetTotal: 1800,
        spentTotal: 1950,
        remainingTotal: -150,
        overBudgetTotal: 150,
        overBudgetCount: 2,
        budgetedCategoryCount: 4,
        unbudgetedExpenseTotal: 80,
        uncategorizedExpenseTotal: 25,
        items: [],
        overBudgetHighlights: [],
        unbudgetedCategories: [],
      },
    ],
    budgetHighlights: [
      {
        budgetId: "budget-1",
        categoryId: "groceries",
        categoryName: "Groceries",
        primaryCategoryId: "food",
        primaryCategoryName: "Food",
        secondaryCategoryId: "groceries",
        secondaryCategoryName: "Groceries",
        categoryArchivedAt: null,
        currency: "EUR",
        budgetAmount: 400,
        spentAmount: 520,
        remainingAmount: -120,
        usageRatio: 1.3,
        status: "OVER_BUDGET",
        previousMonthExpense: 360,
        averageExpenseLast3Months: 390,
        startMonth: "2026-01",
        endMonth: null,
        override: null,
      },
    ],
    reconciliationHighlights: [
      {
        status: "MISMATCH",
        accountId: "account-1",
        accountName: "Main account",
        accountType: "BANK",
        currency: "EUR",
        baselineMode: "FULL_HISTORY",
        trackedBalance: 1200,
        expectedBalance: 1170,
        delta: 30,
        assetCount: 1,
        transactionCount: 12,
        issueCodes: [],
        diagnostics: [
          {
            code: "BASELINE_POSSIBLY_STALE",
            severity: "WARNING",
            summary: "Recent balance edit detected",
            likelyCause: "A transaction or asset was adjusted after the last snapshot.",
            recommendedAction: "Review and reset the baseline if required.",
          },
        ],
        canCreateAdjustment: true,
        canEstablishOpeningBalanceBaseline: false,
        openingBalanceBaselineGuidance: null,
        adjustmentGuidance: {
          status: "SAFE",
          message: "Review recent edits before posting an adjustment.",
        },
      },
    ],
    recurringExceptions: [
      {
        id: "occurrence-1",
        recurringRuleId: "rule-1",
        recurringRuleName: "Gym",
        kind: "EXPENSE",
        occurrenceMonth: "2026-04",
        status: "SKIPPED",
        amount: null,
        postedAtDate: null,
        accountId: "account-1",
        direction: "OUTFLOW",
        categoryId: "groceries",
        primaryCategoryId: "food",
        primaryCategoryName: "Food",
        secondaryCategoryId: "groceries",
        secondaryCategoryName: "Groceries",
        counterparty: null,
        sourceAccountId: null,
        destinationAccountId: null,
        description: null,
        notes: null,
        createdAt: "2026-04-18T10:00:00.000Z",
        updatedAt: "2026-04-18T10:00:00.000Z",
      },
    ],
  };
}

describe("ReviewPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("renders the monthly close hub with compact highlights and actions", async () => {
    apiMock
      .mockResolvedValueOnce(buildReviewResponse())
      .mockResolvedValueOnce({
        isComplete: true,
        requiredCompletedCount: 2,
        requiredTotalCount: 2,
      })
      .mockResolvedValueOnce({ hasPending: true });

    const { container } = render(
      await ReviewPage({
        searchParams: Promise.resolve({ month: "2026-04" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Monthly close" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Opening net worth")).toBeInTheDocument();
    expect(screen.getByText("Close status")).toBeInTheDocument();
    expect(screen.getByText("Warnings and actions")).toBeInTheDocument();
    expect(screen.getByText("Highlights")).toBeInTheDocument();
    expect(screen.getByText("Budget highlights")).toBeInTheDocument();
    expect(screen.getByText("Recurring highlights")).toBeInTheDocument();
    expect(screen.getByText("Cashflow highlights")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation highlights")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync recurring" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Open budgets" })[0],
    ).toHaveAttribute("href", "/budgets?month=2026-04");
    expect(screen.getByRole("link", { name: "Month picker 2026-04" })).toHaveAttribute(
      "href",
      "/review?month=2026-04",
    );
    expect(
      screen.getByText("Recent balance edit detected"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Drivers")).not.toBeInTheDocument();
    expect(screen.queryByText("Budget status")).not.toBeInTheDocument();
    expect(screen.queryByText("Recurring vs actual")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Top expense categories"),
    ).not.toBeInTheDocument();

    const highlightDisclosures = Array.from(
      container.querySelectorAll("details.analytics-filter-shell"),
    );
    expect(highlightDisclosures).toHaveLength(4);
    highlightDisclosures.forEach((disclosure) => {
      expect(disclosure.hasAttribute("open")).toBe(false);
    });

    const highlightsHeading = screen.getByRole("heading", { name: "Highlights" });
    const workflowHeading = screen.getByText("Continue the workflow");
    expect(
      highlightsHeading.compareDocumentPosition(workflowHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("renders compact empty states when the month has no warnings or highlights", async () => {
    const review = buildReviewResponse();
    review.warnings = [];
    review.budgetSummary = [];
    review.budgetHighlights = [];
    review.recurringComparison = [];
    review.recurringExceptions = [];
    review.currencyInsights = [];
    review.reconciliationHighlights = [];

    apiMock
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce({
        isComplete: true,
        requiredCompletedCount: 2,
        requiredTotalCount: 2,
      })
      .mockResolvedValueOnce({ hasPending: false });

    render(
      await ReviewPage({
        searchParams: Promise.resolve({ month: "2026-04" }),
      }),
    );

    expect(
      screen.getByText("No monthly close warnings for this month."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No budget data is available for this month."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No recurring rules or exceptions affected this month."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No income or expense drivers were recorded in 2026-04."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture snapshot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync recurring" })).not.toBeInTheDocument();
  });

  it("shows snapshot capture only for the current month when the closing snapshot is missing", async () => {
    const review = buildReviewResponse();
    review.month = "2026-05";

    apiMock
      .mockResolvedValueOnce(review)
      .mockResolvedValueOnce({
        isComplete: true,
        requiredCompletedCount: 2,
        requiredTotalCount: 2,
      })
      .mockResolvedValueOnce({ hasPending: false });

    render(
      await ReviewPage({
        searchParams: Promise.resolve({ month: "2026-05" }),
      }),
    );

    expect(
      screen.getByRole("button", { name: "Capture snapshot" }),
    ).toBeInTheDocument();
  });
});

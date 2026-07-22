import { describe, expect, it } from "vitest";
import type {
  AccountResponse,
  AiTransactionDraft,
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";

import {
  buildPostedAt,
  buildTransactionRequest,
  applyTransactionDraft,
  emptyTransactionForm,
  matchExpenseRule,
  type TransactionFormState,
} from "./form";

function account(
  id: string,
  currency: string,
  overrides: Partial<AccountResponse> = {},
): AccountResponse {
  return {
    id,
    name: `Account ${id}`,
    type: "BANK",
    currency,
    institution: null,
    notes: null,
    order: 0,
    openingBalance: 0,
    openingBalanceDate: null,
    archivedAt: null,
    canDeletePermanently: false,
    deleteBlockReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const accounts = new Map<string, AccountResponse>([
  ["bank", account("bank", "EUR")],
  ["card", account("card", "EUR")],
  ["usd", account("usd", "USD")],
]);

const rules: ExpenseValidationRuleResponse[] = [
  {
    id: "rule-1",
    entry: "Groceries",
    normalizedEntry: "groceries",
    secondaryCategoryId: "cat-groceries",
    secondaryCategoryName: "Groceries",
    primaryCategoryId: "cat-living",
    primaryCategoryName: "Living",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const categories: CategoryResponse[] = [
  {
    id: "cat-groceries",
    name: "Groceries",
    type: "EXPENSE",
    parentCategoryId: "cat-living",
    parentCategoryName: "Living",
    isPrimary: false,
    isSecondary: true,
    order: 0,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "manual-category",
    name: "Manual category",
    type: "EXPENSE",
    parentCategoryId: "cat-living",
    parentCategoryName: "Living",
    isPrimary: false,
    isSecondary: true,
    order: 1,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "income-salary",
    name: "Salary",
    type: "INCOME",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 2,
    archivedAt: null,
    canDeletePermanently: true,
    deleteBlockReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function baseForm(
  overrides: Partial<TransactionFormState>,
): TransactionFormState {
  return { ...emptyTransactionForm(), ...overrides };
}

describe("buildTransactionRequest — standard", () => {
  it("builds a valid expense", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        amount: "42,50",
        description: "Dinner",
        accountId: "bank",
        categoryId: "cat-eating-out",
        date: "2026-06-09",
        time: "20:15",
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      kind: "EXPENSE",
      amount: 42.5,
      accountId: "bank",
      direction: "OUTFLOW",
      categoryId: "cat-eating-out",
    });
  });

  it("requires a category for expenses without a rule match", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        amount: "10",
        description: "Mystery",
        accountId: "bank",
      }),
      accounts,
      rules,
    );

    expect(result.request).toBeUndefined();
    expect(result.errors.categoryId).toBeDefined();
  });

  it("auto-fills the category from a matching description rule", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        amount: "10",
        description: "  groceries ",
        accountId: "bank",
      }),
      accounts,
      rules,
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({ categoryId: "cat-groceries" });
  });

  it("strips categories from adjustments and honours direction", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "ADJUSTMENT",
        amount: "5",
        description: "Drift fix",
        accountId: "bank",
        categoryId: "cat-x",
        direction: "INFLOW",
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      kind: "ADJUSTMENT",
      direction: "INFLOW",
      categoryId: null,
    });
  });

  it("requires native amount when a different original currency is set", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        amount: "10",
        description: "Abroad",
        accountId: "bank",
        categoryId: "cat",
        nativeEnabled: true,
        nativeCurrency: "USD",
        nativeAmount: "",
      }),
      accounts,
      [],
    );

    expect(result.request).toBeUndefined();
    expect(result.errors.nativeAmount).toBeDefined();
  });

  it("drops the original currency when it matches the account currency", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        amount: "10",
        description: "Local",
        accountId: "bank",
        categoryId: "cat",
        nativeEnabled: true,
        nativeCurrency: "EUR",
        nativeAmount: "11",
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      nativeCurrency: null,
      nativeAmount: null,
    });
  });
});

describe("applyTransactionDraft", () => {
  it("maps safe draft fields and selects a unique cash account", () => {
    const draft: AiTransactionDraft = {
      kind: "EXPENSE",
      amount: 4.5,
      currency: "EUR",
      postedAt: "2026-07-11",
      description: "Groceries",
      counterparty: "Market",
      paymentMethod: "cash",
      cardLast4: null,
      parsedBy: "heuristic",
      cloudAttempted: false,
    };
    const result = applyTransactionDraft(
      baseForm({ kind: "EXPENSE", accountId: null, categoryId: null }),
      draft,
      [account("bank", "EUR"), account("cash", "EUR", { type: "CASH" })],
      categories,
      rules,
    );

    expect(result).toMatchObject({
      amount: "4.5",
      date: "2026-07-11",
      description: "Groceries",
      counterparty: "Market",
      accountId: "cash",
      categoryId: "cat-groceries",
    });
  });

  it("leaves a manually selected category and ambiguous cash selection alone", () => {
    const draft: AiTransactionDraft = {
      kind: "EXPENSE",
      amount: null,
      currency: null,
      postedAt: null,
      description: "Groceries",
      counterparty: null,
      paymentMethod: "cash",
      cardLast4: null,
      parsedBy: "heuristic",
      cloudAttempted: false,
    };
    const result = applyTransactionDraft(
      baseForm({
        kind: "EXPENSE",
        accountId: "bank",
        categoryId: "manual-category",
      }),
      draft,
      [
        account("bank", "EUR"),
        account("cash-1", "EUR", { type: "CASH" }),
        account("cash-2", "EUR", { type: "CASH" }),
      ],
      categories,
      rules,
    );

    expect(result.accountId).toBe("bank");
    expect(result.categoryId).toBe("manual-category");
  });

  it("maps an income draft to its inflow direction and unambiguous local matches", () => {
    const draft: AiTransactionDraft = {
      kind: "INCOME",
      amount: 2400,
      currency: "EUR",
      postedAt: "2026-07-01",
      description: "July Salary Account bank",
      counterparty: "Employer",
      paymentMethod: "unknown",
      cardLast4: null,
      parsedBy: "heuristic",
      cloudAttempted: false,
    };

    const result = applyTransactionDraft(
      baseForm({ kind: "EXPENSE", direction: "OUTFLOW" }),
      draft,
      [account("bank", "EUR")],
      categories,
      rules,
    );

    expect(result).toMatchObject({
      kind: "INCOME",
      direction: "INFLOW",
      amount: "2400",
      accountId: "bank",
      categoryId: "income-salary",
      split: false,
    });
  });
});

describe("buildTransactionRequest — transfer", () => {
  it("rejects identical accounts", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "TRANSFER",
        amount: "100",
        description: "Move",
        sourceAccountId: "bank",
        destinationAccountId: "bank",
      }),
      accounts,
      [],
    );

    expect(result.request).toBeUndefined();
    expect(result.errors.destinationAccountId).toBeDefined();
  });

  it("derives a manual FX rate from an explicit received amount", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "TRANSFER",
        amount: "100",
        description: "To US",
        sourceAccountId: "bank",
        destinationAccountId: "usd",
        destinationAmount: "108",
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      kind: "TRANSFER",
      destinationAmount: 108,
      fxRateUsed: 1.08,
      fxRateSource: "MANUAL",
    });
  });

  it("leaves FX to the server when nothing manual is provided", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "TRANSFER",
        amount: "100",
        description: "To US",
        sourceAccountId: "bank",
        destinationAccountId: "usd",
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      destinationAmount: null,
      fxRateUsed: null,
      fxRateSource: null,
    });
  });
});

describe("buildTransactionRequest — split expense", () => {
  it("rejects splits with fewer than two complete legs", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        split: true,
        description: "Holiday",
        categoryId: "cat",
        legs: [
          { accountId: "bank", amount: "50" },
          { accountId: null, amount: "" },
        ],
      }),
      accounts,
      [],
    );

    expect(result.request).toBeUndefined();
    expect(result.errors.legs).toBeDefined();
  });

  it("rejects legs in different currencies", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        split: true,
        description: "Holiday",
        categoryId: "cat",
        legs: [
          { accountId: "bank", amount: "50" },
          { accountId: "usd", amount: "50" },
        ],
      }),
      accounts,
      [],
    );

    expect(result.request).toBeUndefined();
    expect(result.errors.legs).toContain("one currency");
  });

  it("sums legs into the total amount", () => {
    const result = buildTransactionRequest(
      baseForm({
        kind: "EXPENSE",
        split: true,
        description: "Holiday",
        categoryId: "cat",
        legs: [
          { accountId: "bank", amount: "50,25" },
          { accountId: "card", amount: "49.75" },
        ],
      }),
      accounts,
      [],
    );

    expect(result.errors).toEqual({});
    expect(result.request).toMatchObject({
      amount: 100,
      fundingLegs: [
        { accountId: "bank", amount: 50.25 },
        { accountId: "card", amount: 49.75 },
      ],
    });
  });
});

describe("helpers", () => {
  it("builds ISO timestamps from local date and time", () => {
    const iso = buildPostedAt("2026-06-10", "08:05");
    expect(new Date(iso).getTime()).toBe(new Date(2026, 5, 10, 8, 5).getTime());
  });

  it("matches expense rules case-insensitively", () => {
    expect(matchExpenseRule("GROCERIES", rules)?.id).toBe("rule-1");
    expect(matchExpenseRule("nothing", rules)).toBeNull();
  });
});

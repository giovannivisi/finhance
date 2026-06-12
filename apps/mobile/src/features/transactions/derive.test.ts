import { describe, expect, it } from "vitest";
import type { TransactionResponse } from "@finhance/shared";

import {
  buildSearchEntries,
  filterBySearch,
  groupTransactionsByDay,
  signedTransactionAmount,
  transactionSubtitle,
} from "./derive";

function transaction(
  overrides: Partial<TransactionResponse>,
): TransactionResponse {
  return {
    id: "tx",
    postedAt: new Date(2026, 5, 9, 12, 0).toISOString(),
    amount: 10,
    currency: "EUR",
    kind: "EXPENSE",
    accountId: "bank",
    direction: "OUTFLOW",
    categoryId: "cat",
    primaryCategoryId: "p",
    primaryCategoryName: "Living",
    secondaryCategoryId: "s",
    secondaryCategoryName: "Groceries",
    description: "Shop",
    notes: null,
    counterparty: null,
    sourceAccountId: null,
    destinationAccountId: null,
    recurringRuleId: null,
    recurringOccurrenceMonth: null,
    isRecurringGenerated: false,
    createdAt: "2026-06-09T12:00:00.000Z",
    updatedAt: "2026-06-09T12:00:00.000Z",
    ...overrides,
  };
}

const accountNames = new Map([
  ["bank", "Main bank"],
  ["savings", "Savings"],
]);

describe("groupTransactionsByDay", () => {
  it("groups by local day, newest day and row first", () => {
    const groups = groupTransactionsByDay([
      transaction({
        id: "a",
        postedAt: new Date(2026, 5, 8, 10, 0).toISOString(),
      }),
      transaction({
        id: "b",
        postedAt: new Date(2026, 5, 9, 9, 0).toISOString(),
      }),
      transaction({
        id: "c",
        postedAt: new Date(2026, 5, 9, 18, 0).toISOString(),
      }),
    ]);

    expect(groups.map((group) => group.date)).toEqual([
      "2026-06-09",
      "2026-06-08",
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["c", "b"]);
  });
});

describe("signedTransactionAmount", () => {
  it("signs amounts by kind", () => {
    expect(signedTransactionAmount(transaction({ kind: "EXPENSE" }))).toBe(-10);
    expect(
      signedTransactionAmount(
        transaction({ kind: "INCOME", direction: "INFLOW" }),
      ),
    ).toBe(10);
    expect(
      signedTransactionAmount(
        transaction({ kind: "ADJUSTMENT", direction: "OUTFLOW" }),
      ),
    ).toBe(-10);
    expect(
      signedTransactionAmount(transaction({ kind: "TRANSFER" })),
    ).toBeNull();
  });
});

describe("transactionSubtitle", () => {
  it("describes standard rows with account and category", () => {
    expect(transactionSubtitle(transaction({}), accountNames)).toBe(
      "Main bank • Groceries",
    );
  });

  it("describes transfers with both endpoints", () => {
    expect(
      transactionSubtitle(
        transaction({
          kind: "TRANSFER",
          accountId: null,
          sourceAccountId: "bank",
          destinationAccountId: "savings",
        }),
        accountNames,
      ),
    ).toBe("Main bank → Savings");
  });

  it("flags split rows", () => {
    expect(
      transactionSubtitle(
        transaction({
          splitGroupId: "grp",
          fundingLegs: [
            { accountId: "bank", amount: 5, currency: "EUR" },
            { accountId: "savings", amount: 5, currency: "EUR" },
          ],
        }),
        accountNames,
      ),
    ).toContain("Split · 2 accounts");
  });
});

describe("search", () => {
  it("matches across description, payee, and category", () => {
    const entries = buildSearchEntries(
      [
        transaction({ id: "a", description: "Pizza night" }),
        transaction({
          id: "b",
          description: "Fuel",
          counterparty: "Esso",
          secondaryCategoryName: "Car",
        }),
      ],
      accountNames,
    );

    expect(filterBySearch(entries, "pizza").map((t) => t.id)).toEqual(["a"]);
    expect(filterBySearch(entries, "esso car").map((t) => t.id)).toEqual(["b"]);
    expect(filterBySearch(entries, "")).toHaveLength(2);
  });
});

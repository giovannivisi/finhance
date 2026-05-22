import assert from "node:assert/strict";
import test from "node:test";
import { buildTransactionPayload } from "./transaction-form.ts";

test("buildTransactionPayload creates income payloads", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "INCOME",
    amount: "100",
    description: " Salary ",
    notes: " monthly ",
    accountId: "account-1",
    direction: "OUTFLOW",
    categoryId: "category-1",
    counterparty: " Employer ",
    sourceAccountId: "",
    destinationAccountId: "",
    fundingMode: "SINGLE",
    fundingLegs: [
      { accountId: "", amount: "" },
      { accountId: "", amount: "" },
    ],
  });

  assert.equal(result.payload?.kind, "INCOME");
  assert.deepEqual(result.payload, {
    postedAt: new Date("2026-04-17T10:30").toISOString(),
    kind: "INCOME",
    amount: 100,
    description: "Salary",
    notes: "monthly",
    accountId: "account-1",
    direction: "INFLOW",
    categoryId: "category-1",
    counterparty: "Employer",
    nativeAmount: undefined,
    nativeCurrency: undefined,
    fxRateUsed: undefined,
    fxRateSource: undefined,
  });
});

test("buildTransactionPayload creates transfer payloads", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "TRANSFER",
    amount: "25",
    description: "Transfer",
    notes: "",
    accountId: "",
    direction: "INFLOW",
    categoryId: "",
    counterparty: "",
    sourceAccountId: "account-a",
    destinationAccountId: "account-b",
    fundingMode: "SINGLE",
    fundingLegs: [
      { accountId: "", amount: "" },
      { accountId: "", amount: "" },
    ],
  });

  assert.deepEqual(result.payload, {
    postedAt: new Date("2026-04-17T10:30").toISOString(),
    kind: "TRANSFER",
    amount: 25,
    description: "Transfer",
    notes: null,
    sourceAccountId: "account-a",
    destinationAccountId: "account-b",
    sourceAmount: 25,
    destinationAmount: undefined,
    sourceCurrency: null,
    destinationCurrency: null,
    fxRateUsed: undefined,
    fxRateSource: undefined,
  });
});

test("buildTransactionPayload rejects same-account transfers", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "TRANSFER",
    amount: "25",
    description: "Transfer",
    notes: "",
    accountId: "",
    direction: "INFLOW",
    categoryId: "",
    counterparty: "",
    sourceAccountId: "account-a",
    destinationAccountId: "account-a",
    fundingMode: "SINGLE",
    fundingLegs: [
      { accountId: "", amount: "" },
      { accountId: "", amount: "" },
    ],
  });

  assert.equal(result.error, "Transfers require two different accounts.");
});

test("buildTransactionPayload creates split-funded expense payloads", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "EXPENSE",
    amount: "12",
    description: "Lunch",
    notes: "",
    accountId: "",
    direction: "OUTFLOW",
    categoryId: "category-food",
    counterparty: "Cafe",
    sourceAccountId: "",
    destinationAccountId: "",
    fundingMode: "SPLIT",
    fundingLegs: [
      { accountId: "voucher", amount: "7" },
      { accountId: "cash", amount: "5" },
    ],
  });

  assert.deepEqual(result.payload, {
    postedAt: new Date("2026-04-17T10:30").toISOString(),
    kind: "EXPENSE",
    amount: 12,
    description: "Lunch",
    notes: null,
    categoryId: "category-food",
    counterparty: "Cafe",
    fundingLegs: [
      { accountId: "voucher", amount: 7 },
      { accountId: "cash", amount: 5 },
    ],
  });
});

test("buildTransactionPayload rejects duplicate split-funding accounts", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "EXPENSE",
    amount: "12",
    description: "Lunch",
    notes: "",
    accountId: "",
    direction: "OUTFLOW",
    categoryId: "category-food",
    counterparty: "Cafe",
    sourceAccountId: "",
    destinationAccountId: "",
    fundingMode: "SPLIT",
    fundingLegs: [
      { accountId: "voucher", amount: "7" },
      { accountId: "voucher", amount: "5" },
    ],
  });

  assert.equal(
    result.error,
    "Split funding cannot reuse the same account twice.",
  );
});

test("buildTransactionPayload rejects split-funding totals that do not match", () => {
  const result = buildTransactionPayload({
    postedAt: "2026-04-17T10:30",
    kind: "EXPENSE",
    amount: "12",
    description: "Lunch",
    notes: "",
    accountId: "",
    direction: "OUTFLOW",
    categoryId: "category-food",
    counterparty: "Cafe",
    sourceAccountId: "",
    destinationAccountId: "",
    fundingMode: "SPLIT",
    fundingLegs: [
      { accountId: "voucher", amount: "7" },
      { accountId: "cash", amount: "4" },
    ],
  });

  assert.equal(
    result.error,
    "The main amount must match the sum of the funding legs.",
  );
});

test("buildTransactionPayload combines a date-only value with the current Rome time", () => {
  const result = buildTransactionPayload(
    {
      postedAt: "2026-05-21",
      kind: "EXPENSE",
      amount: "12",
      description: "Lunch",
      notes: "",
      accountId: "account-1",
      direction: "OUTFLOW",
      categoryId: "category-food",
      counterparty: "",
      sourceAccountId: "",
      destinationAccountId: "",
      fundingMode: "SINGLE",
      fundingLegs: [
        { accountId: "", amount: "" },
        { accountId: "", amount: "" },
      ],
    },
    {
      showTransactionTimes: false,
      now: new Date("2026-05-20T08:30:45.000Z"),
    },
  );

  assert.equal(result.payload?.postedAt, "2026-05-21T08:30:45.000Z");
});

test("buildTransactionPayload preserves the hidden Rome time while editing", () => {
  const result = buildTransactionPayload(
    {
      postedAt: "2026-05-22",
      kind: "EXPENSE",
      amount: "12",
      description: "Lunch",
      notes: "",
      accountId: "account-1",
      direction: "OUTFLOW",
      categoryId: "category-food",
      counterparty: "",
      sourceAccountId: "",
      destinationAccountId: "",
      fundingMode: "SINGLE",
      fundingLegs: [
        { accountId: "", amount: "" },
        { accountId: "", amount: "" },
      ],
    },
    {
      showTransactionTimes: false,
      existingPostedAt: "2026-05-20T08:30:45.000Z",
      now: new Date("2026-05-20T18:00:00.000Z"),
    },
  );

  assert.equal(result.payload?.postedAt, "2026-05-22T08:30:45.000Z");
});

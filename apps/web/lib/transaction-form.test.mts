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

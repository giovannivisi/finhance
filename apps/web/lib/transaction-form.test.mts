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
  });

  assert.equal(result.error, "Transfers require two different accounts.");
});

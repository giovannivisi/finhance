import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecurringRulePayload,
  createEmptyRecurringRuleFormValues,
} from "./recurring-rule-form.ts";

test("buildRecurringRulePayload creates standard monthly rules", () => {
  const result = buildRecurringRulePayload({
    ...createEmptyRecurringRuleFormValues(),
    name: "Salary",
    kind: "INCOME",
    amount: "2500",
    dayOfMonth: "15",
    startDate: "2026-04-01",
    accountId: "account-1",
    direction: "INFLOW",
    categoryId: "category-1",
    description: "Monthly salary",
    counterparty: "Employer",
  });

  assert.deepEqual(result, {
    payload: {
      name: "Salary",
      kind: "INCOME",
      amount: 2500,
      dayOfMonth: 15,
      startDate: "2026-04-01",
      endDate: null,
      accountId: "account-1",
      direction: "INFLOW",
      categoryId: "category-1",
      counterparty: "Employer",
      description: "Monthly salary",
      notes: null,
      isActive: true,
    },
  });
});

test("buildRecurringRulePayload creates transfer monthly rules", () => {
  const result = buildRecurringRulePayload({
    ...createEmptyRecurringRuleFormValues(),
    name: "Broker transfer",
    kind: "TRANSFER",
    amount: "500",
    dayOfMonth: "5",
    startDate: "2026-04-01",
    sourceAccountId: "bank",
    destinationAccountId: "broker",
    description: "Invest monthly",
  });

  assert.deepEqual(result, {
    payload: {
      name: "Broker transfer",
      kind: "TRANSFER",
      amount: 500,
      dayOfMonth: 5,
      startDate: "2026-04-01",
      endDate: null,
      sourceAccountId: "bank",
      destinationAccountId: "broker",
      description: "Invest monthly",
      notes: null,
      isActive: true,
    },
  });
});

test("buildRecurringRulePayload rejects invalid monthly dates", () => {
  const result = buildRecurringRulePayload({
    ...createEmptyRecurringRuleFormValues(),
    name: "Bad",
    amount: "100",
    dayOfMonth: "32",
    startDate: "2026-04-01",
    accountId: "account-1",
    description: "Invalid",
  });

  assert.equal(result.error, "Day of month must be between 1 and 31.");
});

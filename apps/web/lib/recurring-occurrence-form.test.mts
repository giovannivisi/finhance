import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecurringOccurrencePayload,
  createRecurringOccurrenceFormValuesFromRule,
} from "./recurring-occurrence-form.ts";

test("buildRecurringOccurrencePayload creates standard month overrides", () => {
  const result = buildRecurringOccurrencePayload({
    occurrenceMonth: "2026-04",
    kind: "EXPENSE",
    postedAtDate: "2026-04-18",
    amount: "125.5",
    description: "Rent override",
    notes: "Late this month",
    accountId: "account-1",
    direction: "OUTFLOW",
    categoryId: "category-1",
    counterparty: "Landlord",
    sourceAccountId: "",
    destinationAccountId: "",
  });

  assert.deepEqual(result, {
    payload: {
      status: "OVERRIDDEN",
      amount: 125.5,
      postedAtDate: "2026-04-18",
      accountId: "account-1",
      direction: "OUTFLOW",
      categoryId: "category-1",
      counterparty: "Landlord",
      description: "Rent override",
      notes: "Late this month",
    },
  });
});

test("buildRecurringOccurrencePayload creates transfer month overrides", () => {
  const result = buildRecurringOccurrencePayload({
    occurrenceMonth: "2026-04",
    kind: "TRANSFER",
    postedAtDate: "2026-04-05",
    amount: "500",
    description: "Broker override",
    notes: "",
    accountId: "",
    direction: "OUTFLOW",
    categoryId: "",
    counterparty: "",
    sourceAccountId: "bank",
    destinationAccountId: "broker",
  });

  assert.deepEqual(result, {
    payload: {
      status: "OVERRIDDEN",
      amount: 500,
      postedAtDate: "2026-04-05",
      sourceAccountId: "bank",
      destinationAccountId: "broker",
      description: "Broker override",
      notes: null,
    },
  });
});

test("buildRecurringOccurrencePayload rejects dates outside the selected month", () => {
  const result = buildRecurringOccurrencePayload({
    occurrenceMonth: "2026-04",
    kind: "INCOME",
    postedAtDate: "2026-05-01",
    amount: "1000",
    description: "Salary",
    notes: "",
    accountId: "account-1",
    direction: "INFLOW",
    categoryId: "",
    counterparty: "",
    sourceAccountId: "",
    destinationAccountId: "",
  });

  assert.equal(
    result.error,
    "Occurrence date must stay inside the selected month.",
  );
});

test("createRecurringOccurrenceFormValuesFromRule clamps day of month", () => {
  const form = createRecurringOccurrenceFormValuesFromRule(
    {
      id: "rule-1",
      name: "Rent",
      isActive: true,
      kind: "EXPENSE",
      amount: 100,
      dayOfMonth: 31,
      startDate: "2026-01-01",
      endDate: null,
      accountId: "account-1",
      direction: "OUTFLOW",
      categoryId: null,
      counterparty: null,
      sourceAccountId: null,
      destinationAccountId: null,
      description: "Rent",
      notes: null,
      lastMaterializationError: null,
      lastMaterializationErrorAt: null,
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    "2026-02",
  );

  assert.equal(form.postedAtDate, "2026-02-28");
});

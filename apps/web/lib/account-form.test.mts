import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountPayload } from "./account-form.ts";

test("buildAccountPayload normalizes account fields", () => {
  const result = buildAccountPayload({
    name: " Main checking ",
    type: "BANK",
    currency: " usd ",
    institution: " Local Bank ",
    notes: " rainy day ",
    order: "3",
    openingBalance: "1200.50",
    openingBalanceDate: "2026-04-01",
  });

  assert.deepEqual(result.payload, {
    name: "Main checking",
    type: "BANK",
    currency: "USD",
    institution: "Local Bank",
    notes: "rainy day",
    order: 3,
    openingBalance: 1200.5,
    openingBalanceDate: "2026-04-01",
  });
});

test("buildAccountPayload rejects invalid currency codes", () => {
  const result = buildAccountPayload({
    name: "Checking",
    type: "BANK",
    currency: "EURO",
    institution: "",
    notes: "",
    order: "",
    openingBalance: "",
    openingBalanceDate: "",
  });

  assert.equal(result.error, "Currency must be a 3-letter code.");
});

test("buildAccountPayload requires an opening-balance date for non-zero baselines", () => {
  const result = buildAccountPayload({
    name: "Checking",
    type: "BANK",
    currency: "EUR",
    institution: "",
    notes: "",
    order: "",
    openingBalance: "10",
    openingBalanceDate: "",
  });

  assert.equal(
    result.error,
    "Opening balance date is required when opening balance is not zero.",
  );
});

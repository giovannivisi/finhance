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
  });

  assert.deepEqual(result.payload, {
    name: "Main checking",
    type: "BANK",
    currency: "USD",
    institution: "Local Bank",
    notes: "rainy day",
    order: 3,
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
  });

  assert.equal(result.error, "Currency must be a 3-letter code.");
});

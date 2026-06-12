import assert from "node:assert/strict";
import test from "node:test";
import { buildCategoryPayload } from "./category-form.ts";

test("buildCategoryPayload normalizes category fields", () => {
  const result = buildCategoryPayload({
    name: " Groceries ",
    type: "EXPENSE",
    parentCategoryId: "",
    order: "2",
  });

  assert.deepEqual(result.payload, {
    name: "Groceries",
    type: "EXPENSE",
    parentCategoryId: null,
    order: 2,
  });
});

test("buildCategoryPayload rejects empty names", () => {
  const result = buildCategoryPayload({
    name: "   ",
    type: "INCOME",
    parentCategoryId: "",
    order: "",
  });

  assert.equal(result.error, "Name is required.");
});

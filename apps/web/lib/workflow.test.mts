import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalyticsFocusLink, getWorkflowCards } from "./workflow.ts";

test("buildAnalyticsFocusLink creates a six-month range ending in the focus month", () => {
  assert.equal(
    buildAnalyticsFocusLink("2026-04"),
    "/analytics?from=2025-11&to=2026-04",
  );
});

test("getWorkflowCards includes setup when the trust baseline is incomplete", () => {
  const cards = getWorkflowCards({
    currentPage: "review",
    month: "2026-04",
    setup: {
      isComplete: false,
      requiredCompletedCount: 1,
      requiredTotalCount: 2,
    },
  });

  assert.deepEqual(
    cards.map((card) => card.code),
    ["SETUP", "ANALYTICS", "BUDGETS"],
  );
  assert.match(cards[0]?.detail ?? "", /1 of 2 required steps complete/);
});

test("getWorkflowCards omits the current page and setup when the baseline is complete", () => {
  const cards = getWorkflowCards({
    currentPage: "analytics",
    month: "2026-04",
    setup: {
      isComplete: true,
      requiredCompletedCount: 2,
      requiredTotalCount: 2,
    },
  });

  assert.deepEqual(
    cards.map((card) => card.code),
    ["REVIEW", "BUDGETS"],
  );
});

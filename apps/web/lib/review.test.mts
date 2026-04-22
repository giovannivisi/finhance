import assert from "node:assert/strict";
import test from "node:test";
import {
  getReviewMonthDateRange,
  getReviewWarningLink,
  isCurrentReviewMonth,
  shouldOfferSnapshotCapture,
} from "./review.ts";

test("getReviewMonthDateRange returns the full selected month", () => {
  assert.deepEqual(getReviewMonthDateRange("2026-02"), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
});

test("isCurrentReviewMonth uses Europe/Rome month boundaries", () => {
  assert.equal(
    isCurrentReviewMonth("2026-04", new Date("2026-04-30T21:59:59.000Z")),
    true,
  );
  assert.equal(
    isCurrentReviewMonth("2026-04", new Date("2026-04-30T22:00:00.000Z")),
    false,
  );
});

test("shouldOfferSnapshotCapture only enables capture for the current month", () => {
  const warnings = [
    {
      code: "MISSING_CLOSING_SNAPSHOT",
      severity: "WARNING",
      title: "Missing closing snapshot",
      detail: "Missing",
      count: null,
      amount: null,
      currency: null,
    },
  ] as const;

  assert.equal(
    shouldOfferSnapshotCapture(
      "2026-04",
      [...warnings],
      new Date("2026-04-15T12:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    shouldOfferSnapshotCapture(
      "2026-03",
      [...warnings],
      new Date("2026-04-15T12:00:00.000Z"),
    ),
    false,
  );
});

test("getReviewWarningLink maps warning codes to the right follow-through page", () => {
  assert.deepEqual(getReviewWarningLink("RECONCILIATION_ISSUES", "2026-04"), {
    href: "/accounts",
    label: "Open accounts",
  });
  assert.deepEqual(getReviewWarningLink("UNCATEGORIZED_EXPENSES", "2026-04"), {
    href: "/transactions?from=2026-04-01&to=2026-04-30",
    label: "Open transactions",
  });
  assert.deepEqual(
    getReviewWarningLink("RECURRING_EXCEPTIONS_PRESENT", "2026-04"),
    {
      href: "/recurring",
      label: "Open recurring rules",
    },
  );
});

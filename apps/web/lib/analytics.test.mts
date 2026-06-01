import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsToMonth,
  buildAnalyticsQueryString,
  buildTransactionsLink,
  getAnalyticsFilters,
  getDefaultAnalyticsFilters,
  getMonthDateRange,
} from "./analytics.ts";

test("getDefaultAnalyticsFilters opens to the last 6 months", () => {
  assert.deepEqual(
    getDefaultAnalyticsFilters(new Date("2026-04-23T12:00:00.000Z")),
    {
      from: "2025-11",
      to: "2026-04",
      accountId: "",
      categoryId: "",
      includeArchivedAccounts: false,
    },
  );
});

test("addMonthsToMonth handles year boundaries", () => {
  assert.equal(addMonthsToMonth("2026-01", -2), "2025-11");
  assert.equal(addMonthsToMonth("2026-12", 2), "2027-02");
});

test("getMonthDateRange returns the full calendar month", () => {
  assert.deepEqual(getMonthDateRange("2026-02"), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
});

test("buildTransactionsLink preserves filters and month scopes", () => {
  assert.equal(
    buildTransactionsLink({
      month: "2026-04",
      accountId: "account-1",
      categoryId: "category-1",
      kind: "EXPENSE",
      includeArchivedAccounts: true,
    }),
    "/transactions?from=2026-04-01&to=2026-04-30&accountId=account-1&categoryId=category-1&kind=EXPENSE&includeArchivedAccounts=true",
  );
});

test("buildAnalyticsQueryString includes required months and omits empty filters", () => {
  assert.equal(
    buildAnalyticsQueryString({
      from: "2026-01",
      to: "2026-06",
      accountId: "",
      categoryId: "",
      includeArchivedAccounts: false,
    }),
    "from=2026-01&to=2026-06",
  );

  assert.equal(
    buildAnalyticsQueryString({
      from: "2026-01",
      to: "2026-06",
      accountId: "account-1",
      categoryId: "category-1",
      includeArchivedAccounts: true,
    }),
    "from=2026-01&to=2026-06&accountId=account-1&categoryId=category-1&includeArchivedAccounts=true",
  );
});

test("getAnalyticsFilters falls back to default months while preserving valid filters", () => {
  assert.deepEqual(
    getAnalyticsFilters(
      {
        from: "bad-month",
        to: "2026-13",
        accountId: "account-1",
        categoryId: "category-1",
        includeArchivedAccounts: "true",
      },
      new Date("2026-04-23T12:00:00.000Z"),
    ),
    {
      from: "2025-11",
      to: "2026-04",
      accountId: "account-1",
      categoryId: "category-1",
      includeArchivedAccounts: true,
    },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentRomeDateString,
  getCurrentRomeYearStartString,
  getDefaultActivityFilters,
  getLatestAvailableMonthActivityFilters,
  getRomeMonthEndString,
  getRomeMonthStartString,
} from "./activity.ts";

test("activity defaults use the current Rome year through today", () => {
  const date = new Date("2026-05-14T12:00:00.000Z");

  assert.equal(getCurrentRomeYearStartString(date), "2026-01-01");
  assert.equal(getCurrentRomeDateString(date), "2026-05-14");
  assert.deepEqual(getDefaultActivityFilters(date), {
    from: "2026-01-01",
    to: "2026-05-14",
    accountId: "",
    categoryId: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
    kind: "",
    includeArchivedAccounts: false,
  });
});

test("latest available month filters cover the whole Rome month", () => {
  const date = new Date("2026-05-14T12:00:00.000Z");

  assert.equal(getRomeMonthStartString(date), "2026-05-01");
  assert.equal(getRomeMonthEndString(date), "2026-05-31");
  assert.deepEqual(getLatestAvailableMonthActivityFilters(date), {
    from: "2026-05-01",
    to: "2026-05-31",
    accountId: "",
    categoryId: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
    kind: "",
    includeArchivedAccounts: false,
  });
});

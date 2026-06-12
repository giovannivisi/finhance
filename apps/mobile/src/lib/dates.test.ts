import { describe, expect, it } from "vitest";

import {
  addMonths,
  currentMonth,
  daysInMonth,
  formatDayHeading,
  formatMonthLabel,
  localDateOf,
  monthBounds,
  monthRange,
  todayLocalDate,
} from "./dates";

describe("month math", () => {
  it("adds months across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-06", 0)).toBe("2026-06");
  });

  it("computes month bounds including leap years", () => {
    expect(monthBounds("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(monthBounds("2024-02").to).toBe("2024-02-29");
    expect(daysInMonth("2026-06")).toBe(30);
  });

  it("builds inclusive month ranges", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("derives the current month and day from a reference date", () => {
    const reference = new Date(2026, 5, 10, 9, 30);
    expect(currentMonth(reference)).toBe("2026-06");
    expect(todayLocalDate(reference)).toBe("2026-06-10");
  });
});

describe("labels", () => {
  it("formats month labels", () => {
    expect(formatMonthLabel("2026-06")).toBe("June 2026");
  });

  it("formats day headings relative to today", () => {
    const now = new Date(2026, 5, 10);
    expect(formatDayHeading("2026-06-10", now)).toBe("Today");
    expect(formatDayHeading("2026-06-09", now)).toBe("Yesterday");
    expect(formatDayHeading("2026-06-01", now)).toContain("1 June");
    expect(formatDayHeading("2025-12-31", now)).toContain("2025");
  });

  it("extracts the local date of a timestamp", () => {
    const timestamp = new Date(2026, 5, 10, 23, 30).toISOString();
    expect(localDateOf(timestamp)).toBe("2026-06-10");
  });
});

import { describe, expect, it } from "vitest";

import {
  parseBooleanPref,
  parseClockFormat,
  parseLaunchTab,
  resolveHour12,
} from "./preferences";

describe("app preferences", () => {
  it("normalises clock format preferences", () => {
    expect(parseClockFormat("12h")).toBe("12h");
    expect(parseClockFormat("24h")).toBe("24h");
    expect(parseClockFormat("bad")).toBe("system");
    expect(parseClockFormat(null)).toBe("system");
  });

  it("normalises launch tabs", () => {
    expect(parseLaunchTab("activity")).toBe("activity");
    expect(parseLaunchTab("wallets")).toBe("wallets");
    expect(parseLaunchTab("dashboard")).toBe("home");
  });

  it("parses stored booleans", () => {
    expect(parseBooleanPref("true")).toBe(true);
    expect(parseBooleanPref(true)).toBe(true);
    expect(parseBooleanPref("false")).toBe(false);
    expect(parseBooleanPref(null)).toBe(false);
  });

  it("resolves explicit hour-cycle preferences", () => {
    expect(resolveHour12("12h", "en-GB")).toBe(true);
    expect(resolveHour12("24h", "en-US")).toBe(false);
  });
});

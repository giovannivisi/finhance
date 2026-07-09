import { afterEach, describe, expect, it } from "vitest";

import { resetFormatConfig, setFormatConfig } from "./format-config";
import { formatMoney, HIDDEN_AMOUNT, parseAmountInput } from "./money";

afterEach(() => {
  resetFormatConfig();
});

describe("formatMoney", () => {
  it("formats amounts with the currency symbol", () => {
    expect(formatMoney(1234.5, "EUR")).toBe("€1,234.50");
  });

  it("masks amounts when hidden", () => {
    expect(formatMoney(1234.5, "EUR", { hide: true })).toBe(HIDDEN_AMOUNT);
  });

  it("supports sign display for flows", () => {
    expect(formatMoney(25, "EUR", { signDisplay: "exceptZero" })).toBe(
      "+€25.00",
    );
    expect(formatMoney(-25, "EUR", { signDisplay: "exceptZero" })).toBe(
      "-€25.00",
    );
  });

  it("drops decimals when asked", () => {
    expect(formatMoney(1900.4, "EUR", { maximumFractionDigits: 0 })).toBe(
      "€1,900",
    );
  });

  it("uses the configured locale", () => {
    setFormatConfig({ locale: "de-DE", hour12: false });
    expect(formatMoney(1234.5, "EUR")).toContain("1.234,50");
  });

  it("falls back gracefully for unknown currency codes", () => {
    expect(formatMoney(10, "ZZZ")).toContain("10");
  });

  it("handles non-finite values", () => {
    expect(formatMoney(Number.NaN, "EUR")).toBe("—");
  });
});

describe("parseAmountInput", () => {
  it("parses plain decimals", () => {
    expect(parseAmountInput("12.34")).toBe(12.34);
  });

  it("parses comma decimals", () => {
    expect(parseAmountInput("12,34")).toBe(12.34);
  });

  it("parses thousands with comma decimal", () => {
    expect(parseAmountInput("1.234,56")).toBe(1234.56);
  });

  it("parses thousands with dot decimal", () => {
    expect(parseAmountInput("1,234.56")).toBe(1234.56);
  });

  it("ignores spaces", () => {
    expect(parseAmountInput(" 1 200,5 ")).toBe(1200.5);
  });

  it("rejects garbage", () => {
    expect(parseAmountInput("12a")).toBeNull();
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("1.2.3,4")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  MAX_RECEIPT_DRAFT_CHARACTERS,
  prepareReceiptDraftText,
  redactReceiptText,
} from "@/features/transactions/receipt-redaction";

describe("redactReceiptText", () => {
  it("keeps only the last four digits of recognised payment-card numbers", () => {
    expect(
      redactReceiptText(
        "cards 4111111111111111, 5555 5555 5555 4444, and 3782-822463-10005",
      ),
    ).toBe("cards •••• 1111, •••• 4444, and •••• 0005");
  });

  it("redacts IBANs, email addresses, and telephone numbers", () => {
    expect(
      redactReceiptText(
        "IBAN IT60 X054 2811 1010 0000 0123 456, person@example.com, +39 347 123 4567",
      ),
    ).toBe("IBAN [REDACTED IBAN], [REDACTED EMAIL], [REDACTED PHONE]");
  });

  it("keeps ordinary receipt amounts intact", () => {
    expect(redactReceiptText("Total EUR 14.50, table 12")).toBe(
      "Total EUR 14.50, table 12",
    );
  });

  it("bounds the redacted text used for a local receipt draft", () => {
    expect(prepareReceiptDraftText("x".repeat(6_100))).toHaveLength(
      MAX_RECEIPT_DRAFT_CHARACTERS,
    );
  });
});

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PAN_PATTERN = /(?<!\d)(?:\d[ -]?){11,18}\d(?!\d)/g;
const INTERNATIONAL_PHONE_PATTERN = /\+\d(?:[\s().-]*\d){6,14}(?![\w.])/g;
const PHONE_PATTERN = /(?<![\w.])\d(?:[\s().-]*\d){6,10}(?![\w.])/g;

export const MAX_RECEIPT_DRAFT_CHARACTERS = 6_000;

/**
 * Removes direct identifiers before recognised receipt text can leave the
 * device. The API applies the same defensive policy again before parsing.
 */
export function redactReceiptText(value: string): string {
  return value
    .replace(IBAN_PATTERN, "[REDACTED IBAN]")
    .replace(EMAIL_PATTERN, "[REDACTED EMAIL]")
    .replace(INTERNATIONAL_PHONE_PATTERN, "[REDACTED PHONE]")
    .replace(PAN_PATTERN, redactPaymentCard)
    .replace(PHONE_PATTERN, "[REDACTED PHONE]");
}

export function prepareReceiptDraftText(value: string): string {
  return redactReceiptText(value).trim().slice(0, MAX_RECEIPT_DRAFT_CHARACTERS);
}

function redactPaymentCard(match: string): string {
  const digits = match.replace(/\D/g, "");

  if (digits.length < 12 || digits.length > 19) {
    return match;
  }

  return `•••• ${digits.slice(-4)}`;
}

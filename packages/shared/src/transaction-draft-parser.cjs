// @ts-check

const ROME_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CURRENCY_PATTERNS = [
  { currency: "EUR", pattern: /(?:€|\beur\b|\beuro\b)/i },
  { currency: "USD", pattern: /(?:\$|\busd\b|\bdollars?\b)/i },
  { currency: "GBP", pattern: /(?:£|\bgbp\b|\bpounds?\b)/i },
  { currency: "CHF", pattern: /(?:\bchf\b|\bfranchi\b)/i },
];
const AMOUNT_PATTERN =
  /(?<!\d)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,7})(?!\d)/g;
const TOTAL_AMOUNT_PATTERN =
  /\b(?:total|totale)\b[^\d]{0,16}(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,7})/gi;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SHORT_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\b/;
const CARD_LAST_FOUR_PATTERN =
  /\b(?:\*{4}|•{4})\s*(\d{4})\b|\b(?:card|carta|visa|mastercard|amex|bancomat)\D{0,12}(\d{4})\b/i;

/**
 * Derives a conservative, reviewable transaction draft from text that the
 * caller has already redacted according to its privacy boundary.
 *
 * @param {string} text
 * @param {Date} [now]
 * @returns {import("#ai").AiTransactionDraft}
 */
function createHeuristicTransactionDraft(text, now = new Date()) {
  return {
    amount: findAmount(text),
    currency: findCurrency(text),
    postedAt: findDate(text, now),
    description: cleanDescription(text),
    counterparty: null,
    paymentMethod: findPaymentMethod(text),
    cardLast4: findCardLastFour(text),
    parsedBy: "heuristic",
    cloudAttempted: false,
  };
}

/**
 * @param {string} value
 * @returns {number | null}
 */
function findAmount(value) {
  const totalMatch = TOTAL_AMOUNT_PATTERN.exec(value);
  TOTAL_AMOUNT_PATTERN.lastIndex = 0;

  if (totalMatch?.[1]) {
    return parseAmount(totalMatch[1]);
  }

  const candidates = [...value.matchAll(AMOUNT_PATTERN)]
    .filter((match) => isPlausibleAmountMatch(value, match))
    .map((match) => parseAmount(match[1] ?? ""))
    .filter((amount) => amount !== null);

  return candidates.at(-1) ?? null;
}

/**
 * @param {string} value
 * @param {RegExpMatchArray} match
 * @returns {boolean}
 */
function isPlausibleAmountMatch(value, match) {
  const raw = match[1] ?? "";
  if (/[.,]/.test(raw) || raw.length <= 3) {
    return true;
  }

  const index = match.index ?? 0;
  const surrounding = value.slice(
    Math.max(0, index - 8),
    index + raw.length + 8,
  );
  return /(?:€|\$|£|\b(?:eur|euro|usd|gbp|chf)\b)/i.test(surrounding);
}

/**
 * @param {string} value
 * @returns {number | null}
 */
function parseAmount(value) {
  const compact = value.replace(/\s/g, "");
  const separatorIndexes = [...compact.matchAll(/[.,]/g)].map(
    (match) => match.index,
  );
  const lastSeparatorIndex = separatorIndexes.at(-1) ?? -1;
  const fractionLength = compact.length - lastSeparatorIndex - 1;
  const usesBothSeparators = compact.includes(".") && compact.includes(",");
  const decimalIndex =
    lastSeparatorIndex !== -1 && (usesBothSeparators || fractionLength <= 2)
      ? lastSeparatorIndex
      : -1;
  const normalized =
    decimalIndex === -1
      ? compact.replace(/[.,]/g, "")
      : `${compact.slice(0, decimalIndex).replace(/[.,]/g, "")}.${compact.slice(decimalIndex + 1)}`;
  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000
    ? amount
    : null;
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function findCurrency(value) {
  return (
    CURRENCY_PATTERNS.find(({ pattern }) => pattern.test(value))?.currency ??
    null
  );
}

/**
 * @param {string} value
 * @param {Date} now
 * @returns {string | null}
 */
function findDate(value, now) {
  const today = ROME_DATE_FORMATTER.format(now);

  if (/\b(?:today|oggi)\b/i.test(value)) {
    return today;
  }

  if (/\b(?:yesterday|ieri)\b/i.test(value)) {
    return addDays(today, -1);
  }

  if (/\b(?:tomorrow|domani)\b/i.test(value)) {
    return addDays(today, 1);
  }

  const isoMatch = ISO_DATE_PATTERN.exec(value);
  if (isoMatch) {
    const date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return isRealDate(date) ? date : null;
  }

  const shortDateMatch = SHORT_DATE_PATTERN.exec(value);
  if (!shortDateMatch) {
    return null;
  }

  const year = Number(today.slice(0, 4));
  const day = Number(shortDateMatch[1]);
  const month = Number(shortDateMatch[2]);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isRealDate(date) ? date : null;
}

/**
 * @param {string} date
 * @param {number} amount
 * @returns {string}
 */
function addDays(date, amount) {
  const [yearPart, monthPart, dayPart] = date.split("-").map(Number);
  const year = yearPart ?? 1970;
  const month = monthPart ?? 1;
  const day = dayPart ?? 1;
  const result = new Date(Date.UTC(year, month - 1, day));
  result.setUTCDate(result.getUTCDate() + amount);

  return result.toISOString().slice(0, 10);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isRealDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * @param {string} value
 * @returns {import("#ai").AiTransactionDraftPaymentMethod}
 */
function findPaymentMethod(value) {
  if (/\b(?:cash|contanti)\b/i.test(value)) {
    return "cash";
  }

  if (/\b(?:card|carta|visa|mastercard|amex|bancomat)\b/i.test(value)) {
    return "card";
  }

  return "unknown";
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function findCardLastFour(value) {
  const match = CARD_LAST_FOUR_PATTERN.exec(value);
  return match?.[1] ?? match?.[2] ?? null;
}

/**
 * @param {string} value
 * @returns {string}
 */
function cleanDescription(value) {
  const withoutAmounts = value
    .replace(TOTAL_AMOUNT_PATTERN, " ")
    .replace(AMOUNT_PATTERN, " ")
    .replace(ISO_DATE_PATTERN, " ")
    .replace(SHORT_DATE_PATTERN, " ")
    .replace(/\b(?:today|oggi|yesterday|ieri|tomorrow|domani)\b/gi, " ")
    .replace(
      /\b(?:cash|contanti|card|carta|visa|mastercard|amex|bancomat)\b/gi,
      " ",
    )
    .replace(
      /(?:€|\$|£|\b(?:eur|euro|usd|dollars?|gbp|pounds?|chf|franchi)\b)/gi,
      " ",
    )
    .replace(/[•*]{4}/g, " ")
    .replace(/[,:;()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (withoutAmounts || "Unlabelled transaction").slice(0, 240);
}

exports.createHeuristicTransactionDraft = createHeuristicTransactionDraft;

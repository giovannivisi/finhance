import type { AssetKind } from "#assets";

export interface ExchangeDefinition {
  value: string;
  flag: string;
  name: string;
  venue: string;
  allowedKinds: readonly AssetKind[];
  searchText: string;
}

const MARKET_KINDS: readonly AssetKind[] = ["STOCK", "BOND"];
const CRYPTO_ONLY: readonly AssetKind[] = ["CRYPTO"];

export const SUPPORTED_EXCHANGES: readonly ExchangeDefinition[] = [
  {
    value: "",
    flag: "🇺🇸",
    name: "United States",
    venue: "NYSE / Nasdaq",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".TO",
    flag: "🇨🇦",
    name: "Toronto",
    venue: "TSX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".V",
    flag: "🇨🇦",
    name: "Toronto Venture",
    venue: "TSXV",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".MX",
    flag: "🇲🇽",
    name: "Mexico City",
    venue: "BMV",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SA",
    flag: "🇧🇷",
    name: "São Paulo",
    venue: "B3",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".BA",
    flag: "🇦🇷",
    name: "Buenos Aires",
    venue: "BYMA",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".L",
    flag: "🇬🇧",
    name: "London",
    venue: "LSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".IR",
    flag: "🇮🇪",
    name: "Dublin",
    venue: "ISE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".DE",
    flag: "🇩🇪",
    name: "Xetra",
    venue: "Deutsche Börse",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".F",
    flag: "🇩🇪",
    name: "Frankfurt",
    venue: "FSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".HM",
    flag: "🇩🇪",
    name: "Hamburg",
    venue: "Börse Hamburg",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".DU",
    flag: "🇩🇪",
    name: "Düsseldorf",
    venue: "Börse Düsseldorf",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".MU",
    flag: "🇩🇪",
    name: "Munich",
    venue: "Börse München",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".BE",
    flag: "🇩🇪",
    name: "Berlin",
    venue: "Börse Berlin",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SG",
    flag: "🇩🇪",
    name: "Stuttgart",
    venue: "Börse Stuttgart",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SW",
    flag: "🇨🇭",
    name: "Zurich",
    venue: "SIX Swiss Exchange",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".VI",
    flag: "🇦🇹",
    name: "Vienna",
    venue: "Wiener Börse",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".AS",
    flag: "🇳🇱",
    name: "Amsterdam",
    venue: "Euronext Amsterdam",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".BR",
    flag: "🇧🇪",
    name: "Brussels",
    venue: "Euronext Brussels",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".PA",
    flag: "🇫🇷",
    name: "Paris",
    venue: "Euronext Paris",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".MC",
    flag: "🇪🇸",
    name: "Madrid",
    venue: "BME",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".LS",
    flag: "🇵🇹",
    name: "Lisbon",
    venue: "Euronext Lisbon",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".MI",
    flag: "🇮🇹",
    name: "Milan",
    venue: "BIT",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".ST",
    flag: "🇸🇪",
    name: "Stockholm",
    venue: "Nasdaq Stockholm",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".OL",
    flag: "🇳🇴",
    name: "Oslo",
    venue: "Oslo Børs",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".CO",
    flag: "🇩🇰",
    name: "Copenhagen",
    venue: "Nasdaq Copenhagen",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".HE",
    flag: "🇫🇮",
    name: "Helsinki",
    venue: "Nasdaq Helsinki",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".WA",
    flag: "🇵🇱",
    name: "Warsaw",
    venue: "GPW",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".PR",
    flag: "🇨🇿",
    name: "Prague",
    venue: "PSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".AT",
    flag: "🇬🇷",
    name: "Athens",
    venue: "ATHEX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".IS",
    flag: "🇹🇷",
    name: "Istanbul",
    venue: "Borsa İstanbul",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".JO",
    flag: "🇿🇦",
    name: "Johannesburg",
    venue: "JSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".TA",
    flag: "🇮🇱",
    name: "Tel Aviv",
    venue: "TASE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".BO",
    flag: "🇮🇳",
    name: "Mumbai",
    venue: "BSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".NS",
    flag: "🇮🇳",
    name: "National Stock Exchange",
    venue: "NSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".T",
    flag: "🇯🇵",
    name: "Tokyo",
    venue: "TSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".KS",
    flag: "🇰🇷",
    name: "Korea Exchange",
    venue: "KRX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".KQ",
    flag: "🇰🇷",
    name: "KOSDAQ",
    venue: "KRX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".HK",
    flag: "🇭🇰",
    name: "Hong Kong",
    venue: "HKEX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SS",
    flag: "🇨🇳",
    name: "Shanghai",
    venue: "SSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SZ",
    flag: "🇨🇳",
    name: "Shenzhen",
    venue: "SZSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".TW",
    flag: "🇹🇼",
    name: "Taiwan",
    venue: "TWSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".SI",
    flag: "🇸🇬",
    name: "Singapore",
    venue: "SGX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".BK",
    flag: "🇹🇭",
    name: "Bangkok",
    venue: "SET",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".KL",
    flag: "🇲🇾",
    name: "Kuala Lumpur",
    venue: "Bursa Malaysia",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".JK",
    flag: "🇮🇩",
    name: "Jakarta",
    venue: "IDX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".PS",
    flag: "🇵🇭",
    name: "Philippine Stock Exchange",
    venue: "PSE",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".AX",
    flag: "🇦🇺",
    name: "Australia",
    venue: "ASX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: ".NZ",
    flag: "🇳🇿",
    name: "New Zealand",
    venue: "NZX",
    allowedKinds: MARKET_KINDS,
  },
  {
    value: "_CRYPTO_",
    flag: "₿",
    name: "Crypto",
    venue: "Yahoo crypto pair",
    allowedKinds: CRYPTO_ONLY,
  },
].map((entry) => ({
  ...entry,
  searchText:
    `${entry.value} ${entry.name} ${entry.venue} ${entry.flag}`.toLowerCase(),
}));

export function getSupportedExchangeDefinitionsForKind(kind: AssetKind) {
  return SUPPORTED_EXCHANGES.filter((exchange) =>
    exchange.allowedKinds.some((allowedKind) => allowedKind === kind),
  );
}

export function getExchangeDefinition(
  value: string | null | undefined,
  kind?: AssetKind | null,
): ExchangeDefinition | null {
  const normalized = (value ?? "").trim().toUpperCase();
  const exchanges =
    kind &&
    kind !== "CASH" &&
    kind !== "REAL_ESTATE" &&
    kind !== "PENSION" &&
    kind !== "COMMODITY" &&
    kind !== "OTHER"
      ? getSupportedExchangeDefinitionsForKind(kind)
      : SUPPORTED_EXCHANGES;

  return exchanges.find((exchange) => exchange.value === normalized) ?? null;
}

export function isSupportedExchangeValue(
  value: string | null | undefined,
  kind?: AssetKind | null,
): boolean {
  return getExchangeDefinition(value, kind) !== null;
}

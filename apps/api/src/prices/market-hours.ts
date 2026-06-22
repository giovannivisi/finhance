import { AssetKind } from '@finhance/db';

/**
 * Regular cash-equity trading hours for the venues finhance supports, used to
 * decide whether a stored quote is genuinely behind the market or simply the
 * most recent close while the venue is shut.
 *
 * Hours describe the *core* continuous-trading session (no pre/post auctions).
 * Keeping the window narrow biases the "is the market open?" check towards
 * "closed", so a price captured at the close is treated as current rather than
 * stale once continuous trading ends — which is what we want for a long-term
 * net-worth tracker.
 *
 * This is a deliberate approximation: public holidays are not modelled, so on a
 * holiday a venue reads as open and an aged quote may still look stale. In that
 * case an automatic refresh simply re-fetches the unchanged close, so the cost
 * of the approximation is a redundant fetch, not a wrong figure.
 */
export interface MarketSession {
  timeZone: string;
  /** Minutes past local midnight when continuous trading opens. */
  openMinutes: number;
  /** Minutes past local midnight when continuous trading closes. */
  closeMinutes: number;
}

export type MarketOpenState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

const hm = (hours: number, minutes: number): number => hours * 60 + minutes;

// All Eurozone CET/CEST venues share the same UTC offset and DST rules, so a
// single representative IANA zone resolves them all.
const CET_SESSION: MarketSession = {
  timeZone: 'Europe/Berlin',
  openMinutes: hm(9, 0),
  closeMinutes: hm(17, 30),
};

/**
 * Keyed by the Yahoo exchange suffix stored on the asset (US listings use the
 * empty string). Venues that trade on a non Mon–Fri week (e.g. Tel Aviv) or
 * whose hours we are unsure about are intentionally omitted and resolve to
 * {@link MarketOpenState} `UNKNOWN`, which preserves the legacy age-only
 * staleness behaviour for them.
 */
const EXCHANGE_SESSIONS: Record<string, MarketSession> = {
  // North America
  '': {
    timeZone: 'America/New_York',
    openMinutes: hm(9, 30),
    closeMinutes: hm(16, 0),
  },
  '.TO': {
    timeZone: 'America/Toronto',
    openMinutes: hm(9, 30),
    closeMinutes: hm(16, 0),
  },
  '.V': {
    timeZone: 'America/Toronto',
    openMinutes: hm(9, 30),
    closeMinutes: hm(16, 0),
  },
  // UK & Ireland
  '.L': {
    timeZone: 'Europe/London',
    openMinutes: hm(8, 0),
    closeMinutes: hm(16, 30),
  },
  '.IR': {
    timeZone: 'Europe/Dublin',
    openMinutes: hm(8, 0),
    closeMinutes: hm(16, 30),
  },
  // Eurozone (CET/CEST)
  '.DE': CET_SESSION,
  '.F': CET_SESSION,
  '.HM': CET_SESSION,
  '.DU': CET_SESSION,
  '.MU': CET_SESSION,
  '.BE': CET_SESSION,
  '.SG': CET_SESSION,
  '.SW': CET_SESSION,
  '.VI': CET_SESSION,
  '.AS': CET_SESSION,
  '.BR': CET_SESSION,
  '.PA': CET_SESSION,
  '.MC': CET_SESSION,
  '.LS': CET_SESSION,
  '.MI': CET_SESSION,
  '.ST': CET_SESSION,
  '.OL': CET_SESSION,
  '.CO': CET_SESSION,
  '.WA': CET_SESSION,
  '.PR': CET_SESSION,
  // Other Europe
  '.HE': {
    timeZone: 'Europe/Helsinki',
    openMinutes: hm(10, 0),
    closeMinutes: hm(18, 30),
  },
  '.AT': {
    timeZone: 'Europe/Athens',
    openMinutes: hm(10, 15),
    closeMinutes: hm(17, 20),
  },
  // Asia-Pacific
  '.T': {
    timeZone: 'Asia/Tokyo',
    openMinutes: hm(9, 0),
    closeMinutes: hm(15, 0),
  },
  '.HK': {
    timeZone: 'Asia/Hong_Kong',
    openMinutes: hm(9, 30),
    closeMinutes: hm(16, 0),
  },
  '.SS': {
    timeZone: 'Asia/Shanghai',
    openMinutes: hm(9, 30),
    closeMinutes: hm(15, 0),
  },
  '.SZ': {
    timeZone: 'Asia/Shanghai',
    openMinutes: hm(9, 30),
    closeMinutes: hm(15, 0),
  },
  '.SI': {
    timeZone: 'Asia/Singapore',
    openMinutes: hm(9, 0),
    closeMinutes: hm(17, 0),
  },
  '.KS': {
    timeZone: 'Asia/Seoul',
    openMinutes: hm(9, 0),
    closeMinutes: hm(15, 30),
  },
  '.KQ': {
    timeZone: 'Asia/Seoul',
    openMinutes: hm(9, 0),
    closeMinutes: hm(15, 30),
  },
  '.TW': {
    timeZone: 'Asia/Taipei',
    openMinutes: hm(9, 0),
    closeMinutes: hm(13, 30),
  },
  '.BO': {
    timeZone: 'Asia/Kolkata',
    openMinutes: hm(9, 15),
    closeMinutes: hm(15, 30),
  },
  '.NS': {
    timeZone: 'Asia/Kolkata',
    openMinutes: hm(9, 15),
    closeMinutes: hm(15, 30),
  },
  '.AX': {
    timeZone: 'Australia/Sydney',
    openMinutes: hm(10, 0),
    closeMinutes: hm(16, 0),
  },
  '.NZ': {
    timeZone: 'Pacific/Auckland',
    openMinutes: hm(10, 0),
    closeMinutes: hm(16, 45),
  },
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedWeekdayAndMinutes(
  date: Date,
  timeZone: string,
): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  let weekday = 1;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') {
      weekday = WEEKDAY_INDEX[part.value] ?? weekday;
    } else if (part.type === 'hour') {
      // Some engines emit "24" for midnight under hour12:false.
      hour = Number(part.value) % 24;
    } else if (part.type === 'minute') {
      minute = Number(part.value);
    }
  }

  return { weekday, minutes: hour * 60 + minute };
}

/**
 * Returns whether the venue for a given asset is in its regular continuous
 * trading session at `at`.
 *
 * - `CRYPTO` is always `OPEN` (24/7 markets).
 * - A known venue returns `OPEN`/`CLOSED` from its weekday and local time.
 * - An unknown venue returns `UNKNOWN` so callers can keep their previous
 *   behaviour for it.
 */
export function getMarketOpenState(
  exchange: string | null | undefined,
  kind: AssetKind | null | undefined,
  at: Date,
): MarketOpenState {
  if (kind === AssetKind.CRYPTO) {
    return 'OPEN';
  }

  const key = (exchange ?? '').trim().toUpperCase();
  const session = EXCHANGE_SESSIONS[key];
  if (!session) {
    return 'UNKNOWN';
  }

  const { weekday, minutes } = getZonedWeekdayAndMinutes(at, session.timeZone);
  if (weekday === 0 || weekday === 6) {
    return 'CLOSED';
  }

  return minutes >= session.openMinutes && minutes < session.closeMinutes
    ? 'OPEN'
    : 'CLOSED';
}

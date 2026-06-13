import type {
  BrokeragePositionResponse,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

/**
 * Pure helpers for merging `/assets/live-valuations` quotes into the
 * positions/holdings the user is currently looking at, and for recomputing
 * reporting-currency summary figures from the resulting deltas.
 *
 * These are intentionally side-effect free so they can be unit tested without
 * React Native or TanStack Query.
 */

/** Indexes quotes by assetId for O(1) lookups during a merge. */
function indexQuotes(
  quotes: readonly LiveAssetValuationResponse[],
): Map<string, LiveAssetValuationResponse> {
  return new Map(quotes.map((quote) => [quote.assetId, quote]));
}

/**
 * Updates each matched position's `currentPrice` and `currentValue` (asset
 * currency) from the live quotes. Positions without a matching quote, or
 * whose currency does not match the quote's currency, are returned
 * unchanged.
 */
export function mergePositionsWithLiveQuotes(
  positions: readonly BrokeragePositionResponse[],
  quotes: readonly LiveAssetValuationResponse[],
): BrokeragePositionResponse[] {
  if (quotes.length === 0) {
    return [...positions];
  }

  const byAsset = indexQuotes(quotes);

  return positions.map((position) => {
    const quote = byAsset.get(position.assetId);

    if (
      !quote ||
      quote.currency.toUpperCase() !== position.currency.toUpperCase()
    ) {
      return position;
    }

    const unrealisedGainLoss =
      position.costBasis !== null && position.costBasis !== undefined
        ? quote.value - position.costBasis
        : position.unrealisedGainLoss;

    return {
      ...position,
      currentPrice: quote.price,
      currentValue: quote.value,
      unrealisedGainLoss,
    };
  });
}

/**
 * Updates each matched dashboard asset's `currentValue` (and `lastPrice`
 * when the holding tracks a unit price) from the live quotes. Used by the
 * dashboard tab, which displays `DashboardAssetResponse` rows rather than
 * brokerage positions.
 */
export function mergeDashboardAssetsWithLiveQuotes(
  assets: readonly DashboardAssetResponse[],
  quotes: readonly LiveAssetValuationResponse[],
): DashboardAssetResponse[] {
  if (quotes.length === 0) {
    return [...assets];
  }

  const byAsset = indexQuotes(quotes);

  return assets.map((asset) => {
    const quote = byAsset.get(asset.id);

    if (
      !quote ||
      quote.currency.toUpperCase() !== asset.currency.toUpperCase()
    ) {
      return asset;
    }

    return {
      ...asset,
      currentValue: quote.value,
      lastPrice: asset.quantity !== null ? quote.price : asset.lastPrice,
    };
  });
}

export interface LiveSummaryDeltas {
  /** Sum of per-position deltas in reporting currency. */
  totalValueDelta: number;
  /** Number of positions whose delta contributed to the total. */
  matchedCount: number;
}

/**
 * Computes the aggregate reporting-currency delta between two live-valuation
 * snapshots, by assetId. A position only contributes when both snapshots
 * have a non-null `valueInReporting` for that asset; positions with an
 * unknown stale reporting value are skipped entirely (their movement cannot
 * be expressed in the reporting currency).
 */
export function computeLiveValueDelta(
  previousQuotes: readonly LiveAssetValuationResponse[] | null,
  currentQuotes: readonly LiveAssetValuationResponse[],
): LiveSummaryDeltas {
  if (!previousQuotes || previousQuotes.length === 0) {
    return { totalValueDelta: 0, matchedCount: 0 };
  }

  const previousByAsset = indexQuotes(previousQuotes);
  let totalValueDelta = 0;
  let matchedCount = 0;

  for (const current of currentQuotes) {
    if (current.valueInReporting === null) {
      continue;
    }

    const previous = previousByAsset.get(current.assetId);

    if (!previous || previous.valueInReporting === null) {
      continue;
    }

    totalValueDelta += current.valueInReporting - previous.valueInReporting;
    matchedCount += 1;
  }

  return { totalValueDelta, matchedCount };
}

export interface BrokerageSummaryFigures {
  totalValue: number;
  investedValue: number;
  unrealisedGainLoss: number;
}

/**
 * Applies a cumulative reporting-currency delta to the broker summary
 * figures shown in the header card. All three figures move by the same
 * delta: the live re-pricing affects the total, the invested value (which
 * tracks live position values), and the unrealised P/L equally.
 */
export function applyLiveDeltaToSummary(
  summary: BrokerageSummaryFigures,
  delta: number,
): BrokerageSummaryFigures {
  if (delta === 0) {
    return summary;
  }

  return {
    totalValue: summary.totalValue + delta,
    investedValue: summary.investedValue + delta,
    unrealisedGainLoss: summary.unrealisedGainLoss + delta,
  };
}

export interface ChangeRecompute {
  changeAbsolute: number;
  changePercent: number;
}

/**
 * Recomputes the header change badge from a fresher live total against the
 * performance series baseline. Returns null when the baseline is missing or
 * zero (a percentage cannot be expressed).
 */
export function recomputeChangeFromLiveTotal(
  liveTotal: number,
  baselineValue: number | null,
): ChangeRecompute | null {
  if (baselineValue === null || baselineValue === 0) {
    return null;
  }

  const changeAbsolute = liveTotal - baselineValue;
  const changePercent = (changeAbsolute / baselineValue) * 100;

  return { changeAbsolute, changePercent };
}

/**
 * Resolves the header total to display: the live-merged total when live data
 * is fresh, otherwise the performance series' latest value, otherwise the
 * workspace summary total.
 */
export function resolveHeaderTotal(options: {
  liveTotal: number | null;
  performanceLatestValue: number | null;
  workspaceTotalValue: number;
}): number {
  if (options.liveTotal !== null) {
    return options.liveTotal;
  }

  if (options.performanceLatestValue !== null) {
    return options.performanceLatestValue;
  }

  return options.workspaceTotalValue;
}

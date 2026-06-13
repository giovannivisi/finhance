import type {
  BrokeragePositionResponse,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

/**
 * Indexes live valuation quotes by asset id for quick lookup during merges.
 */
export function indexLiveQuotesByAssetId(
  quotes: LiveAssetValuationResponse[],
): Map<string, LiveAssetValuationResponse> {
  const byAssetId = new Map<string, LiveAssetValuationResponse>();
  for (const quote of quotes) {
    byAssetId.set(quote.assetId, quote);
  }
  return byAssetId;
}

/**
 * Merges live quotes into brokerage positions, replacing the unit price (in
 * the position's asset currency) and the current value and unrealised
 * profit/loss (both in the reporting currency) with the live figures for any
 * position with a matching quote. Positions without a matching quote, or
 * whose quote has no `valueInReporting`, are returned unchanged.
 */
export function mergeLivePositions(
  positions: BrokeragePositionResponse[],
  quotes: LiveAssetValuationResponse[],
): BrokeragePositionResponse[] {
  if (quotes.length === 0) {
    return positions;
  }

  const byAssetId = indexLiveQuotesByAssetId(quotes);

  return positions.map((position) => {
    const quote = byAssetId.get(position.assetId);
    if (!quote || quote.valueInReporting == null) {
      return position;
    }

    const currentValue = quote.valueInReporting;

    return {
      ...position,
      currentPrice: quote.price,
      currentValue,
      unrealisedGainLoss: currentValue - position.costBasis,
    };
  });
}

/**
 * Merges live quotes into dashboard asset rows, replacing the current value
 * (reporting currency) with the live reporting-currency valuation for any
 * asset with a matching quote and a known FX rate. Assets without a matching
 * quote, or whose quote has no `valueInReporting`, are returned unchanged.
 */
export function mergeLiveDashboardAssets(
  assets: DashboardAssetResponse[],
  quotes: LiveAssetValuationResponse[],
): DashboardAssetResponse[] {
  if (quotes.length === 0) {
    return assets;
  }

  const byAssetId = indexLiveQuotesByAssetId(quotes);

  return assets.map((asset) => {
    const quote = byAssetId.get(asset.id);
    if (!quote || quote.valueInReporting == null) {
      return asset;
    }

    return {
      ...asset,
      currentValue: quote.valueInReporting,
    };
  });
}

/**
 * Computes the total reporting-currency delta across all positions with a
 * matching live quote. A position contributes to the delta only when both
 * its stale reporting-currency value (`currentValue`) and the quote's
 * `valueInReporting` are known; positions with an unresolved FX rate on
 * either side are skipped so they neither inflate nor deflate the total.
 */
export function computeLiveValueDelta(
  positions: BrokeragePositionResponse[],
  quotes: LiveAssetValuationResponse[],
): number {
  if (quotes.length === 0) {
    return 0;
  }

  const byAssetId = indexLiveQuotesByAssetId(quotes);
  let delta = 0;

  for (const position of positions) {
    const quote = byAssetId.get(position.assetId);
    if (
      !quote ||
      quote.valueInReporting == null ||
      position.currentValue == null
    ) {
      continue;
    }

    delta += quote.valueInReporting - position.currentValue;
  }

  return delta;
}

export interface BrokerageSummaryFigures {
  totalValue: number;
  investedValue: number;
  unrealisedGainLoss: number;
}

/**
 * Applies a reporting-currency delta to the summary figures that move
 * together with live position values: total value, invested value, and
 * unrealised profit/loss all shift by the same amount as the underlying
 * position valuations change.
 */
export function applyLiveValueDelta<T extends BrokerageSummaryFigures>(
  summary: T,
  delta: number,
): T {
  if (delta === 0) {
    return summary;
  }

  return {
    ...summary,
    totalValue: summary.totalValue + delta,
    investedValue: summary.investedValue + delta,
    unrealisedGainLoss: summary.unrealisedGainLoss + delta,
  };
}

/**
 * Recomputes the performance change percentage against a baseline value
 * using a fresher (live-merged) portfolio total. Returns `null` when the
 * baseline is missing or zero, since a percentage change is undefined in
 * that case.
 */
export function computeLiveChangePercent(
  liveTotal: number,
  baselineValue: number | null,
): number | null {
  if (baselineValue == null || baselineValue === 0) {
    return null;
  }

  return ((liveTotal - baselineValue) / baselineValue) * 100;
}

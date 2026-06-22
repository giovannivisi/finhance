import type {
  BrokeragePositionResponse,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

interface LiveMergeOptions {
  asOf?: string | null;
  reportingCurrency?: string | null;
  hasFreshFx?: boolean;
}

function hasFreshReportingCurrencyQuote(
  assetCurrency: string,
  options: LiveMergeOptions,
): boolean {
  if (!options.reportingCurrency) {
    return true;
  }

  if (assetCurrency.toUpperCase() === options.reportingCurrency.toUpperCase()) {
    return true;
  }

  return options.hasFreshFx === true;
}

/**
 * Indexes live valuation quotes by asset id for quick lookup during merges.
 */
export function indexLiveQuotesByAssetId(
  quotes: readonly LiveAssetValuationResponse[],
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
  options: LiveMergeOptions = {},
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
    const clearsStale = hasFreshReportingCurrencyQuote(
      position.currency,
      options,
    );

    return {
      ...position,
      currentPrice: quote.price,
      currentValue,
      unrealisedGainLoss: currentValue - position.costBasis,
      valuationSource: clearsStale ? "LIVE" : position.valuationSource,
      valuationAsOf: clearsStale
        ? (options.asOf ?? position.valuationAsOf)
        : position.valuationAsOf,
      isStale: clearsStale ? false : position.isStale,
    };
  });
}

/**
 * Merges live quotes into dashboard asset rows, updating the displayed
 * current value (reporting currency, from `quote.valueInReporting`) and, for
 * assets that track a quantity, the latest unit price (asset currency, from
 * `quote.price`). Matching requires both the assetId and currency to agree
 * with the quote. A row is left entirely unchanged when there is no matching
 * quote, the currency differs, or the quote has no `valueInReporting` (a
 * half-updated row showing a fresh price against a stale value would be
 * misleading). This mirrors the mobile dashboard's
 * `mergeDashboardAssetsWithLiveQuotes` so the two platforms behave the same
 * way.
 */
export function mergeDashboardAssetsWithLiveQuotes(
  assets: readonly DashboardAssetResponse[],
  quotes: readonly LiveAssetValuationResponse[],
  options: LiveMergeOptions = {},
): DashboardAssetResponse[] {
  if (quotes.length === 0) {
    return [...assets];
  }

  const byAssetId = indexLiveQuotesByAssetId(quotes);

  return assets.map((asset) => {
    const quote = byAssetId.get(asset.id);

    if (
      !quote ||
      quote.currency.toUpperCase() !== asset.currency.toUpperCase() ||
      quote.valueInReporting == null
    ) {
      return asset;
    }

    const clearsStale = hasFreshReportingCurrencyQuote(asset.currency, options);

    return {
      ...asset,
      currentValue: quote.valueInReporting,
      lastPrice: asset.quantity !== null ? quote.price : asset.lastPrice,
      valuationSource: clearsStale ? "LIVE" : asset.valuationSource,
      valuationAsOf: clearsStale
        ? (options.asOf ?? asset.valuationAsOf)
        : asset.valuationAsOf,
      isStale: clearsStale ? false : asset.isStale,
    };
  });
}

/**
 * Computes the reporting-currency delta for each asset with a matching live
 * quote, against the server-provided baseline value (`currentValue ??
 * referenceValue`). Assets without a matching quote, or whose quote has no
 * `valueInReporting`, are omitted from the result so they neither inflate
 * nor deflate aggregates derived from it.
 *
 * Computing deltas against the props (the server's last snapshot) rather
 * than the previous tick keeps the merge idempotent: re-applying it to the
 * same baseline always yields the same aggregates, and a fresh
 * `router.refresh()` resets the baseline cleanly.
 */
export function computeDashboardLiveValueDeltas(
  assets: readonly DashboardAssetResponse[],
  quotes: readonly LiveAssetValuationResponse[],
): Map<string, number> {
  const deltas = new Map<string, number>();

  if (quotes.length === 0) {
    return deltas;
  }

  const byAssetId = indexLiveQuotesByAssetId(quotes);

  for (const asset of assets) {
    const quote = byAssetId.get(asset.id);
    if (!quote || quote.valueInReporting == null) {
      continue;
    }

    const baseline = asset.currentValue ?? asset.referenceValue ?? 0;
    deltas.set(asset.id, quote.valueInReporting - baseline);
  }

  return deltas;
}

/**
 * Applies per-asset reporting-currency deltas to the asset-kind subtotals
 * shown in the allocation overview. Each total moves by the sum of the
 * deltas for the ASSET-type assets that belong to that kind; kinds with no
 * matching deltas are returned unchanged (same array reference).
 */
export function applyLiveDeltasToKindTotals(
  kindTotalsArray: readonly { kind: string; total: number }[],
  assets: readonly DashboardAssetResponse[],
  deltas: ReadonlyMap<string, number>,
): { kind: string; total: number }[] {
  if (deltas.size === 0) {
    return [...kindTotalsArray];
  }

  return kindTotalsArray.map((kindTotal) => {
    let delta = 0;
    for (const asset of assets) {
      if (asset.type !== "ASSET" || (asset.kind ?? null) !== kindTotal.kind) {
        continue;
      }
      delta += deltas.get(asset.id) ?? 0;
    }

    return delta === 0
      ? kindTotal
      : { ...kindTotal, total: kindTotal.total + delta };
  });
}

export interface DashboardSummaryFigures {
  assets: number;
  liabilities: number;
  netWorth: number;
}

/**
 * Applies per-asset reporting-currency deltas to the headline summary
 * figures. Asset deltas move the assets total, liability deltas move the
 * liabilities total, and net worth shifts by their difference. Returns the
 * same object reference when there is nothing to apply.
 */
export function applyLiveDeltasToSummary<T extends DashboardSummaryFigures>(
  summary: T,
  assets: readonly DashboardAssetResponse[],
  deltas: ReadonlyMap<string, number>,
): T {
  if (deltas.size === 0) {
    return summary;
  }

  let assetsDelta = 0;
  let liabilitiesDelta = 0;

  for (const asset of assets) {
    const delta = deltas.get(asset.id);
    if (!delta) {
      continue;
    }

    if (asset.type === "ASSET") {
      assetsDelta += delta;
    } else {
      liabilitiesDelta += delta;
    }
  }

  if (assetsDelta === 0 && liabilitiesDelta === 0) {
    return summary;
  }

  return {
    ...summary,
    assets: summary.assets + assetsDelta,
    liabilities: summary.liabilities + liabilitiesDelta,
    netWorth: summary.netWorth + assetsDelta - liabilitiesDelta,
  };
}

/**
 * Sums the reporting-currency value of a group of assets (`currentValue ??
 * referenceValue`), adjusted by any matching live-value deltas. Used to
 * recompute the per-kind subtotals shown above each asset/liability block.
 *
 * Assets where both values are null (the server could not resolve a
 * reporting-currency valuation, e.g. an unknown FX rate) contribute nothing,
 * matching the server's summary figures and the per-row display. The raw
 * `balance` is deliberately not used as a fallback: it is in the asset's own
 * currency, so adding it to a reporting-currency total would mix currencies.
 */
export function sumDashboardValuesWithLiveDeltas(
  assets: readonly DashboardAssetResponse[],
  deltas: ReadonlyMap<string, number>,
): number {
  let total = 0;

  for (const asset of assets) {
    const baseline = asset.currentValue ?? asset.referenceValue ?? 0;
    total += baseline + (deltas.get(asset.id) ?? 0);
  }

  return total;
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

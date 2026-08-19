import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View } from "react-native";
import type {
  AggregatePricingStatus,
  AssetKind,
  BrokerageActivityItemResponse,
  BrokeragePerformanceRange,
  BrokeragePositionResponse,
  BrokerageWorkspaceResponse,
  LiveAssetValuationResponse,
  PortfolioAssetKindTargetInput,
  PortfolioAllocationSnapshotItemResponse,
  PortfolioSecurityTargetInput,
} from "@finhance/shared";

import {
  useBrokerageBuy,
  useBrokerageDividend,
  useBrokerageFee,
  useBrokeragePerformance,
  useBrokerageSell,
  useBrokerageWorkspace,
  useCategories,
  useDeleteBrokerageTrade,
  useLiveValuations,
  useRefreshAssets,
  useUpdateBrokerageTrade,
  useUpdatePortfolioAllocationTargets,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  Chip,
  ChipRow,
  DateField,
  describeError,
  Divider,
  ErrorState,
  ListRow,
  MoneyText,
  ProgressBar,
  Screen,
  Section,
  SegmentedControl,
  SelectField,
  Sheet,
  Skeleton,
  SkeletonCard,
  Stat,
  SwitchField,
  TextField,
} from "@/components/ui";
import { AllocationDonutChart, PerformanceChart } from "@/components/charts";
import {
  categoryLabel,
  isAssignableTransactionCategory,
} from "@/lib/categories";
import { localDateOf, todayLocalDate } from "@/lib/dates";
import { ASSET_KIND_LABELS } from "@/lib/labels";
import {
  applyLiveDeltaToSummary,
  computeLiveValueDelta,
  mergePositionsWithLiveQuotes,
  recomputeChangeFromLiveTotal,
  resolvePerformanceTotal,
} from "@/lib/live-merge";
import { parseAmountInput } from "@/lib/money";
import {
  createAutomaticPriceRefreshAttempt,
  getAutomaticPriceRefreshDelay,
  type AutomaticPriceRefreshAttempt,
} from "@/lib/price-refresh";
import { useIsScreenActive } from "@/lib/screen-active";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

const RANGE_OPTIONS: { value: BrokeragePerformanceRange; label: string }[] = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "1Y", label: "1Y" },
  { value: "MAX", label: "Max" },
];

function formatChangePercent(percent: number): string {
  return `${Math.abs(percent).toFixed(2)}%`;
}

function formatAllocationPercent(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function performancePricingNote(
  performance: BrokerageWorkspaceResponse["pricingStatus"] | null,
  hasPoints: boolean,
): string | null {
  if (!performance || performance.state === "FRESH") {
    return null;
  }

  if (performance.state === "PARTIAL" && !hasPoints) {
    return "Historical prices could not be loaded for this range. Check tickers or try refreshing later.";
  }

  if (performance.state === "STALE") {
    return "Some prices are stale; this chart may not reflect the latest market moves.";
  }

  return "Some prices are still updating; this chart may be partial.";
}

function getLiveAdjustedPricingStatus(input: {
  pricingStatus: AggregatePricingStatus;
  positions: readonly BrokeragePositionResponse[];
  quotes?: readonly LiveAssetValuationResponse[];
}): AggregatePricingStatus {
  if (
    !input.quotes ||
    input.quotes.length === 0 ||
    input.pricingStatus.state === "FRESH" ||
    input.pricingStatus.hasMissingFx ||
    input.pricingStatus.hasStaleFx
  ) {
    return input.pricingStatus;
  }

  const liveAssetIds = new Set(
    input.quotes
      .filter(
        (quote) => quote.valueInReporting != null && quote.isStale === false,
      )
      .map((quote) => quote.assetId),
  );
  const hasUncoveredStaleQuotes = input.positions.some(
    (position) =>
      position.isStale &&
      (position.valuationSource === "LAST_QUOTE" ||
        position.valuationSource === "AVG_COST") &&
      !liveAssetIds.has(position.assetId),
  );

  if (hasUncoveredStaleQuotes) {
    return input.pricingStatus;
  }

  return {
    state: "FRESH",
    refreshSuggested: false,
    hasStaleQuotes: false,
    hasStaleFx: false,
    hasMissingFx: false,
  };
}

type OperationKind = "BUY" | "SELL" | "DIVIDEND" | "FEE";
type TargetTab = "assetClasses" | "securities";

const TARGET_TAB_OPTIONS: { value: TargetTab; label: string }[] = [
  { value: "assetClasses", label: "Asset classes" },
  { value: "securities", label: "Positions" },
];

const SECURITY_KINDS: AssetKind[] = [
  "STOCK",
  "BOND",
  "CRYPTO",
  "COMMODITY",
  "OTHER",
];

interface AllocationTargetFormRow {
  key: string;
  label: string;
  kind: AssetKind;
  ticker: string | null;
  exchange: string | null;
  enabled: boolean;
  targetPercent: string;
}

function createTargetFormRows(
  rows: PortfolioAllocationSnapshotItemResponse[],
): AllocationTargetFormRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    kind: row.kind,
    ticker: row.ticker,
    exchange: row.exchange,
    enabled: row.targetPercent !== null,
    targetPercent: row.targetPercent === null ? "" : String(row.targetPercent),
  }));
}

function parseTargetPercent(value: string): number | null {
  const parsed = parseAmountInput(value);
  return parsed === null || parsed < 0 ? null : parsed;
}

function sumEnabledTargetRows(rows: AllocationTargetFormRow[]): number {
  return rows.reduce((sum, row) => {
    if (!row.enabled) {
      return sum;
    }

    return sum + (parseTargetPercent(row.targetPercent) ?? 0);
  }, 0);
}

function validateTargetRows(
  rows: AllocationTargetFormRow[],
  label: string,
): string | null {
  const enabledRows = rows.filter((row) => row.enabled);

  if (enabledRows.length === 0) {
    return null;
  }

  let total = 0;
  for (const row of enabledRows) {
    const targetPercent = parseTargetPercent(row.targetPercent);
    if (targetPercent === null) {
      return `${label}: enter a non-negative target for ${row.label}.`;
    }

    total += targetPercent;
  }

  if (Math.abs(total - 100) > 0.01) {
    return `${label}: enabled rows must total 100%. Current total is ${total.toFixed(2)}%.`;
  }

  return null;
}

function buildAssetKindTargets(
  rows: AllocationTargetFormRow[],
): PortfolioAssetKindTargetInput[] {
  return rows
    .filter((row) => row.enabled)
    .map((row) => ({
      kind: row.kind,
      targetPercent: parseTargetPercent(row.targetPercent) ?? 0,
    }));
}

function buildSecurityTargets(
  rows: AllocationTargetFormRow[],
): PortfolioSecurityTargetInput[] {
  return rows.flatMap((row) => {
    if (!row.enabled || !row.ticker) {
      return [];
    }

    return [
      {
        kind: row.kind,
        ticker: row.ticker,
        exchange: row.exchange,
        name: row.label,
        targetPercent: parseTargetPercent(row.targetPercent) ?? 0,
      },
    ];
  });
}

function PositionRow({
  position,
  showDivider,
}: {
  position: BrokeragePositionResponse;
  showDivider: boolean;
}) {
  const format = useFormatters();
  // The "(avg)" suffix makes clear this is the average buy-in, not the current
  // price: the row's value is current (quantity × current price), so an
  // unqualified "@ price" multiplies to the cost basis, not the value shown.
  const quantityLabel = `${position.quantity} @ ${format.money(
    position.averageCostPerUnit,
    position.currency,
  )} (avg)`;

  return (
    <ListRow
      showDivider={showDivider}
      title={
        position.ticker
          ? `${position.name} (${position.ticker})`
          : position.name
      }
      subtitle={quantityLabel}
      right={
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {position.currentValue !== null ? (
            <MoneyText
              amount={position.currentValue}
              currency={position.currency}
              variant="bodyMedium"
            />
          ) : (
            <AppText variant="bodyMedium" tone="tertiary">
              —
            </AppText>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {position.unrealisedGainLoss !== null ? (
              <MoneyText
                amount={position.unrealisedGainLoss}
                currency={position.currency}
                variant="caption"
                colorBySign
                signDisplay="exceptZero"
                maximumFractionDigits={0}
              />
            ) : null}
            {position.isStale ? (
              <AppText variant="caption" tone="warning">
                stale
              </AppText>
            ) : null}
          </View>
        </View>
      }
    />
  );
}

function AllocationTargetRow({
  row,
  currency,
  showDivider,
}: {
  row: PortfolioAllocationSnapshotItemResponse;
  currency: string;
  showDivider: boolean;
}) {
  const largeDelta =
    row.deltaPercent !== null && Math.abs(row.deltaPercent) > 5;
  const deltaTone =
    row.deltaPercent === null
      ? "secondary"
      : largeDelta
        ? "warning"
        : row.deltaPercent > 0
          ? "income"
          : row.deltaPercent < 0
            ? "expense"
            : "secondary";

  return (
    <View style={{ gap: spacing.sm }}>
      {showDivider ? <Divider /> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="footnoteMedium" numberOfLines={1}>
            {row.label}
          </AppText>
          {row.ticker ? (
            <AppText variant="caption" tone="tertiary" numberOfLines={1}>
              {row.exchange ? `${row.ticker} · ${row.exchange}` : row.ticker}
            </AppText>
          ) : null}
        </View>
        <MoneyText
          amount={row.currentValue}
          currency={currency}
          variant="footnoteMedium"
          tone="secondary"
          maximumFractionDigits={0}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: spacing.md,
        }}
      >
        <AppText variant="caption" tone="tertiary" tabular>
          Current {formatAllocationPercent(row.currentPercent)}
        </AppText>
        <AppText variant="caption" tone="tertiary" tabular>
          Target {formatAllocationPercent(row.targetPercent)}
        </AppText>
        <AppText variant="caption" tone={deltaTone} tabular>
          Delta {formatAllocationPercent(row.deltaPercent)}
        </AppText>
      </View>

      <ProgressBar
        ratio={row.currentPercent !== null ? row.currentPercent / 100 : null}
        tone={largeDelta ? "warning" : "accent"}
      />
    </View>
  );
}

function AllocationSnapshotGroup({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: PortfolioAllocationSnapshotItemResponse[];
  currency: string;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="kicker" tone="tertiary">
        {title}
      </AppText>
      <View style={{ gap: spacing.md }}>
        {rows.map((row, index) => (
          <AllocationTargetRow
            key={row.key}
            row={row}
            currency={currency}
            showDivider={index > 0}
          />
        ))}
      </View>
    </View>
  );
}

interface OperationFormState {
  assetId: string | null;
  newSecurity: boolean;
  name: string;
  kind: AssetKind;
  ticker: string;
  exchange: string;
  currency: string;
  quantity: string;
  unitPrice: string;
  fee: string;
  amount: string;
  categoryId: string | null;
  date: string;
  notes: string;
}

function emptyOperationForm(accountCurrency: string): OperationFormState {
  return {
    assetId: null,
    newSecurity: false,
    name: "",
    kind: "STOCK",
    ticker: "",
    exchange: "",
    currency: accountCurrency,
    quantity: "",
    unitPrice: "",
    fee: "",
    amount: "",
    categoryId: null,
    date: todayLocalDate(),
    notes: "",
  };
}

export default function BrokerageWorkspaceScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const params = useLocalSearchParams<{ accountId: string }>();
  const accountId = params.accountId;

  const workspaceQuery = useBrokerageWorkspace(accountId);
  const categoriesQuery = useCategories(false);
  const refreshAssets = useRefreshAssets();
  const refreshAssetsIsPending = refreshAssets.isPending;
  const refreshAssetsMutate = refreshAssets.mutate;

  const buyMutation = useBrokerageBuy(accountId);
  const sellMutation = useBrokerageSell(accountId);
  const dividendMutation = useBrokerageDividend(accountId);
  const feeMutation = useBrokerageFee(accountId);
  const updateTradeMutation = useUpdateBrokerageTrade(accountId);
  const deleteTradeMutation = useDeleteBrokerageTrade(accountId);
  const targetsMutation = useUpdatePortfolioAllocationTargets();

  const [operation, setOperation] = useState<OperationKind | null>(null);
  const [editingTrade, setEditingTrade] =
    useState<BrokerageActivityItemResponse | null>(null);
  const [confirmTradeDelete, setConfirmTradeDelete] = useState(false);
  const [form, setForm] = useState<OperationFormState>(() =>
    emptyOperationForm("EUR"),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [range, setRange] = useState<BrokeragePerformanceRange>("1D");
  const [targetSheetOpen, setTargetSheetOpen] = useState(false);
  const [targetTab, setTargetTab] = useState<TargetTab>("assetClasses");
  const [assetKindTargetRows, setAssetKindTargetRows] = useState<
    AllocationTargetFormRow[]
  >([]);
  const [securityTargetRows, setSecurityTargetRows] = useState<
    AllocationTargetFormRow[]
  >([]);
  const [targetError, setTargetError] = useState<string | null>(null);

  const isActive = useIsScreenActive();
  const performanceQuery = useBrokeragePerformance(accountId, range);
  const liveQuery = useLiveValuations(isActive);

  const previousQuotesRef = useRef<
    readonly LiveAssetValuationResponse[] | null
  >(null);
  const autoRefreshAttemptRef = useRef<AutomaticPriceRefreshAttempt | null>(
    null,
  );
  const [liveValueDelta, setLiveValueDelta] = useState(0);

  const liveQuotes = liveQuery.data?.quotes;
  const workspace: BrokerageWorkspaceResponse | undefined = workspaceQuery.data;
  const broker = workspace?.selectedBroker;
  const accountCurrency = broker?.account.currency ?? "EUR";
  const brokerageAssetIds = useMemo(
    () =>
      new Set(workspace?.positions.map((position) => position.assetId) ?? []),
    [workspace?.positions],
  );
  const brokerageAssetIdsRef = useRef<ReadonlySet<string>>(new Set());
  const previousPerformanceSignatureRef = useRef<string | null>(null);
  const previousPositionQuantitySignatureRef = useRef<string | null>(null);
  const quantityChangedSincePerformanceRef = useRef(false);
  brokerageAssetIdsRef.current = brokerageAssetIds;
  const positionQuantitySignature = useMemo(
    () =>
      (workspace?.positions ?? [])
        .map((position) => `${position.assetId}:${position.quantity}`)
        .sort()
        .join("|"),
    [workspace?.positions],
  );

  // Reset the accumulated delta when navigating to a different account.
  useEffect(() => {
    previousQuotesRef.current = null;
    previousPerformanceSignatureRef.current = null;
    previousPositionQuantitySignatureRef.current = null;
    quantityChangedSincePerformanceRef.current = false;
    setLiveValueDelta(0);
  }, [accountId]);

  // A workspace refresh can change a holding's quantity before the performance
  // query and live-valuations query finish refreshing. Start a new live
  // baseline in that case so the capital contribution is never treated as a
  // price movement, including with older API responses without quantities.
  useEffect(() => {
    const previousSignature = previousPositionQuantitySignatureRef.current;
    if (
      previousSignature !== null &&
      previousSignature !== positionQuantitySignature
    ) {
      previousQuotesRef.current = null;
      quantityChangedSincePerformanceRef.current = true;
      setLiveValueDelta(0);
    }

    previousPositionQuantitySignatureRef.current = positionQuantitySignature;
  }, [positionQuantitySignature]);

  useEffect(() => {
    if (!liveQuotes) {
      return;
    }

    const { totalValueDelta, matchedCount } = computeLiveValueDelta(
      previousQuotesRef.current,
      liveQuotes,
      brokerageAssetIdsRef.current,
    );

    if (matchedCount > 0) {
      setLiveValueDelta((current) => current + totalValueDelta);
    }

    previousQuotesRef.current = liveQuotes;
  }, [liveQuotes]);
  const displayPricingStatus = useMemo(
    () =>
      workspace
        ? getLiveAdjustedPricingStatus({
            pricingStatus: workspace.pricingStatus,
            positions: workspace.positions,
            quotes: liveQuotes,
          })
        : null,
    [liveQuotes, workspace],
  );

  useEffect(() => {
    const lastRefreshAt = workspace?.lastRefreshAt ?? null;
    const refreshSuggested = displayPricingStatus?.refreshSuggested;

    if (refreshSuggested !== true) {
      autoRefreshAttemptRef.current = null;
    }

    const retryDelay = getAutomaticPriceRefreshDelay({
      isActive,
      refreshSuggested,
      isRefreshing: refreshAssetsIsPending,
      lastRefreshAt,
      lastAttempt: autoRefreshAttemptRef.current,
      nowMs: Date.now(),
    });

    if (retryDelay !== 0) {
      return;
    }

    const startedLastRefreshAt = lastRefreshAt;
    autoRefreshAttemptRef.current = createAutomaticPriceRefreshAttempt({
      lastRefreshAt: startedLastRefreshAt,
      nowMs: Date.now(),
    });
    refreshAssetsMutate(undefined, {
      onSuccess: (result) => {
        autoRefreshAttemptRef.current = createAutomaticPriceRefreshAttempt({
          lastRefreshAt: startedLastRefreshAt,
          refreshedAt: result.refreshedAt,
          nowMs: Date.now(),
        });
      },
    });
  }, [
    isActive,
    refreshAssetsIsPending,
    refreshAssetsMutate,
    displayPricingStatus?.refreshSuggested,
    workspace?.lastRefreshAt,
  ]);

  const performance = performanceQuery.data;
  const performanceSignature = performance
    ? `${performance.asOf}:${performance.latestValue ?? ""}:${performance.baselineValue ?? ""}`
    : null;

  useEffect(() => {
    const previousSignature = previousPerformanceSignatureRef.current;
    if (previousSignature === null && performanceSignature !== null) {
      quantityChangedSincePerformanceRef.current = false;
    } else if (
      previousSignature !== null &&
      previousSignature !== performanceSignature
    ) {
      // The API response now includes the live total, so any accumulated
      // quote delta belongs to the superseded response and must be discarded.
      previousQuotesRef.current = quantityChangedSincePerformanceRef.current
        ? null
        : (liveQuotes ?? null);
      quantityChangedSincePerformanceRef.current = false;
      setLiveValueDelta(0);
    }

    previousPerformanceSignatureRef.current = performanceSignature;
  }, [liveQuotes, performanceSignature]);
  const priceRefreshMessage = refreshAssets.isError
    ? describeError(refreshAssets.error)
    : !refreshAssets.isPending
      ? (refreshAssets.data?.priceRefresh.message ?? null)
      : null;

  const headerTotal = resolvePerformanceTotal({
    performanceLatestValue: performance?.latestValue ?? null,
    investedValue: broker?.investedValue ?? null,
    liveValueDelta,
  });

  const headerChange =
    performance &&
    headerTotal !== null &&
    performance?.baselineValue !== null &&
    performance?.latestValue !== null &&
    performance?.changeAbsolute !== null
      ? recomputeChangeFromLiveTotal(
          headerTotal,
          performance.baselineValue,
          performance.latestValue,
          performance.changeAbsolute,
        )
      : performance &&
          performance.changeAbsolute !== null &&
          performance.changePercent !== null
        ? {
            changeAbsolute: performance.changeAbsolute,
            changePercent: performance.changePercent,
          }
        : null;

  const mergedPositions = useMemo(
    () =>
      workspace && liveQuotes
        ? mergePositionsWithLiveQuotes(workspace.positions, liveQuotes, {
            asOf: liveQuery.data?.asOf ?? null,
            reportingCurrency: workspace.reportingCurrency,
            hasFreshFx:
              !workspace.pricingStatus.hasMissingFx &&
              !workspace.pricingStatus.hasStaleFx,
          })
        : (workspace?.positions ?? []),
    [workspace, liveQuery.data?.asOf, liveQuotes],
  );

  const liveSummary =
    broker && liveValueDelta !== 0
      ? applyLiveDeltaToSummary(
          {
            totalValue: broker.totalValue,
            investedValue: broker.investedValue,
            unrealisedGainLoss: broker.unrealisedGainLoss,
          },
          liveValueDelta,
        )
      : null;

  // Subtle fade/translate animation whenever the header total ticks.
  const headerAnim = useRef(new Animated.Value(1)).current;
  const previousHeaderTotalRef = useRef<number | null>(null);

  useEffect(() => {
    if (headerTotal === null) {
      return;
    }

    if (
      previousHeaderTotalRef.current !== null &&
      previousHeaderTotalRef.current !== headerTotal
    ) {
      headerAnim.setValue(0.4);
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }

    previousHeaderTotalRef.current = headerTotal;
  }, [headerTotal, headerAnim]);

  const positionOptions = useMemo(
    () =>
      (workspace?.positions ?? [])
        .filter((position) => position.quantity > 0)
        .map((position) => ({
          value: position.assetId,
          label: position.ticker
            ? `${position.name} (${position.ticker})`
            : position.name,
          detail: `${position.quantity} held · ${position.currency}`,
        })),
    [workspace?.positions],
  );

  const incomeCategories = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) =>
          isAssignableTransactionCategory(category, "INCOME"),
        )
        .map((category) => ({
          value: category.id,
          label: categoryLabel(category),
        })),
    [categoriesQuery.data],
  );

  const expenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) =>
          isAssignableTransactionCategory(category, "EXPENSE"),
        )
        .map((category) => ({
          value: category.id,
          label: categoryLabel(category),
        })),
    [categoriesQuery.data],
  );

  const openOperation = (kind: OperationKind) => {
    setForm(emptyOperationForm(accountCurrency));
    setFormError(null);
    setEditingTrade(null);
    setOperation(kind);
  };

  const openTradeEditor = (item: BrokerageActivityItemResponse) => {
    if (
      (item.kind !== "BUY" && item.kind !== "SELL") ||
      !item.assetId ||
      item.quantity === null ||
      item.unitPrice === null
    ) {
      return;
    }

    setForm({
      ...emptyOperationForm(accountCurrency),
      assetId: item.assetId,
      name: item.assetName ?? "Position",
      currency: item.currency,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      fee: item.feeAmount === null ? "" : String(item.feeAmount),
      date: localDateOf(item.postedAt),
      notes: item.notes ?? "",
    });
    setFormError(null);
    setEditingTrade(item);
    setOperation(item.kind);
  };

  const openActivityEditor = (item: BrokerageActivityItemResponse) => {
    if (item.source === "TRANSACTION" && item.transactionId) {
      router.push({
        pathname: "/transactions/upsert",
        params: { id: item.transactionId },
      });
      return;
    }

    if (
      item.source === "BROKERAGE_OPERATION" &&
      (item.kind === "DIVIDEND" || item.kind === "FEE") &&
      item.transactionId
    ) {
      router.push({
        pathname: "/transactions/upsert",
        params: { id: item.transactionId },
      });
      return;
    }

    openTradeEditor(item);
  };

  const openTargetEditor = () => {
    setAssetKindTargetRows(createTargetFormRows(assetKindTargets));
    setSecurityTargetRows(createTargetFormRows(securityTargets));
    setTargetTab("assetClasses");
    setTargetError(null);
    setTargetSheetOpen(true);
  };

  const updateActiveTargetRow = (
    index: number,
    patch: Partial<AllocationTargetFormRow>,
  ) => {
    const updater =
      targetTab === "assetClasses"
        ? setAssetKindTargetRows
        : setSecurityTargetRows;

    updater((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const submitTargets = async () => {
    setTargetError(null);

    const assetKindError = validateTargetRows(
      assetKindTargetRows,
      "Asset classes",
    );
    if (assetKindError) {
      setTargetTab("assetClasses");
      setTargetError(assetKindError);
      return;
    }

    const securityError = validateTargetRows(securityTargetRows, "Positions");
    if (securityError) {
      setTargetTab("securities");
      setTargetError(securityError);
      return;
    }

    const enabledSecurityWithoutTicker = securityTargetRows.find(
      (row) => row.enabled && !row.ticker,
    );
    if (enabledSecurityWithoutTicker) {
      setTargetTab("securities");
      setTargetError(
        `Positions: ${enabledSecurityWithoutTicker.label} cannot be targeted without a ticker.`,
      );
      return;
    }

    try {
      await targetsMutation.mutateAsync({
        assetKindTargets: buildAssetKindTargets(assetKindTargetRows),
        securityTargets: buildSecurityTargets(securityTargetRows),
      });
      setTargetSheetOpen(false);
    } catch (error) {
      setTargetError(describeError(error));
    }
  };

  const operationPending =
    buyMutation.isPending ||
    sellMutation.isPending ||
    dividendMutation.isPending ||
    feeMutation.isPending ||
    updateTradeMutation.isPending ||
    deleteTradeMutation.isPending;

  const submitOperation = async () => {
    setFormError(null);

    try {
      if (editingTrade) {
        const quantity = parseAmountInput(form.quantity);
        const unitPrice = parseAmountInput(form.unitPrice);
        const fee = form.fee.trim() ? parseAmountInput(form.fee) : null;

        if (
          quantity === null ||
          quantity <= 0 ||
          unitPrice === null ||
          unitPrice <= 0
        ) {
          setFormError("Quantity and unit price must be positive.");
          return;
        }

        await updateTradeMutation.mutateAsync({
          operationId: editingTrade.id,
          body: {
            quantity,
            unitPrice,
            feeAmount: fee,
            postedAt: form.date,
            notes: form.notes.trim() || null,
          },
        });
        setEditingTrade(null);
        setOperation(null);
        return;
      }

      if (operation === "BUY") {
        const quantity = parseAmountInput(form.quantity);
        const unitPrice = parseAmountInput(form.unitPrice);
        const fee = form.fee.trim() ? parseAmountInput(form.fee) : null;

        if (!form.newSecurity && !form.assetId) {
          setFormError("Pick a position or switch to a new security.");
          return;
        }

        if (form.newSecurity && !form.name.trim()) {
          setFormError("Name the new security.");
          return;
        }

        if (
          quantity === null ||
          quantity <= 0 ||
          unitPrice === null ||
          unitPrice <= 0
        ) {
          setFormError("Quantity and unit price must be positive.");
          return;
        }

        await buyMutation.mutateAsync({
          assetId: form.newSecurity ? null : form.assetId,
          name: form.newSecurity ? form.name.trim() : null,
          kind: form.kind,
          ticker: form.newSecurity
            ? form.ticker.trim().toUpperCase() || null
            : null,
          exchange: form.newSecurity ? form.exchange.trim() || null : null,
          currency: form.currency.trim().toUpperCase(),
          quantity,
          unitPrice,
          feeAmount: fee,
          postedAt: form.date,
          notes: form.notes.trim() || null,
        });
      } else if (operation === "SELL") {
        const quantity = parseAmountInput(form.quantity);
        const unitPrice = parseAmountInput(form.unitPrice);
        const fee = form.fee.trim() ? parseAmountInput(form.fee) : null;

        if (!form.assetId) {
          setFormError("Pick the position to sell.");
          return;
        }

        if (
          quantity === null ||
          quantity <= 0 ||
          unitPrice === null ||
          unitPrice <= 0
        ) {
          setFormError("Quantity and unit price must be positive.");
          return;
        }

        await sellMutation.mutateAsync({
          assetId: form.assetId,
          quantity,
          unitPrice,
          feeAmount: fee,
          postedAt: form.date,
          notes: form.notes.trim() || null,
        });
      } else if (operation === "DIVIDEND" || operation === "FEE") {
        const amount = parseAmountInput(form.amount);

        if (amount === null || amount <= 0) {
          setFormError("Enter a positive amount.");
          return;
        }

        if (!form.categoryId) {
          setFormError("Pick a category.");
          return;
        }

        const body = {
          assetId: form.assetId,
          amount,
          postedAt: form.date,
          categoryId: form.categoryId,
          notes: form.notes.trim() || null,
        };

        if (operation === "DIVIDEND") {
          await dividendMutation.mutateAsync(body);
        } else {
          await feeMutation.mutateAsync(body);
        }
      }

      setOperation(null);
    } catch (error) {
      setFormError(describeError(error));
    }
  };

  const deleteTrade = async () => {
    if (!editingTrade) {
      return;
    }

    setFormError(null);
    try {
      await deleteTradeMutation.mutateAsync(editingTrade.id);
      setConfirmTradeDelete(false);
      setEditingTrade(null);
      setOperation(null);
    } catch (error) {
      setConfirmTradeDelete(false);
      setFormError(describeError(error));
    }
  };

  if (workspaceQuery.isPending) {
    return (
      <Screen title="Brokerage" showBack>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  if (workspaceQuery.isError || !workspace || !broker) {
    return (
      <Screen title="Brokerage" showBack>
        <ErrorState
          error={workspaceQuery.error}
          onRetry={() => workspaceQuery.refetch()}
        />
      </Screen>
    );
  }

  const assetKindTargets = workspace.allocation.assetKindTargets;
  const securityTargets = workspace.allocation.securityTargets;
  const activeTargetRows =
    targetTab === "assetClasses" ? assetKindTargetRows : securityTargetRows;
  const activeTargetTotal = sumEnabledTargetRows(activeTargetRows);
  const activeTargetEnabledCount = activeTargetRows.filter(
    (row) => row.enabled,
  ).length;
  const activeTargetTotalIsValid =
    activeTargetEnabledCount === 0 || Math.abs(activeTargetTotal - 100) <= 0.01;
  // Once any asset class has a target, classes turned OFF (no target) drop out
  // of the donut so it reflects the strategy rather than raw holdings. With no
  // targets at all the donut still shows the full current allocation.
  const anyAssetKindTarget = assetKindTargets.some(
    (target) => target.targetPercent !== null,
  );
  const allocationDistribution = assetKindTargets
    .filter(
      (target) =>
        target.currentValue > 0 &&
        (!anyAssetKindTarget || target.targetPercent !== null),
    )
    .map((target) => ({
      key: target.key,
      label: target.label,
      value: target.currentValue,
    }));
  const hasAllocationSnapshot =
    assetKindTargets.length > 0 || securityTargets.length > 0;
  const performanceNote = performancePricingNote(
    performance?.pricingStatus ?? null,
    (performance?.points.length ?? 0) > 0,
  );
  const operationTitle = editingTrade
    ? operation === "BUY"
      ? "Edit buy"
      : "Edit sell"
    : operation === "BUY"
      ? "Record buy"
      : operation === "SELL"
        ? "Record sell"
        : operation === "DIVIDEND"
          ? "Record dividend"
          : "Record fee";

  return (
    <Screen
      kicker="Brokerage"
      title={broker.account.name}
      showBack
      refreshing={workspaceQuery.isRefetching}
      onRefresh={() => workspaceQuery.refetch()}
    >
      <Card>
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <AppText variant="kicker" tone="tertiary">
                Invested value · {accountCurrency}
              </AppText>
            </View>
            <Animated.View style={{ opacity: headerAnim }}>
              <MoneyText
                amount={headerTotal ?? broker.investedValue}
                currency={accountCurrency}
                variant="display"
              />
            </Animated.View>
            {headerChange ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons
                  name={
                    headerChange.changeAbsolute >= 0 ? "caret-up" : "caret-down"
                  }
                  size={13}
                  color={
                    headerChange.changeAbsolute >= 0
                      ? colors.chartIncome
                      : colors.chartExpense
                  }
                />
                <MoneyText
                  amount={headerChange.changeAbsolute}
                  currency={accountCurrency}
                  variant="footnoteMedium"
                  colorBySign
                  signDisplay="exceptZero"
                  maximumFractionDigits={0}
                />
                <AppText
                  variant="footnoteMedium"
                  tone={headerChange.changeAbsolute >= 0 ? "income" : "expense"}
                >
                  ({formatChangePercent(headerChange.changePercent)})
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={{ gap: spacing.sm }}>
            <ChipRow
              options={RANGE_OPTIONS}
              value={range}
              onChange={setRange}
            />
            {performanceQuery.isPending ? (
              <Skeleton height={240} style={{ borderRadius: 16 }} />
            ) : performanceQuery.isError ? (
              <AppText variant="footnote" tone="secondary">
                Couldn&apos;t load the performance chart.
              </AppText>
            ) : (
              <PerformanceChart
                points={performance?.points ?? []}
                range={range}
                baselineValue={performance?.baselineValue ?? null}
                latestValue={headerTotal}
                currency={performance?.reportingCurrency ?? accountCurrency}
                emptyMessage={
                  performance?.pricingStatus.state === "PARTIAL"
                    ? "Historical performance is temporarily unavailable."
                    : undefined
                }
              />
            )}
            {performanceNote ? (
              <AppText variant="caption" tone="tertiary">
                {performanceNote}
              </AppText>
            ) : null}
          </View>

          <Divider />

          <View
            style={{ flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" }}
          >
            <Stat
              label="Invested"
              value={
                <MoneyText
                  amount={liveSummary?.investedValue ?? broker.investedValue}
                  currency={accountCurrency}
                  variant="title3"
                  maximumFractionDigits={0}
                  numberOfLines={1}
                />
              }
              style={{ flex: 1, minWidth: 90 }}
            />
            <Stat
              label="Cash"
              value={
                <MoneyText
                  amount={broker.cashAvailable}
                  currency={accountCurrency}
                  variant="title3"
                  maximumFractionDigits={0}
                  numberOfLines={1}
                />
              }
              style={{ flex: 1, minWidth: 90 }}
            />
            <Stat
              label="Unrealised"
              value={
                <MoneyText
                  amount={
                    liveSummary?.unrealisedGainLoss ?? broker.unrealisedGainLoss
                  }
                  currency={accountCurrency}
                  variant="title3"
                  colorBySign
                  signDisplay="exceptZero"
                  maximumFractionDigits={0}
                  numberOfLines={1}
                />
              }
              style={{ flex: 1, minWidth: 90 }}
            />
          </View>
          {(displayPricingStatus?.state ?? workspace.pricingStatus.state) !==
          "FRESH" ? (
            <Chip label="Some prices are stale" tone="warning" />
          ) : null}
          {priceRefreshMessage ? (
            <AppText
              variant="caption"
              tone={refreshAssets.isError ? "danger" : "warning"}
            >
              {priceRefreshMessage}
            </AppText>
          ) : null}
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <Button
          label="Buy"
          size="sm"
          onPress={() => openOperation("BUY")}
          style={{ flexGrow: 1, minWidth: "47%" }}
        />
        <Button
          label="Sell"
          size="sm"
          variant="secondary"
          onPress={() => openOperation("SELL")}
          style={{ flexGrow: 1, minWidth: "47%" }}
        />
        <Button
          label="Dividend"
          size="sm"
          variant="secondary"
          onPress={() => openOperation("DIVIDEND")}
          style={{ flexGrow: 1, minWidth: "47%" }}
        />
        <Button
          label="Fee"
          size="sm"
          variant="secondary"
          onPress={() => openOperation("FEE")}
          style={{ flexGrow: 1, minWidth: "47%" }}
        />
      </View>

      {workspace.cashReconciliation &&
      workspace.cashReconciliation.status === "MISMATCH" ? (
        <Card
          surface="warning"
          onPress={() =>
            router.push({
              pathname: "/accounts/[id]",
              params: { id: broker.account.id },
            })
          }
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <AppText variant="footnote" tone="warning" style={{ flex: 1 }}>
              Broker cash does not reconcile. Open the account to review.
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.warning} />
          </View>
        </Card>
      ) : null}

      <Section
        kicker="Holdings"
        title={`Positions (${mergedPositions.length})`}
      >
        {mergedPositions.length === 0 ? (
          <Card surface="muted">
            <AppText variant="footnote" tone="secondary">
              No positions yet. Record a buy to start the history.
            </AppText>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {mergedPositions.map((position, index) => (
              <PositionRow
                key={position.assetId}
                position={position}
                showDivider={index < mergedPositions.length - 1}
              />
            ))}
          </Card>
        )}
      </Section>

      {hasAllocationSnapshot ? (
        <Section
          kicker="Strategy"
          title="Portfolio allocation"
          description="Across all investable holdings, not just this broker."
          action={
            <Button
              label="Edit"
              size="sm"
              variant="secondary"
              onPress={openTargetEditor}
              icon={
                <Ionicons
                  name="options-outline"
                  size={16}
                  color={colors.textPrimary}
                />
              }
            />
          }
        >
          <Card>
            <View style={{ gap: spacing.lg }}>
              {allocationDistribution.length > 0 ? (
                <>
                  <AllocationDonutChart
                    data={allocationDistribution}
                    currency={workspace.reportingCurrency}
                    size={136}
                    totalLabel="Invested"
                  />
                  <Divider />
                </>
              ) : null}

              <AllocationSnapshotGroup
                title="Asset classes"
                rows={assetKindTargets}
                currency={workspace.reportingCurrency}
              />

              {securityTargets.length > 0 ? (
                <>
                  <Divider />
                  <AllocationSnapshotGroup
                    title="Positions"
                    rows={securityTargets}
                    currency={workspace.reportingCurrency}
                  />
                </>
              ) : null}
            </View>
          </Card>
        </Section>
      ) : null}

      <Section kicker="History" title="Activity">
        {workspace.activity.length === 0 ? (
          <Card surface="muted">
            <AppText variant="footnote" tone="secondary">
              Operations and cash movements appear here.
            </AppText>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" tone="secondary">
              Tap an item to edit or delete it.
            </AppText>
            <Card style={{ paddingVertical: 4 }}>
              {workspace.activity.slice(0, 25).map((item, index) => (
                <ListRow
                  key={`${item.source}-${item.id}`}
                  title={item.title}
                  subtitle={`${format.date(localDateOf(item.postedAt))}${
                    item.detail ? ` • ${item.detail}` : ""
                  }`}
                  showDivider={
                    index < Math.min(workspace.activity.length, 25) - 1
                  }
                  onPress={() => openActivityEditor(item)}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <MoneyText
                        amount={item.amount}
                        currency={item.currency}
                        variant="footnoteMedium"
                        colorBySign
                        signDisplay="exceptZero"
                      />
                      <Ionicons
                        name="create-outline"
                        size={14}
                        color={colors.textTertiary}
                      />
                    </View>
                  }
                />
              ))}
            </Card>
          </View>
        )}
      </Section>

      <Sheet
        visible={targetSheetOpen}
        onClose={() => setTargetSheetOpen(false)}
        title="Edit allocation targets"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <SegmentedControl
            options={TARGET_TAB_OPTIONS}
            value={targetTab}
            onChange={setTargetTab}
          />

          <Card surface={activeTargetTotalIsValid ? "muted" : "warning"}>
            <View style={{ gap: 4 }}>
              <AppText variant="footnoteMedium">
                Target total {activeTargetTotal.toFixed(2)}%
              </AppText>
              <AppText variant="caption" tone="secondary">
                Switch rows off to exclude them. Enabled rows must total 100%.
              </AppText>
            </View>
          </Card>

          {activeTargetRows.length === 0 ? (
            <Card surface="muted">
              <AppText variant="footnote" tone="secondary">
                No target rows available for this view yet.
              </AppText>
            </Card>
          ) : (
            <View style={{ gap: spacing.md }}>
              {activeTargetRows.map((row, index) => (
                <Card
                  key={row.key}
                  surface={row.enabled ? "default" : "muted"}
                  style={row.enabled ? null : { opacity: 0.72 }}
                >
                  <View style={{ gap: spacing.md }}>
                    <SwitchField
                      label={row.label}
                      description={
                        row.ticker
                          ? row.exchange
                            ? `${row.ticker} · ${row.exchange}`
                            : row.ticker
                          : row.enabled
                            ? "Included in target total"
                            : "Ignored in target total"
                      }
                      value={row.enabled}
                      onChange={(enabled) =>
                        updateActiveTargetRow(index, { enabled })
                      }
                    />
                    <TextField
                      label="Target percent"
                      value={row.targetPercent}
                      editable={row.enabled}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="0"
                      onChangeText={(targetPercent) =>
                        updateActiveTargetRow(index, { targetPercent })
                      }
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}

          {targetError ? (
            <Card surface="danger">
              <AppText variant="footnote" tone="danger">
                {targetError}
              </AppText>
            </Card>
          ) : null}

          <Button
            label="Save targets"
            onPress={submitTargets}
            loading={targetsMutation.isPending}
          />
        </View>
      </Sheet>

      <Sheet
        visible={operation !== null}
        onClose={() => setOperation(null)}
        title={operationTitle}
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          {operation === "BUY" ? (
            <>
              {editingTrade ? (
                <Card surface="muted">
                  <AppText variant="footnoteMedium">{form.name}</AppText>
                  <AppText variant="caption" tone="secondary">
                    The position stays the same when correcting a trade.
                  </AppText>
                </Card>
              ) : (
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Chip
                    label="Existing position"
                    selected={!form.newSecurity}
                    onPress={() =>
                      setForm((f) => ({ ...f, newSecurity: false }))
                    }
                  />
                  <Chip
                    label="New security"
                    selected={form.newSecurity}
                    onPress={() =>
                      setForm((f) => ({ ...f, newSecurity: true }))
                    }
                  />
                </View>
              )}
              {form.newSecurity && !editingTrade ? (
                <>
                  <TextField
                    label="Name"
                    value={form.name}
                    onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                    placeholder="e.g. Vanguard FTSE All-World"
                  />
                  <SelectField
                    label="Kind"
                    options={SECURITY_KINDS.map((kind) => ({
                      value: kind,
                      label: ASSET_KIND_LABELS[kind],
                    }))}
                    value={form.kind}
                    onChange={(kind) => setForm((f) => ({ ...f, kind }))}
                  />
                  <TextField
                    label="Ticker (optional)"
                    value={form.ticker}
                    onChangeText={(ticker) =>
                      setForm((f) => ({ ...f, ticker: ticker.toUpperCase() }))
                    }
                    autoCapitalize="characters"
                    placeholder="VWCE"
                  />
                  <TextField
                    label="Exchange (optional)"
                    value={form.exchange}
                    onChangeText={(exchange) =>
                      setForm((f) => ({ ...f, exchange }))
                    }
                    placeholder="MIL"
                  />
                  <TextField
                    label="Currency"
                    value={form.currency}
                    onChangeText={(currency) =>
                      setForm((f) => ({
                        ...f,
                        currency: currency.toUpperCase(),
                      }))
                    }
                    autoCapitalize="characters"
                  />
                </>
              ) : !editingTrade ? (
                <SelectField
                  label="Position"
                  options={positionOptions}
                  value={form.assetId}
                  onChange={(assetId) => setForm((f) => ({ ...f, assetId }))}
                />
              ) : null}
              <AmountField
                label="Quantity"
                value={form.quantity}
                onChangeText={(quantity) =>
                  setForm((f) => ({ ...f, quantity }))
                }
              />
              <AmountField
                label="Unit price"
                value={form.unitPrice}
                onChangeText={(unitPrice) =>
                  setForm((f) => ({ ...f, unitPrice }))
                }
                currency={form.currency}
              />
              <AmountField
                label="Fee (optional)"
                value={form.fee}
                onChangeText={(fee) => setForm((f) => ({ ...f, fee }))}
                currency={accountCurrency}
              />
            </>
          ) : null}

          {operation === "SELL" ? (
            <>
              {editingTrade ? (
                <Card surface="muted">
                  <AppText variant="footnoteMedium">{form.name}</AppText>
                  <AppText variant="caption" tone="secondary">
                    The position stays the same when correcting a trade.
                  </AppText>
                </Card>
              ) : (
                <SelectField
                  label="Position"
                  options={positionOptions}
                  value={form.assetId}
                  onChange={(assetId) => setForm((f) => ({ ...f, assetId }))}
                />
              )}
              <AmountField
                label="Quantity"
                value={form.quantity}
                onChangeText={(quantity) =>
                  setForm((f) => ({ ...f, quantity }))
                }
              />
              <AmountField
                label="Unit price"
                value={form.unitPrice}
                onChangeText={(unitPrice) =>
                  setForm((f) => ({ ...f, unitPrice }))
                }
                currency={form.currency}
              />
              <AmountField
                label="Fee (optional)"
                value={form.fee}
                onChangeText={(fee) => setForm((f) => ({ ...f, fee }))}
                currency={accountCurrency}
              />
            </>
          ) : null}

          {operation === "DIVIDEND" || operation === "FEE" ? (
            <>
              <AmountField
                label="Amount"
                value={form.amount}
                onChangeText={(amount) => setForm((f) => ({ ...f, amount }))}
                currency={accountCurrency}
              />
              <SelectField
                label="Category"
                options={
                  operation === "DIVIDEND"
                    ? incomeCategories
                    : expenseCategories
                }
                value={form.categoryId}
                onChange={(categoryId) =>
                  setForm((f) => ({ ...f, categoryId }))
                }
              />
              <SelectField
                label="Related position (optional)"
                options={[{ value: "NONE", label: "None" }, ...positionOptions]}
                value={form.assetId ?? "NONE"}
                onChange={(assetId) =>
                  setForm((f) => ({
                    ...f,
                    assetId: assetId === "NONE" ? null : assetId,
                  }))
                }
              />
            </>
          ) : null}

          <DateField
            label="Date"
            value={form.date}
            onChange={(date) => setForm((f) => ({ ...f, date }))}
          />
          <TextField
            label="Notes (optional)"
            value={form.notes}
            onChangeText={(notes) => setForm((f) => ({ ...f, notes }))}
          />

          {formError ? (
            <Card surface="danger">
              <AppText variant="footnote" tone="danger">
                {formError}
              </AppText>
            </Card>
          ) : null}

          <Button
            label={editingTrade ? "Save changes" : operationTitle}
            onPress={submitOperation}
            loading={operationPending}
          />
          {editingTrade ? (
            <Button
              label="Delete trade"
              variant="danger"
              onPress={() => setConfirmTradeDelete(true)}
              disabled={operationPending}
            />
          ) : null}
        </View>
      </Sheet>

      <Sheet
        visible={confirmTradeDelete}
        onClose={() => setConfirmTradeDelete(false)}
        title="Delete trade?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            This permanently removes the {editingTrade?.kind.toLowerCase()} and
            recalculates the position from its remaining trade history.
          </AppText>
          <Button
            label="Delete trade"
            variant="danger"
            onPress={deleteTrade}
            loading={deleteTradeMutation.isPending}
          />
          <Button
            label="Keep it"
            variant="secondary"
            onPress={() => setConfirmTradeDelete(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

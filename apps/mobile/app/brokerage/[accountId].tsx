import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View } from "react-native";
import type {
  AssetKind,
  BrokeragePerformanceRange,
  BrokeragePositionResponse,
  BrokerageWorkspaceResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

import {
  useBrokerageBuy,
  useBrokerageDividend,
  useBrokerageFee,
  useBrokeragePerformance,
  useBrokerageSell,
  useBrokerageWorkspace,
  useCategories,
  useLiveValuations,
  useRefreshAssets,
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
  SelectField,
  Sheet,
  Skeleton,
  SkeletonCard,
  Stat,
  TextField,
} from "@/components/ui";
import { LiveDot, PerformanceChart } from "@/components/charts";
import {
  categoryLabel,
  isAssignableTransactionCategory,
} from "@/lib/categories";
import { formatDateLabel, localDateOf, todayLocalDate } from "@/lib/dates";
import { ASSET_KIND_LABELS } from "@/lib/labels";
import {
  applyLiveDeltaToSummary,
  computeLiveValueDelta,
  mergePositionsWithLiveQuotes,
  recomputeChangeFromLiveTotal,
  resolveHeaderTotal,
} from "@/lib/live-merge";
import { formatMoney, parseAmountInput } from "@/lib/money";
import { shouldStartAutomaticPriceRefresh } from "@/lib/price-refresh";
import { useIsScreenActive } from "@/lib/screen-active";
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

type OperationKind = "BUY" | "SELL" | "DIVIDEND" | "FEE";

const SECURITY_KINDS: AssetKind[] = [
  "STOCK",
  "BOND",
  "CRYPTO",
  "COMMODITY",
  "OTHER",
];

function PositionRow({
  position,
  showDivider,
}: {
  position: BrokeragePositionResponse;
  showDivider: boolean;
}) {
  const quantityLabel = `${position.quantity} @ ${formatMoney(
    position.averageCostPerUnit,
    position.currency,
  )}`;

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
  const params = useLocalSearchParams<{ accountId: string }>();
  const accountId = params.accountId;

  const workspaceQuery = useBrokerageWorkspace(accountId);
  const categoriesQuery = useCategories(false);
  const refreshAssets = useRefreshAssets();

  const buyMutation = useBrokerageBuy(accountId);
  const sellMutation = useBrokerageSell(accountId);
  const dividendMutation = useBrokerageDividend(accountId);
  const feeMutation = useBrokerageFee(accountId);

  const [operation, setOperation] = useState<OperationKind | null>(null);
  const [form, setForm] = useState<OperationFormState>(() =>
    emptyOperationForm("EUR"),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [range, setRange] = useState<BrokeragePerformanceRange>("1D");

  const isActive = useIsScreenActive();
  const performanceQuery = useBrokeragePerformance(accountId, range, isActive);
  const liveQuery = useLiveValuations(isActive);

  const previousQuotesRef = useRef<
    readonly LiveAssetValuationResponse[] | null
  >(null);
  const autoRefreshStartedRef = useRef(false);
  const [liveValueDelta, setLiveValueDelta] = useState(0);

  const liveQuotes = liveQuery.data?.quotes;

  // Reset the accumulated delta when navigating to a different account.
  useEffect(() => {
    previousQuotesRef.current = null;
    setLiveValueDelta(0);
  }, [accountId]);

  useEffect(() => {
    if (!liveQuotes) {
      return;
    }

    const { totalValueDelta, matchedCount } = computeLiveValueDelta(
      previousQuotesRef.current,
      liveQuotes,
    );

    if (matchedCount > 0) {
      setLiveValueDelta((current) => current + totalValueDelta);
    }

    previousQuotesRef.current = liveQuotes;
  }, [liveQuotes]);

  const workspace: BrokerageWorkspaceResponse | undefined = workspaceQuery.data;
  const broker = workspace?.selectedBroker;
  const accountCurrency = broker?.account.currency ?? "EUR";

  useEffect(() => {
    if (
      !shouldStartAutomaticPriceRefresh({
        isActive,
        refreshSuggested: workspace?.pricingStatus.refreshSuggested,
        alreadyStarted: autoRefreshStartedRef.current,
      })
    ) {
      return;
    }

    autoRefreshStartedRef.current = true;
    refreshAssets.mutate();
  }, [isActive, refreshAssets, workspace?.pricingStatus.refreshSuggested]);

  const performance = performanceQuery.data;

  const liveTotal =
    broker && liveValueDelta !== 0 ? broker.totalValue + liveValueDelta : null;

  const headerTotal = broker
    ? resolveHeaderTotal({
        liveTotal,
        performanceLatestValue: performance?.latestValue ?? null,
        workspaceTotalValue: broker.totalValue,
      })
    : null;

  const headerChange =
    liveTotal !== null
      ? recomputeChangeFromLiveTotal(
          liveTotal,
          performance?.baselineValue ?? null,
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
        ? mergePositionsWithLiveQuotes(workspace.positions, liveQuotes)
        : (workspace?.positions ?? []),
    [workspace, liveQuotes],
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
    setOperation(kind);
  };

  const operationPending =
    buyMutation.isPending ||
    sellMutation.isPending ||
    dividendMutation.isPending ||
    feeMutation.isPending;

  const submitOperation = async () => {
    setFormError(null);

    try {
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

  const kindTargets = workspace.allocation.assetKindTargets;
  const operationTitle =
    operation === "BUY"
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
                Total value · {accountCurrency}
              </AppText>
              {isActive && liveQuery.isFetching ? <LiveDot /> : null}
            </View>
            <Animated.View style={{ opacity: headerAnim }}>
              <MoneyText
                amount={headerTotal ?? broker.totalValue}
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
                latestValue={performance?.latestValue ?? null}
                currency={performance?.reportingCurrency ?? accountCurrency}
              />
            )}
            {performance &&
            (performance.pricingStatus.state === "PARTIAL" ||
              performance.pricingStatus.state === "STALE") ? (
              <AppText variant="caption" tone="tertiary">
                {performance.pricingStatus.state === "STALE"
                  ? "Some prices are stale; this chart may not reflect the latest market moves."
                  : "Some prices are still updating; this chart may be partial."}
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
          {workspace.pricingStatus.state !== "FRESH" ? (
            <Chip label="Some prices are stale" tone="warning" />
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

      {kindTargets.length > 0 ? (
        <Section kicker="Strategy" title="Allocation">
          <Card>
            <View style={{ gap: spacing.lg }}>
              {kindTargets.map((target, index) => (
                <View key={target.key} style={{ gap: spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <AppText variant="footnoteMedium">{target.label}</AppText>
                    <AppText variant="footnote" tone="secondary" tabular>
                      {target.currentPercent !== null
                        ? `${target.currentPercent.toFixed(1)}%`
                        : "—"}
                      {target.targetPercent !== null
                        ? ` / ${target.targetPercent.toFixed(0)}%`
                        : ""}
                    </AppText>
                  </View>
                  <ProgressBar
                    ratio={
                      target.currentPercent !== null
                        ? target.currentPercent / 100
                        : null
                    }
                    tone={
                      target.deltaPercent !== null &&
                      Math.abs(target.deltaPercent) > 5
                        ? "warning"
                        : "accent"
                    }
                  />
                </View>
              ))}
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
          <Card style={{ paddingVertical: 4 }}>
            {workspace.activity.slice(0, 25).map((item, index) => (
              <ListRow
                key={`${item.source}-${item.id}`}
                title={item.title}
                subtitle={`${formatDateLabel(localDateOf(item.postedAt))}${
                  item.detail ? ` • ${item.detail}` : ""
                }`}
                showDivider={
                  index < Math.min(workspace.activity.length, 25) - 1
                }
                right={
                  <MoneyText
                    amount={item.amount}
                    currency={item.currency}
                    variant="footnoteMedium"
                    colorBySign
                    signDisplay="exceptZero"
                  />
                }
              />
            ))}
          </Card>
        )}
      </Section>

      <Sheet
        visible={operation !== null}
        onClose={() => setOperation(null)}
        title={operationTitle}
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          {operation === "BUY" ? (
            <>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip
                  label="Existing position"
                  selected={!form.newSecurity}
                  onPress={() => setForm((f) => ({ ...f, newSecurity: false }))}
                />
                <Chip
                  label="New security"
                  selected={form.newSecurity}
                  onPress={() => setForm((f) => ({ ...f, newSecurity: true }))}
                />
              </View>
              {form.newSecurity ? (
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

          {operation === "SELL" ? (
            <>
              <SelectField
                label="Position"
                options={positionOptions}
                value={form.assetId}
                onChange={(assetId) => setForm((f) => ({ ...f, assetId }))}
              />
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
            label={operationTitle}
            onPress={submitOperation}
            loading={operationPending}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

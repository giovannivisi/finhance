import { Ionicons } from "@expo/vector-icons";
import { Redirect, usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type {
  AggregatePricingStatus,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";

import {
  useDashboard,
  useLiveValuations,
  useRefreshAssets,
} from "@/api/queries";
import { AllocationDonutChart } from "@/components/charts";
import {
  AppText,
  Card,
  Chip,
  describeError,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  MoneyText,
  ProgressBar,
  Screen,
  Section,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import {
  deriveDashboardHoldings,
  holdingValue,
} from "@/features/dashboard/derive";
import { localDateOf } from "@/lib/dates";
import {
  computeLiveValueDelta,
  mergeDashboardAssetsWithLiveQuotes,
} from "@/lib/live-merge";
import {
  createAutomaticPriceRefreshAttempt,
  formatPriceRefreshStatusText,
  getAutomaticPriceRefreshDelay,
  type AutomaticPriceRefreshAttempt,
} from "@/lib/price-refresh";
import { LAUNCH_TAB_HREFS } from "@/lib/preferences";
import { useIsScreenActive } from "@/lib/screen-active";
import { useAppPreferences, useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

let launchRedirectConsumed = false;

function PricingStatusChip({
  state,
}: {
  state: "FRESH" | "STALE" | "PARTIAL";
}) {
  if (state === "FRESH") {
    return <Chip label="Prices fresh" tone="success" />;
  }

  if (state === "PARTIAL") {
    return <Chip label="Prices partial" tone="warning" />;
  }

  return <Chip label="Prices stale" tone="warning" />;
}

function getLiveAdjustedPricingStatus(input: {
  pricingStatus: AggregatePricingStatus;
  assets: readonly DashboardAssetResponse[];
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
  const hasUncoveredStaleQuotes = input.assets.some(
    (asset) =>
      asset.isStale &&
      (asset.valuationSource === "LAST_QUOTE" ||
        asset.valuationSource === "AVG_COST") &&
      !liveAssetIds.has(asset.id),
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

function HoldingRow({
  asset,
  reportingCurrency,
  onPress,
  showDivider,
}: {
  asset: DashboardAssetResponse;
  reportingCurrency: string;
  onPress: () => void;
  showDivider: boolean;
}) {
  const { hideMoney } = useTheme();
  const format = useFormatters();
  const value = holdingValue(asset);
  const isLiability = asset.type === "LIABILITY";
  const nativeDiffers =
    asset.currency.toUpperCase() !== reportingCurrency.toUpperCase();

  const subtitleParts: string[] = [];

  if (asset.accountName) {
    subtitleParts.push(asset.accountName);
  }

  if (asset.ticker) {
    subtitleParts.push(asset.ticker);
  }

  if (nativeDiffers) {
    subtitleParts.push(
      format.money(asset.balance, asset.currency, { hide: hideMoney }),
    );
  }

  return (
    <ListRow
      title={asset.name}
      subtitle={subtitleParts.join(" • ") || null}
      onPress={onPress}
      showDivider={showDivider}
      right={
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {value === null ? (
            <AppText variant="bodyMedium" tone="tertiary">
              —
            </AppText>
          ) : (
            <MoneyText
              amount={isLiability ? -value : value}
              currency={reportingCurrency}
              variant="bodyMedium"
              tone={isLiability ? "expense" : "primary"}
            />
          )}
          {asset.isStale ? (
            <AppText variant="caption" tone="warning">
              stale
            </AppText>
          ) : null}
        </View>
      }
    />
  );
}

export default function HomeRoute() {
  const pathname = usePathname();
  const { launchTab } = useAppPreferences();

  if (!launchRedirectConsumed && pathname === "/" && launchTab !== "home") {
    launchRedirectConsumed = true;
    return <Redirect href={LAUNCH_TAB_HREFS[launchTab] as Href} />;
  }

  return <DashboardScreen />;
}

function DashboardScreen() {
  const router = useRouter();
  const { colors, hideMoney, setHideMoney } = useTheme();
  const format = useFormatters();
  const dashboardQuery = useDashboard();
  const refreshAssets = useRefreshAssets();
  const refreshAssetsIsPending = refreshAssets.isPending;
  const refreshAssetsMutate = refreshAssets.mutate;

  const isActive = useIsScreenActive();
  const liveQuery = useLiveValuations(isActive);

  const previousQuotesRef = useRef<
    readonly LiveAssetValuationResponse[] | null
  >(null);
  const autoRefreshAttemptRef = useRef<AutomaticPriceRefreshAttempt | null>(
    null,
  );
  const [liveValueDelta, setLiveValueDelta] = useState(0);

  const liveQuotes = liveQuery.data?.quotes;

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

  const data = dashboardQuery.data;
  const displayPricingStatus = useMemo(
    () =>
      data
        ? getLiveAdjustedPricingStatus({
            pricingStatus: data.dashboard.pricingStatus,
            assets: data.dashboard.assets,
            quotes: liveQuotes,
          })
        : null,
    [data, liveQuotes],
  );

  useEffect(() => {
    const lastRefreshAt = data?.dashboard.lastRefreshAt ?? null;
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
    data?.dashboard.lastRefreshAt,
    displayPricingStatus?.refreshSuggested,
    isActive,
    refreshAssetsIsPending,
    refreshAssetsMutate,
  ]);

  const mergedAssets = useMemo(
    () =>
      data && liveQuotes
        ? mergeDashboardAssetsWithLiveQuotes(
            data.dashboard.assets,
            liveQuotes,
            {
              asOf: liveQuery.data?.asOf ?? null,
              reportingCurrency: data.dashboard.reportingCurrency,
              hasFreshFx:
                !data.dashboard.pricingStatus.hasMissingFx &&
                !data.dashboard.pricingStatus.hasStaleFx,
            },
          )
        : (data?.dashboard.assets ?? []),
    [data, liveQuery.data?.asOf, liveQuotes],
  );

  const holdings = useMemo(
    () =>
      data
        ? deriveDashboardHoldings(mergedAssets, data.dashboard.assetKindOrder)
        : null,
    [data, mergedAssets],
  );

  const headerRight = (
    <>
      <IconButton
        accessibilityLabel={hideMoney ? "Show amounts" : "Hide amounts"}
        icon={
          <Ionicons
            name={hideMoney ? "eye-off-outline" : "eye-outline"}
            size={18}
            color={colors.textPrimary}
          />
        }
        onPress={() => setHideMoney(!hideMoney)}
      />
      <IconButton
        accessibilityLabel="Add holding"
        icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
        onPress={() => router.push("/holdings/upsert")}
      />
    </>
  );

  if (dashboardQuery.isPending) {
    return (
      <Screen
        kicker="Overview"
        title="Dashboard"
        headerRight={headerRight}
        withTabBarClearance
      >
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  if (dashboardQuery.isError || !data || !holdings) {
    return (
      <Screen
        kicker="Overview"
        title="Dashboard"
        headerRight={headerRight}
        withTabBarClearance
      >
        <ErrorState
          error={dashboardQuery.error}
          onRetry={() => dashboardQuery.refetch()}
        />
      </Screen>
    );
  }

  const { dashboard, budgetView, setup } = data;
  const reportingCurrency = dashboard.reportingCurrency;
  const incompleteSetup = setup && !setup.isComplete ? setup : null;
  const nextStep = incompleteSetup?.requiredSteps.find(
    (step) => step.status === "INCOMPLETE",
  );

  const liveNetWorth = dashboard.summary.netWorth + liveValueDelta;
  const liveAssets = dashboard.summary.assets + liveValueDelta;
  const refreshStatusText = formatPriceRefreshStatusText({
    isRefreshing: refreshAssets.isPending,
    hasLiveQuotes: Boolean(liveQuotes && liveQuotes.length > 0),
    lastRefreshAt: dashboard.lastRefreshAt,
  });
  const priceRefreshMessage = refreshAssets.isError
    ? describeError(refreshAssets.error)
    : !refreshAssets.isPending
      ? (refreshAssets.data?.priceRefresh.message ?? null)
      : null;
  const assetDistribution = holdings.assetGroups
    .filter((group) => group.total !== null && group.total > 0)
    .map((group) => ({
      key: group.key,
      label: group.label,
      value: group.total ?? 0,
    }));

  return (
    <Screen
      kicker="Overview"
      title="Dashboard"
      headerRight={headerRight}
      withTabBarClearance
      refreshing={dashboardQuery.isRefetching}
      onRefresh={() => dashboardQuery.refetch()}
    >
      <Card>
        <View style={{ gap: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: spacing.md,
            }}
          >
            <View style={{ gap: 4, flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AppText variant="kicker" tone="tertiary">
                  Net worth · {reportingCurrency}
                </AppText>
              </View>
              <MoneyText
                amount={liveNetWorth}
                currency={reportingCurrency}
                variant="display"
              />
            </View>
            <IconButton
              accessibilityLabel="Refresh prices"
              disabled={refreshAssets.isPending}
              icon={
                <Ionicons
                  name="refresh"
                  size={18}
                  color={
                    refreshAssets.isPending
                      ? colors.textTertiary
                      : colors.textPrimary
                  }
                />
              }
              onPress={() => {
                refreshAssets.reset();
                refreshAssets.mutate();
              }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: spacing.xl }}>
            <Stat
              label="Assets"
              value={
                <MoneyText
                  amount={liveAssets}
                  currency={reportingCurrency}
                  variant="title3"
                />
              }
              style={{ flex: 1 }}
            />
            <Stat
              label="Liabilities"
              value={
                <MoneyText
                  amount={-dashboard.summary.liabilities}
                  currency={reportingCurrency}
                  variant="title3"
                  tone={
                    dashboard.summary.liabilities > 0 ? "expense" : "primary"
                  }
                />
              }
              style={{ flex: 1 }}
            />
          </View>

          <Divider />

          {assetDistribution.length > 0 ? (
            <>
              <View style={{ gap: spacing.md }}>
                <AppText variant="kicker" tone="tertiary">
                  Assets distribution
                </AppText>
                <AllocationDonutChart
                  data={assetDistribution}
                  currency={reportingCurrency}
                  size={136}
                  totalLabel="Assets"
                />
              </View>

              <Divider />
            </>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <PricingStatusChip
              state={
                displayPricingStatus?.state ?? dashboard.pricingStatus.state
              }
            />
            {refreshStatusText ? (
              <AppText variant="caption" tone="tertiary">
                {refreshStatusText}
              </AppText>
            ) : null}
          </View>

          {priceRefreshMessage ? (
            <AppText
              variant="caption"
              tone={refreshAssets.isError ? "danger" : "warning"}
            >
              {priceRefreshMessage}
            </AppText>
          ) : null}

          {dashboard.latestSnapshotDate ? (
            <AppText variant="caption" tone="tertiary">
              Last snapshot {localDateOf(dashboard.latestSnapshotDate)}
              {dashboard.latestSnapshotIsPartial ? " (partial)" : ""}
            </AppText>
          ) : null}
        </View>
      </Card>

      {incompleteSetup ? (
        <Card surface="info" onPress={() => router.push("/settings/setup")}>
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <AppText variant="kicker" tone="info">
                Setup · {incompleteSetup.requiredCompletedCount}/
                {incompleteSetup.requiredTotalCount} complete
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </View>
            <ProgressBar
              ratio={
                incompleteSetup.requiredTotalCount > 0
                  ? incompleteSetup.requiredCompletedCount /
                    incompleteSetup.requiredTotalCount
                  : 0
              }
              tone="neutral"
            />
            {nextStep ? (
              <AppText variant="footnote" tone="secondary">
                Next: {nextStep.title}
              </AppText>
            ) : null}
          </View>
        </Card>
      ) : null}

      {budgetView && budgetView.currencies.length > 0 ? (
        <Section
          kicker={`Budgets · ${budgetView.month}`}
          title="This month"
          action={
            <IconButton
              accessibilityLabel="Open budgets"
              icon={
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={colors.textPrimary}
                />
              }
              onPress={() => router.push("/budgets")}
            />
          }
        >
          <Card>
            <View style={{ gap: spacing.lg }}>
              {budgetView.currencies.map((currency, index) => {
                const ratio =
                  currency.budgetTotal > 0
                    ? currency.spentTotal / currency.budgetTotal
                    : null;
                return (
                  <View key={currency.currency} style={{ gap: spacing.sm }}>
                    {index > 0 ? <Divider /> : null}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <AppText variant="footnoteMedium" tone="secondary">
                        {currency.currency}
                      </AppText>
                      {currency.overBudgetCount > 0 ? (
                        <Chip
                          label={`${currency.overBudgetCount} over budget`}
                          tone="danger"
                        />
                      ) : (
                        <Chip label="On track" tone="success" />
                      )}
                    </View>
                    <ProgressBar
                      ratio={ratio}
                      tone={
                        ratio !== null && ratio > 1
                          ? "danger"
                          : ratio !== null && ratio > 0.9
                            ? "warning"
                            : "accent"
                      }
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <AppText variant="caption" tone="tertiary">
                        Spent{" "}
                        {format.money(currency.spentTotal, currency.currency, {
                          hide: hideMoney,
                          maximumFractionDigits: 0,
                        })}
                      </AppText>
                      <AppText variant="caption" tone="tertiary">
                        of{" "}
                        {format.money(currency.budgetTotal, currency.currency, {
                          hide: hideMoney,
                          maximumFractionDigits: 0,
                        })}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </Section>
      ) : null}

      {holdings.assetGroups.length === 0 &&
      holdings.liabilityGroups.length === 0 ? (
        <Section kicker="Holdings" title="Assets & liabilities">
          <Card surface="muted">
            <View style={{ gap: spacing.sm, alignItems: "center" }}>
              <AppText variant="title3">Nothing tracked yet</AppText>
              <AppText
                variant="footnote"
                tone="secondary"
                style={{ textAlign: "center" }}
              >
                Add your first asset or liability to see net worth here.
              </AppText>
            </View>
          </Card>
        </Section>
      ) : null}

      {holdings.assetGroups.map((group) => (
        <Section
          key={group.key}
          kicker="Assets"
          title={group.label}
          action={
            group.total !== null ? (
              <MoneyText
                amount={group.total}
                currency={reportingCurrency}
                variant="title3"
                tone="secondary"
              />
            ) : undefined
          }
        >
          <Card style={{ paddingVertical: 4 }}>
            {group.items.map((asset, index) => (
              <HoldingRow
                key={asset.id}
                asset={asset}
                reportingCurrency={reportingCurrency}
                showDivider={index < group.items.length - 1}
                onPress={() => {
                  if (asset.accountType === "BROKER" && asset.accountId) {
                    router.push({
                      pathname: "/brokerage/[accountId]",
                      params: { accountId: asset.accountId },
                    });
                  } else {
                    router.push({
                      pathname: "/holdings/upsert",
                      params: { id: asset.id },
                    });
                  }
                }}
              />
            ))}
          </Card>
        </Section>
      ))}

      {holdings.liabilityGroups.map((group) => (
        <Section
          key={group.key}
          kicker="Liabilities"
          title={group.label}
          action={
            group.total !== null ? (
              <MoneyText
                amount={-group.total}
                currency={reportingCurrency}
                variant="title3"
                tone="expense"
              />
            ) : undefined
          }
        >
          <Card style={{ paddingVertical: 4 }}>
            {group.items.map((asset, index) => (
              <HoldingRow
                key={asset.id}
                asset={asset}
                reportingCurrency={reportingCurrency}
                showDivider={index < group.items.length - 1}
                onPress={() =>
                  router.push({
                    pathname: "/holdings/upsert",
                    params: { id: asset.id },
                  })
                }
              />
            ))}
          </Card>
        </Section>
      ))}
    </Screen>
  );
}

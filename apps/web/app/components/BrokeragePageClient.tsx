"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import Modal from "@components/Modal";
import MoneyValue from "@components/MoneyValue";
import OverflowMenu from "@components/OverflowMenu";
import SearchablePicker from "@components/SearchablePicker";
import { useAppPreferences } from "@components/ThemeProvider";
import { apiMutation } from "@lib/api";
import { getExchangeSuffixesForKind } from "@lib/asset-ui";
import { getCurrencyPickerOptions } from "@lib/currency-ui";
import {
  getDashboardRefreshNotice,
  requestDashboardRefresh,
} from "@lib/dashboard-refresh";
import { formatSensitiveNumber } from "@lib/money";
import type {
  AssetKind,
  BrokerageActivityItemResponse,
  BrokeragePositionResponse,
  BrokerageWorkspaceResponse,
  CategoryResponse,
  PortfolioAllocationSnapshotItemResponse,
} from "@finhance/shared";

type OperationModalKind =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "FEE"
  | "TARGETS"
  | null;
type TargetTab = "assetClasses" | "securities";
type BrokerageActivitySourceFilter =
  | "ALL"
  | "BROKERAGE_OPERATION"
  | "TRANSACTION";
type BrokerageActivityFilters = {
  month: string;
  kind: string;
  source: BrokerageActivitySourceFilter;
};

type BuyFormState = {
  assetId: string;
  name: string;
  kind: "STOCK" | "BOND" | "CRYPTO";
  ticker: string;
  exchange: string;
  currency: string;
  quantity: string;
  unitPrice: string;
  feeAmount: string;
  postedAt: string;
  notes: string;
};

type SellFormState = {
  assetId: string;
  quantity: string;
  unitPrice: string;
  feeAmount: string;
  postedAt: string;
  notes: string;
};

type CashFormState = {
  assetId: string;
  amount: string;
  categoryId: string;
  postedAt: string;
  notes: string;
};

type EditableTargetRow = {
  key: string;
  label: string;
  kind: AssetKind;
  ticker: string | null;
  exchange: string | null;
  enabled: boolean;
  targetPercent: string;
};

const BROKERAGE_ACTIVITY_DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  dateStyle: "short",
  timeStyle: "medium",
});

const BROKERAGE_ACTIVITY_MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  month: "long",
  year: "numeric",
});

const BROKERAGE_ACTIVITY_MONTH_KEY_FORMATTER = new Intl.DateTimeFormat(
  "en-CA",
  {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  },
);

function createCurrentDateTimeValue() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function createEmptyBuyForm(
  workspace: BrokerageWorkspaceResponse,
): BuyFormState {
  return {
    assetId: "",
    name: "",
    kind: "STOCK",
    ticker: "",
    exchange: "",
    currency: workspace.selectedBroker.account.currency,
    quantity: "",
    unitPrice: "",
    feeAmount: "",
    postedAt: createCurrentDateTimeValue(),
    notes: "",
  };
}

function createEmptySellForm(
  positions: BrokeragePositionResponse[],
): SellFormState {
  return {
    assetId: positions[0]?.assetId ?? "",
    quantity: "",
    unitPrice: "",
    feeAmount: "",
    postedAt: createCurrentDateTimeValue(),
    notes: "",
  };
}

function createEmptyCashForm(): CashFormState {
  return {
    assetId: "",
    amount: "",
    categoryId: "",
    postedAt: createCurrentDateTimeValue(),
    notes: "",
  };
}

function createTargetRows(
  rows: PortfolioAllocationSnapshotItemResponse[],
): EditableTargetRow[] {
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    kind: row.kind,
    ticker: row.ticker,
    exchange: row.exchange,
    enabled: row.targetPercent != null,
    targetPercent:
      row.targetPercent == null
        ? ""
        : String(Number(row.targetPercent.toFixed(4))),
  }));
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return `${value.toFixed(1)}%`;
}

function getTargetTotal(rows: EditableTargetRow[]): number {
  return rows.reduce((sum, row) => {
    if (!row.enabled) {
      return sum;
    }

    return sum + (parseNumber(row.targetPercent) ?? 0);
  }, 0);
}

function getBrokerageActivityMonthKey(postedAt: string): string {
  return BROKERAGE_ACTIVITY_MONTH_KEY_FORMATTER.format(new Date(postedAt));
}

function buildBrokerageActivityGroups(items: BrokerageActivityItemResponse[]) {
  const groups = new Map<
    string,
    { label: string; items: BrokerageActivityItemResponse[] }
  >();

  for (const item of items) {
    const postedAt = new Date(item.postedAt);
    const groupKey = getBrokerageActivityMonthKey(item.postedAt);
    const existing = groups.get(groupKey);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(groupKey, {
      label: BROKERAGE_ACTIVITY_MONTH_FORMATTER.format(postedAt),
      items: [item],
    });
  }

  return Array.from(groups.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      items: value.items,
    }))
    .sort((left, right) => right.key.localeCompare(left.key));
}

export default function BrokeragePageClient({
  workspace,
  categories,
}: {
  workspace: BrokerageWorkspaceResponse;
  categories: CategoryResponse[];
}) {
  const router = useRouter();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;
  const autoRefreshStartedRef = useRef(false);
  const [openModal, setOpenModal] = useState<OperationModalKind>(null);
  const [targetTab, setTargetTab] = useState<TargetTab>("assetClasses");
  const [buyForm, setBuyForm] = useState<BuyFormState>(() =>
    createEmptyBuyForm(workspace),
  );
  const [sellForm, setSellForm] = useState<SellFormState>(() =>
    createEmptySellForm(workspace.positions),
  );
  const [dividendForm, setDividendForm] = useState<CashFormState>(() =>
    createEmptyCashForm(),
  );
  const [feeForm, setFeeForm] = useState<CashFormState>(() =>
    createEmptyCashForm(),
  );
  const [assetKindTargets, setAssetKindTargets] = useState<EditableTargetRow[]>(
    () => createTargetRows(workspace.allocation.assetKindTargets),
  );
  const [securityTargets, setSecurityTargets] = useState<EditableTargetRow[]>(
    () => createTargetRows(workspace.allocation.securityTargets),
  );
  const [showTargetHelp, setShowTargetHelp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activityFilters, setActivityFilters] =
    useState<BrokerageActivityFilters>({
      month: "",
      kind: "",
      source: "ALL",
    });
  const [openActivityMonthKey, setOpenActivityMonthKey] = useState<
    string | null
  >(null);

  const dividendCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.archivedAt === null &&
          category.type === "INCOME" &&
          category.parentCategoryId === null,
      ),
    [categories],
  );
  const feeCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.archivedAt === null &&
          category.type === "EXPENSE" &&
          category.parentCategoryId !== null,
      ),
    [categories],
  );
  const selectedSellPosition = useMemo(
    () =>
      workspace.positions.find(
        (position) => position.assetId === sellForm.assetId,
      ) ?? null,
    [sellForm.assetId, workspace.positions],
  );
  const buyGross = useMemo(() => {
    const quantity = parseNumber(buyForm.quantity);
    const unitPrice = parseNumber(buyForm.unitPrice);
    return quantity != null && unitPrice != null ? quantity * unitPrice : null;
  }, [buyForm.quantity, buyForm.unitPrice]);
  const buyFee = parseNumber(buyForm.feeAmount) ?? 0;
  const buyCashUsed = buyGross == null ? null : buyGross + buyFee;
  const buyExchangeOptions = getExchangeSuffixesForKind(buyForm.kind);
  const currencyOptions = getCurrencyPickerOptions();
  const sellGross = useMemo(() => {
    const quantity = parseNumber(sellForm.quantity);
    const unitPrice = parseNumber(sellForm.unitPrice);
    return quantity != null && unitPrice != null ? quantity * unitPrice : null;
  }, [sellForm.quantity, sellForm.unitPrice]);
  const sellFee = parseNumber(sellForm.feeAmount) ?? 0;
  const sellNetCash = sellGross == null ? null : sellGross - sellFee;
  const brokerageAccountId = workspace.selectedBroker.account.id;
  const activeTargetRows =
    targetTab === "assetClasses" ? assetKindTargets : securityTargets;
  const activeTargetTotal = getTargetTotal(activeTargetRows);
  const allActivityGroups = useMemo(
    () => buildBrokerageActivityGroups(workspace.activity),
    [workspace.activity],
  );
  const filteredActivity = useMemo(() => {
    return workspace.activity.filter((item) => {
      if (activityFilters.month) {
        const itemMonth = getBrokerageActivityMonthKey(item.postedAt);
        if (itemMonth !== activityFilters.month) {
          return false;
        }
      }

      if (activityFilters.kind && item.kind !== activityFilters.kind) {
        return false;
      }

      if (
        activityFilters.source !== "ALL" &&
        item.source !== activityFilters.source
      ) {
        return false;
      }

      return true;
    });
  }, [activityFilters, workspace.activity]);
  const groupedActivity = useMemo(
    () => buildBrokerageActivityGroups(filteredActivity),
    [filteredActivity],
  );
  const availableActivityKinds = useMemo(
    () =>
      Array.from(new Set(workspace.activity.map((item) => item.kind))).sort(),
    [workspace.activity],
  );
  const activityFilterCount = [
    Boolean(activityFilters.month),
    Boolean(activityFilters.kind),
    activityFilters.source !== "ALL",
  ].filter(Boolean).length;
  const hasCashMismatch =
    workspace.cashReconciliation != null &&
    workspace.cashReconciliation.status !== "CLEAN";
  const cashReconciliationStatusClass =
    workspace.cashReconciliation == null
      ? "status-chip is-neutral"
      : workspace.cashReconciliation.status === "CLEAN"
        ? "status-chip is-success"
        : workspace.cashReconciliation.status === "MISMATCH"
          ? "status-chip is-warning"
          : "status-chip is-danger";
  const unrealisedGainLossTone =
    workspace.selectedBroker.unrealisedGainLoss > 0
      ? "brokerage-value-positive"
      : workspace.selectedBroker.unrealisedGainLoss < 0
        ? "brokerage-value-negative"
        : undefined;
  const unrealisedGainLossColor =
    workspace.selectedBroker.unrealisedGainLoss > 0
      ? "var(--color-income)"
      : workspace.selectedBroker.unrealisedGainLoss < 0
        ? "var(--color-expense)"
        : undefined;
  const pricingStatusMessage =
    workspace.pricingStatus.state === "PARTIAL"
      ? "Latest stored prices are shown."
      : workspace.pricingStatus.state === "STALE"
        ? "Latest stored prices are shown while brokerage data refreshes in the background."
        : "Price snapshot is current.";
  const runAutoRefresh = useEffectEvent(() => {
    void handleRefreshPrices();
  });

  useEffect(() => {
    setBuyForm((current) => {
      const nextExchange =
        current.kind === "CRYPTO"
          ? "_CRYPTO_"
          : current.exchange === "_CRYPTO_"
            ? ""
            : current.exchange;

      if (nextExchange === current.exchange) {
        return current;
      }

      return {
        ...current,
        exchange: nextExchange,
      };
    });
  }, [buyForm.kind]);

  useEffect(() => {
    for (const broker of workspace.brokers) {
      if (broker.account.id === brokerageAccountId) {
        continue;
      }

      router.prefetch(`/brokerage/${broker.account.id}`);
    }
  }, [brokerageAccountId, router, workspace.brokers]);

  useEffect(() => {
    setOpenActivityMonthKey(groupedActivity[0]?.key ?? null);
  }, [groupedActivity]);

  useEffect(() => {
    if (
      !isHydrated ||
      autoRefreshStartedRef.current ||
      !workspace.pricingStatus.refreshSuggested
    ) {
      return;
    }

    autoRefreshStartedRef.current = true;
    runAutoRefresh();
  }, [isHydrated, workspace.pricingStatus.refreshSuggested]);

  async function handleRefreshPrices() {
    setRefreshError(null);
    setRefreshNotice(null);
    setIsRefreshingPrices(true);

    try {
      const result = await requestDashboardRefresh();

      if (!result.ok) {
        const notice = getDashboardRefreshNotice(result.status, result.error);
        if (notice) {
          setRefreshNotice(notice);
          return;
        }

        setRefreshError(result.error);
        return;
      }

      router.refresh();
    } finally {
      setIsRefreshingPrices(false);
    }
  }

  function resetOperationState(nextModal: OperationModalKind) {
    setFormError(null);
    if (nextModal === "BUY") {
      setBuyForm(createEmptyBuyForm(workspace));
    }
    if (nextModal === "SELL") {
      setSellForm(createEmptySellForm(workspace.positions));
    }
    if (nextModal === "DIVIDEND") {
      setDividendForm(createEmptyCashForm());
    }
    if (nextModal === "FEE") {
      setFeeForm(createEmptyCashForm());
    }
    if (nextModal === "TARGETS") {
      setAssetKindTargets(
        createTargetRows(workspace.allocation.assetKindTargets),
      );
      setSecurityTargets(
        createTargetRows(workspace.allocation.securityTargets),
      );
      setTargetTab("assetClasses");
      setShowTargetHelp(false);
    }
    setOpenModal(nextModal);
  }

  function clearActivityFilters() {
    setActivityFilters({
      month: "",
      kind: "",
      source: "ALL",
    });
  }

  async function handleBuySubmit() {
    const quantity = parseNumber(buyForm.quantity);
    const unitPrice = parseNumber(buyForm.unitPrice);
    const feeAmount = parseNumber(buyForm.feeAmount);

    if (quantity == null || quantity <= 0) {
      setFormError("Please enter a positive quantity.");
      return;
    }

    if (unitPrice == null || unitPrice <= 0) {
      setFormError("Please enter a positive unit price.");
      return;
    }

    if (!buyForm.assetId && (!buyForm.name.trim() || !buyForm.ticker.trim())) {
      setFormError("New holdings require a name and ticker.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiMutation(`/brokerage/${brokerageAccountId}/buy`, {
        method: "POST",
        body: JSON.stringify({
          assetId: buyForm.assetId || null,
          name: buyForm.assetId ? null : buyForm.name,
          kind: buyForm.kind,
          ticker: buyForm.assetId ? null : buyForm.ticker,
          exchange: buyForm.assetId ? null : buyForm.exchange || null,
          currency: buyForm.currency,
          quantity,
          unitPrice,
          feeAmount: feeAmount == null ? null : feeAmount,
          postedAt: new Date(buyForm.postedAt).toISOString(),
          notes: buyForm.notes || null,
        }),
      });
      setOpenModal(null);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to record this buy.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSellSubmit() {
    const quantity = parseNumber(sellForm.quantity);
    const unitPrice = parseNumber(sellForm.unitPrice);
    const feeAmount = parseNumber(sellForm.feeAmount);

    if (!sellForm.assetId) {
      setFormError("Please choose a holding to sell.");
      return;
    }

    if (quantity == null || quantity <= 0) {
      setFormError("Please enter a positive quantity.");
      return;
    }

    if (unitPrice == null || unitPrice <= 0) {
      setFormError("Please enter a positive unit price.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiMutation(`/brokerage/${brokerageAccountId}/sell`, {
        method: "POST",
        body: JSON.stringify({
          assetId: sellForm.assetId,
          quantity,
          unitPrice,
          feeAmount: feeAmount == null ? null : feeAmount,
          postedAt: new Date(sellForm.postedAt).toISOString(),
          notes: sellForm.notes || null,
        }),
      });
      setOpenModal(null);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to record this sale.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCashOperationSubmit(kind: "DIVIDEND" | "FEE") {
    const form = kind === "DIVIDEND" ? dividendForm : feeForm;
    const amount = parseNumber(form.amount);

    if (amount == null || amount <= 0) {
      setFormError("Please enter a positive amount.");
      return;
    }

    if (!form.categoryId) {
      setFormError("Please choose a category.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiMutation(
        `/brokerage/${brokerageAccountId}/${kind.toLowerCase()}`,
        {
          method: "POST",
          body: JSON.stringify({
            assetId: form.assetId || null,
            amount,
            categoryId: form.categoryId,
            postedAt: new Date(form.postedAt).toISOString(),
            notes: form.notes || null,
          }),
        },
      );
      setOpenModal(null);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : `Unable to record this ${kind.toLowerCase()}.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTargetsSubmit() {
    const assetKindPayload = assetKindTargets
      .filter((row) => row.enabled && (parseNumber(row.targetPercent) ?? 0) > 0)
      .map((row) => ({
        kind: row.kind,
        targetPercent: parseNumber(row.targetPercent) ?? 0,
      }));
    const securityPayload = securityTargets
      .filter((row) => row.enabled && (parseNumber(row.targetPercent) ?? 0) > 0)
      .map((row) => ({
        kind: row.kind,
        ticker: row.ticker ?? "",
        exchange: row.exchange,
        name: row.label,
        targetPercent: parseNumber(row.targetPercent) ?? 0,
      }));

    const assetKindTotal = assetKindPayload.reduce(
      (sum, row) => sum + row.targetPercent,
      0,
    );
    const securityTotal = securityPayload.reduce(
      (sum, row) => sum + row.targetPercent,
      0,
    );

    if (assetKindPayload.length > 0 && Math.abs(assetKindTotal - 100) > 0.001) {
      setFormError("Asset-class targets must sum to 100%.");
      return;
    }

    if (securityPayload.length > 0 && Math.abs(securityTotal - 100) > 0.001) {
      setFormError("Security targets must sum to 100%.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await apiMutation("/brokerage/targets", {
        method: "PUT",
        body: JSON.stringify({
          assetKindTargets: assetKindPayload,
          securityTargets: securityPayload,
        }),
      });
      setOpenModal(null);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to save targets.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-hero page-section--allow-overflow brokerage-hero">
          <div className="page-hero-copy">
            <p className="page-kicker">Investing</p>
            <h2 className="page-title is-compact">Brokerage</h2>
            <p className="page-description">
              Cash, positions, trades, and allocation targets in one workspace.
            </p>
          </div>

          <div className="brokerage-hero-toolbar">
            {workspace.brokers.length > 1 ? (
              <label className="brokerage-account-switcher">
                <span className="detail-metric-label">Broker account</span>
                <select
                  className="brokerage-account-select"
                  value={brokerageAccountId}
                  onChange={(event) =>
                    router.push(`/brokerage/${event.target.value}`)
                  }
                >
                  {workspace.brokers.map((broker) => (
                    <option key={broker.account.id} value={broker.account.id}>
                      {broker.account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="brokerage-account-switcher brokerage-account-chip">
                <span className="detail-metric-label">Broker account</span>
                <p className="brokerage-account-chip-value">
                  {workspace.selectedBroker.account.name}
                </p>
              </div>
            )}

            <div className="brokerage-hero-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => resetOperationState("BUY")}
              >
                Buy
              </button>

              <OverflowMenu
                label="Operations"
                panelClassName="brokerage-operations-panel"
                renderTrigger={({ triggerProps, setTriggerNode }) => (
                  <div className="brokerage-operations-menu">
                    <button
                      {...triggerProps}
                      ref={setTriggerNode}
                      className="btn-secondary brokerage-operations-trigger"
                    >
                      <MoreHorizontal size={16} aria-hidden="true" />
                      <span>Operations</span>
                    </button>
                  </div>
                )}
              >
                {({ closeMenu }) => (
                  <>
                    <button
                      type="button"
                      className="overflow-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        resetOperationState("SELL");
                      }}
                      disabled={workspace.positions.length === 0}
                    >
                      Sell
                    </button>
                    <button
                      type="button"
                      className="overflow-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        resetOperationState("DIVIDEND");
                      }}
                    >
                      Dividend
                    </button>
                    <button
                      type="button"
                      className="overflow-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        resetOperationState("FEE");
                      }}
                    >
                      Fee
                    </button>
                    <Link
                      href={`/transactions?accountId=${encodeURIComponent(brokerageAccountId)}`}
                      className="overflow-menu-item"
                      role="menuitem"
                      onClick={() => closeMenu()}
                    >
                      Cash activity
                    </Link>
                  </>
                )}
              </OverflowMenu>
            </div>
          </div>
        </div>

        <section className="page-section brokerage-section-card brokerage-workspace-card">
          <div className="brokerage-workspace-block">
            <div className="brokerage-summary-head">
              <div>
                <h3 className="brokerage-summary-title">
                  {workspace.selectedBroker.account.name}
                </h3>
                {workspace.selectedBroker.account.institution ? (
                  <p className="brokerage-summary-subtitle">
                    {workspace.selectedBroker.account.institution}
                  </p>
                ) : null}
                {workspace.pricingStatus.state !== "FRESH" ||
                isRefreshingPrices ||
                refreshNotice ||
                refreshError ? (
                  <p className="brokerage-summary-subtitle">
                    {isRefreshingPrices
                      ? "Refreshing latest prices..."
                      : refreshError
                        ? refreshError
                        : refreshNotice
                          ? refreshNotice
                          : pricingStatusMessage}
                  </p>
                ) : null}
              </div>
              <div className="brokerage-summary-total">
                <p className="detail-metric-label">Total value</p>
                <p className="brokerage-summary-total-value">
                  <MoneyValue
                    value={workspace.selectedBroker.totalValue}
                    currency={workspace.reportingCurrency}
                  />
                </p>
              </div>
            </div>

            <div className="metric-strip is-relaxed brokerage-summary-metrics">
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Cash available</p>
                <p className="detail-metric-value">
                  <MoneyValue
                    value={workspace.selectedBroker.cashAvailable}
                    currency={workspace.reportingCurrency}
                  />
                </p>
              </div>
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Invested</p>
                <p className="detail-metric-value">
                  <MoneyValue
                    value={workspace.selectedBroker.investedValue}
                    currency={workspace.reportingCurrency}
                  />
                </p>
              </div>
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Unrealised P/L</p>
                <p
                  className={`detail-metric-value${
                    unrealisedGainLossTone ? ` ${unrealisedGainLossTone}` : ""
                  }`}
                  style={
                    unrealisedGainLossColor
                      ? { color: unrealisedGainLossColor }
                      : undefined
                  }
                >
                  <MoneyValue
                    value={workspace.selectedBroker.unrealisedGainLoss}
                    currency={workspace.reportingCurrency}
                    className={unrealisedGainLossTone}
                    style={
                      unrealisedGainLossColor
                        ? { color: unrealisedGainLossColor }
                        : undefined
                    }
                  />
                </p>
              </div>
            </div>
          </div>

          <div className="brokerage-workspace-divider" />

          <div className="brokerage-workspace-block">
            <div className="compact-toolbar">
              <div>
                <h3 className="page-section-title">Positions</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Weighted-average cost, current valuation, and account-level
                  contribution.
                </p>
              </div>
            </div>

            {hasCashMismatch ? (
              <div className="page-inline-notice surface-warning brokerage-reconciliation-alert">
                <div>
                  <p className="font-medium">
                    Cash reconciliation needs attention before you can trust
                    this brokerage balance.
                  </p>
                  <p className="mt-1 text-sm">
                    Resolve the mismatch from Accounts, where you can review the
                    delta and create an adjustment when it is safe.
                  </p>
                </div>
                <div className="brokerage-reconciliation-alert-actions">
                  <Link href="/accounts" className="btn-secondary">
                    Open Accounts
                  </Link>
                </div>
              </div>
            ) : null}

            {workspace.positions.length === 0 ? (
              <div className="page-inline-notice surface-dashed">
                No active positions yet.
              </div>
            ) : (
              <div className="list-stack">
                {workspace.positions.map((position) => {
                  const gainLossTone =
                    position.unrealisedGainLoss == null
                      ? "neutral"
                      : position.unrealisedGainLoss > 0
                        ? "positive"
                        : position.unrealisedGainLoss < 0
                          ? "negative"
                          : "neutral";

                  return (
                    <article
                      key={position.assetId}
                      className="list-card brokerage-position-card"
                    >
                      <div className="brokerage-position-head">
                        <div className="brokerage-position-copy">
                          <div className="brokerage-position-title-row">
                            <h4 className="brokerage-position-title">
                              {position.name}
                            </h4>
                            {position.ticker ? (
                              <span className="status-chip is-info brokerage-position-ticker">
                                {position.ticker}
                                {position.exchange ?? ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {formatSensitiveNumber(
                              position.quantity,
                              shouldHideMoney,
                            )}{" "}
                            shares · Avg cost{" "}
                            {shouldHideMoney
                              ? "••••"
                              : `${position.averageCostPerUnit.toFixed(2)} ${position.currency}`}
                          </p>
                        </div>
                        <div className="brokerage-position-value">
                          <p className="brokerage-position-value-amount">
                            <MoneyValue
                              value={position.currentValue}
                              currency={workspace.reportingCurrency}
                            />
                          </p>
                          <p
                            className={`brokerage-position-value-sub is-${gainLossTone}`}
                          >
                            P/L{" "}
                            <MoneyValue
                              value={position.unrealisedGainLoss}
                              currency={workspace.reportingCurrency}
                              className={`brokerage-position-money is-${gainLossTone}`}
                            />
                          </p>
                        </div>
                      </div>

                      <div className="metric-strip is-relaxed brokerage-position-metrics">
                        <div className="detail-panel is-roomy">
                          <p className="detail-metric-label">Current price</p>
                          <p className="detail-metric-value">
                            {shouldHideMoney
                              ? "••••"
                              : position.currentPrice == null
                                ? "Unavailable"
                                : `${position.currentPrice.toFixed(2)} ${position.currency}`}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="detail-metric-label">% of brokerage</p>
                          <p className="detail-metric-value">
                            {formatPercent(position.percentOfBrokerage)}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="detail-metric-label">% of portfolio</p>
                          <p className="detail-metric-value">
                            {formatPercent(position.percentOfPortfolio)}
                          </p>
                        </div>
                        <div className="detail-panel is-roomy">
                          <p className="detail-metric-label">Target / delta</p>
                          <p className="detail-metric-value">
                            {position.targetPercent == null
                              ? "No target"
                              : `${formatPercent(position.targetPercent)} · ${formatPercent(position.deltaPercent)}`}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="brokerage-workspace-divider" />

          <div className="brokerage-workspace-block">
            <details className="analytics-filter-shell brokerage-reconciliation-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Cash reconciliation
                  </span>
                  <span className="analytics-filter-summary-detail">
                    Cash only for this broker account, separate from
                    mark-to-market positions.
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className={cashReconciliationStatusClass}>
                    {workspace.cashReconciliation?.status ?? "Unavailable"}
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="brokerage-reconciliation-details">
                {workspace.cashReconciliation ? (
                  <>
                    {hasCashMismatch ? (
                      <div className="compact-toolbar-actions brokerage-reconciliation-actions">
                        <Link href="/accounts" className="btn-secondary">
                          Review in Accounts
                        </Link>
                      </div>
                    ) : null}
                    <div className="brokerage-reconciliation-metrics">
                      <div className="brokerage-reconciliation-metric">
                        <p className="detail-metric-label">Tracked cash</p>
                        <p className="detail-metric-value">
                          <MoneyValue
                            value={workspace.cashReconciliation.trackedBalance}
                            currency={workspace.cashReconciliation.currency}
                          />
                        </p>
                      </div>
                      <div className="brokerage-reconciliation-metric">
                        <p className="detail-metric-label">Expected cash</p>
                        <p className="detail-metric-value">
                          <MoneyValue
                            value={workspace.cashReconciliation.expectedBalance}
                            currency={workspace.cashReconciliation.currency}
                          />
                        </p>
                      </div>
                      <div className="brokerage-reconciliation-metric">
                        <p className="detail-metric-label">Delta</p>
                        <p className="detail-metric-value">
                          <MoneyValue
                            value={workspace.cashReconciliation.delta}
                            currency={workspace.cashReconciliation.currency}
                          />
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="page-inline-notice surface-dashed">
                    No reconciliation snapshot is available for this brokerage
                    yet.
                  </p>
                )}
              </div>
            </details>
          </div>

          <div className="brokerage-workspace-divider" />

          <div className="brokerage-workspace-block">
            <details className="analytics-filter-shell brokerage-activity-shell">
              <summary className="analytics-filter-summary">
                <div className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">
                    Activity
                  </span>
                  <span className="analytics-filter-summary-detail">
                    Trades plus non-duplicated cash activity for this brokerage
                    account.
                  </span>
                </div>
                <div className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {workspace.activity.length} entries
                  </span>
                  <span className="analytics-filter-summary-chevron" />
                </div>
              </summary>

              <div className="brokerage-activity-details">
                <details className="analytics-filter-shell brokerage-activity-filter-shell">
                  <summary className="analytics-filter-summary">
                    <span className="analytics-filter-summary-copy">
                      <span className="analytics-filter-summary-title">
                        Filter
                      </span>
                      <span className="analytics-filter-summary-detail">
                        Month, kind, and source for this brokerage ledger.
                      </span>
                    </span>
                    <span className="analytics-filter-summary-meta">
                      <span className="analytics-filter-summary-status">
                        {activityFilterCount > 0
                          ? `${activityFilterCount} active`
                          : "All activity"}
                      </span>
                      <span className="analytics-filter-summary-chevron" />
                    </span>
                  </summary>

                  <div className="filter-grid brokerage-activity-filter-grid">
                    <div className="app-form-field">
                      <label htmlFor="brokerage-activity-filter-month">
                        Month
                      </label>
                      <select
                        id="brokerage-activity-filter-month"
                        value={activityFilters.month}
                        onChange={(event) =>
                          setActivityFilters((current) => ({
                            ...current,
                            month: event.target.value,
                          }))
                        }
                      >
                        <option value="">All</option>
                        {allActivityGroups.map((group) => (
                          <option key={group.key} value={group.key}>
                            {group.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="app-form-field">
                      <label htmlFor="brokerage-activity-filter-kind">
                        Kind
                      </label>
                      <select
                        id="brokerage-activity-filter-kind"
                        value={activityFilters.kind}
                        onChange={(event) =>
                          setActivityFilters((current) => ({
                            ...current,
                            kind: event.target.value,
                          }))
                        }
                      >
                        <option value="">All</option>
                        {availableActivityKinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="app-form-field">
                      <label htmlFor="brokerage-activity-filter-source">
                        Source
                      </label>
                      <select
                        id="brokerage-activity-filter-source"
                        value={activityFilters.source}
                        onChange={(event) =>
                          setActivityFilters((current) => ({
                            ...current,
                            source: event.target
                              .value as BrokerageActivitySourceFilter,
                          }))
                        }
                      >
                        <option value="ALL">All</option>
                        <option value="BROKERAGE_OPERATION">Operations</option>
                        <option value="TRANSACTION">Cash activity</option>
                      </select>
                    </div>

                    <div className="filter-actions brokerage-activity-filter-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={clearActivityFilters}
                        disabled={activityFilterCount === 0}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </details>

                {groupedActivity.length === 0 ? (
                  <p className="page-inline-notice surface-dashed">
                    No brokerage activity yet.
                  </p>
                ) : (
                  <div className="activity-month-stack brokerage-activity-groups">
                    {groupedActivity.map((group) => (
                      <section
                        key={group.key}
                        className="detail-panel is-roomy brokerage-activity-group"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenActivityMonthKey((previous) =>
                              previous === group.key ? null : group.key,
                            )
                          }
                          className="activity-month-toggle"
                        >
                          <div className="activity-month-toggle-copy">
                            <h4 className="activity-month-title">
                              {group.label}
                            </h4>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {group.items.length}{" "}
                              {group.items.length === 1 ? "entry" : "entries"}
                            </p>
                          </div>
                          <span className="activity-month-toggle-indicator">
                            {openActivityMonthKey === group.key ? "−" : "+"}
                          </span>
                        </button>

                        {openActivityMonthKey === group.key ? (
                          <div className="list-stack">
                            {group.items.map((item) => (
                              <article
                                key={`${item.source}:${item.id}`}
                                className="list-card brokerage-activity-card"
                              >
                                <div className="brokerage-activity-row">
                                  <div>
                                    <p className="brokerage-activity-title">
                                      {item.title}
                                    </p>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                      {item.detail ?? item.kind} ·{" "}
                                      {BROKERAGE_ACTIVITY_DATETIME_FORMATTER.format(
                                        new Date(item.postedAt),
                                      )}
                                    </p>
                                  </div>
                                  <div className="brokerage-activity-value">
                                    <MoneyValue
                                      value={item.amount}
                                      currency={item.currency}
                                    />
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        </section>

        <section className="page-section brokerage-section-card">
          <div className="compact-toolbar">
            <div>
              <h3 className="page-section-title">
                Portfolio allocation snapshot
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Across all investable holdings, not just this broker account.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => resetOperationState("TARGETS")}
            >
              Edit targets
            </button>
          </div>

          <div className="brokerage-allocation-layout mt-4">
            <div>
              <h4 className="brokerage-subsection-title">Asset classes</h4>
              <div className="brokerage-target-list">
                {workspace.allocation.assetKindTargets.map((row) => (
                  <div key={row.key} className="brokerage-target-row">
                    <span>{row.label}</span>
                    <span>{formatPercent(row.currentPercent)}</span>
                    <span>{formatPercent(row.targetPercent)}</span>
                    <span>{formatPercent(row.deltaPercent)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="brokerage-subsection-title">Securities</h4>
              <div className="brokerage-target-list">
                {workspace.allocation.securityTargets.map((row) => (
                  <div key={row.key} className="brokerage-target-row">
                    <span>{row.label}</span>
                    <span>{formatPercent(row.currentPercent)}</span>
                    <span>{formatPercent(row.targetPercent)}</span>
                    <span>{formatPercent(row.deltaPercent)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>

      <Modal
        open={openModal === "BUY"}
        onClose={() => setOpenModal(null)}
        title="Buy investment"
        maxWidth={760}
      >
        {(() => {
          const fieldPrefix = "brokerage-buy";

          return (
            <div className="app-form-grid brokerage-form-grid">
              <div className="app-form-field">
                <label
                  htmlFor={`${fieldPrefix}-asset-id`}
                  className="is-optional"
                >
                  <span>Existing holding</span>
                  <span>Optional</span>
                </label>
                <select
                  id={`${fieldPrefix}-asset-id`}
                  value={buyForm.assetId}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      assetId: event.target.value,
                    }))
                  }
                >
                  <option value="">Create new holding</option>
                  {workspace.positions.map((position) => (
                    <option key={position.assetId} value={position.assetId}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </div>
              {!buyForm.assetId ? (
                <>
                  <div className="app-form-field">
                    <label htmlFor={`${fieldPrefix}-name`}>
                      <span>Name</span>
                    </label>
                    <input
                      id={`${fieldPrefix}-name`}
                      value={buyForm.name}
                      onChange={(event) =>
                        setBuyForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="app-form-field">
                    <label htmlFor={`${fieldPrefix}-kind`}>
                      <span>Kind</span>
                    </label>
                    <select
                      id={`${fieldPrefix}-kind`}
                      value={buyForm.kind}
                      onChange={(event) =>
                        setBuyForm((current) => ({
                          ...current,
                          kind: event.target.value as BuyFormState["kind"],
                        }))
                      }
                    >
                      <option value="STOCK">Stock</option>
                      <option value="BOND">Bond</option>
                      <option value="CRYPTO">Crypto</option>
                    </select>
                  </div>
                  <div className="app-form-field">
                    <label htmlFor={`${fieldPrefix}-ticker`}>
                      <span>Ticker</span>
                    </label>
                    <input
                      id={`${fieldPrefix}-ticker`}
                      value={buyForm.ticker}
                      onChange={(event) =>
                        setBuyForm((current) => ({
                          ...current,
                          ticker: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="app-form-field">
                    <label
                      htmlFor={`${fieldPrefix}-exchange`}
                      className="is-optional"
                    >
                      <span>Exchange</span>
                      <span>Optional</span>
                    </label>
                    <SearchablePicker
                      id={`${fieldPrefix}-exchange`}
                      value={buyForm.exchange}
                      onChange={(nextValue) =>
                        setBuyForm((current) => ({
                          ...current,
                          exchange: nextValue,
                        }))
                      }
                      options={buyExchangeOptions}
                      placeholder="Choose an exchange"
                      searchPlaceholder="Search exchanges…"
                    />
                  </div>
                  <div className="app-form-field">
                    <label htmlFor={`${fieldPrefix}-currency`}>
                      <span>Currency</span>
                    </label>
                    <SearchablePicker
                      id={`${fieldPrefix}-currency`}
                      value={buyForm.currency}
                      onChange={(nextValue) =>
                        setBuyForm((current) => ({
                          ...current,
                          currency: nextValue,
                        }))
                      }
                      options={currencyOptions}
                      placeholder="Choose a currency"
                      searchPlaceholder="Search currencies…"
                    />
                  </div>
                </>
              ) : null}
              <div className="app-form-field">
                <label htmlFor={`${fieldPrefix}-quantity`}>
                  <span>Quantity</span>
                </label>
                <input
                  id={`${fieldPrefix}-quantity`}
                  type="number"
                  step="0.0001"
                  value={buyForm.quantity}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="app-form-field">
                <label htmlFor={`${fieldPrefix}-unit-price`}>
                  <span>Price per unit</span>
                </label>
                <input
                  id={`${fieldPrefix}-unit-price`}
                  type="number"
                  step="0.0001"
                  value={buyForm.unitPrice}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="app-form-field">
                <label
                  htmlFor={`${fieldPrefix}-fee-amount`}
                  className="is-optional"
                >
                  <span>Fee</span>
                  <span>Optional</span>
                </label>
                <input
                  id={`${fieldPrefix}-fee-amount`}
                  type="number"
                  step="0.01"
                  value={buyForm.feeAmount}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      feeAmount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="app-form-field">
                <label htmlFor={`${fieldPrefix}-posted-at`}>
                  <span>Posted at</span>
                </label>
                <input
                  id={`${fieldPrefix}-posted-at`}
                  type="datetime-local"
                  value={buyForm.postedAt}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      postedAt: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="app-form-field app-form-field-span-2">
                <label htmlFor={`${fieldPrefix}-notes`} className="is-optional">
                  <span>Notes</span>
                  <span>Optional</span>
                </label>
                <textarea
                  id={`${fieldPrefix}-notes`}
                  value={buyForm.notes}
                  onChange={(event) =>
                    setBuyForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          );
        })()}

        <div className="detail-panel is-roomy mt-4">
          <p className="detail-metric-label">Trade summary</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Cash used:{" "}
            <MoneyValue
              value={buyCashUsed}
              currency={buyForm.currency || workspace.reportingCurrency}
            />
          </p>
        </div>

        {formError ? (
          <p className="page-inline-notice surface-danger mt-4">{formError}</p>
        ) : null}

        <div className="modal-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpenModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleBuySubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Record buy"}
          </button>
        </div>
      </Modal>

      <Modal
        open={openModal === "SELL"}
        onClose={() => setOpenModal(null)}
        title="Sell investment"
        maxWidth={720}
      >
        <div className="app-form-grid brokerage-form-grid">
          <label className="app-form-field">
            <span className="detail-metric-label">Holding</span>
            <select
              value={sellForm.assetId}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  assetId: event.target.value,
                }))
              }
            >
              {workspace.positions.map((position) => (
                <option key={position.assetId} value={position.assetId}>
                  {position.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Quantity</span>
            <input
              type="number"
              step="0.0001"
              value={sellForm.quantity}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Price per unit</span>
            <input
              type="number"
              step="0.0001"
              value={sellForm.unitPrice}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  unitPrice: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Fee</span>
            <input
              type="number"
              step="0.01"
              value={sellForm.feeAmount}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  feeAmount: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Posted at</span>
            <input
              type="datetime-local"
              value={sellForm.postedAt}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  postedAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={sellForm.notes}
              onChange={(event) =>
                setSellForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="detail-panel is-roomy mt-4">
          <p className="detail-metric-label">Trade summary</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Net cash added:{" "}
            <MoneyValue
              value={sellNetCash}
              currency={
                selectedSellPosition?.currency ?? workspace.reportingCurrency
              }
            />
          </p>
        </div>

        {formError ? (
          <p className="page-inline-notice surface-danger mt-4">{formError}</p>
        ) : null}

        <div className="modal-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpenModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSellSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Record sale"}
          </button>
        </div>
      </Modal>

      <Modal
        open={openModal === "DIVIDEND"}
        onClose={() => setOpenModal(null)}
        title="Record dividend"
      >
        <div className="app-form-grid brokerage-form-grid">
          <label className="app-form-field">
            <span className="detail-metric-label">Holding</span>
            <select
              value={dividendForm.assetId}
              onChange={(event) =>
                setDividendForm((current) => ({
                  ...current,
                  assetId: event.target.value,
                }))
              }
            >
              <option value="">Cash dividend</option>
              {workspace.positions.map((position) => (
                <option key={position.assetId} value={position.assetId}>
                  {position.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Amount</span>
            <input
              type="number"
              step="0.01"
              value={dividendForm.amount}
              onChange={(event) =>
                setDividendForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Category</span>
            <select
              value={dividendForm.categoryId}
              onChange={(event) =>
                setDividendForm((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
            >
              <option value="">Select income category</option>
              {dividendCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Posted at</span>
            <input
              type="datetime-local"
              value={dividendForm.postedAt}
              onChange={(event) =>
                setDividendForm((current) => ({
                  ...current,
                  postedAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={dividendForm.notes}
              onChange={(event) =>
                setDividendForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        {formError ? (
          <p className="page-inline-notice surface-danger mt-4">{formError}</p>
        ) : null}

        <div className="modal-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpenModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleCashOperationSubmit("DIVIDEND")}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Record dividend"}
          </button>
        </div>
      </Modal>

      <Modal
        open={openModal === "FEE"}
        onClose={() => setOpenModal(null)}
        title="Record fee"
      >
        <div className="app-form-grid brokerage-form-grid">
          <label className="app-form-field">
            <span className="detail-metric-label">Holding</span>
            <select
              value={feeForm.assetId}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  assetId: event.target.value,
                }))
              }
            >
              <option value="">General brokerage fee</option>
              {workspace.positions.map((position) => (
                <option key={position.assetId} value={position.assetId}>
                  {position.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Amount</span>
            <input
              type="number"
              step="0.01"
              value={feeForm.amount}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Category</span>
            <select
              value={feeForm.categoryId}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  categoryId: event.target.value,
                }))
              }
            >
              <option value="">Select expense category</option>
              {feeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentCategoryName} / {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Posted at</span>
            <input
              type="datetime-local"
              value={feeForm.postedAt}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  postedAt: event.target.value,
                }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={feeForm.notes}
              onChange={(event) =>
                setFeeForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        {formError ? (
          <p className="page-inline-notice surface-danger mt-4">{formError}</p>
        ) : null}

        <div className="modal-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpenModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleCashOperationSubmit("FEE")}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Recording..." : "Record fee"}
          </button>
        </div>
      </Modal>

      <Modal
        open={openModal === "TARGETS"}
        onClose={() => setOpenModal(null)}
        title="Edit allocation targets"
        maxWidth={820}
      >
        <div className="brokerage-target-editor-shell">
          <div className="compact-toolbar brokerage-target-toolbar">
            <div className="brokerage-tab-strip">
              <button
                type="button"
                className={`page-pill${targetTab === "assetClasses" ? " is-active" : ""}`}
                onClick={() => setTargetTab("assetClasses")}
              >
                Asset classes
              </button>
              <button
                type="button"
                className={`page-pill${targetTab === "securities" ? " is-active" : ""}`}
                onClick={() => setTargetTab("securities")}
              >
                Securities
              </button>
            </div>

            <div className="brokerage-target-toolbar-meta">
              <p
                className={`brokerage-target-editor-total${
                  activeTargetTotal === 0
                    ? ""
                    : Math.abs(activeTargetTotal - 100) <= 0.001
                      ? " is-valid"
                      : " is-warning"
                }`}
              >
                Current total{" "}
                <span className="font-semibold">
                  {activeTargetTotal.toFixed(2)}%
                </span>
              </p>
              <div className="brokerage-target-help">
                <button
                  type="button"
                  className="brokerage-target-help-button"
                  aria-expanded={showTargetHelp}
                  onClick={() => setShowTargetHelp((current) => !current)}
                >
                  How it works
                </button>
                {showTargetHelp ? (
                  <div className="brokerage-target-help-panel" role="note">
                    <p>
                      Enter whole percentages, for example{" "}
                      <span className="font-semibold">25</span> for{" "}
                      <span className="font-semibold">25%</span>.
                    </p>
                    <p>
                      Switch a row to <span className="font-semibold">OFF</span>{" "}
                      to exclude it from allocation targets, for example cash.
                    </p>
                    <p>
                      Enabled rows must sum to exactly{" "}
                      <span className="font-semibold">100%</span>.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="brokerage-target-editor">
            {activeTargetRows.map((row, index) => (
              <div key={row.key} className="brokerage-target-editor-row">
                <div className="brokerage-target-editor-summary">
                  <span className="brokerage-target-editor-label">
                    {row.label}
                  </span>
                  <span className="brokerage-target-editor-caption">
                    {row.enabled
                      ? "Included in target total"
                      : "Ignored in target total"}
                  </span>
                </div>
                <div className="brokerage-target-editor-controls">
                  <div
                    className="brokerage-target-toggle-group"
                    role="group"
                    aria-label={`${row.label} target enabled`}
                  >
                    <button
                      type="button"
                      className={`brokerage-target-toggle-option is-off${!row.enabled ? " is-active" : ""}`}
                      aria-pressed={!row.enabled}
                      onClick={() => {
                        const updater =
                          targetTab === "assetClasses"
                            ? setAssetKindTargets
                            : setSecurityTargets;
                        updater((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, enabled: false }
                              : item,
                          ),
                        );
                      }}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={`brokerage-target-toggle-option is-on${row.enabled ? " is-active" : ""}`}
                      aria-pressed={row.enabled}
                      onClick={() => {
                        const updater =
                          targetTab === "assetClasses"
                            ? setAssetKindTargets
                            : setSecurityTargets;
                        updater((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, enabled: true }
                              : item,
                          ),
                        );
                      }}
                    >
                      On
                    </button>
                  </div>
                  <label
                    className={`brokerage-target-percent-field${row.enabled ? "" : " is-disabled"}`}
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      disabled={!row.enabled}
                      aria-label={`${row.label} target percent`}
                      value={row.targetPercent}
                      onChange={(event) => {
                        const updater =
                          targetTab === "assetClasses"
                            ? setAssetKindTargets
                            : setSecurityTargets;
                        updater((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, targetPercent: event.target.value }
                              : item,
                          ),
                        );
                      }}
                    />
                    <span>%</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {formError ? (
          <p className="page-inline-notice surface-danger mt-4">{formError}</p>
        ) : null}

        <div className="modal-action-row">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpenModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleTargetsSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save targets"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

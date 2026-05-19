"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Modal from "@components/Modal";
import MoneyValue from "@components/MoneyValue";
import { useAppPreferences } from "@components/ThemeProvider";
import { apiMutation } from "@lib/api";
import { formatSensitiveNumber } from "@lib/money";
import type {
  AssetKind,
  BrokeragePositionResponse,
  BrokerageWorkspaceResponse,
  CategoryResponse,
  PortfolioAllocationSnapshotItemResponse,
} from "@finhance/shared";

type OperationModalKind = "BUY" | "SELL" | "DIVIDEND" | "FEE" | "TARGETS" | null;
type TargetTab = "assetClasses" | "securities";

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

function createCurrentDateTimeValue() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function createEmptyBuyForm(workspace: BrokerageWorkspaceResponse): BuyFormState {
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
      row.targetPercent == null ? "" : String(Number(row.targetPercent.toFixed(4))),
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
  const [feeForm, setFeeForm] = useState<CashFormState>(() => createEmptyCashForm());
  const [assetKindTargets, setAssetKindTargets] = useState<EditableTargetRow[]>(() =>
    createTargetRows(workspace.allocation.assetKindTargets),
  );
  const [securityTargets, setSecurityTargets] = useState<EditableTargetRow[]>(() =>
    createTargetRows(workspace.allocation.securityTargets),
  );
  const [showTargetHelp, setShowTargetHelp] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      workspace.positions.find((position) => position.assetId === sellForm.assetId) ??
      null,
    [sellForm.assetId, workspace.positions],
  );
  const buyGross = useMemo(() => {
    const quantity = parseNumber(buyForm.quantity);
    const unitPrice = parseNumber(buyForm.unitPrice);
    return quantity != null && unitPrice != null ? quantity * unitPrice : null;
  }, [buyForm.quantity, buyForm.unitPrice]);
  const buyFee = parseNumber(buyForm.feeAmount) ?? 0;
  const buyCashUsed = buyGross == null ? null : buyGross + buyFee;
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
      setAssetKindTargets(createTargetRows(workspace.allocation.assetKindTargets));
      setSecurityTargets(createTargetRows(workspace.allocation.securityTargets));
      setTargetTab("assetClasses");
      setShowTargetHelp(false);
    }
    setOpenModal(nextModal);
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
      setFormError(error instanceof Error ? error.message : "Unable to record this buy.");
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
      setFormError(error instanceof Error ? error.message : "Unable to record this sale.");
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
      await apiMutation(`/brokerage/${brokerageAccountId}/${kind.toLowerCase()}`, {
        method: "POST",
        body: JSON.stringify({
          assetId: form.assetId || null,
          amount,
          categoryId: form.categoryId,
          postedAt: new Date(form.postedAt).toISOString(),
          notes: form.notes || null,
        }),
      });
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
      .map((row) => ({
        kind: row.kind,
        targetPercent: parseNumber(row.targetPercent) ?? 0,
        enabled: row.enabled,
      }))
      .filter((row) => row.enabled && row.targetPercent > 0);
    const securityPayload = securityTargets
      .map((row) => ({
        kind: row.kind,
        ticker: row.ticker ?? "",
        exchange: row.exchange,
        name: row.label,
        targetPercent: parseNumber(row.targetPercent) ?? 0,
        enabled: row.enabled,
      }))
      .filter((row) => row.enabled && row.targetPercent > 0);

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
      setFormError(error instanceof Error ? error.message : "Unable to save targets.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-hero">
          <div className="page-hero-row brokerage-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Investing</p>
              <h2 className="page-title is-compact">Brokerage</h2>
              <p className="page-description">
                Cash, positions, trades, and allocation targets in one workspace.
              </p>
            </div>

            <div className="brokerage-hero-actions">
              {workspace.brokers.length > 1 ? (
                <label className="app-form-field brokerage-account-switcher">
                  <span className="detail-metric-label">Broker account</span>
                  <select
                    value={brokerageAccountId}
                    onChange={(event) => router.push(`/brokerage/${event.target.value}`)}
                  >
                    {workspace.brokers.map((broker) => (
                      <option key={broker.account.id} value={broker.account.id}>
                        {broker.account.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                type="button"
                className="btn-primary"
                onClick={() => resetOperationState("BUY")}
              >
                Buy
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => resetOperationState("SELL")}
                disabled={workspace.positions.length === 0}
              >
                Sell
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => resetOperationState("DIVIDEND")}
              >
                Dividend
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => resetOperationState("FEE")}
              >
                Fee
              </button>
              <Link
                href={`/transactions?accountId=${encodeURIComponent(brokerageAccountId)}`}
                className="btn-secondary"
              >
                Cash activity
              </Link>
            </div>
          </div>
        </div>

        <section className="page-section brokerage-summary-card">
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
            </div>
            <div className="brokerage-summary-total">
              <p className="detail-metric-label">Total value</p>
              <p className="brokerage-summary-total-value">
                <MoneyValue
                  value={workspace.selectedBroker.totalValue}
                  currency={workspace.baseCurrency}
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
                  currency={workspace.baseCurrency}
                />
              </p>
            </div>
            <div className="detail-panel is-roomy">
              <p className="detail-metric-label">Invested</p>
              <p className="detail-metric-value">
                <MoneyValue
                  value={workspace.selectedBroker.investedValue}
                  currency={workspace.baseCurrency}
                />
              </p>
            </div>
            <div className="detail-panel is-roomy">
              <p className="detail-metric-label">Unrealised P/L</p>
              <p className="detail-metric-value">
                <MoneyValue
                  value={workspace.selectedBroker.unrealisedGainLoss}
                  currency={workspace.baseCurrency}
                />
              </p>
            </div>
          </div>
        </section>

        <section className="page-section brokerage-section-card">
          <div className="compact-toolbar">
            <div>
              <h3 className="page-section-title">Cash reconciliation</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Broker reconciliation now tracks cash only, not mark-to-market positions.
              </p>
            </div>
            {workspace.cashReconciliation ? (
              <span className="status-chip is-warning">
                {workspace.cashReconciliation.status}
              </span>
            ) : null}
          </div>

          {workspace.cashReconciliation ? (
            <div className="metric-strip is-relaxed mt-4">
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Tracked cash</p>
                <p className="detail-metric-value">
                  <MoneyValue
                    value={workspace.cashReconciliation.trackedBalance}
                    currency={workspace.cashReconciliation.currency}
                  />
                </p>
              </div>
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Expected cash</p>
                <p className="detail-metric-value">
                  <MoneyValue
                    value={workspace.cashReconciliation.expectedBalance}
                    currency={workspace.cashReconciliation.currency}
                  />
                </p>
              </div>
              <div className="detail-panel is-roomy">
                <p className="detail-metric-label">Delta</p>
                <p className="detail-metric-value">
                  <MoneyValue
                    value={workspace.cashReconciliation.delta}
                    currency={workspace.cashReconciliation.currency}
                  />
                </p>
              </div>
            </div>
          ) : (
            <p className="page-inline-notice surface-dashed mt-4">
              No reconciliation snapshot is available for this brokerage yet.
            </p>
          )}
        </section>

        <section className="page-section brokerage-section-card">
          <div className="compact-toolbar">
            <div>
              <h3 className="page-section-title">Positions</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Weighted-average cost, current valuation, and allocation contribution.
              </p>
            </div>
          </div>

          {workspace.positions.length === 0 ? (
            <div className="page-inline-notice surface-dashed mt-4">
              No active positions yet.
            </div>
          ) : (
            <div className="list-stack mt-4">
              {workspace.positions.map((position) => (
                <article key={position.assetId} className="list-card brokerage-position-card">
                  <div className="brokerage-position-head">
                    <div>
                      <div className="brokerage-position-title-row">
                        <h4 className="brokerage-position-title">{position.name}</h4>
                        {position.ticker ? (
                          <span className="status-chip is-neutral">
                            {position.ticker}
                            {position.exchange ?? ""}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {formatSensitiveNumber(position.quantity, shouldHideMoney)} shares · Avg cost{" "}
                        {shouldHideMoney
                          ? "••••"
                          : `${position.averageCostPerUnit.toFixed(4)} ${position.currency}`}
                      </p>
                    </div>
                    <div className="brokerage-position-value">
                      <p className="brokerage-position-value-amount">
                        <MoneyValue
                          value={position.currentValue}
                          currency={workspace.baseCurrency}
                        />
                      </p>
                      <p className="brokerage-position-value-sub">
                        P/L{" "}
                        <MoneyValue
                          value={position.unrealisedGainLoss}
                          currency={workspace.baseCurrency}
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
                            : `${position.currentPrice.toFixed(4)} ${position.currency}`}
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
              ))}
            </div>
          )}
        </section>

        <section className="page-section brokerage-section-card">
          <div className="compact-toolbar">
            <div>
              <h3 className="page-section-title">Allocation snapshot</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Portfolio-wide current, target, and delta, surfaced here for investing decisions.
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

        <section className="page-section brokerage-section-card">
          <div className="compact-toolbar">
            <div>
              <h3 className="page-section-title">Activity</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Trades plus non-duplicated cash activity for this brokerage account.
              </p>
            </div>
          </div>

          <div className="list-stack mt-4">
            {workspace.activity.map((item) => (
              <article key={`${item.source}:${item.id}`} className="list-card brokerage-activity-card">
                <div className="brokerage-activity-row">
                  <div>
                    <p className="brokerage-activity-title">{item.title}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {item.detail ?? item.kind} ·{" "}
                      {BROKERAGE_ACTIVITY_DATETIME_FORMATTER.format(
                        new Date(item.postedAt),
                      )}
                    </p>
                  </div>
                  <div className="brokerage-activity-value">
                    <MoneyValue value={item.amount} currency={item.currency} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>

      <Modal
        open={openModal === "BUY"}
        onClose={() => setOpenModal(null)}
        title="Buy investment"
        maxWidth={760}
      >
        <div className="app-form-grid brokerage-form-grid">
          <label className="app-form-field">
            <span className="detail-metric-label">Existing holding</span>
            <select
              value={buyForm.assetId}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, assetId: event.target.value }))
              }
            >
              <option value="">Create new holding</option>
              {workspace.positions.map((position) => (
                <option key={position.assetId} value={position.assetId}>
                  {position.name}
                </option>
              ))}
            </select>
          </label>
          {!buyForm.assetId ? (
            <>
              <label className="app-form-field">
                <span className="detail-metric-label">Name</span>
                <input
                  value={buyForm.name}
                  onChange={(event) =>
                    setBuyForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="app-form-field">
                <span className="detail-metric-label">Kind</span>
                <select
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
              </label>
              <label className="app-form-field">
                <span className="detail-metric-label">Ticker</span>
                <input
                  value={buyForm.ticker}
                  onChange={(event) =>
                    setBuyForm((current) => ({ ...current, ticker: event.target.value }))
                  }
                />
              </label>
              <label className="app-form-field">
                <span className="detail-metric-label">Exchange</span>
                <input
                  value={buyForm.exchange}
                  onChange={(event) =>
                    setBuyForm((current) => ({ ...current, exchange: event.target.value }))
                  }
                />
              </label>
              <label className="app-form-field">
                <span className="detail-metric-label">Currency</span>
                <input
                  value={buyForm.currency}
                  onChange={(event) =>
                    setBuyForm((current) => ({ ...current, currency: event.target.value }))
                  }
                />
              </label>
            </>
          ) : null}
          <label className="app-form-field">
            <span className="detail-metric-label">Quantity</span>
            <input
              type="number"
              step="0.0001"
              value={buyForm.quantity}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, quantity: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Price per unit</span>
            <input
              type="number"
              step="0.0001"
              value={buyForm.unitPrice}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, unitPrice: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Fee</span>
            <input
              type="number"
              step="0.01"
              value={buyForm.feeAmount}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, feeAmount: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Posted at</span>
            <input
              type="datetime-local"
              value={buyForm.postedAt}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, postedAt: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={buyForm.notes}
              onChange={(event) =>
                setBuyForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="detail-panel is-roomy mt-4">
          <p className="detail-metric-label">Trade summary</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Cash used:{" "}
            <MoneyValue value={buyCashUsed} currency={buyForm.currency || workspace.baseCurrency} />
          </p>
        </div>

        {formError ? <p className="page-inline-notice surface-danger mt-4">{formError}</p> : null}

        <div className="modal-action-row">
          <button type="button" className="btn-secondary" onClick={() => setOpenModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleBuySubmit} disabled={isSubmitting}>
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
                setSellForm((current) => ({ ...current, assetId: event.target.value }))
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
                setSellForm((current) => ({ ...current, quantity: event.target.value }))
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
                setSellForm((current) => ({ ...current, unitPrice: event.target.value }))
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
                setSellForm((current) => ({ ...current, feeAmount: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Posted at</span>
            <input
              type="datetime-local"
              value={sellForm.postedAt}
              onChange={(event) =>
                setSellForm((current) => ({ ...current, postedAt: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={sellForm.notes}
              onChange={(event) =>
                setSellForm((current) => ({ ...current, notes: event.target.value }))
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
              currency={selectedSellPosition?.currency ?? workspace.baseCurrency}
            />
          </p>
        </div>

        {formError ? <p className="page-inline-notice surface-danger mt-4">{formError}</p> : null}

        <div className="modal-action-row">
          <button type="button" className="btn-secondary" onClick={() => setOpenModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSellSubmit} disabled={isSubmitting}>
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
                setDividendForm((current) => ({ ...current, assetId: event.target.value }))
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
                setDividendForm((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Category</span>
            <select
              value={dividendForm.categoryId}
              onChange={(event) =>
                setDividendForm((current) => ({ ...current, categoryId: event.target.value }))
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
                setDividendForm((current) => ({ ...current, postedAt: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={dividendForm.notes}
              onChange={(event) =>
                setDividendForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
        </div>

        {formError ? <p className="page-inline-notice surface-danger mt-4">{formError}</p> : null}

        <div className="modal-action-row">
          <button type="button" className="btn-secondary" onClick={() => setOpenModal(null)}>
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

      <Modal open={openModal === "FEE"} onClose={() => setOpenModal(null)} title="Record fee">
        <div className="app-form-grid brokerage-form-grid">
          <label className="app-form-field">
            <span className="detail-metric-label">Holding</span>
            <select
              value={feeForm.assetId}
              onChange={(event) =>
                setFeeForm((current) => ({ ...current, assetId: event.target.value }))
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
                setFeeForm((current) => ({ ...current, amount: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field">
            <span className="detail-metric-label">Category</span>
            <select
              value={feeForm.categoryId}
              onChange={(event) =>
                setFeeForm((current) => ({ ...current, categoryId: event.target.value }))
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
                setFeeForm((current) => ({ ...current, postedAt: event.target.value }))
              }
            />
          </label>
          <label className="app-form-field app-form-field-span-2">
            <span className="detail-metric-label">Notes</span>
            <textarea
              value={feeForm.notes}
              onChange={(event) =>
                setFeeForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
        </div>

        {formError ? <p className="page-inline-notice surface-danger mt-4">{formError}</p> : null}

        <div className="modal-action-row">
          <button type="button" className="btn-secondary" onClick={() => setOpenModal(null)}>
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

      <Modal open={openModal === "TARGETS"} onClose={() => setOpenModal(null)} title="Edit allocation targets" maxWidth={820}>
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
                Current total <span className="font-semibold">{activeTargetTotal.toFixed(2)}%</span>
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
                      Enter whole percentages, for example <span className="font-semibold">25</span> for{" "}
                      <span className="font-semibold">25%</span>.
                    </p>
                    <p>
                      Switch a row to <span className="font-semibold">OFF</span> to exclude it from allocation targets, for
                      example cash.
                    </p>
                    <p>
                      Enabled rows must sum to exactly <span className="font-semibold">100%</span>.
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
                <span className="brokerage-target-editor-label">{row.label}</span>
                <span className="brokerage-target-editor-caption">
                  {row.enabled ? "Included in target total" : "Ignored in target total"}
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
                    className={`brokerage-target-toggle-option${!row.enabled ? " is-active" : ""}`}
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
                    className={`brokerage-target-toggle-option${row.enabled ? " is-active" : ""}`}
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

        {formError ? <p className="page-inline-notice surface-danger mt-4">{formError}</p> : null}

        <div className="modal-action-row">
          <button type="button" className="btn-secondary" onClick={() => setOpenModal(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleTargetsSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save targets"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

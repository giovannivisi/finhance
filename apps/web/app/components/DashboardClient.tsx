"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  AggregatePricingStatus,
  DashboardAssetResponse,
  LiveAssetValuationResponse,
} from "@finhance/shared";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });
import CreateAssetModal from "@/components/CreateAssetModal";
import CooldownNotice from "@components/CooldownNotice";
import EditAssetModal from "@components/EditAssetModal";
import DeleteAssetButton from "@components/DeleteAssetButton";
import OverflowMenu from "@components/OverflowMenu";
import {
  getDashboardRefreshNotice,
  requestDashboardRefresh,
} from "@lib/dashboard-refresh";
import { formatCurrency } from "@lib/format";
import HeaderAddButton from "@components/HeaderAddButton";
import SectionHeader from "@components/SectionHeader";
import DisclosureIcon from "@components/DisclosureIcon";
import AllocationChart from "@components/AllocationChart";
import { useAppPreferences } from "@components/ThemeProvider";
import {
  applyLiveDeltasToKindTotals,
  applyLiveDeltasToSummary,
  computeDashboardLiveValueDeltas,
  mergeDashboardAssetsWithLiveQuotes,
  sumDashboardValuesWithLiveDeltas,
} from "@lib/live-valuations";
import { formatSensitiveCurrency } from "@lib/money";
import { useSingleFlightActions } from "@lib/single-flight";
import { useLiveValuations } from "@lib/useLiveValuations";
import { fetchApiMutation } from "@lib/api";
import { COLORS, formatKindLabel } from "@lib/asset-ui";

// Stable fallback so the live-merge memos don't recompute on every render
// while there is no live data yet.
const EMPTY_LIVE_QUOTES: LiveAssetValuationResponse[] = [];

function getKindDotColor(kind: string): string {
  return COLORS[kind as keyof typeof COLORS] ?? "var(--border-glass-strong)";
}

function getValuationLabel(asset: DashboardAssetResponse): string {
  switch (asset.valuationSource) {
    case "LIVE":
      return "Live quote";
    case "LAST_QUOTE":
      return "Latest quote";
    case "AVG_COST":
      return "Reference avg cost";
    case "DIRECT_BALANCE":
      return asset.isStale ? "Latest balance" : "Stored balance";
    case "UNAVAILABLE":
      return "Unavailable in dashboard currency";
    default:
      return "Stored value";
  }
}

function getPricingStatusLabel(pricingStatus: AggregatePricingStatus): string {
  switch (pricingStatus.state) {
    case "FRESH":
    case "PARTIAL":
    case "STALE":
    default:
      return "";
  }
}

function SortableKindBlock({
  id,
  isEditing,
  children,
}: {
  id: string;
  isEditing: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditing, animateLayoutChanges });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition ?? "transform 200ms ease",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`glass-card category-block${isEditing && !isDragging ? " is-trembling" : ""}`}
      {...(isEditing ? { ...attributes, ...listeners } : {})}
    >
      {children}
    </div>
  );
}

function SortableAssetRow({
  asset,
  isEditing,
  baseCurrency,
  shouldHideMoney,
  isAssetType,
  onEdit,
  brokerageAccountIds,
}: {
  asset: DashboardAssetResponse;
  isEditing: boolean;
  baseCurrency: string;
  shouldHideMoney: boolean;
  isAssetType: boolean;
  onEdit: (id: string) => void;
  brokerageAccountIds: Set<string>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id, disabled: !isEditing, animateLayoutChanges });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition ?? "transform 200ms ease",
    zIndex: isDragging ? 50 : undefined,
  };

  const displayValue = asset.currentValue ?? asset.referenceValue;
  const brokerageHref =
    asset.accountId && brokerageAccountIds.has(asset.accountId)
      ? `/brokerage/${asset.accountId}`
      : null;

  if (isAssetType) {
    const referenceDiffers =
      asset.referenceValue != null &&
      asset.currentValue != null &&
      Math.abs(asset.referenceValue - asset.currentValue) > 0.005;

    const liveUnitPrice =
      asset.quantity && asset.currentValue
        ? Number(asset.currentValue) / Number(asset.quantity)
        : null;

    const quantityDisplay = shouldHideMoney
      ? (asset.ticker ?? asset.accountName ?? "")
      : asset.quantity != null
        ? `${asset.quantity} × ${formatCurrency(liveUnitPrice ?? Number(asset.unitPrice), asset.currency ?? baseCurrency)}`
        : (asset.accountName ?? "Stored balance");
    const valuationBadgeText =
      asset.valuationSource === "LIVE"
        ? "LIVE"
        : asset.valuationSource === "LAST_QUOTE" ||
            (asset.valuationSource === "DIRECT_BALANCE" && asset.isStale)
          ? "LATEST"
          : null;

    return (
      <li
        ref={setNodeRef}
        style={style}
        className={`asset-row${isEditing && !isDragging ? " is-trembling" : ""}`}
        {...(isEditing ? { ...attributes, ...listeners } : {})}
      >
        <div className="asset-row-info">
          <div className="asset-row-headline">
            <p className="asset-row-name">{asset.name}</p>
            {asset.ticker ? (
              <span className="asset-row-ticker">{asset.ticker}</span>
            ) : null}
          </div>
          <div className="asset-row-meta">
            <p className="asset-row-meta-text">{quantityDisplay}</p>
            {valuationBadgeText ? (
              <span
                className={`asset-row-live-badge${
                  valuationBadgeText === "LATEST" ? " is-warning" : ""
                }`}
              >
                {valuationBadgeText}
              </span>
            ) : null}
            {asset.notes ? (
              <>
                <span className="asset-row-bullet">&bull;</span>
                <span className="asset-row-notes">{asset.notes}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="asset-row-value">
          <p className="asset-row-value-amount">
            {formatSensitiveCurrency(
              displayValue,
              baseCurrency,
              shouldHideMoney,
            )}
          </p>
          {referenceDiffers ? (
            <p className="asset-row-value-sub is-ref">
              Ref:{" "}
              {formatSensitiveCurrency(
                asset.referenceValue,
                baseCurrency,
                shouldHideMoney,
              )}
            </p>
          ) : (
            <p className="asset-row-value-sub">{getValuationLabel(asset)}</p>
          )}
        </div>

        {!isEditing ? (
          <OverflowMenu
            label="Asset actions"
            panelClassName="asset-row-action-panel"
            renderTrigger={({ isOpen, triggerProps, setTriggerNode }) => (
              <div
                className={`asset-row-actions asset-row-action-menu${
                  isOpen ? " is-open" : ""
                }`}
              >
                <button
                  {...triggerProps}
                  ref={setTriggerNode}
                  className="asset-row-action-trigger"
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                  <span className="sr-only">Asset actions</span>
                </button>
              </div>
            )}
          >
            {({ closeMenu }) => (
              <>
                {brokerageHref ? (
                  <Link
                    href={brokerageHref}
                    role="menuitem"
                    className="overflow-menu-item"
                    onClick={() => closeMenu()}
                  >
                    Brokerage
                  </Link>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onEdit(asset.id);
                  }}
                  className="overflow-menu-item"
                >
                  Edit
                </button>
                <DeleteAssetButton
                  id={asset.id}
                  role="menuitem"
                  className="overflow-menu-item is-danger"
                  onOpen={() => closeMenu()}
                >
                  Delete
                </DeleteAssetButton>
              </>
            )}
          </OverflowMenu>
        ) : null}
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`asset-row${isEditing ? " is-trembling" : ""}`}
      {...(isEditing ? { ...attributes, ...listeners } : {})}
    >
      <div className="asset-row-info">
        <p className="asset-row-name">{asset.name}</p>
        <div className="asset-row-meta">
          <span className="asset-row-meta-text">
            {asset.liabilityKind ?? asset.accountName ?? "Stored balance"}
          </span>
          {asset.notes ? (
            <>
              <span className="asset-row-bullet">&bull;</span>
              <span className="asset-row-notes">{asset.notes}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="asset-row-value">
        <p className="asset-row-value-amount">
          {formatSensitiveCurrency(displayValue, baseCurrency, shouldHideMoney)}
        </p>
        <p className="asset-row-value-sub">{getValuationLabel(asset)}</p>
      </div>

      {!isEditing ? (
        <OverflowMenu
          label="Asset actions"
          panelClassName="asset-row-action-panel"
          renderTrigger={({ isOpen, triggerProps, setTriggerNode }) => (
            <div
              className={`asset-row-actions asset-row-action-menu${
                isOpen ? " is-open" : ""
              }`}
            >
              <button
                {...triggerProps}
                ref={setTriggerNode}
                className="asset-row-action-trigger"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
                <span className="sr-only">Asset actions</span>
              </button>
            </div>
          )}
        >
          {({ closeMenu }) => (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onEdit(asset.id);
                }}
                className="overflow-menu-item"
              >
                Edit
              </button>
              <DeleteAssetButton
                id={asset.id}
                role="menuitem"
                className="overflow-menu-item is-danger"
                onOpen={() => closeMenu()}
              >
                Delete
              </DeleteAssetButton>
            </>
          )}
        </OverflowMenu>
      ) : null}
    </li>
  );
}

function applySavedKindOrder(
  categories: string[],
  savedOrder: string[],
): string[] {
  if (savedOrder.length === 0) return categories.slice().sort();

  const ordered: string[] = [];
  for (const kind of savedOrder) {
    if (categories.includes(kind)) {
      ordered.push(kind);
    }
  }
  for (const kind of categories) {
    if (!ordered.includes(kind)) {
      ordered.push(kind);
    }
  }
  return ordered;
}

export default function DashboardClient({
  grouped,
  kindTotalsArray,
  baseCurrency,
  pricingStatus,
  lastRefreshAt,
  summary,
  assetKindOrder: savedKindOrder,
  brokerageAccountIds,
}: {
  grouped: Record<string, DashboardAssetResponse[]>;
  kindTotalsArray: { kind: string; total: number }[];
  baseCurrency: string;
  pricingStatus: AggregatePricingStatus;
  lastRefreshAt?: string | null;
  summary: { assets: number; liabilities: number; netWorth: number };
  assetKindOrder: string[];
  brokerageAccountIds: string[];
}) {
  const router = useRouter();
  const brokerageAccountIdSet = useMemo(
    () => new Set(brokerageAccountIds),
    [brokerageAccountIds],
  );
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [lastDataRefreshMs, setLastDataRefreshMs] = useState(Date.now());
  const [isEditing, setIsEditing] = useState(false);
  const actions = useSingleFlightActions<"refresh">();
  const { hideMoney, isHydrated, toggleHideMoney } = useAppPreferences();
  const allCategories = useMemo(() => Object.keys(grouped), [grouped]);

  // Live valuations are display-only: they update the figures the user sees
  // between data refreshes but never touch `grouped`/`summary`/
  // `kindTotalsArray` (the server-provided baseline) or `lastDataRefreshMs`.
  const { data: liveValuationsData } = useLiveValuations();
  const liveQuotes = liveValuationsData?.quotes ?? EMPTY_LIVE_QUOTES;

  const flatAssets = useMemo(() => Object.values(grouped).flat(), [grouped]);

  const liveValueDeltas = useMemo(
    () => computeDashboardLiveValueDeltas(flatAssets, liveQuotes),
    [flatAssets, liveQuotes],
  );

  const liveGrouped = useMemo(() => {
    if (liveQuotes.length === 0) {
      return grouped;
    }

    const mergedById = new Map(
      mergeDashboardAssetsWithLiveQuotes(flatAssets, liveQuotes).map(
        (asset) => [asset.id, asset],
      ),
    );

    const next: Record<string, DashboardAssetResponse[]> = {};
    for (const [kind, assets] of Object.entries(grouped)) {
      next[kind] = assets.map((asset) => mergedById.get(asset.id) ?? asset);
    }
    return next;
  }, [grouped, flatAssets, liveQuotes]);

  const liveKindTotalsArray = useMemo(
    () =>
      applyLiveDeltasToKindTotals(kindTotalsArray, flatAssets, liveValueDeltas),
    [kindTotalsArray, flatAssets, liveValueDeltas],
  );

  const liveSummary = useMemo(
    () => applyLiveDeltasToSummary(summary, flatAssets, liveValueDeltas),
    [summary, flatAssets, liveValueDeltas],
  );

  const [assetKindOrderState, setAssetKindOrderState] = useState<string[]>(() =>
    applySavedKindOrder(allCategories, savedKindOrder),
  );

  const [assetOrderState, setAssetOrderState] = useState<
    Record<string, string[]>
  >(() => {
    const result: Record<string, string[]> = {};
    for (const [kind, assets] of Object.entries(grouped)) {
      result[kind] = assets.map((a) => a.id);
    }
    return result;
  });

  useEffect(() => {
    setAssetKindOrderState((prev) => {
      const newCategories = allCategories.filter((c) => !prev.includes(c));
      const validPrev = prev.filter((c) => allCategories.includes(c));
      return newCategories.length > 0 || validPrev.length !== prev.length
        ? [...validPrev, ...newCategories]
        : prev;
    });
    setAssetOrderState((prev) => {
      const next: Record<string, string[]> = {};
      for (const [kind, assets] of Object.entries(grouped)) {
        const ids = assets.map((a) => a.id);
        const prevIds = prev[kind] ?? [];
        const ordered: string[] = [];
        for (const id of prevIds) {
          if (ids.includes(id)) ordered.push(id);
        }
        for (const id of ids) {
          if (!ordered.includes(id)) ordered.push(id);
        }
        next[kind] = ordered;
      }
      return next;
    });
  }, [grouped, allCategories]);

  useEffect(() => {
    setLastDataRefreshMs(Date.now());
  }, [grouped]);

  const sortedAssetCategories = useMemo(
    () =>
      assetKindOrderState.filter((category) =>
        grouped[category]?.some((asset) => asset.type === "ASSET"),
      ),
    [assetKindOrderState, grouped],
  );

  const sortedLiabilityCategories = useMemo(
    () =>
      assetKindOrderState.filter((category) =>
        grouped[category]?.some((asset) => asset.type === "LIABILITY"),
      ),
    [assetKindOrderState, grouped],
  );

  const shouldHideMoney = !isHydrated || hideMoney;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setOpenCategories((previous) => {
      const next: Record<string, boolean> = {};
      for (const category of allCategories) {
        next[category] = previous[category] ?? true;
      }
      return next;
    });
  }, [allCategories]);

  function toggleCategory(category: string) {
    if (isEditing) return;
    setOpenCategories((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  }

  async function handleRefresh() {
    await actions.run("refresh", async () => {
      setRefreshError(null);
      setRefreshNotice(null);
      setIsRefreshing(true);

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
        setIsRefreshing(false);
      }
    });
  }

  const handleKindDragEnd = useCallback(
    (event: DragEndEvent, type: "ASSET" | "LIABILITY") => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const categories =
        type === "ASSET" ? sortedAssetCategories : sortedLiabilityCategories;
      const oldIndex = categories.indexOf(active.id as string);
      const newIndex = categories.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      setAssetKindOrderState((prev) => {
        const prevOldIndex = prev.indexOf(active.id as string);
        const prevNewIndex = prev.indexOf(over.id as string);
        if (prevOldIndex === -1 || prevNewIndex === -1) return prev;
        return arrayMove(prev, prevOldIndex, prevNewIndex);
      });
    },
    [sortedAssetCategories, sortedLiabilityCategories],
  );

  const handleAssetDragEnd = useCallback(
    (event: DragEndEvent, kind: string) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setAssetOrderState((prev) => {
        const ids = prev[kind] ?? [];
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return { ...prev, [kind]: arrayMove(ids, oldIndex, newIndex) };
      });
    },
    [],
  );

  function getOrderedAssets(
    kind: string,
    type: "ASSET" | "LIABILITY",
  ): DashboardAssetResponse[] {
    const assets = (liveGrouped[kind] ?? []).filter((a) => a.type === type);
    const orderedIds = assetOrderState[kind] ?? [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    const ordered: DashboardAssetResponse[] = [];
    for (const id of orderedIds) {
      const asset = byId.get(id);
      if (asset) ordered.push(asset);
    }
    for (const asset of assets) {
      if (!orderedIds.includes(asset.id)) ordered.push(asset);
    }
    return ordered;
  }

  async function handleDone() {
    setIsEditing(false);

    try {
      await fetchApiMutation("/assets/reorder/kinds", {
        method: "PUT",
        body: JSON.stringify({ kindOrder: assetKindOrderState }),
      });

      for (const [kind, ids] of Object.entries(assetOrderState)) {
        if (!grouped[kind]) continue;
        await fetchApiMutation("/assets/reorder/assets", {
          method: "PUT",
          body: JSON.stringify({ assetIds: ids }),
        });
      }
    } catch {
      // Silently ignore reorder failures — the next page load will use
      // whatever order was last persisted successfully.
    }
  }

  function handleEdit() {
    setIsEditing(true);
    setOpenCategories((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = true;
      }
      return next;
    });
  }

  const refreshStatusDetail =
    lastRefreshAt == null
      ? "No stored price snapshot yet"
      : nowMs == null
        ? "Stored price snapshot available"
        : `Last refresh ${Math.max(
            0,
            Math.floor(
              (nowMs - Math.max(Date.parse(lastRefreshAt), lastDataRefreshMs)) /
                60_000,
            ),
          )} min ago`;
  const refreshStatus = isRefreshing
    ? "Refreshing latest prices..."
    : [getPricingStatusLabel(pricingStatus), refreshStatusDetail]
        .filter(Boolean)
        .join(" ");

  const refreshToneClass = refreshError
    ? "is-error"
    : pricingStatus.state === "FRESH" && lastRefreshAt != null
      ? ""
      : "is-warning";

  return (
    <>
      <div className="dashboard-hero">
        <div className="dashboard-hero-main">
          <p className="dashboard-hero-eyebrow">Total Net Worth</p>
          <h1 className="dashboard-hero-amount">
            {formatSensitiveCurrency(
              liveSummary.netWorth,
              baseCurrency,
              shouldHideMoney,
            )}
          </h1>
        </div>

        <div className="dashboard-hero-controls">
          <button
            type="button"
            onClick={toggleHideMoney}
            aria-pressed={hideMoney}
            className="btn-secondary dashboard-hero-privacy-btn"
          >
            {shouldHideMoney ? (
              <Eye size={16} aria-hidden="true" />
            ) : (
              <EyeOff size={16} aria-hidden="true" />
            )}
            <span>{shouldHideMoney ? "Show balances" : "Hide balances"}</span>
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary dashboard-hero-refresh-btn"
          >
            {isRefreshing ? "Refreshing..." : "Refresh data"}
          </button>
        </div>

        <div className="dashboard-hero-stats">
          <div>
            <p className="dashboard-hero-stat-label">Assets</p>
            <p className="dashboard-hero-stat-value is-positive">
              {formatSensitiveCurrency(
                liveSummary.assets,
                baseCurrency,
                shouldHideMoney,
              )}
            </p>
          </div>
          <div>
            <p className="dashboard-hero-stat-label">Liabilities</p>
            <p className="dashboard-hero-stat-value is-negative">
              {formatSensitiveCurrency(
                liveSummary.liabilities,
                baseCurrency,
                shouldHideMoney,
              )}
            </p>
          </div>
        </div>

        <div
          className={`dashboard-refresh-card${refreshToneClass ? ` ${refreshToneClass}` : ""}`}
        >
          <p className="dashboard-hero-aside-status">{refreshStatus}</p>
          {refreshNotice ? (
            <CooldownNotice
              notice={refreshNotice}
              style={{
                fontSize: "12px",
                color: "#f59e0b",
                margin: "6px 0 0",
                textAlign: "right",
              }}
            />
          ) : null}
          {refreshError ? (
            <p className="dashboard-hero-aside-error">{refreshError}</p>
          ) : null}
        </div>
      </div>

      <section className="dashboard-overview">
        <div className="glass-card dashboard-overview-card dashboard-overview-breakdown">
          <h3 className="dashboard-overview-title">Asset Allocation</h3>
          <div className="dashboard-overview-list">
            {liveKindTotalsArray.map(({ kind, total }) => (
              <div key={kind} className="dashboard-overview-row">
                <div className="dashboard-overview-label">
                  <div
                    className="category-dot is-large"
                    style={{ background: getKindDotColor(kind) }}
                  />
                  <span>{formatKindLabel(kind)}</span>
                </div>
                <span className="dashboard-overview-value">
                  {formatSensitiveCurrency(
                    total,
                    baseCurrency,
                    shouldHideMoney,
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card dashboard-overview-card dashboard-overview-chart">
          <div className="dashboard-overview-chart-wrap">
            <AllocationChart
              size={220}
              currency={baseCurrency}
              data={liveKindTotalsArray.map((kindTotal) => ({
                label: formatKindLabel(kindTotal.kind),
                total: kindTotal.total,
                color: getKindDotColor(kindTotal.kind),
              }))}
            />
          </div>
        </div>
      </section>

      <SectionHeader
        title="Assets and liabilities"
        action={
          <div className="section-header-actions">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDone}
                className="btn-primary dashboard-done-btn"
              >
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEdit}
                className="btn-secondary dashboard-edit-btn"
              >
                Edit
              </button>
            )}
            {!isEditing ? (
              <HeaderAddButton onClick={() => setCreateOpen(true)} />
            ) : null}
          </div>
        }
      />

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="dashboard-section-heading">Assets</h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToParentElement]}
            onDragEnd={(e) => handleKindDragEnd(e, "ASSET")}
          >
            <SortableContext
              items={sortedAssetCategories}
              strategy={verticalListSortingStrategy}
            >
              <div className="dashboard-grid">
                {sortedAssetCategories.map((category) => {
                  const orderedAssets = getOrderedAssets(category, "ASSET");
                  const assetIds = orderedAssets.map((a) => a.id);

                  return (
                    <SortableKindBlock
                      key={category}
                      id={category}
                      isEditing={isEditing}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="category-toggle"
                      >
                        <div className="category-toggle-label">
                          <div
                            className="category-dot"
                            style={{ background: getKindDotColor(category) }}
                          />
                          <span className="category-toggle-name">
                            {formatKindLabel(category)}
                          </span>
                        </div>
                        <div className="category-toggle-meta">
                          <span className="category-toggle-total">
                            {formatSensitiveCurrency(
                              sumDashboardValuesWithLiveDeltas(
                                grouped[category].filter(
                                  (a) => a.type === "ASSET",
                                ),
                                liveValueDeltas,
                              ),
                              baseCurrency,
                              shouldHideMoney,
                            )}
                          </span>
                          {!isEditing ? (
                            <DisclosureIcon open={openCategories[category]} />
                          ) : null}
                        </div>
                      </button>

                      {openCategories[category] ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          modifiers={[restrictToParentElement]}
                          onDragEnd={(e) => handleAssetDragEnd(e, category)}
                        >
                          <SortableContext
                            items={assetIds}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul className="category-items">
                              {orderedAssets.map((asset) => (
                                <SortableAssetRow
                                  key={asset.id}
                                  asset={asset}
                                  isEditing={isEditing}
                                  baseCurrency={baseCurrency}
                                  shouldHideMoney={shouldHideMoney}
                                  isAssetType={true}
                                  onEdit={setEditAssetId}
                                  brokerageAccountIds={brokerageAccountIdSet}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      ) : null}
                    </SortableKindBlock>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="space-y-4">
          <h3 className="dashboard-section-heading is-secondary">
            Liabilities
          </h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToParentElement]}
            onDragEnd={(e) => handleKindDragEnd(e, "LIABILITY")}
          >
            <SortableContext
              items={sortedLiabilityCategories}
              strategy={verticalListSortingStrategy}
            >
              <div className="dashboard-grid">
                {sortedLiabilityCategories.map((category) => {
                  const orderedAssets = getOrderedAssets(category, "LIABILITY");
                  const assetIds = orderedAssets.map((a) => a.id);

                  return (
                    <SortableKindBlock
                      key={category}
                      id={category}
                      isEditing={isEditing}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="category-toggle"
                      >
                        <div className="category-toggle-label">
                          <div
                            className="category-dot"
                            style={{ background: "var(--color-expense)" }}
                          />
                          <span className="category-toggle-name">
                            {formatKindLabel(category)}
                          </span>
                        </div>
                        <div className="category-toggle-meta">
                          <span className="category-toggle-total">
                            {formatSensitiveCurrency(
                              sumDashboardValuesWithLiveDeltas(
                                grouped[category].filter(
                                  (a) => a.type === "LIABILITY",
                                ),
                                liveValueDeltas,
                              ),
                              baseCurrency,
                              shouldHideMoney,
                            )}
                          </span>
                          {!isEditing ? (
                            <DisclosureIcon open={openCategories[category]} />
                          ) : null}
                        </div>
                      </button>

                      {openCategories[category] ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          modifiers={[restrictToParentElement]}
                          onDragEnd={(e) => handleAssetDragEnd(e, category)}
                        >
                          <SortableContext
                            items={assetIds}
                            strategy={verticalListSortingStrategy}
                          >
                            <ul className="category-items">
                              {orderedAssets.map((asset) => (
                                <SortableAssetRow
                                  key={asset.id}
                                  asset={asset}
                                  isEditing={isEditing}
                                  baseCurrency={baseCurrency}
                                  shouldHideMoney={shouldHideMoney}
                                  isAssetType={false}
                                  onEdit={setEditAssetId}
                                  brokerageAccountIds={brokerageAccountIdSet}
                                />
                              ))}
                            </ul>
                          </SortableContext>
                        </DndContext>
                      ) : null}
                    </SortableKindBlock>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <EditAssetModal
        assetId={editAssetId}
        open={Boolean(editAssetId)}
        onClose={() => setEditAssetId(null)}
      />

      <CreateAssetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}

import type { DashboardAssetResponse } from "@finhance/shared";

import { assetKindLabel, liabilityKindLabel } from "@/lib/labels";

export interface HoldingGroup {
  key: string;
  label: string;
  items: DashboardAssetResponse[];
  /** Sum of reporting-currency values; null when no item has a value. */
  total: number | null;
  hasMissingValues: boolean;
}

export function holdingValue(asset: DashboardAssetResponse): number | null {
  return asset.currentValue ?? asset.referenceValue ?? null;
}

function buildGroups(
  items: DashboardAssetResponse[],
  keyOf: (asset: DashboardAssetResponse) => string,
  labelOf: (asset: DashboardAssetResponse) => string,
  preferredOrder: string[],
): HoldingGroup[] {
  const groups = new Map<string, HoldingGroup>();

  for (const item of items) {
    const key = keyOf(item);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        label: labelOf(item),
        items: [],
        total: null,
        hasMissingValues: false,
      };
      groups.set(key, group);
    }

    group.items.push(item);
    const value = holdingValue(item);

    if (value === null) {
      group.hasMissingValues = true;
    } else {
      group.total = (group.total ?? 0) + value;
    }
  }

  const orderIndex = new Map(preferredOrder.map((key, index) => [key, index]));

  return [...groups.values()].sort((left, right) => {
    const leftIndex = orderIndex.get(left.key);
    const rightIndex = orderIndex.get(right.key);

    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }

    if (leftIndex !== undefined) {
      return -1;
    }

    if (rightIndex !== undefined) {
      return 1;
    }

    return (right.total ?? 0) - (left.total ?? 0);
  });
}

export interface DashboardHoldings {
  assetGroups: HoldingGroup[];
  liabilityGroups: HoldingGroup[];
}

export function deriveDashboardHoldings(
  assets: DashboardAssetResponse[],
  assetKindOrder: string[],
): DashboardHoldings {
  const assetItems = assets.filter((asset) => asset.type === "ASSET");
  const liabilityItems = assets.filter((asset) => asset.type === "LIABILITY");

  return {
    assetGroups: buildGroups(
      assetItems,
      (asset) => asset.kind ?? "UNASSIGNED",
      (asset) => assetKindLabel(asset.kind),
      assetKindOrder,
    ),
    liabilityGroups: buildGroups(
      liabilityItems,
      (asset) => asset.liabilityKind ?? "UNASSIGNED",
      (asset) => liabilityKindLabel(asset.liabilityKind),
      [],
    ),
  };
}

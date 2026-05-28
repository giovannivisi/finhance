import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ClipboardCheck,
  History,
  Import,
  Landmark,
  LayoutDashboard,
  ListChecks,
  PieChart,
  Repeat,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const PRIMARY_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/accounts", label: "Wallets", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
] as const;

export const SECONDARY_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/history", label: "History", icon: History },
  { href: "/brokerage", label: "Brokerage", icon: Landmark },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/review", label: "Monthly close", icon: ClipboardCheck },
  { href: "/categories", label: "Categories", icon: Tag },
  {
    href: "/expense-validation",
    label: "Expense validation",
    icon: ListChecks,
  },
  { href: "/import", label: "Import", icon: Import },
] as const;

export const DESKTOP_NAV_ITEMS: readonly AppNavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
] as const;

export function normalizeNavigationPath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path === "/") {
    return path;
  }

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isRedundantTabNavigation(input: {
  currentPath: string;
  targetPath: string;
  pendingPath?: string | null;
}): boolean {
  const currentPath = normalizeNavigationPath(input.currentPath);
  const targetPath = normalizeNavigationPath(input.targetPath);
  const pendingPath = normalizeNavigationPath(input.pendingPath ?? null);

  if (!currentPath || !targetPath) {
    return false;
  }

  return currentPath === targetPath || pendingPath === targetPath;
}

export function isActivePath(
  currentPath: string | null,
  targetPath: string,
): boolean {
  const normalizedCurrentPath = normalizeNavigationPath(currentPath);
  const normalizedTargetPath = normalizeNavigationPath(targetPath);

  if (!normalizedCurrentPath || !normalizedTargetPath) {
    return false;
  }

  if (normalizedTargetPath === "/") {
    return normalizedCurrentPath === "/";
  }

  return normalizedCurrentPath.startsWith(normalizedTargetPath);
}

export function getNavigationTitle(path: string | null): string {
  const normalizedPath = normalizeNavigationPath(path);

  if (!normalizedPath || normalizedPath === "/" || normalizedPath === "/dashboard") {
    return "Dashboard";
  }

  if (normalizedPath === "/setup") {
    return "Setup";
  }

  const item = DESKTOP_NAV_ITEMS.find((candidate) => candidate.href === normalizedPath);
  return item?.label ?? "Loading";
}

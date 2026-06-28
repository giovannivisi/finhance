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

const PREFETCH_NAV_PATHS = new Set<string>([
  ...DESKTOP_NAV_ITEMS.map((item) => item.href),
  "/setup",
]);

const ROUTE_SUCCESSOR_PREFETCH_PATHS: Record<string, readonly string[]> = {
  "/dashboard": ["/transactions", "/setup", "/review", "/analytics"],
  "/transactions": ["/accounts"],
  "/accounts": ["/analytics", "/brokerage"],
  "/analytics": ["/review", "/budgets", "/setup"],
  "/review": ["/accounts", "/budgets", "/recurring", "/analytics"],
  "/setup": ["/accounts", "/import", "/categories"],
  "/import": ["/review", "/analytics", "/budgets"],
  "/budgets": ["/review", "/analytics"],
  "/brokerage": ["/accounts"],
} as const;

const MORE_MENU_EXPANDED_PREFETCH_PATHS = ["/history", "/review"] as const;
const DEFAULT_RETURN_PREFETCH_PATH = "/dashboard";
const PUBLIC_AUTH_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/account-deleted",
]);

export function shouldPrefetchNavPath(path: string): boolean {
  return PREFETCH_NAV_PATHS.has(normalizeNavigationPath(path) ?? path);
}

export function getRouteSuccessorPrefetchPaths(
  path: string | null,
): readonly string[] {
  const normalizedPath = normalizeNavigationPath(path);

  if (!normalizedPath || normalizedPath === "/") {
    return ROUTE_SUCCESSOR_PREFETCH_PATHS["/dashboard"];
  }

  const basePaths = ROUTE_SUCCESSOR_PREFETCH_PATHS[normalizedPath] ?? [];

  if (
    normalizedPath === DEFAULT_RETURN_PREFETCH_PATH ||
    basePaths.includes(DEFAULT_RETURN_PREFETCH_PATH)
  ) {
    return basePaths;
  }

  if (basePaths.length === 0) {
    return [DEFAULT_RETURN_PREFETCH_PATH];
  }

  return [basePaths[0]!, DEFAULT_RETURN_PREFETCH_PATH, ...basePaths.slice(1)];
}

export function getExpandedMoreMenuPrefetchPaths(): readonly string[] {
  return MORE_MENU_EXPANDED_PREFETCH_PATHS;
}

export function normalizeNavigationPath(path: string | null): string | null {
  if (!path) {
    return null;
  }

  if (path === "/") {
    return path;
  }

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isPublicAuthPath(path: string | null): boolean {
  const normalizedPath = normalizeNavigationPath(path);
  return normalizedPath ? PUBLIC_AUTH_PATHS.has(normalizedPath) : false;
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

  if (
    !normalizedPath ||
    normalizedPath === "/" ||
    normalizedPath === "/dashboard"
  ) {
    return "Dashboard";
  }

  if (normalizedPath === "/setup") {
    return "Setup";
  }

  const item = DESKTOP_NAV_ITEMS.find(
    (candidate) => candidate.href === normalizedPath,
  );
  return item?.label ?? "Loading";
}

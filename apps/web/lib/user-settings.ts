import type {
  UserSettingsResponse,
  UserStartPage,
} from "@finhance/shared/users";
import { getReportingCurrencyPickerOptions } from "@lib/currency-ui";
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  USER_START_PAGE_VALUES,
} from "@finhance/shared/users";

export const START_PAGE_META: Record<
  UserStartPage,
  { href: string; label: string }
> = {
  DASHBOARD: { href: "/dashboard", label: "Dashboard" },
  ACTIVITY: { href: "/transactions", label: "Activity" },
  WALLETS: { href: "/accounts", label: "Wallets" },
  BROKERAGE: { href: "/brokerage", label: "Brokerage" },
  BUDGETS: { href: "/budgets", label: "Budgets" },
  MONTHLY_CLOSE: { href: "/review", label: "Monthly close" },
  ANALYTICS: { href: "/analytics", label: "Analytics" },
};

export const START_PAGE_OPTIONS = USER_START_PAGE_VALUES.map((value) => ({
  value,
  label: START_PAGE_META[value].label,
})) satisfies Array<{ value: UserStartPage; label: string }>;

export const REPORTING_CURRENCY_OPTIONS = getReportingCurrencyPickerOptions();

export function getStartPageHref(startPage: UserStartPage): string {
  return START_PAGE_META[startPage].href;
}

export function getDefaultUserSettings(): UserSettingsResponse {
  return { ...DEFAULT_USER_SETTINGS };
}

export function mergeUserSettings(
  value: Partial<UserSettingsResponse> | null | undefined,
): UserSettingsResponse {
  return normalizeUserSettings(value);
}

import { isSupportedReportingCurrencyCode } from "#currencies";

export const USER_START_PAGE_VALUES = [
  "DASHBOARD",
  "ACTIVITY",
  "WALLETS",
  "BROKERAGE",
  "BUDGETS",
  "MONTHLY_CLOSE",
  "ANALYTICS",
] as const;

export type UserStartPage = (typeof USER_START_PAGE_VALUES)[number];

export interface UserSettings {
  showTransactionTimes: boolean;
  startPage: UserStartPage;
  reportingCurrency: string;
}

export interface UserSettingsResponse extends UserSettings {}

export interface UpdateUserSettingsRequest {
  showTransactionTimes?: boolean;
  startPage?: UserStartPage;
  reportingCurrency?: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  showTransactionTimes: true,
  startPage: "DASHBOARD",
  reportingCurrency: "EUR",
};

export function isUserStartPage(value: unknown): value is UserStartPage {
  return (
    typeof value === "string" &&
    USER_START_PAGE_VALUES.includes(value as UserStartPage)
  );
}

export function normalizeUserSettings(
  value: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    showTransactionTimes:
      typeof value?.showTransactionTimes === "boolean"
        ? value.showTransactionTimes
        : DEFAULT_USER_SETTINGS.showTransactionTimes,
    startPage: isUserStartPage(value?.startPage)
      ? value.startPage
      : DEFAULT_USER_SETTINGS.startPage,
    reportingCurrency:
      typeof value?.reportingCurrency === "string" &&
      isSupportedReportingCurrencyCode(value.reportingCurrency)
        ? value.reportingCurrency.trim().toUpperCase()
        : DEFAULT_USER_SETTINGS.reportingCurrency,
  };
}

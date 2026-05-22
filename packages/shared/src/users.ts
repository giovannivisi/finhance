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
}

export interface UserSettingsResponse extends UserSettings {}

export interface UpdateUserSettingsRequest {
  showTransactionTimes?: boolean;
  startPage?: UserStartPage;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  showTransactionTimes: true,
  startPage: "DASHBOARD",
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
  };
}

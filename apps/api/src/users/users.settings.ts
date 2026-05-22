import type { UserSettingsResponse, UserStartPage } from '@finhance/shared';

export const USER_START_PAGE_VALUES = [
  'DASHBOARD',
  'ACTIVITY',
  'WALLETS',
  'BROKERAGE',
  'BUDGETS',
  'MONTHLY_CLOSE',
  'ANALYTICS',
] as const satisfies readonly UserStartPage[];

export const DEFAULT_USER_SETTINGS: UserSettingsResponse = {
  showTransactionTimes: true,
  startPage: 'DASHBOARD',
};

export function isUserStartPage(value: unknown): value is UserStartPage {
  return (
    typeof value === 'string' &&
    USER_START_PAGE_VALUES.includes(value as UserStartPage)
  );
}

export function normalizeUserSettings(
  value: Partial<UserSettingsResponse> | null | undefined,
): UserSettingsResponse {
  return {
    showTransactionTimes:
      typeof value?.showTransactionTimes === 'boolean'
        ? value.showTransactionTimes
        : DEFAULT_USER_SETTINGS.showTransactionTimes,
    startPage: isUserStartPage(value?.startPage)
      ? value.startPage
      : DEFAULT_USER_SETTINGS.startPage,
  };
}

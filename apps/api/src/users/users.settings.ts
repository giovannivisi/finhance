import { isSupportedReportingCurrencyCode } from '@/common/catalogues';
import type { UserSettings, UserStartPage } from '@finhance/shared';

export const USER_START_PAGE_VALUES = [
  'DASHBOARD',
  'ACTIVITY',
  'WALLETS',
  'BROKERAGE',
  'BUDGETS',
  'MONTHLY_CLOSE',
  'ANALYTICS',
] as const satisfies readonly UserStartPage[];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  showTransactionTimes: true,
  startPage: 'DASHBOARD',
  reportingCurrency: 'EUR',
  cloudParserEnabled: false,
};

export function isUserStartPage(value: unknown): value is UserStartPage {
  return (
    typeof value === 'string' &&
    USER_START_PAGE_VALUES.includes(value as UserStartPage)
  );
}

export function normalizeUserSettings(
  value: Partial<UserSettings> | null | undefined,
): UserSettings {
  return {
    showTransactionTimes:
      typeof value?.showTransactionTimes === 'boolean'
        ? value.showTransactionTimes
        : DEFAULT_USER_SETTINGS.showTransactionTimes,
    startPage: isUserStartPage(value?.startPage)
      ? value.startPage
      : DEFAULT_USER_SETTINGS.startPage,
    reportingCurrency:
      typeof value?.reportingCurrency === 'string' &&
      isSupportedReportingCurrencyCode(value.reportingCurrency)
        ? value.reportingCurrency.trim().toUpperCase()
        : DEFAULT_USER_SETTINGS.reportingCurrency,
    cloudParserEnabled:
      typeof value?.cloudParserEnabled === 'boolean'
        ? value.cloudParserEnabled
        : DEFAULT_USER_SETTINGS.cloudParserEnabled,
  };
}

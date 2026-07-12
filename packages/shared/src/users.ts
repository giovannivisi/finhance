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
  cloudParserEnabled: boolean;
}

export interface UserSettingsResponse extends UserSettings {
  /** Whether the deployment has a cloud parsing provider configured. */
  cloudParserAvailable: boolean;
  /** Current cloud-parser consent text version, when cloud parsing is available. */
  cloudParserConsentVersion: string | null;
}

export interface UpdateUserSettingsRequest {
  showTransactionTimes?: boolean;
  startPage?: UserStartPage;
  reportingCurrency?: string;
  cloudParserEnabled?: boolean;
  /** Version of the separately presented cloud-parser consent text. */
  cloudParserConsentVersion?: string;
}

export interface UserPasskeyResponse {
  credentialId: string;
  createdAt: string;
  lastUsedAt: string | null;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports: string | null;
}

export interface DeleteUserPasskeyRequest {
  credentialId?: string;
}

export type ConnectedAccountProvider = "google" | "github";

export interface ConnectedAccountResponse {
  id: string;
  provider: ConnectedAccountProvider;
  providerLabel: string;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  providerDisplayName: string | null;
  createdAt: string | null;
  isPrimaryEmail: boolean;
}

export interface UserIdentityResponse {
  email: string | null;
  name: string | null;
  image: string | null;
  connectedAccounts: ConnectedAccountResponse[];
}

export interface DeleteConnectedAccountRequest {
  accountId?: string;
}

export interface StartMobileProviderLinkRequest {
  provider?: ConnectedAccountProvider;
  /** SHA-256 PKCE challenge encoded as lowercase hexadecimal. */
  challenge?: string;
  /** Allowlisted native deep-link callback supplied by the app. */
  redirect?: string;
}

export interface StartMobileProviderLinkResponse {
  authorizationUrl: string;
}

export interface ConfirmMobileProviderLinkRequest {
  code?: string;
  verifier?: string;
}

export interface ConfirmMobileProviderLinkResponse {
  connectedAccount: ConnectedAccountResponse;
}

export interface DeleteUserAccountRequest {
  email: string;
}

export const RECENT_AUTH_REQUIRED_CODE = "RECENT_AUTH_REQUIRED";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  showTransactionTimes: true,
  startPage: "DASHBOARD",
  reportingCurrency: "EUR",
  cloudParserEnabled: false,
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
    cloudParserEnabled:
      typeof value?.cloudParserEnabled === "boolean"
        ? value.cloudParserEnabled
        : DEFAULT_USER_SETTINGS.cloudParserEnabled,
  };
}

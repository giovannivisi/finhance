import * as SecureStore from "expo-secure-store";

const LEGACY_MOBILE_TOKEN_KEY = "finhance.mobileToken";
const MOBILE_TOKEN_KEY = "finhance.mobileToken.deviceOnly.v1";

const MOBILE_TOKEN_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export interface HostedSessionCredentials {
  /** Short-lived bearer used for proxy requests. */
  token: string;
  /** Opaque rotated credential kept only in SecureStore. */
  refreshToken: string;
}

export function isHostedSessionCredentials(
  value: unknown,
): value is HostedSessionCredentials {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { token, refreshToken } = value as {
    token?: unknown;
    refreshToken?: unknown;
  };

  return (
    typeof token === "string" &&
    Boolean(token.trim()) &&
    typeof refreshToken === "string" &&
    Boolean(refreshToken.trim())
  );
}

function parseHostedSessionCredentials(
  stored: string,
): HostedSessionCredentials | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }

  return isHostedSessionCredentials(parsed) ? parsed : null;
}

export async function readHostedSessionCredentials(): Promise<HostedSessionCredentials | null> {
  const current = await SecureStore.getItemAsync(
    MOBILE_TOKEN_KEY,
    MOBILE_TOKEN_STORE_OPTIONS,
  );

  if (current) {
    // Remove any stale migratable copy even when the device-only key already
    // exists, so a partially completed older migration cannot leave a usable
    // bearer credential in backups.
    await SecureStore.deleteItemAsync(
      LEGACY_MOBILE_TOKEN_KEY,
      MOBILE_TOKEN_STORE_OPTIONS,
    );
    return parseHostedSessionCredentials(current);
  }

  const legacy = await SecureStore.getItemAsync(
    LEGACY_MOBILE_TOKEN_KEY,
    MOBILE_TOKEN_STORE_OPTIONS,
  );

  if (!legacy) {
    return null;
  }

  const credentials = parseHostedSessionCredentials(legacy);

  // The old key used iOS's migratable WHEN_UNLOCKED class. Delete it before
  // creating the device-only replacement because updating an existing
  // keychain item does not change its accessibility class.
  await SecureStore.deleteItemAsync(
    LEGACY_MOBILE_TOKEN_KEY,
    MOBILE_TOKEN_STORE_OPTIONS,
  );

  if (!credentials) {
    return null;
  }

  await SecureStore.setItemAsync(
    MOBILE_TOKEN_KEY,
    JSON.stringify(credentials),
    MOBILE_TOKEN_STORE_OPTIONS,
  );

  return credentials;
}

export async function writeHostedSessionCredentials(
  credentials: HostedSessionCredentials | null,
): Promise<void> {
  await SecureStore.deleteItemAsync(
    LEGACY_MOBILE_TOKEN_KEY,
    MOBILE_TOKEN_STORE_OPTIONS,
  );

  if (credentials) {
    await SecureStore.setItemAsync(
      MOBILE_TOKEN_KEY,
      JSON.stringify(credentials),
      MOBILE_TOKEN_STORE_OPTIONS,
    );
    return;
  }

  await SecureStore.deleteItemAsync(
    MOBILE_TOKEN_KEY,
    MOBILE_TOKEN_STORE_OPTIONS,
  );
}

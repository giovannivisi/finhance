import {
  createLegacyPasscodeRequiredRecord,
  parseAppLockRecord,
  type AppLockRecord,
} from "./app-lock";

export const APP_LOCK_SECURE_STORE_KEY = "finhance.appLock.v1";
export const LEGACY_APP_LOCK_ASYNC_STORAGE_KEY = "finhance.appLock";

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type AppLockLoadResult =
  | { state: "empty" }
  | { state: "record"; record: AppLockRecord }
  | { state: "invalid-record" };

export interface AppLockStore {
  load(): Promise<AppLockLoadResult>;
  save(record: AppLockRecord): Promise<void>;
  remove(): Promise<void>;
  /** Retire the legacy boolean after a passcode has been configured or removed. */
  clearLegacyFlag(): Promise<void>;
}

export function createAppLockStore(
  secureStorage: AsyncKeyValueStorage,
  legacyStorage: AsyncKeyValueStorage,
  now: () => number = Date.now,
): AppLockStore {
  return {
    async load(): Promise<AppLockLoadResult> {
      const rawRecord = await secureStorage.getItem(APP_LOCK_SECURE_STORE_KEY);

      if (rawRecord !== null) {
        const record = parseStoredRecord(rawRecord);
        return record ? { state: "record", record } : { state: "invalid-record" };
      }

      const legacyAppLock = await legacyStorage.getItem(
        LEGACY_APP_LOCK_ASYNC_STORAGE_KEY,
      );

      if (legacyAppLock !== "true") {
        return { state: "empty" };
      }

      // Do not clear the old flag yet. The current app stays protected by the
      // legacy setting until a passcode record has been written successfully.
      const record = createLegacyPasscodeRequiredRecord(now());
      await secureStorage.setItem(
        APP_LOCK_SECURE_STORE_KEY,
        JSON.stringify(record),
      );
      return { state: "record", record };
    },

    async save(record: AppLockRecord): Promise<void> {
      await secureStorage.setItem(
        APP_LOCK_SECURE_STORE_KEY,
        JSON.stringify(record),
      );
    },

    async remove(): Promise<void> {
      await secureStorage.removeItem(APP_LOCK_SECURE_STORE_KEY);
    },

    async clearLegacyFlag(): Promise<void> {
      await legacyStorage.removeItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY);
    },
  };
}

function parseStoredRecord(rawRecord: string): AppLockRecord | null {
  try {
    return parseAppLockRecord(JSON.parse(rawRecord));
  } catch {
    return null;
  }
}

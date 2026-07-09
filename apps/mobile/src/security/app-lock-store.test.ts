import { describe, expect, it } from "vitest";

import {
  PASSCODE_LOCKOUT_POLICY,
  createConfiguredAppLockRecord,
  recordFailedPasscodeAttempt,
} from "./app-lock";
import {
  APP_LOCK_SECURE_STORE_KEY,
  LEGACY_APP_LOCK_ASYNC_STORAGE_KEY,
  createAppLockStore,
  type AsyncKeyValueStorage,
} from "./app-lock-store";

class MemoryStorage implements AsyncKeyValueStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("app-lock storage", () => {
  it("migrates the legacy appLock=true preference without dropping protection", async () => {
    const secureStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    await legacyStorage.setItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY, "true");
    const store = createAppLockStore(secureStorage, legacyStorage, () => 123);

    const loaded = await store.load();

    expect(loaded).toEqual({
      state: "record",
      record: {
        version: 1,
        state: "legacy-passcode-required",
        biometricEnabled: true,
        createdAt: 123,
        updatedAt: 123,
      },
    });
    expect(await legacyStorage.getItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY)).toBe(
      "true",
    );
    expect(await secureStorage.getItem(APP_LOCK_SECURE_STORE_KEY)).not.toBeNull();
  });

  it("only retires the legacy flag when requested after passcode setup", async () => {
    const secureStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    const store = createAppLockStore(secureStorage, legacyStorage);
    await legacyStorage.setItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY, "true");

    await store.clearLegacyFlag();

    expect(await legacyStorage.getItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY)).toBeNull();
  });

  it("fails closed when an existing secure record is malformed", async () => {
    const secureStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    await secureStorage.setItem(APP_LOCK_SECURE_STORE_KEY, "not-json");
    await legacyStorage.setItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY, "true");
    const store = createAppLockStore(secureStorage, legacyStorage);

    await expect(store.load()).resolves.toEqual({ state: "invalid-record" });
  });

  it("prefers an existing secure record to a stale legacy preference", async () => {
    const secureStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    const record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt: "0123456789abcdef0123456789abcdef",
      now: 10,
      deriveHash: async () => "a".repeat(64),
    });
    await secureStorage.setItem(APP_LOCK_SECURE_STORE_KEY, JSON.stringify(record));
    await legacyStorage.setItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY, "true");
    const store = createAppLockStore(secureStorage, legacyStorage);

    await expect(store.load()).resolves.toEqual({ state: "record", record });
  });

  it("retains passcode lockout state across an app restart", async () => {
    const secureStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    const store = createAppLockStore(secureStorage, legacyStorage);
    let record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt: "0123456789abcdef0123456789abcdef",
      now: 1_000,
      deriveHash: async () => "a".repeat(64),
    });

    for (let index = 0; index < PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout; index += 1) {
      record = recordFailedPasscodeAttempt(record, 2_000 + index);
    }
    await store.save(record);

    await expect(store.load()).resolves.toEqual({ state: "record", record });
  });
});

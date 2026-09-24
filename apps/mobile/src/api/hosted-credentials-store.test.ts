import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readHostedSessionCredentials,
  writeHostedSessionCredentials,
} from "./hosted-credentials-store";

const { deleteItemAsyncMock, getItemAsyncMock, setItemAsyncMock } = vi.hoisted(
  () => ({
    deleteItemAsyncMock: vi.fn(),
    getItemAsyncMock: vi.fn(),
    setItemAsyncMock: vi.fn(),
  }),
);

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  deleteItemAsync: deleteItemAsyncMock,
  getItemAsync: getItemAsyncMock,
  setItemAsync: setItemAsyncMock,
}));

const OPTIONS = { keychainAccessible: "device-only" };
const CREDENTIALS = {
  token: "access-token",
  refreshToken: "refresh-token",
};

describe("hosted credential storage", () => {
  beforeEach(() => {
    deleteItemAsyncMock.mockReset();
    getItemAsyncMock.mockReset();
    setItemAsyncMock.mockReset();
    deleteItemAsyncMock.mockResolvedValue(undefined);
    setItemAsyncMock.mockResolvedValue(undefined);
  });

  it("stores hosted credentials under a device-only key", async () => {
    await writeHostedSessionCredentials(CREDENTIALS);

    expect(deleteItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken",
      OPTIONS,
    );
    expect(setItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken.deviceOnly.v1",
      JSON.stringify(CREDENTIALS),
      OPTIONS,
    );
  });

  it("removes a stale legacy copy when the device-only key exists", async () => {
    getItemAsyncMock.mockResolvedValueOnce(JSON.stringify(CREDENTIALS));

    await expect(readHostedSessionCredentials()).resolves.toEqual(CREDENTIALS);

    expect(deleteItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken",
      OPTIONS,
    );
    expect(getItemAsyncMock).toHaveBeenCalledTimes(1);
    expect(setItemAsyncMock).not.toHaveBeenCalled();
  });

  it("migrates legacy credentials by deleting the migratable item first", async () => {
    getItemAsyncMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(CREDENTIALS));

    await expect(readHostedSessionCredentials()).resolves.toEqual(CREDENTIALS);

    expect(getItemAsyncMock).toHaveBeenNthCalledWith(
      1,
      "finhance.mobileToken.deviceOnly.v1",
      OPTIONS,
    );
    expect(deleteItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken",
      OPTIONS,
    );
    expect(deleteItemAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
      setItemAsyncMock.mock.invocationCallOrder[0]!,
    );
    expect(setItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken.deviceOnly.v1",
      JSON.stringify(CREDENTIALS),
      OPTIONS,
    );
  });

  it("removes invalid legacy credentials without migrating them", async () => {
    getItemAsyncMock.mockResolvedValueOnce(null).mockResolvedValueOnce("bad");

    await expect(readHostedSessionCredentials()).resolves.toBeNull();

    expect(deleteItemAsyncMock).toHaveBeenCalledWith(
      "finhance.mobileToken",
      OPTIONS,
    );
    expect(setItemAsyncMock).not.toHaveBeenCalled();
  });
});

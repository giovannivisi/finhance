import { describe, expect, it, vi } from "vitest";
import { RECENT_AUTH_REQUIRED_CODE } from "@finhance/shared/users";

import { ApiError } from "./client";
import { formatPasskeyTitle, isRecentAuthError } from "./passkeys";

vi.mock("react-native-passkeys", () => ({
  create: vi.fn(),
}));

describe("mobile passkey helpers", () => {
  it("formats passkey titles", () => {
    expect(
      formatPasskeyTitle({
        credentialId: "credential",
        createdAt: "2026-07-08T10:00:00.000Z",
        lastUsedAt: null,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        transports: null,
      }),
    ).toBe("Multi device passkey (backed up)");
  });

  it("detects recent-auth errors", () => {
    expect(
      isRecentAuthError(
        new ApiError("Confirm it is you.", {
          status: 403,
          code: RECENT_AUTH_REQUIRED_CODE,
        }),
      ),
    ).toBe(true);
    expect(isRecentAuthError(new Error("nope"))).toBe(false);
  });
});

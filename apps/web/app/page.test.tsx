import { describe, expect, it, vi } from "vitest";
import Home from "@/page";

const { redirectMock, settingsMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  settingsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@lib/server-user-settings", () => ({
  getUserSettingsOrDefaults: settingsMock,
}));

describe("Home start page redirect", () => {
  it("redirects to the configured start page", async () => {
    settingsMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "ANALYTICS",
    });

    await Home();

    expect(redirectMock).toHaveBeenCalledWith("/analytics");
  });
});

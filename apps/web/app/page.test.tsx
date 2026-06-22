import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/page";

const { authMock, hostedModeMock, redirectMock, settingsMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    hostedModeMock: vi.fn(),
    redirectMock: vi.fn(),
    settingsMock: vi.fn(),
  }),
);

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/AuthPageClient", () => ({
  default: ({ callbackUrl, mode }: { callbackUrl: string; mode: string }) => (
    <div>
      Auth page {mode} {callbackUrl}
    </div>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@lib/server-user-settings", () => ({
  getUserSettingsOrDefaults: settingsMock,
}));

describe("Home start page redirect", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(false);
    redirectMock.mockReset();
    settingsMock.mockReset();
  });

  it("redirects to the configured start page", async () => {
    settingsMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "ANALYTICS",
    });

    await Home();

    expect(redirectMock).toHaveBeenCalledWith("/analytics");
  });

  it("renders the hosted landing page when no session exists", async () => {
    hostedModeMock.mockReturnValue(true);

    render((await Home()) as React.ReactElement);

    expect(
      screen.getByText("Auth page landing /dashboard"),
    ).toBeInTheDocument();
    expect(settingsMock).not.toHaveBeenCalled();
  });

  it("redirects hosted signed-in users to their configured start page", async () => {
    hostedModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    settingsMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "BROKERAGE",
    });

    await Home();

    expect(redirectMock).toHaveBeenCalledWith("/brokerage");
  });
});

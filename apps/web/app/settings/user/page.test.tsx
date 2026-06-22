import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSettingsPage from "@/settings/user/page";

const { apiMock, hostedModeMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  hostedModeMock: vi.fn(),
}));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/UserSettingsPageClient", () => ({
  default: ({
    canManagePasskeys,
    canSignOutMobileDevices,
    initialSettings,
  }: {
    canManagePasskeys?: boolean;
    canSignOutMobileDevices?: boolean;
    initialSettings: {
      showTransactionTimes: boolean;
      startPage: string;
      reportingCurrency: string;
    };
  }) => (
    <div>
      User settings client {String(initialSettings.showTransactionTimes)}{" "}
      {initialSettings.startPage} {initialSettings.reportingCurrency}
      {canSignOutMobileDevices ? " mobile hosted" : " mobile local"}
      {canManagePasskeys ? " passkeys hosted" : " passkeys local"}
    </div>
  ),
}));

describe("UserSettingsPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(false);
  });

  it("renders the user settings client with current values", async () => {
    apiMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "DASHBOARD",
      reportingCurrency: "EUR",
    });

    render(await UserSettingsPage());

    expect(
      screen.getByText(
        "User settings client true DASHBOARD EUR mobile local passkeys local",
      ),
    ).toBeInTheDocument();
  });

  it("enables hosted security controls in hosted mode", async () => {
    hostedModeMock.mockReturnValue(true);
    apiMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "DASHBOARD",
      reportingCurrency: "EUR",
    });

    render(await UserSettingsPage());

    expect(
      screen.getByText(
        "User settings client true DASHBOARD EUR mobile hosted passkeys hosted",
      ),
    ).toBeInTheDocument();
  });

  it("renders an inline error when settings cannot be loaded", async () => {
    apiMock.mockRejectedValue(new Error("API down."));

    render(await UserSettingsPage());

    expect(
      screen.getByText("The web app could not reach the API."),
    ).toBeInTheDocument();
    expect(screen.getByText("API down.")).toBeInTheDocument();
  });
});

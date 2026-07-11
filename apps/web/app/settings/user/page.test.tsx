import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSettingsPage from "@/settings/user/page";

const { apiMock, authMock, getUserIdentityForUserMock, hostedModeMock } =
  vi.hoisted(() => ({
    apiMock: vi.fn(),
    authMock: vi.fn(),
    getUserIdentityForUserMock: vi.fn(),
    hostedModeMock: vi.fn(),
  }));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/connected-accounts", () => ({
  getUserIdentityForUser: getUserIdentityForUserMock,
}));

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/UserSettingsPageClient", () => ({
  default: ({
    canManagePasskeys,
    canManageConnectedAccounts,
    canSignOutMobileDevices,
    identity,
    initialSettings,
  }: {
    canManagePasskeys?: boolean;
    canManageConnectedAccounts?: boolean;
    canSignOutMobileDevices?: boolean;
    identity?: { email: string | null } | null;
    initialSettings: {
      showTransactionTimes: boolean;
      startPage: string;
      reportingCurrency: string;
    };
  }) => (
    <div>
      User settings client {String(initialSettings.showTransactionTimes)}{" "}
      {initialSettings.startPage} {initialSettings.reportingCurrency}
      {identity?.email ? ` ${identity.email}` : " no identity"}
      {canSignOutMobileDevices ? " mobile hosted" : " mobile local"}
      {canManageConnectedAccounts ? " accounts hosted" : " accounts local"}
      {canManagePasskeys ? " passkeys hosted" : " passkeys local"}
    </div>
  ),
}));

describe("UserSettingsPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    getUserIdentityForUserMock.mockReset();
    getUserIdentityForUserMock.mockResolvedValue(null);
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
        "User settings client true DASHBOARD EUR no identity mobile local accounts local passkeys local",
      ),
    ).toBeInTheDocument();
  });

  it("enables hosted security controls in hosted mode", async () => {
    hostedModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getUserIdentityForUserMock.mockResolvedValue({
      email: "person@example.com",
      name: "Person",
      image: null,
      connectedAccounts: [],
    });
    apiMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "DASHBOARD",
      reportingCurrency: "EUR",
    });

    render(await UserSettingsPage());

    expect(
      screen.getByText(
        "User settings client true DASHBOARD EUR person@example.com mobile hosted accounts hosted passkeys hosted",
      ),
    ).toBeInTheDocument();
    expect(getUserIdentityForUserMock).toHaveBeenCalledWith("user-1");
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

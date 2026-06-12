import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSettingsPage from "@/settings/user/page";

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock("@lib/server-api", () => ({
  api: apiMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: () => false,
}));

vi.mock("@components/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@components/UserSettingsPageClient", () => ({
  default: ({
    initialSettings,
  }: {
    initialSettings: {
      showTransactionTimes: boolean;
      startPage: string;
      reportingCurrency: string;
    };
  }) => (
    <div>
      User settings client {String(initialSettings.showTransactionTimes)}{" "}
      {initialSettings.startPage} {initialSettings.reportingCurrency}
    </div>
  ),
}));

describe("UserSettingsPage", () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it("renders the user settings client with current values", async () => {
    apiMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "DASHBOARD",
      reportingCurrency: "EUR",
    });

    render(await UserSettingsPage());

    expect(
      screen.getByText("User settings client true DASHBOARD EUR"),
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

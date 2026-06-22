import type React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/login/page";

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

vi.mock("@lib/server-user-settings", () => ({
  getUserSettingsOrDefaults: settingsMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
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

describe("LoginPage", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    redirectMock.mockReset();
    settingsMock.mockReset();
  });

  it("redirects away outside hosted mode", async () => {
    hostedModeMock.mockReturnValue(false);

    await LoginPage({});

    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(authMock).not.toHaveBeenCalled();
  });

  it("renders hosted login with a safe callback url", async () => {
    render(
      (await LoginPage({
        searchParams: Promise.resolve({
          callbackUrl: "/review?month=2026-05",
        }),
      })) as React.ReactElement,
    );

    expect(
      screen.getByText("Auth page login /review?month=2026-05"),
    ).toBeInTheDocument();
  });

  it("falls back when the callback url is external", async () => {
    render(
      (await LoginPage({
        searchParams: Promise.resolve({
          callbackUrl: "https://attacker.example/review",
        }),
      })) as React.ReactElement,
    );

    expect(screen.getByText("Auth page login /dashboard")).toBeInTheDocument();
  });

  it("redirects signed-in users to their start page", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    settingsMock.mockResolvedValue({
      showTransactionTimes: true,
      startPage: "MONTHLY_CLOSE",
    });

    await LoginPage({});

    expect(redirectMock).toHaveBeenCalledWith("/review");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserSettingsPageClient from "@components/UserSettingsPageClient";
import { apiMutation } from "@lib/api";

const { signInWithOAuthMock, signInWithPasskeyMock } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn(),
  signInWithPasskeyMock: vi.fn(),
}));

const refreshMock = vi.fn();

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
}));

vi.mock("next-auth/webauthn", () => ({
  signIn: signInWithPasskeyMock,
}));

vi.mock("next-auth/react", () => ({
  signIn: signInWithOAuthMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockedApiMutation = vi.mocked(apiMutation);

describe("UserSettingsPageClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockedApiMutation.mockReset();
    refreshMock.mockReset();
    signInWithOAuthMock.mockReset();
    signInWithOAuthMock.mockResolvedValue(undefined);
    signInWithPasskeyMock.mockReset();
    signInWithPasskeyMock.mockResolvedValue({});
  });

  it("renders the current settings and saves updates", async () => {
    const user = userEvent.setup();
    mockedApiMutation.mockResolvedValue({
      showTransactionTimes: false,
      startPage: "BROKERAGE",
      reportingCurrency: "USD",
    });

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
      />,
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByLabelText("Open this page first")).toHaveValue(
      "DASHBOARD",
    );

    await user.click(screen.getByRole("checkbox"));
    await user.selectOptions(
      screen.getByLabelText("Open this page first"),
      "BROKERAGE",
    );
    await user.click(
      screen.getByRole("button", { name: /save user settings/i }),
    );

    await waitFor(() => {
      expect(mockedApiMutation).toHaveBeenCalledWith("/users/me/settings", {
        method: "PATCH",
        body: JSON.stringify({
          showTransactionTimes: false,
          startPage: "BROKERAGE",
          reportingCurrency: "EUR",
        }),
      });
    });

    expect(await screen.findByText("User settings saved.")).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("hides the mobile sign-out section outside hosted mode", () => {
    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /sign out mobile devices/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add passkey/i }),
    ).not.toBeInTheDocument();
  });

  it("signs out mobile devices after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <UserSettingsPageClient
          initialSettings={{
            showTransactionTimes: true,
            startPage: "DASHBOARD",
            reportingCurrency: "EUR",
          }}
          canSignOutMobileDevices
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /sign out mobile devices/i }),
      );
      await user.click(
        screen.getByRole("button", { name: /sign out devices/i }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith("/api/mobile/sessions", {
          method: "DELETE",
        });
      });

      expect(
        await screen.findByText("All mobile devices have been signed out."),
      ).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders identity and starts provider linking", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "account-1",
          provider: "google",
          providerLabel: "Google",
          providerEmail: "person@example.com",
          providerEmailVerified: true,
          providerDisplayName: "Person",
          createdAt: "2026-07-09T10:00:00.000Z",
          isPrimaryEmail: true,
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
        identity={{
          email: "person@example.com",
          name: "Person",
          image: null,
          connectedAccounts: [],
        }}
        canManageConnectedAccounts
      />,
    );

    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(await screen.findByText("Google · Person")).toBeInTheDocument();
    expect(screen.getByText("Primary email")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /connect github/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/connected-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github" }),
    });
    expect(signInWithOAuthMock).toHaveBeenCalledWith("github", {
      redirectTo: "/settings/user",
    });
  });

  it("removes connected accounts after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "account-1",
            provider: "github",
            providerLabel: "GitHub",
            providerEmail: "person@example.com",
            providerEmailVerified: true,
            providerDisplayName: "person",
            createdAt: "2026-07-09T10:00:00.000Z",
            isPrimaryEmail: true,
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
        identity={{
          email: "person@example.com",
          name: "Person",
          image: null,
          connectedAccounts: [],
        }}
        canManageConnectedAccounts
      />,
    );

    expect(await screen.findByText("GitHub · person")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove github/i }));
    await user.click(screen.getByRole("button", { name: /remove method/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/connected-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "account-1" }),
      });
    });
    expect(screen.getByText("Sign-in method removed.")).toBeInTheDocument();
  });

  it("loads, adds, and removes passkeys in hosted mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            credentialId: "credential-1",
            createdAt: "2026-06-19T10:00:00.000Z",
            lastUsedAt: null,
            credentialDeviceType: "singleDevice",
            credentialBackedUp: true,
            transports: "internal",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            credentialId: "credential-2",
            createdAt: "2026-06-19T11:00:00.000Z",
            lastUsedAt: null,
            credentialDeviceType: "multiDevice",
            credentialBackedUp: true,
            transports: "internal",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
        canManagePasskeys
      />,
    );

    expect(
      await screen.findByText("Single device passkey (backed up)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add passkey/i }));

    await waitFor(() => {
      expect(signInWithPasskeyMock).toHaveBeenCalledWith("passkey", {
        action: "register",
        redirect: false,
      });
    });
    expect(
      await screen.findByText("Multi device passkey (backed up)"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove passkey/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId: "credential-2" }),
      });
    });
    expect(screen.getByText("Passkey removed.")).toBeInTheDocument();
  });

  it("shows a re-authentication error when passkey registration is refused", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    signInWithPasskeyMock.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserSettingsPageClient
        initialSettings={{
          showTransactionTimes: true,
          startPage: "DASHBOARD",
          reportingCurrency: "EUR",
        }}
        canManagePasskeys
      />,
    );

    await screen.findByText("No passkeys yet.");
    await user.click(screen.getByRole("button", { name: /add passkey/i }));

    expect(
      await screen.findByText("Sign in again before changing sign-in methods."),
    ).toBeInTheDocument();
  });
});

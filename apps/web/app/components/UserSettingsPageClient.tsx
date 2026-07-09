"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ConnectedAccountProvider,
  ConnectedAccountResponse,
  DeleteConnectedAccountRequest,
  DeleteUserPasskeyRequest,
  UpdateUserSettingsRequest,
  UserPasskeyResponse,
  UserIdentityResponse,
  UserSettingsResponse,
} from "@finhance/shared/users";
import { BadgeCheck, GitBranch, KeyRound, Trash2 } from "lucide-react";
import { signIn as signInWithOAuth } from "next-auth/react";
import { signIn as signInWithPasskey } from "next-auth/webauthn";
import { apiMutation } from "@lib/api";
import ConfirmActionModal from "@components/ConfirmActionModal";
import SearchablePicker from "@components/SearchablePicker";
import {
  REPORTING_CURRENCY_OPTIONS,
  START_PAGE_OPTIONS,
} from "@lib/user-settings";
import { useSingleFlightActions } from "@lib/single-flight";

const PASSKEY_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const PROVIDER_OPTIONS: readonly {
  provider: ConnectedAccountProvider;
  label: string;
}[] = [
  { provider: "google", label: "Google" },
  { provider: "github", label: "GitHub" },
];

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccountNotLinked: "That provider account is already linked to another user.",
  OAuthAccountNotLinked:
    "That provider account could not be linked. Sign in again and retry from settings.",
  AccessDenied: "The provider sign-in was not allowed for this account.",
};

function formatPasskeyTitle(passkey: UserPasskeyResponse): string {
  const deviceType = passkey.credentialDeviceType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  const title = deviceType
    ? `${deviceType[0]?.toUpperCase() ?? ""}${deviceType.slice(1)} passkey`
    : "Passkey";

  return passkey.credentialBackedUp ? `${title} (backed up)` : title;
}

function getInitials(
  identity: UserIdentityResponse | null | undefined,
): string {
  const source = identity?.name?.trim() || identity?.email?.trim() || "FW";
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? "F") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "W");
}

function formatConnectedAccountTitle(
  account: ConnectedAccountResponse,
): string {
  return account.providerDisplayName
    ? `${account.providerLabel} · ${account.providerDisplayName}`
    : account.providerLabel;
}

function formatConnectedAccountMeta(account: ConnectedAccountResponse): string {
  const details = [
    account.providerEmail ?? "No email shared",
    account.createdAt
      ? `Added ${PASSKEY_DATE_FORMATTER.format(new Date(account.createdAt))}`
      : null,
  ].filter(Boolean);

  return details.join(" · ");
}

export default function UserSettingsPageClient({
  initialSettings,
  identity,
  canSignOutMobileDevices = false,
  canManageConnectedAccounts = false,
  canManagePasskeys = false,
}: {
  initialSettings: UserSettingsResponse;
  identity?: UserIdentityResponse | null;
  canSignOutMobileDevices?: boolean;
  canManageConnectedAccounts?: boolean;
  canManagePasskeys?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fieldPrefix = useId();
  const [form, setForm] = useState<UserSettingsResponse>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobileSignOutOpen, setIsMobileSignOutOpen] = useState(false);
  const [mobileSignOutError, setMobileSignOutError] = useState<string | null>(
    null,
  );
  const [isMobileSignOutPending, setIsMobileSignOutPending] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccountResponse[]
  >(identity?.connectedAccounts ?? []);
  const [connectedAccountsLoaded, setConnectedAccountsLoaded] = useState(
    !canManageConnectedAccounts,
  );
  const [connectedAccountError, setConnectedAccountError] = useState<
    string | null
  >(null);
  const [busyProvider, setBusyProvider] =
    useState<ConnectedAccountProvider | null>(null);
  const [accountToRemove, setAccountToRemove] =
    useState<ConnectedAccountResponse | null>(null);
  const [isRemovingAccount, setIsRemovingAccount] = useState(false);
  const [passkeys, setPasskeys] = useState<UserPasskeyResponse[]>([]);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeysLoaded, setPasskeysLoaded] = useState(false);
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(
    null,
  );
  const actions = useSingleFlightActions<"submit">();

  const loadConnectedAccounts = useCallback(async () => {
    if (!canManageConnectedAccounts) {
      return;
    }

    setConnectedAccountError(null);

    try {
      const response = await fetch("/api/connected-accounts", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Sign-in methods are currently unavailable.");
      }

      setConnectedAccounts(
        (await response.json()) as ConnectedAccountResponse[],
      );
    } catch (loadError) {
      setConnectedAccountError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load sign-in methods.",
      );
    } finally {
      setConnectedAccountsLoaded(true);
    }
  }, [canManageConnectedAccounts]);

  const loadPasskeys = useCallback(async () => {
    if (!canManagePasskeys) {
      return;
    }

    setPasskeyError(null);

    try {
      const response = await fetch("/api/passkeys", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Passkeys are currently unavailable.");
      }

      setPasskeys((await response.json()) as UserPasskeyResponse[]);
    } catch (loadError) {
      setPasskeyError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load passkeys.",
      );
    } finally {
      setPasskeysLoaded(true);
    }
  }, [canManagePasskeys]);

  async function handleMobileSignOut() {
    setMobileSignOutError(null);
    setIsMobileSignOutPending(true);

    try {
      const response = await fetch("/api/mobile/sessions", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("The server could not sign out mobile devices.");
      }

      setIsMobileSignOutOpen(false);
      setNotice("All mobile devices have been signed out.");
    } catch (signOutError) {
      setMobileSignOutError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out mobile devices.",
      );
    } finally {
      setIsMobileSignOutPending(false);
    }
  }

  useEffect(() => {
    setForm(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    setConnectedAccounts(identity?.connectedAccounts ?? []);
  }, [identity]);

  useEffect(() => {
    const authError = searchParams.get("error");
    if (!authError) {
      return;
    }

    setConnectedAccountError(
      AUTH_ERROR_MESSAGES[authError] ??
        "The provider account could not be linked.",
    );
  }, [searchParams]);

  useEffect(() => {
    void loadConnectedAccounts();
  }, [loadConnectedAccounts]);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  async function handleConnectProvider(provider: ConnectedAccountProvider) {
    setConnectedAccountError(null);
    setBusyProvider(provider);

    try {
      await signInWithOAuth(provider, { redirectTo: "/settings/user" });
    } catch (connectError) {
      setConnectedAccountError(
        connectError instanceof Error
          ? connectError.message
          : "Unable to start provider sign-in.",
      );
      setBusyProvider(null);
    }
  }

  async function handleRemoveConnectedAccount() {
    if (!accountToRemove) {
      return;
    }

    setConnectedAccountError(null);
    setIsRemovingAccount(true);

    try {
      const payload: DeleteConnectedAccountRequest = {
        accountId: accountToRemove.id,
      };
      const response = await fetch("/api/connected-accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "The sign-in method could not be removed.";

        try {
          const payload = (await response.json()) as { message?: unknown };
          if (typeof payload.message === "string" && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // Keep the generic message when the server does not return JSON.
        }

        throw new Error(message);
      }

      setConnectedAccounts((current) =>
        current.filter((account) => account.id !== accountToRemove.id),
      );
      setAccountToRemove(null);
      setNotice("Sign-in method removed.");
    } catch (removeError) {
      setConnectedAccountError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove sign-in method.",
      );
    } finally {
      setIsRemovingAccount(false);
    }
  }

  async function handleAddPasskey() {
    setPasskeyError(null);
    setIsAddingPasskey(true);

    try {
      const result = await signInWithPasskey("passkey", {
        action: "register",
        redirect: false,
      });

      if (!result) {
        throw new Error("Sign in again before changing sign-in methods.");
      }

      if (result?.error) {
        throw new Error("The passkey could not be added.");
      }

      await loadPasskeys();
      setNotice("Passkey added.");
    } catch (addError) {
      setPasskeyError(
        addError instanceof Error ? addError.message : "Unable to add passkey.",
      );
    } finally {
      setIsAddingPasskey(false);
    }
  }

  async function handleDeletePasskey(credentialId: string) {
    setPasskeyError(null);
    setDeletingPasskeyId(credentialId);

    try {
      const payload: DeleteUserPasskeyRequest = { credentialId };
      const response = await fetch("/api/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("The passkey could not be removed.");
      }

      setPasskeys((current) =>
        current.filter((passkey) => passkey.credentialId !== credentialId),
      );
      setNotice("Passkey removed.");
    } catch (deleteError) {
      setPasskeyError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to remove passkey.",
      );
    } finally {
      setDeletingPasskeyId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("submit", async () => {
      setError(null);
      setNotice(null);
      setIsSubmitting(true);

      try {
        const payload: UpdateUserSettingsRequest = {
          showTransactionTimes: form.showTransactionTimes,
          startPage: form.startPage,
          reportingCurrency: form.reportingCurrency,
        };
        const saved = await apiMutation<UserSettingsResponse>(
          "/users/me/settings",
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        );
        setForm(saved);
        setNotice("User settings saved.");
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to save user settings.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="page-shell">
      <div className="page-hero">
        <p className="page-kicker">Account</p>
        <h1 className="page-title is-compact">User settings</h1>
        <p className="page-subtitle">
          Personalise transaction display and where the workspace opens first.
        </p>
      </div>

      <section className="glass-card page-section account-identity-card">
        <div className="account-identity-main">
          {identity?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.image}
              alt=""
              className="account-identity-avatar"
            />
          ) : (
            <span className="account-identity-avatar" aria-hidden="true">
              {getInitials(identity).toUpperCase()}
            </span>
          )}
          <div className="account-identity-copy">
            <p className="section-kicker">Identity</p>
            <h2 className="section-title">
              {identity?.name?.trim() ||
                identity?.email ||
                (canManageConnectedAccounts
                  ? "Hosted workspace"
                  : "Local workspace")}
            </h2>
            <p className="section-subtitle">
              {identity?.email ??
                (canManageConnectedAccounts
                  ? "Account details unavailable"
                  : "Private on this device")}
            </p>
          </div>
        </div>
        <div
          className="account-provider-badges"
          aria-label="Connected providers"
        >
          {identity?.connectedAccounts.length ? (
            identity.connectedAccounts.map((account) => (
              <span key={account.id} className="status-chip is-secondary">
                {account.providerLabel}
              </span>
            ))
          ) : (
            <span className="status-chip is-neutral">
              {canManageConnectedAccounts ? "No providers" : "Local mode"}
            </span>
          )}
        </div>
      </section>

      <section className="glass-card page-section">
        <div className="page-section-heading">
          <div>
            <p className="section-kicker">Transactions</p>
            <h2 className="section-title">Time display</h2>
          </div>
        </div>

        <div className="app-form-field">
          <label
            htmlFor={`${fieldPrefix}-show-transaction-times`}
            className="app-form-toggle"
          >
            <span>
              <span className="app-form-toggle-label">
                Show transaction times
              </span>
              <span className="app-form-toggle-copy">
                Keep date and time visible in manual transaction forms and the
                activity list.
              </span>
            </span>
            <input
              id={`${fieldPrefix}-show-transaction-times`}
              type="checkbox"
              checked={form.showTransactionTimes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  showTransactionTimes: event.target.checked,
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="glass-card page-section">
        <div className="page-section-heading">
          <div>
            <p className="section-kicker">Navigation</p>
            <h2 className="section-title">Start page</h2>
          </div>
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-start-page`}>
            Open this page first
          </label>
          <select
            id={`${fieldPrefix}-start-page`}
            value={form.startPage}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                startPage: event.target
                  .value as UserSettingsResponse["startPage"],
              }))
            }
          >
            {START_PAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="glass-card page-section">
        <div className="page-section-heading">
          <div>
            <p className="section-kicker">Reporting</p>
            <h2 className="section-title">Reporting currency</h2>
          </div>
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-reporting-currency`}>
            Show aggregated totals in
          </label>
          <SearchablePicker
            id={`${fieldPrefix}-reporting-currency`}
            value={form.reportingCurrency}
            onChange={(nextValue) =>
              setForm((current) => ({
                ...current,
                reportingCurrency: nextValue,
              }))
            }
            options={REPORTING_CURRENCY_OPTIONS}
            placeholder="Choose a reporting currency"
            searchPlaceholder="Search reporting currencies…"
          />
        </div>
      </section>

      {canManageConnectedAccounts ? (
        <section className="glass-card page-section">
          <div className="page-section-heading">
            <div>
              <p className="section-kicker">Security</p>
              <h2 className="section-title">Sign-in methods</h2>
            </div>
            <div className="connected-account-actions">
              {PROVIDER_OPTIONS.map((option) => (
                <button
                  key={option.provider}
                  type="button"
                  className="btn-secondary connected-account-add-button"
                  disabled={busyProvider !== null}
                  onClick={() => handleConnectProvider(option.provider)}
                >
                  {option.provider === "google" ? (
                    <BadgeCheck size={17} aria-hidden="true" />
                  ) : (
                    <GitBranch size={17} aria-hidden="true" />
                  )}
                  <span>
                    {busyProvider === option.provider
                      ? "Opening..."
                      : `Connect ${option.label}`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {connectedAccountError ? (
            <p role="alert" className="app-form-error">
              {connectedAccountError}
            </p>
          ) : null}

          <div className="passkey-list">
            {!connectedAccountsLoaded ? (
              <p className="section-subtitle">Loading sign-in methods...</p>
            ) : connectedAccounts.length === 0 ? (
              <p className="section-subtitle">No connected providers yet.</p>
            ) : (
              connectedAccounts.map((account) => (
                <div key={account.id} className="passkey-row">
                  <div className="passkey-row-main">
                    <span className="passkey-row-icon" aria-hidden="true">
                      {account.provider === "google" ? (
                        <BadgeCheck size={17} />
                      ) : (
                        <GitBranch size={17} />
                      )}
                    </span>
                    <div>
                      <p className="passkey-row-title">
                        {formatConnectedAccountTitle(account)}
                      </p>
                      <p className="passkey-row-meta">
                        {formatConnectedAccountMeta(account)}
                      </p>
                    </div>
                  </div>
                  <div className="connected-account-row-actions">
                    {account.isPrimaryEmail ? (
                      <span className="status-chip is-success">
                        Primary email
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="asset-row-action-trigger passkey-delete-button"
                      aria-label={`Remove ${account.providerLabel}`}
                      onClick={() => setAccountToRemove(account)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <ConfirmActionModal
            open={accountToRemove !== null}
            onClose={() => setAccountToRemove(null)}
            onConfirm={handleRemoveConnectedAccount}
            title="Remove sign-in method?"
            description={
              accountToRemove
                ? `${accountToRemove.providerLabel} will no longer be able to sign in to this account.`
                : ""
            }
            confirmLabel="Remove method"
            pendingLabel="Removing..."
            error={connectedAccountError}
            isPending={isRemovingAccount}
          />
        </section>
      ) : null}

      {canSignOutMobileDevices ? (
        <section className="glass-card page-section">
          <div className="page-section-heading">
            <div>
              <p className="section-kicker">Security</p>
              <h2 className="section-title">Mobile devices</h2>
            </div>
          </div>

          <div className="app-form-field">
            <p className="section-subtitle">
              Sign out every mobile device connected to this account. Each
              device will need to sign in again.
            </p>
            <div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setMobileSignOutError(null);
                  setIsMobileSignOutOpen(true);
                }}
              >
                Sign out mobile devices
              </button>
            </div>
          </div>

          <ConfirmActionModal
            open={isMobileSignOutOpen}
            onClose={() => setIsMobileSignOutOpen(false)}
            onConfirm={handleMobileSignOut}
            title="Sign out mobile devices?"
            description="Every signed-in mobile device will lose access immediately and will need to sign in again."
            confirmLabel="Sign out devices"
            pendingLabel="Signing out..."
            error={mobileSignOutError}
            isPending={isMobileSignOutPending}
          />
        </section>
      ) : null}

      {canManagePasskeys ? (
        <section className="glass-card page-section">
          <div className="page-section-heading">
            <div>
              <p className="section-kicker">Security</p>
              <h2 className="section-title">Passkeys</h2>
            </div>
            <button
              type="button"
              className="btn-secondary passkey-add-button"
              disabled={isAddingPasskey}
              onClick={handleAddPasskey}
            >
              <KeyRound size={17} aria-hidden="true" />
              <span>{isAddingPasskey ? "Adding..." : "Add passkey"}</span>
            </button>
          </div>

          {passkeyError ? (
            <p role="alert" className="app-form-error">
              {passkeyError}
            </p>
          ) : null}

          <div className="passkey-list">
            {!passkeysLoaded ? (
              <p className="section-subtitle">Loading passkeys...</p>
            ) : passkeys.length === 0 ? (
              <p className="section-subtitle">No passkeys yet.</p>
            ) : (
              passkeys.map((passkey) => (
                <div key={passkey.credentialId} className="passkey-row">
                  <div className="passkey-row-main">
                    <span className="passkey-row-icon" aria-hidden="true">
                      <KeyRound size={17} />
                    </span>
                    <div>
                      <p className="passkey-row-title">
                        {formatPasskeyTitle(passkey)}
                      </p>
                      <p className="passkey-row-meta">
                        Added{" "}
                        {PASSKEY_DATE_FORMATTER.format(
                          new Date(passkey.createdAt),
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="asset-row-action-trigger passkey-delete-button"
                    aria-label="Remove passkey"
                    disabled={deletingPasskeyId === passkey.credentialId}
                    onClick={() => handleDeletePasskey(passkey.credentialId)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="app-form-error">
          {error}
        </p>
      ) : null}
      {notice ? <p className="app-form-success">{notice}</p> : null}

      <div className="app-form-actions">
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save user settings"}
        </button>
      </div>
    </form>
  );
}

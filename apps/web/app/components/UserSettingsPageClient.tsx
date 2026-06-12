"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from "@finhance/shared/users";
import { apiMutation } from "@lib/api";
import ConfirmActionModal from "@components/ConfirmActionModal";
import SearchablePicker from "@components/SearchablePicker";
import {
  REPORTING_CURRENCY_OPTIONS,
  START_PAGE_OPTIONS,
} from "@lib/user-settings";
import { useSingleFlightActions } from "@lib/single-flight";

export default function UserSettingsPageClient({
  initialSettings,
  canSignOutMobileDevices = false,
}: {
  initialSettings: UserSettingsResponse;
  canSignOutMobileDevices?: boolean;
}) {
  const router = useRouter();
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
  const actions = useSingleFlightActions<"submit">();

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

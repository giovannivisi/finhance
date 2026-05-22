"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from "@finhance/shared/users";
import { apiMutation } from "@lib/api";
import { START_PAGE_OPTIONS } from "@lib/user-settings";
import { useSingleFlightActions } from "@lib/single-flight";

export default function UserSettingsPageClient({
  initialSettings,
}: {
  initialSettings: UserSettingsResponse;
}) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<UserSettingsResponse>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();

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
        };
        const saved = await apiMutation<UserSettingsResponse>("/users/me/settings", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
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
              <span className="app-form-toggle-label">Show transaction times</span>
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
          <label htmlFor={`${fieldPrefix}-start-page`}>Open this page first</label>
          <select
            id={`${fieldPrefix}-start-page`}
            value={form.startPage}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                startPage: event.target.value as UserSettingsResponse["startPage"],
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

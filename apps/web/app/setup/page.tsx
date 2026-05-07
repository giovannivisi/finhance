import Link from "next/link";
import type { SetupStatusResponse } from "@finhance/shared";
import Container from "@components/Container";

import { api } from "@lib/server-api";
import { getPrimarySetupAction, getSetupProgressLabel } from "@lib/setup";

export const dynamic = "force-dynamic";

const STEP_STATUS_STYLES = {
  COMPLETE: "status-chip is-success",
  INCOMPLETE: "status-chip is-warning",
} as const;

const WARNING_STYLES = {
  INFO: "surface-info",
  WARNING: "surface-warning",
} as const;

export default async function SetupPage() {
  let setup: SetupStatusResponse | null = null;
  let errorMessage: string | null = null;

  try {
    setup = await api<SetupStatusResponse>("/setup/status");
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Setup data is currently unavailable.";
  }

  if (!setup) {
    return (
      <>
        <Container>
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Trust</p>
              <h1 className="page-title is-compact">Setup</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        </Container>
      </>
    );
  }

  const primaryAction = getPrimarySetupAction(setup);

  return (
    <>
      <Container>
        <div className="page-shell">
          <section className="page-hero section-stack-relaxed">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="page-hero-copy">
                <p className="page-kicker">Trust</p>
                <h1 className="page-title is-compact">Setup</h1>
                <p className="page-description">
                  Build a trustworthy starting point, then move into review,
                  analytics, budgets, and recurring workflows.
                </p>
              </div>
              <div className="page-pill">
                {setup.isComplete
                  ? "Trust baseline complete"
                  : getSetupProgressLabel(setup)}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="list-card is-roomy section-stack-tight">
                <div>
                  <h2 className="section-title">Import existing data</h2>
                  <p className="section-subtitle">
                    Use the CSV round-trip flow if you already track balances,
                    transactions, recurring rules, or budgets elsewhere.
                  </p>
                </div>
                <p className="text-sm">
                  Use the CSV round-trip flow if you already track balances,
                  transactions, recurring rules, or budgets elsewhere.
                </p>
                <p className="text-sm">
                  {setup.hasAppliedImportBatch
                    ? "An import batch has already been applied in this workspace."
                    : "No applied import batch yet. You can still import later if you start manually now."}
                </p>
                <p className="text-sm">
                  Review the{" "}
                  <Link href="/privacy" className="import-disclosure-link">
                    privacy notice
                  </Link>{" "}
                  before uploading finance files or sharing this workspace with
                  someone else.
                </p>
                <Link href="/import" className="btn-secondary self-start">
                  Open import
                </Link>
              </article>

              <article className="list-card is-roomy section-stack-tight">
                <div>
                  <h2 className="section-title">Set up manually</h2>
                  <p className="section-subtitle">
                    Create accounts, categories, recurring rules, and budgets
                    directly in finhance using the existing product pages.
                  </p>
                </div>
                <p className="text-sm">
                  Create accounts, categories, recurring rules, and budgets
                  directly in finhance using the existing product pages.
                </p>
                <p className="text-sm">
                  Start with accounts and categories first. Everything else
                  builds more cleanly on that trust baseline.
                </p>
                <Link href="/accounts" className="btn-primary self-start">
                  Open accounts
                </Link>
              </article>
            </div>

            {primaryAction ? (
              <div className="page-inline-notice surface-info section-stack-tight">
                <p className="detail-metric-label">Best next action</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="page-hero-copy">
                    <p className="section-title">{primaryAction.title}</p>
                    <p className="mt-1 text-sm">{primaryAction.detail}</p>
                  </div>
                  <Link href={primaryAction.href} className="btn-primary">
                    {primaryAction.actionLabel}
                  </Link>
                </div>
              </div>
            ) : null}
          </section>

          <section className="page-section">
            <h2 className="section-title">Required checklist</h2>
            <p className="section-subtitle">
              These are the minimum steps needed for a usable, trustworthy
              baseline.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {setup.requiredSteps.map((step) => (
                <article key={step.code} className="list-card is-roomy">
                  <div className="flex items-start justify-between gap-3">
                    <div className="page-hero-copy">
                      <h3 className="section-title">{step.title}</h3>
                      <p className="mt-2 text-sm">{step.detail}</p>
                    </div>
                    <span className={STEP_STATUS_STYLES[step.status]}>
                      {step.status === "COMPLETE" ? "Complete" : "Pending"}
                    </span>
                  </div>
                  <Link
                    href={step.href}
                    className="btn-secondary mt-4 self-start"
                  >
                    {step.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="page-section">
            <h2 className="section-title">Warnings and trust notes</h2>
            <p className="section-subtitle">
              These do not block setup completion, but they explain what still
              weakens confidence in the numbers.
            </p>

            {setup.warnings.length === 0 ? (
              <div className="mt-6 page-inline-notice surface-dashed">
                No setup warnings are active right now.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {setup.warnings.map((warning) => (
                  <article
                    key={warning.code}
                    className={`page-inline-notice ${WARNING_STYLES[warning.severity]}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="page-hero-copy">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {warning.title}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {warning.detail}
                        </p>
                        {warning.count !== null ? (
                          <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                            {warning.count} affected item
                            {warning.count === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`status-chip ${
                          warning.severity === "WARNING"
                            ? "is-warning"
                            : "is-info"
                        }`}
                      >
                        {warning.severity}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link href={warning.href} className="link-button">
                        {warning.actionLabel}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="page-section">
            <h2 className="section-title">Recommended next steps</h2>
            <p className="section-subtitle">
              These are not required to finish setup, but they make the first
              real month much more useful.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {setup.recommendedSteps.map((step) => (
                <article key={step.code} className="list-card is-roomy">
                  <div className="flex items-start justify-between gap-3">
                    <div className="page-hero-copy">
                      <h3 className="section-title">{step.title}</h3>
                      <p className="mt-2 text-sm">{step.detail}</p>
                    </div>
                    <span className={STEP_STATUS_STYLES[step.status]}>
                      {step.status === "COMPLETE" ? "Complete" : "Pending"}
                    </span>
                  </div>
                  <Link href={step.href} className="link-button mt-4">
                    {step.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          {setup.handoff.length > 0 ? (
            <section className="page-section is-spacious">
              <h2 className="section-title">Ready for the first month</h2>
              <p className="section-subtitle">
                Your trust baseline is in place. These are the best next pages
                to use the system rather than just configuring it.
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {setup.handoff.map((item) => (
                  <article key={item.code} className="list-card is-roomy">
                    <h3 className="section-title">{item.title}</h3>
                    <p className="mt-2 text-sm">{item.detail}</p>
                    <Link
                      href={item.href}
                      className="btn-primary mt-4 self-start"
                    >
                      {item.actionLabel}
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Container>
    </>
  );
}

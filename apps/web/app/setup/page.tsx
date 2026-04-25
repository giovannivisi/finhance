import Link from "next/link";
import type { SetupStatusResponse } from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import { getPrimarySetupAction, getSetupProgressLabel } from "@lib/setup";

export const dynamic = "force-dynamic";

const STEP_STATUS_STYLES = {
  COMPLETE: "bg-emerald-100 text-emerald-800",
  INCOMPLETE: "bg-amber-100 text-amber-900",
} as const;

const WARNING_STYLES = {
  INFO: "border-blue-200 bg-blue-50 text-blue-950",
  WARNING: "border-amber-200 bg-amber-50 text-amber-950",
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
        <Header />
        <Container>
          <h1 className="text-3xl font-semibold text-gray-900">Setup</h1>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm text-amber-900/80">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </Container>
      </>
    );
  }

  const primaryAction = getPrimarySetupAction(setup);

  return (
    <>
      <Header />
      <Container>
        <div className="space-y-8">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-gray-900">Setup</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Build a trustworthy starting point, then move into review,
                  analytics, budgets, and recurring workflows.
                </p>
              </div>
              <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                {setup.isComplete
                  ? "Trust baseline complete"
                  : getSetupProgressLabel(setup)}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-gray-200 p-5">
                <h2 className="text-lg font-semibold text-gray-900">
                  Import existing data
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Use the CSV round-trip flow if you already track balances,
                  transactions, recurring rules, or budgets elsewhere.
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  {setup.hasAppliedImportBatch
                    ? "An import batch has already been applied in this workspace."
                    : "No applied import batch yet. You can still import later if you start manually now."}
                </p>
                <Link
                  href="/import"
                  className="mt-4 inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  Open import
                </Link>
              </article>

              <article className="rounded-2xl border border-gray-200 p-5">
                <h2 className="text-lg font-semibold text-gray-900">
                  Set up manually
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Create accounts, categories, recurring rules, and budgets
                  directly in finhance using the existing product pages.
                </p>
                <p className="mt-3 text-sm text-gray-500">
                  Start with accounts and categories first. Everything else
                  builds more cleanly on that trust baseline.
                </p>
                <Link
                  href="/accounts"
                  className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Open accounts
                </Link>
              </article>
            </div>

            {primaryAction ? (
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                <p className="text-sm font-medium uppercase tracking-wide text-blue-700">
                  Best next action
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{primaryAction.title}</p>
                    <p className="mt-1 text-sm text-blue-900/80">
                      {primaryAction.detail}
                    </p>
                  </div>
                  <Link
                    href={primaryAction.href}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {primaryAction.actionLabel}
                  </Link>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-2xl font-semibold text-gray-900">
              Required checklist
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              These are the minimum steps needed for a usable, trustworthy
              baseline.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {setup.requiredSteps.map((step) => (
                <article
                  key={step.code}
                  className="rounded-2xl border border-gray-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-600">
                        {step.detail}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STEP_STATUS_STYLES[step.status]}`}
                    >
                      {step.status === "COMPLETE" ? "Complete" : "Pending"}
                    </span>
                  </div>
                  <Link
                    href={step.href}
                    className="mt-4 inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {step.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-2xl font-semibold text-gray-900">
              Warnings and trust notes
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              These do not block setup completion, but they explain what still
              weakens confidence in the numbers.
            </p>

            {setup.warnings.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">
                No setup warnings are active right now.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {setup.warnings.map((warning) => (
                  <article
                    key={warning.code}
                    className={`rounded-2xl border p-5 ${WARNING_STYLES[warning.severity]}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {warning.title}
                        </h3>
                        <p className="mt-2 text-sm opacity-90">
                          {warning.detail}
                        </p>
                        {warning.count !== null ? (
                          <p className="mt-2 text-xs font-medium uppercase tracking-wide opacity-75">
                            {warning.count} affected item
                            {warning.count === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                      <Link
                        href={warning.href}
                        className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium hover:bg-white/40"
                      >
                        {warning.actionLabel}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-2xl font-semibold text-gray-900">
              Recommended next steps
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              These are not required to finish setup, but they make the first
              real month much more useful.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {setup.recommendedSteps.map((step) => (
                <article
                  key={step.code}
                  className="rounded-2xl border border-gray-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-600">
                        {step.detail}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STEP_STATUS_STYLES[step.status]}`}
                    >
                      {step.status === "COMPLETE" ? "Complete" : "Pending"}
                    </span>
                  </div>
                  <Link
                    href={step.href}
                    className="mt-4 inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {step.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          {setup.handoff.length > 0 ? (
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-2xl font-semibold text-gray-900">
                Ready for the first month
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Your trust baseline is in place. These are the best next pages
                to use the system rather than just configuring it.
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                {setup.handoff.map((item) => (
                  <article
                    key={item.code}
                    className="rounded-2xl border border-gray-200 p-5"
                  >
                    <h3 className="text-lg font-semibold text-gray-900">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">{item.detail}</p>
                    <Link
                      href={item.href}
                      className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
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

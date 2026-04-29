import Link from "next/link";
import Container from "@components/Container";
import {
  getPrivacyNoticeConfig,
  type PrivacyContact,
  type PrivacyNoticeConfig,
} from "@lib/privacy-notice";

export const dynamic = "force-dynamic";

function ContactCard({
  title,
  contact,
  note,
}: {
  title: string;
  contact: PrivacyContact;
  note?: string;
}) {
  return (
    <article className="list-card">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
        {title}
      </p>
      <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
        {contact.name}
      </h2>
      <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
        {contact.email ? (
          <p>
            Email:{" "}
            <a
              href={`mailto:${contact.email}`}
              className="import-disclosure-link"
            >
              {contact.email}
            </a>
          </p>
        ) : null}
        {contact.website ? (
          <p>
            Website:{" "}
            <a
              href={contact.website}
              target="_blank"
              rel="noreferrer"
              className="import-disclosure-link"
            >
              {contact.website}
            </a>
          </p>
        ) : null}
        {contact.postalAddress ? (
          <p>Postal address: {contact.postalAddress}</p>
        ) : null}
        {contact.instructions ? <p>{contact.instructions}</p> : null}
        {note ? <p>{note}</p> : null}
      </div>
    </article>
  );
}

function modeLabel(mode: PrivacyNoticeConfig["deploymentMode"]): string {
  switch (mode) {
    case "local":
      return "Local / self-hosted";
    case "managed":
      return "Managed deployment";
    case "mixed":
      return "Mixed deployment";
    default:
      return mode;
  }
}

export default function PrivacyPage() {
  const notice = getPrivacyNoticeConfig();

  return (
    <Container>
      <div className="page-shell">
        <section className="page-hero">
          <p className="page-kicker">Trust</p>
          <h1 className="page-title is-compact">Privacy notice</h1>
          <p className="page-description">
            This notice explains what personal data finhance processes, why it
            is processed, how long it is kept, who may receive it, and how data
            subject rights can be exercised for this deployment.
          </p>

          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <ContactCard
              title="Controller"
              contact={notice.controller}
              note={`Deployment model: ${modeLabel(notice.deploymentMode)}.`}
            />
            <ContactCard
              title="Rights requests"
              contact={notice.rightsContact}
            />
            {notice.dpo ? (
              <ContactCard
                title="Data protection contact"
                contact={notice.dpo}
              />
            ) : null}
            <article className="list-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Supervisory authority
              </p>
              <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                {notice.supervisoryAuthority.name}
              </h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                You can complain to the supervisory authority responsible for
                your place of residence, work, or the place of the alleged
                infringement.
              </p>
              <a
                href={notice.supervisoryAuthority.complaintUrl}
                target="_blank"
                rel="noreferrer"
                className="import-disclosure-link mt-3 inline-flex"
              >
                Complaint details
              </a>
            </article>
            <article className="list-card">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Notice status
              </p>
              <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
                Last updated {notice.lastUpdated}
              </h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Use this page together with any operator-specific contract,
                terms, or support materials that apply to your deployment.
              </p>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {notice.dpo
                  ? `Separate data protection contact configured: ${notice.dpo.name}.`
                  : "No separate DPO contact is configured for this deployment."}
              </p>
            </article>
          </div>

          {notice.isUsingDefaultLocalNotice ? (
            <div className="mt-6 page-inline-notice surface-warning">
              <p className="font-semibold">
                This page is using the built-in self-hosted privacy defaults.
              </p>
              <p className="mt-2 text-sm">
                Replace the privacy environment variables before relying on this
                notice for a deployment shared with other users.
              </p>
            </div>
          ) : null}
        </section>

        <section className="page-section">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            What personal data finhance processes
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            The exact records depend on which features you use, but the product
            is built to handle financial workspace data, import files, snapshot
            history, short-lived security records, and browser-side preference
            storage.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {notice.categoryGroups.map((group) => (
              <article key={group.title} className="list-card is-roomy">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {group.title}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="page-section">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Sources, purposes, and legal bases
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            finhance receives data from direct user input, uploaded files, and
            limited external quote requests when you ask the app to refresh
            supported market valuations.
          </p>

          <div className="mt-6 page-inline-notice surface-dashed">
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Source of data
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-primary)]">
              {notice.sourceOfData.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 space-y-4">
            {notice.processingActivities.map((activity) => (
              <article key={activity.key} className="list-card is-roomy">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      {activity.title}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {activity.purpose}
                    </p>
                  </div>
                  <div className="privacy-basis-pill">
                    {activity.legalBasis.basis}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Data categories used for this purpose
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                      {activity.dataCategories.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="privacy-side-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Why this basis applies
                    </p>
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      {activity.legalBasis.explanation}
                    </p>
                    {activity.legalBasis.legitimateInterests ? (
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Legitimate interests:{" "}
                        {activity.legalBasis.legitimateInterests}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="page-section">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Recipients, processors, and international transfers
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            finhance can involve both deployment-specific infrastructure and
            code-owned external services. Browser preference storage remains on
            the device you use to access the app.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {notice.processors.map((processor) => (
              <article
                key={`${processor.name}-${processor.purpose}`}
                className="list-card"
              >
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {processor.name}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {processor.role}
                </p>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  Purpose: {processor.purpose}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Location / scope: {processor.location}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                  {processor.dataCategories.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {processor.website ? (
                  <a
                    href={processor.website}
                    target="_blank"
                    rel="noreferrer"
                    className="import-disclosure-link mt-3 inline-flex"
                  >
                    Provider website
                  </a>
                ) : null}
              </article>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {notice.transfers.map((transfer) => (
              <div
                key={`${transfer.destination}-${transfer.purpose}`}
                className="page-inline-notice surface-warning"
              >
                <p className="font-semibold">
                  Transfer destination: {transfer.destination}
                </p>
                <p className="mt-2 text-sm">Purpose: {transfer.purpose}</p>
                <p className="mt-2 text-sm">
                  Data categories: {transfer.dataCategories.join("; ")}
                </p>
                <p className="mt-2 text-sm">
                  Safeguards / notes: {transfer.safeguard}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="page-section">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Retention, rights, and complaints
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Retention depends on the record type. Some periods are fixed in the
            code, while longer-lived finance records depend on operator actions
            and the backing data store used by this deployment.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {notice.retention.map((entry) => (
              <article key={entry.key} className="list-card is-roomy">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  {entry.title}
                </h3>
                <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                  {entry.retention}
                </p>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {entry.detail}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <div className="page-inline-notice surface-info">
              <p className="text-sm font-medium uppercase tracking-wide text-blue-700">
                Your rights
              </p>
              <p className="mt-3 text-sm text-blue-950">
                Depending on the law that applies to you, you may have rights of
                access, rectification, erasure, restriction, objection,
                portability, and complaint to a supervisory authority.
              </p>
              <p className="mt-3 text-sm text-blue-950">
                {notice.importSummary.rights}
              </p>
              <p className="mt-3 text-sm text-blue-950">
                The current product does not provide an end-user self-service
                delete action for snapshot history, so snapshot erasure or
                restriction requests must be handled by the configured rights
                contact.
              </p>
            </div>

            <div className="page-inline-notice surface-dashed">
              <p className="text-sm font-medium uppercase tracking-wide text-[var(--text-secondary)]">
                If you choose not to provide data
              </p>
              <p className="mt-3 text-sm text-[var(--text-primary)]">
                {notice.consequenceOfNotProviding}
              </p>
            </div>
          </div>
        </section>

        <section className="page-section section-stack-tight">
          <div className="page-inline-notice surface-dashed">
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              Automated decision-making
            </p>
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              {notice.automatedDecisionMaking}
            </p>
          </div>

          <div className="page-inline-notice surface-dashed">
            <p className="text-sm font-medium uppercase tracking-wide text-[var(--text-secondary)]">
              References
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <a
                href="https://eur-lex.europa.eu/eli/reg/2016/679/oj"
                target="_blank"
                rel="noreferrer"
                className="import-disclosure-link"
              >
                GDPR text
              </a>
              <a
                href="https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-information-should-i_en"
                target="_blank"
                rel="noreferrer"
                className="import-disclosure-link"
              >
                EDPB transparency guidance
              </a>
              <Link href="/import" className="import-disclosure-link">
                Back to import
              </Link>
              <Link href="/setup" className="import-disclosure-link">
                Back to setup
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}

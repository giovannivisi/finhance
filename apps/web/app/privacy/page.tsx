import Link from "next/link";
import Container from "@components/Container";
import {
  getPrivacyNoticeConfig,
  type PrivacyContact,
  type PrivacyNoticeConfig,
} from "@lib/privacy-notice";

export const dynamic = "force-dynamic";

function ContactDetails({
  label,
  contact,
}: {
  label: string;
  contact: PrivacyContact;
}) {
  return (
    <div className="privacy-contact-block">
      <p className="privacy-meta-label">{label}</p>
      <p className="privacy-contact-name">{contact.name}</p>
      <div className="privacy-contact-lines">
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
      </div>
    </div>
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
      <div className="page-shell is-relaxed route-stack-desktop-xl">
        <section className="page-hero">
          <p className="page-kicker">Trust</p>
          <h1 className="page-title is-compact">Privacy notice</h1>
          <p className="page-description privacy-page-description">
            This notice explains what personal data finhance processes, why it
            is processed, how long it is kept, who may receive it, and how data
            subject rights can be exercised for this deployment.
          </p>

          <div className="privacy-summary-grid">
            <article className="list-card privacy-summary-card">
              <p className="privacy-meta-label">Overview</p>
              <h2 className="privacy-card-title">
                Controller and rights contact
              </h2>
              <p className="privacy-summary-copy">
                The operator of this finhance workspace decides how personal
                data is handled for this deployment and is the primary point of
                contact for privacy requests.
              </p>

              <div className="privacy-contact-stack">
                <ContactDetails
                  label="Controller"
                  contact={notice.controller}
                />
                <ContactDetails
                  label="Rights requests"
                  contact={notice.rightsContact}
                />
                {notice.dpo ? (
                  <ContactDetails
                    label="Data protection contact"
                    contact={notice.dpo}
                  />
                ) : null}
              </div>

              <p className="privacy-summary-note">
                Deployment model: {modeLabel(notice.deploymentMode)}.
              </p>
            </article>

            <article className="list-card privacy-summary-card">
              <p className="privacy-meta-label">Status</p>
              <h2 className="privacy-card-title">
                Notice status and complaints
              </h2>
              <div className="privacy-meta-stack">
                <div className="privacy-meta-row">
                  <span className="privacy-meta-term">Last updated</span>
                  <span className="privacy-meta-value">
                    {notice.lastUpdated}
                  </span>
                </div>
                <div className="privacy-meta-row">
                  <span className="privacy-meta-term">
                    Supervisory authority
                  </span>
                  <span className="privacy-meta-value">
                    {notice.supervisoryAuthority.name}
                  </span>
                </div>
              </div>
              <p className="privacy-summary-copy">
                Use this page together with any operator-specific contract,
                terms, or support materials that apply to your deployment.
              </p>
              <a
                href={notice.supervisoryAuthority.complaintUrl}
                target="_blank"
                rel="noreferrer"
                className="import-disclosure-link"
              >
                Complaint details
              </a>
            </article>
          </div>

          {notice.isUsingDefaultLocalNotice ? (
            <div className="page-inline-notice surface-warning privacy-slim-notice">
              <p className="font-semibold">
                This page is using the built-in self-hosted privacy defaults.
              </p>
              <p className="mt-1 text-sm">
                Replace the privacy environment variables before relying on this
                notice for a deployment shared with other users.
              </p>
            </div>
          ) : null}
        </section>

        <section className="page-section section-stack-tight">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              What personal data finhance processes
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] privacy-section-intro">
              The exact records depend on which features you use, but the
              product is built to handle financial workspace data, import files,
              snapshot history, short-lived security records, and browser-side
              preference storage.
            </p>
          </div>

          <article className="list-card privacy-content-card">
            <div className="privacy-group-grid">
              {notice.categoryGroups.map((group) => (
                <div key={group.title} className="privacy-subsection">
                  <h3 className="privacy-subsection-title">{group.title}</h3>
                  <ul className="privacy-list">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="page-section section-stack-tight">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              Sources, purposes, and legal bases
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] privacy-section-intro">
              finhance receives data from direct user input, uploaded files, and
              limited external quote requests when you ask the app to refresh
              supported market valuations.
            </p>
          </div>

          <article className="list-card privacy-content-card">
            <div className="privacy-note-block privacy-note-block--muted">
              <p className="privacy-meta-label">Source of data</p>
              <ul className="privacy-list">
                {notice.sourceOfData.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="privacy-divider-list">
              {notice.processingActivities.map((activity) => (
                <div key={activity.key} className="privacy-activity-row">
                  <div className="privacy-activity-header">
                    <div className="privacy-activity-copy">
                      <h3 className="privacy-subsection-title">
                        {activity.title}
                      </h3>
                      <p className="privacy-detail-copy mt-2">
                        {activity.purpose}
                      </p>
                    </div>
                    <div className="privacy-basis-pill">
                      {activity.legalBasis.basis}
                    </div>
                  </div>

                  <p className="privacy-detail-copy">
                    {activity.legalBasis.explanation}
                  </p>

                  {activity.legalBasis.legitimateInterests ? (
                    <p className="privacy-detail-copy">
                      Legitimate interests:{" "}
                      {activity.legalBasis.legitimateInterests}
                    </p>
                  ) : null}

                  <div className="privacy-subsection">
                    <p className="privacy-meta-label">
                      Data categories used for this purpose
                    </p>
                    <ul className="privacy-list">
                      {activity.dataCategories.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="page-section section-stack-tight">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              Recipients, processors, and international transfers
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] privacy-section-intro">
              finhance can involve both deployment-specific infrastructure and
              code-owned external services. Browser preference storage remains
              on the device you use to access the app.
            </p>
          </div>

          <article className="list-card privacy-content-card">
            <div className="privacy-divider-list">
              {notice.processors.map((processor) => (
                <div
                  key={`${processor.name}-${processor.purpose}`}
                  className="privacy-processor-row"
                >
                  <div className="privacy-activity-header">
                    <div className="privacy-activity-copy">
                      <h3 className="privacy-subsection-title">
                        {processor.name}
                      </h3>
                      <p className="privacy-detail-copy mt-2">
                        {processor.role}
                      </p>
                    </div>
                    {processor.website ? (
                      <a
                        href={processor.website}
                        target="_blank"
                        rel="noreferrer"
                        className="import-disclosure-link"
                      >
                        Provider website
                      </a>
                    ) : null}
                  </div>

                  <div className="privacy-inline-meta">
                    <p>
                      <span className="privacy-meta-term">Purpose</span>
                      {processor.purpose}
                    </p>
                    <p>
                      <span className="privacy-meta-term">
                        Location / scope
                      </span>
                      {processor.location}
                    </p>
                  </div>

                  <ul className="privacy-list">
                    {processor.dataCategories.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {notice.transfers.length > 0 ? (
              <div className="privacy-transfer-block">
                <p className="privacy-meta-label">International transfers</p>
                <div className="privacy-transfer-list">
                  {notice.transfers.map((transfer) => (
                    <div
                      key={`${transfer.destination}-${transfer.purpose}`}
                      className="privacy-transfer-row"
                    >
                      <p className="privacy-detail-copy">
                        <span className="privacy-meta-term">Destination</span>
                        {transfer.destination}
                      </p>
                      <p className="privacy-detail-copy">
                        <span className="privacy-meta-term">Purpose</span>
                        {transfer.purpose}
                      </p>
                      <p className="privacy-detail-copy">
                        <span className="privacy-meta-term">
                          Data categories
                        </span>
                        {transfer.dataCategories.join("; ")}
                      </p>
                      <p className="privacy-detail-copy">
                        <span className="privacy-meta-term">
                          Safeguards / notes
                        </span>
                        {transfer.safeguard}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        </section>

        <section className="page-section section-stack-tight">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              Retention, rights, and complaints
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] privacy-section-intro">
              Retention depends on the record type. Some periods are fixed in
              the code, while longer-lived finance records depend on operator
              actions and the backing data store used by this deployment.
            </p>
          </div>

          <article className="list-card privacy-content-card">
            <div className="privacy-divider-list">
              {notice.retention.map((entry) => (
                <div key={entry.key} className="privacy-retention-row">
                  <h3 className="privacy-subsection-title">{entry.title}</h3>
                  <p className="privacy-retention-copy">{entry.retention}</p>
                  <p className="privacy-detail-copy">{entry.detail}</p>
                </div>
              ))}
            </div>

            <div className="privacy-note-stack">
              <div className="privacy-note-block surface-info">
                <p className="privacy-meta-label text-blue-700">Your rights</p>
                <p className="privacy-detail-copy text-blue-950">
                  Depending on the law that applies to you, you may have rights
                  of access, rectification, erasure, restriction, objection,
                  portability, and complaint to a supervisory authority.
                </p>
                <p className="privacy-detail-copy text-blue-950">
                  {notice.importSummary.rights}
                </p>
                <p className="privacy-detail-copy text-blue-950">
                  Hosted users can permanently delete their account from the
                  avatar menu under Account, then Delete account. The flow
                  requires recent authentication and an exact email
                  confirmation. It immediately removes all live user-owned
                  application records, including snapshot history; the
                  application retains no separate audit copy.
                </p>
                <p className="privacy-detail-copy text-blue-950">
                  Infrastructure backups, security logs, or processor records,
                  where configured by the deployment operator, follow the
                  operator&apos;s and processor&apos;s separate retention
                  schedules and are not selectively restored after account
                  deletion.
                </p>
              </div>

              <div className="privacy-note-block privacy-note-block--muted">
                <p className="privacy-meta-label">
                  If you choose not to provide data
                </p>
                <p className="privacy-detail-copy">
                  {notice.consequenceOfNotProviding}
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="page-section section-stack-tight">
          <div className="privacy-footer-grid">
            <div className="privacy-footer-note">
              <p className="privacy-meta-label">Automated decision-making</p>
              <p className="privacy-detail-copy">
                {notice.automatedDecisionMaking}
              </p>
            </div>

            <div className="privacy-footer-note">
              <p className="privacy-meta-label">References</p>
              <p className="privacy-detail-copy">
                Legal reference material for this notice, plus the import
                workflow entry point.
              </p>
              <div className="privacy-reference-links">
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
              </div>
              <Link href="/import" className="import-disclosure-link">
                Back to import
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Container>
  );
}

import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrivacyNoticeConfig } from "./privacy-notice.ts";

const COMPLETE_LEGAL_BASES = {
  workspaceRecords: {
    basis: "Art. 6(1)(b) GDPR",
    explanation: "To operate the main workspace records.",
  },
  importsAndExports: {
    basis: "Art. 6(1)(b) GDPR",
    explanation: "To preview, merge, and export uploaded data.",
  },
  snapshotsAndReview: {
    basis: "Art. 6(1)(b) GDPR",
    explanation: "To capture history and review boundaries.",
  },
  marketData: {
    basis: "Art. 6(1)(b) GDPR",
    explanation: "To refresh quote and FX data on request.",
  },
  securityAndReliability: {
    basis: "Art. 6(1)(f) GDPR",
    explanation: "To prevent duplicate writes and keep the service reliable.",
    legitimateInterests: "Service integrity and abuse prevention.",
  },
  browserPreferences: {
    basis: "Art. 6(1)(f) GDPR",
    explanation: "To remember display preferences on the device in use.",
    legitimateInterests: "Stable UI preferences.",
  },
};

const COMPLETE_ENV = {
  FINHANCE_PRIVACY_DEPLOYMENT_MODE: "mixed",
  FINHANCE_PRIVACY_LAST_UPDATED: "2026-04-30",
  FINHANCE_PRIVACY_CONTROLLER_NAME: "Finhance Ops Ltd.",
  FINHANCE_PRIVACY_CONTROLLER_EMAIL: "privacy@finhance.test",
  FINHANCE_PRIVACY_RIGHTS_NAME: "Finhance Privacy Team",
  FINHANCE_PRIVACY_RIGHTS_EMAIL: "rights@finhance.test",
  FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_NAME: "Italian Garante",
  FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_URL: "https://www.garanteprivacy.it/",
  FINHANCE_PRIVACY_LEGAL_BASES_JSON: JSON.stringify(COMPLETE_LEGAL_BASES),
  FINHANCE_PRIVACY_PROCESSORS_JSON: JSON.stringify([
    {
      name: "Neon",
      role: "Hosted Postgres",
      purpose: "Primary database hosting",
      location: "EU region selected by the operator",
      dataCategories: ["Workspace finance records", "Snapshot history"],
      website: "https://neon.tech/",
    },
  ]),
  FINHANCE_PRIVACY_TRANSFERS_JSON: JSON.stringify([
    {
      destination: "United States",
      purpose: "Operator-managed support escalation",
      dataCategories: ["Support-relevant account or transaction excerpts"],
      safeguard: "SCCs and operator access controls.",
    },
  ]),
};

test("resolvePrivacyNoticeConfig provides local defaults for self-hosted mode", () => {
  const config = resolvePrivacyNoticeConfig({});

  assert.equal(config.deploymentMode, "local");
  assert.equal(config.isUsingDefaultLocalNotice, true);
  assert.match(config.importSummary.retention, /15 minutes/i);
  assert.match(config.importSummary.recipients, /loopback browser origins/i);
  assert.ok(
    config.processors.some((processor) =>
      processor.name.includes("Yahoo Finance"),
    ),
  );
});

test("resolvePrivacyNoticeConfig accepts mixed-deployment overrides", () => {
  const config = resolvePrivacyNoticeConfig(COMPLETE_ENV);

  assert.equal(config.deploymentMode, "mixed");
  assert.equal(config.controller.name, "Finhance Ops Ltd.");
  assert.equal(config.rightsContact.email, "rights@finhance.test");
  assert.equal(config.supervisoryAuthority.name, "Italian Garante");
  assert.equal(config.processingActivities.length, 6);
  assert.ok(config.processors.some((processor) => processor.name === "Neon"));
  assert.ok(
    config.transfers.some(
      (transfer) => transfer.destination === "United States",
    ),
  );
});

test("resolvePrivacyNoticeConfig rejects managed or mixed mode when required operator facts are missing", () => {
  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        FINHANCE_PRIVACY_DEPLOYMENT_MODE: "managed",
      }),
    /FINHANCE_PRIVACY_CONTROLLER_NAME/,
  );
});

test("resolvePrivacyNoticeConfig rejects transfer entries without safeguard wording", () => {
  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        ...COMPLETE_ENV,
        FINHANCE_PRIVACY_TRANSFERS_JSON: JSON.stringify([
          {
            destination: "United States",
            purpose: "Support",
            dataCategories: ["Transaction excerpts"],
          },
        ]),
      }),
    /safeguard/i,
  );
});

test("resolvePrivacyNoticeConfig applies retention overrides while preserving code-owned defaults elsewhere", () => {
  const config = resolvePrivacyNoticeConfig({
    ...COMPLETE_ENV,
    FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON: JSON.stringify({
      snapshotHistory: {
        retention: "180 days unless the operator extends the period.",
        detail: "Configured override for hosted deployments.",
      },
    }),
  });

  const snapshotHistory = config.retention.find(
    (entry) => entry.key === "snapshotHistory",
  );
  const requestSafety = config.retention.find(
    (entry) => entry.key === "requestSafety",
  );

  assert.equal(
    snapshotHistory?.retention,
    "180 days unless the operator extends the period.",
  );
  assert.equal(
    snapshotHistory?.detail,
    "Configured override for hosted deployments.",
  );
  assert.match(requestSafety?.retention ?? "", /24 hours/i);
});

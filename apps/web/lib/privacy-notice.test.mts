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
  assert.match(
    config.importSummary.recipients,
    /CSV uploads are not sent to Groq or market-data providers/i,
  );
  assert.equal(config.lastUpdated, "2026-10-01");
  assert.ok(
    config.categoryGroups.some((group) =>
      group.items.some((item) =>
        /mobile access and refresh credentials/i.test(item),
      ),
    ),
  );
  assert.ok(
    config.processingActivities.some(
      (activity) =>
        activity.key === "marketData" &&
        /historical chart/i.test(activity.purpose),
    ),
  );
  assert.ok(
    config.retention.some(
      (entry) =>
        entry.key === "requestSafety" &&
        /performance-series cache/i.test(entry.retention),
    ),
  );
  assert.ok(
    config.processors.some((processor) =>
      processor.name.includes("Yahoo Finance"),
    ),
  );
  assert.ok(config.processors.some((processor) => processor.name === "EODHD"));
  assert.ok(
    config.processors.some((processor) => processor.name === "Marketstack"),
  );
  assert.ok(config.processors.some((processor) => processor.name === "Groq"));
  assert.ok(
    config.transfers.some((transfer) =>
      /Groq infrastructure/i.test(transfer.destination),
    ),
  );
  assert.ok(
    config.retention.some(
      (entry) =>
        entry.key === "cloudDraftProcessing" &&
        /does not store the transaction prompt/i.test(entry.retention),
    ),
  );
});

test("resolvePrivacyNoticeConfig keeps the local warning visible when required privacy contacts still use fallbacks", () => {
  const config = resolvePrivacyNoticeConfig({
    FINHANCE_PRIVACY_CONTROLLER_NAME: "Self-hosted operator",
  });

  assert.equal(config.isUsingDefaultLocalNotice, true);
  assert.equal(
    config.rightsContact.name,
    "The operator of this finhance workspace",
  );
});

test("resolvePrivacyNoticeConfig accepts mixed-deployment overrides", () => {
  const config = resolvePrivacyNoticeConfig(COMPLETE_ENV);

  assert.equal(config.deploymentMode, "mixed");
  assert.equal(config.controller.name, "Finhance Ops Ltd.");
  assert.equal(config.rightsContact.email, "rights@finhance.test");
  assert.equal(config.supervisoryAuthority.name, "Italian Garante");
  assert.equal(config.processingActivities.length, 7);
  assert.ok(
    config.processingActivities.some(
      (activity) =>
        activity.key === "cloudDrafts" &&
        /explicitly enables/i.test(activity.purpose),
    ),
  );
  assert.ok(config.processors.some((processor) => processor.name === "Neon"));
  assert.ok(
    config.transfers.some(
      (transfer) => transfer.destination === "United States",
    ),
  );
  assert.match(config.importSummary.recipients, /Neon/i);
  assert.match(
    config.importSummary.recipients,
    /recipients and transfers for each processing purpose/i,
  );
  assert.equal(config.isUsingDefaultLocalNotice, false);
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

test("resolvePrivacyNoticeConfig rejects managed or mixed mode when rights contact has no reachable channel", () => {
  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        ...COMPLETE_ENV,
        FINHANCE_PRIVACY_RIGHTS_EMAIL: undefined,
      }),
    /FINHANCE_PRIVACY_RIGHTS/,
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

test("resolvePrivacyNoticeConfig rejects unsafe operator-supplied external URLs", () => {
  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        ...COMPLETE_ENV,
        FINHANCE_PRIVACY_CONTROLLER_WEBSITE: "javascript:alert(1)",
      }),
    /FINHANCE_PRIVACY_CONTROLLER_WEBSITE/,
  );

  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        ...COMPLETE_ENV,
        FINHANCE_PRIVACY_PROCESSORS_JSON: JSON.stringify([
          {
            name: "Neon",
            role: "Hosted Postgres",
            purpose: "Primary database hosting",
            location: "EU region selected by the operator",
            dataCategories: ["Workspace finance records", "Snapshot history"],
            website: "http://neon.tech/",
          },
        ]),
      }),
    /website/,
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

test("resolvePrivacyNoticeConfig includes postal and routing instructions in the rights summary", () => {
  const config = resolvePrivacyNoticeConfig({
    ...COMPLETE_ENV,
    FINHANCE_PRIVACY_RIGHTS_EMAIL: undefined,
    FINHANCE_PRIVACY_RIGHTS_WEBSITE: "https://example.com/privacy-requests",
    FINHANCE_PRIVACY_RIGHTS_POSTAL_ADDRESS: "Via Example 1, Rome",
    FINHANCE_PRIVACY_RIGHTS_INSTRUCTIONS:
      "Include the workspace name in your request.",
  });

  assert.match(
    config.importSummary.rights,
    /https:\/\/example\.com\/privacy-requests/i,
  );
  assert.match(config.importSummary.rights, /Via Example 1, Rome/i);
  assert.match(config.importSummary.rights, /Include the workspace name/i);
});

test("notice distinguishes preview expiry from request-driven deletion", () => {
  const config = resolvePrivacyNoticeConfig({});
  assert.match(config.importSummary.retention, /expire after 15 minutes/i);
  assert.match(config.importSummary.retention, /subsequent import operation/i);
  assert.match(config.importSummary.retention, /idle workspace/i);
});

test("notice includes authentication, app-lock storage, and consent withdrawal", () => {
  const config = resolvePrivacyNoticeConfig({});
  const categories = config.categoryGroups
    .flatMap((group) => group.items)
    .join(" ");
  assert.match(categories, /passkey identifiers, public keys/i);
  assert.match(categories, /passcode verifier/i);
  assert.match(categories, /rate-limit/i);
  assert.ok(config.retention.some((entry) => entry.key === "authentication"));
  assert.ok(config.retention.some((entry) => entry.key === "appLock"));
  assert.match(
    config.rightsStatements.join(" "),
    /without affecting the lawfulness of earlier processing/i,
  );
});

test("operator transfer details replace the matching built-in disclosure", () => {
  const config = resolvePrivacyNoticeConfig({
    ...COMPLETE_ENV,
    FINHANCE_PRIVACY_TRANSFERS_JSON: JSON.stringify([
      {
        provider: "Groq",
        destination: "United States",
        purpose: "Optional transaction drafts",
        dataCategories: ["Redacted transaction text"],
        safeguard:
          "Example operator-confirmed safeguards; copies from the rights contact.",
      },
    ]),
  });
  const groq = config.transfers.filter((entry) => entry.provider === "Groq");
  assert.equal(groq.length, 1);
  assert.match(groq[0].safeguard, /operator-confirmed safeguards/i);
  assert.equal(config.transfers.length, 4);
  assert.throws(
    () =>
      resolvePrivacyNoticeConfig({
        ...COMPLETE_ENV,
        FINHANCE_PRIVACY_TRANSFERS_JSON: JSON.stringify([
          {
            provider: "Unknown provider",
            destination: "United States",
            purpose: "Drafts",
            dataCategories: [],
            safeguard: "Example",
          },
        ]),
      }),
    /provider must name a built-in provider/,
  );
});

test("updated product disclosures advance the date without hiding newer operator revisions", () => {
  assert.equal(
    resolvePrivacyNoticeConfig(COMPLETE_ENV).lastUpdated,
    "2026-10-01",
  );
  assert.equal(
    resolvePrivacyNoticeConfig({
      ...COMPLETE_ENV,
      FINHANCE_PRIVACY_LAST_UPDATED: "2026-10-02",
    }).lastUpdated,
    "2026-10-02",
  );
});

test("backup retention can be supplied without claiming unknown deployment periods", () => {
  const config = resolvePrivacyNoticeConfig({
    ...COMPLETE_ENV,
    FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON: JSON.stringify({
      backupsAndLogs: {
        retention: "Example deployment: backups 7 days, logs 14 days.",
        detail: "Deleted records age out with the backup rotation.",
      },
    }),
  });
  assert.match(
    config.retention.find((entry) => entry.key === "backupsAndLogs")!.retention,
    /7 days/,
  );
  assert.match(
    resolvePrivacyNoticeConfig({}).retention.find(
      (entry) => entry.key === "backupsAndLogs",
    )!.retention,
    /has not supplied/,
  );
  assert.match(
    config.importSummary.recipients,
    /CSV uploads are not sent to Groq or market-data providers/i,
  );
});

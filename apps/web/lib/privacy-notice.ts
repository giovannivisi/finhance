export type PrivacyDeploymentMode = "local" | "managed" | "mixed";

export type PrivacyPurposeKey =
  | "workspaceRecords"
  | "importsAndExports"
  | "snapshotsAndReview"
  | "marketData"
  | "securityAndReliability"
  | "browserPreferences";

export type PrivacyRetentionKey =
  | "workspaceData"
  | "importPreviewPayloads"
  | "snapshotHistory"
  | "requestSafety"
  | "browserPreferences";

export interface PrivacyContact {
  name: string;
  email: string | null;
  website: string | null;
  postalAddress: string | null;
  instructions: string | null;
}

export interface PrivacyLegalBasis {
  key: PrivacyPurposeKey;
  title: string;
  basis: string;
  explanation: string;
  legitimateInterests: string | null;
}

export interface PrivacyProcessor {
  name: string;
  role: string;
  purpose: string;
  location: string;
  dataCategories: string[];
  website: string | null;
}

export interface PrivacyTransfer {
  destination: string;
  purpose: string;
  dataCategories: string[];
  safeguard: string;
}

export interface PrivacyRetentionEntry {
  key: PrivacyRetentionKey;
  title: string;
  retention: string;
  detail: string;
}

export interface PrivacyCategoryGroup {
  title: string;
  items: string[];
}

export interface PrivacyProcessingActivity {
  key: PrivacyPurposeKey;
  title: string;
  purpose: string;
  dataCategories: string[];
  legalBasis: PrivacyLegalBasis;
}

export interface ImportPrivacySummary {
  controller: string;
  purpose: string;
  legalBasis: string;
  retention: string;
  recipients: string;
  rights: string;
  fullNoticeHref: string;
  fullNoticeLabel: string;
}

export interface PrivacyNoticeConfig {
  deploymentMode: PrivacyDeploymentMode;
  lastUpdated: string;
  controller: PrivacyContact;
  dpo: PrivacyContact | null;
  rightsContact: PrivacyContact;
  supervisoryAuthority: {
    name: string;
    complaintUrl: string;
  };
  isUsingDefaultLocalNotice: boolean;
  categoryGroups: PrivacyCategoryGroup[];
  sourceOfData: string[];
  consequenceOfNotProviding: string;
  processingActivities: PrivacyProcessingActivity[];
  processors: PrivacyProcessor[];
  transfers: PrivacyTransfer[];
  retention: PrivacyRetentionEntry[];
  automatedDecisionMaking: string;
  importSummary: ImportPrivacySummary;
}

type EnvSource = Record<string, string | undefined>;

type PrivacyLegalBasisInput = {
  basis: string;
  explanation: string;
  legitimateInterests?: string;
};

type PrivacyProcessorInput = {
  name: string;
  role: string;
  purpose: string;
  location: string;
  dataCategories: string[];
  website?: string;
};

type PrivacyTransferInput = {
  destination: string;
  purpose: string;
  dataCategories: string[];
  safeguard: string;
};

type PrivacyRetentionOverrideInput = Partial<
  Record<
    PrivacyRetentionKey,
    {
      title?: string;
      retention?: string;
      detail?: string;
    }
  >
>;

type PrivacyContactFallback = {
  name: string;
  instructions?: string;
};

type CreatedContactResult = {
  contact: PrivacyContact | null;
  usedFallback: boolean;
};

const PRIVACY_NOTICE_PATH = "/privacy";
const DEFAULT_LAST_UPDATED = "2026-04-30";
const DEFAULT_SUPERVISORY_AUTHORITY_URL =
  "https://www.edpb.europa.eu/about-edpb/about-edpb/members_en";

const PROCESSING_ACTIVITY_DEFINITIONS: Record<
  PrivacyPurposeKey,
  {
    title: string;
    purpose: string;
    dataCategories: string[];
  }
> = {
  workspaceRecords: {
    title: "Operate the finance workspace",
    purpose:
      "To store, display, edit, reconcile, and organise the accounts, transactions, assets, liabilities, budgets, categories, and recurring definitions that make up the workspace.",
    dataCategories: [
      "Account, category, asset, liability, transaction, recurring-rule, and budget records.",
      "Free-text fields such as names, institutions, descriptions, notes, and counterparties.",
      "Valuation fields such as balances, prices, FX rates, and opening-balance history.",
    ],
  },
  importsAndExports: {
    title: "Import and export workspace data",
    purpose:
      "To preview CSV uploads, merge imported rows safely, and generate round-trip export packages for migration and restore workflows.",
    dataCategories: [
      "Uploaded CSV files and the rows parsed from them.",
      "Import preview summaries, issues, and batch metadata.",
      "Imported personal data that may include institutions, notes, descriptions, and counterparties.",
    ],
  },
  snapshotsAndReview: {
    title: "Create snapshot history and monthly review context",
    purpose:
      "To capture dated net-worth totals, anchor monthly review boundaries, and show historical portfolio changes over time.",
    dataCategories: [
      "Snapshot dates, capture timestamps, base currency, and derived asset/liability/net-worth totals.",
      "Flags showing whether a snapshot is partial and how many valuations were unavailable.",
    ],
  },
  marketData: {
    title: "Refresh market prices and FX rates",
    purpose:
      "To fetch quote and exchange-rate data for supported market assets and currencies when valuations are refreshed.",
    dataCategories: [
      "Requested market symbols, exchange suffixes, and currency pairs.",
      "Technical request metadata needed to call the external quote provider.",
    ],
  },
  securityAndReliability: {
    title: "Protect write operations and keep the service reliable",
    purpose:
      "To reject duplicate writes, throttle abuse, enforce local-only access while authentication is disabled, and keep short-lived operational state.",
    dataCategories: [
      "Idempotency keys, hashed request fingerprints, response status codes, and request bodies cached for replay protection.",
      "Loopback IP, host-header, origin, and referer checks used to enforce local-only access.",
      "Operational timestamps and short-lived process state used to coordinate imports or refresh jobs.",
    ],
  },
  browserPreferences: {
    title: "Remember browser-side preferences",
    purpose:
      "To remember the selected theme, whether monetary values should be hidden, and whether the dashboard refresh attempt already happened in this browser session.",
    dataCategories: [
      "Theme preference stored in local storage.",
      "Hide-balances preference stored in local storage.",
      "Single-session dashboard refresh flag stored in session storage.",
    ],
  },
};

const PURPOSE_ORDER: PrivacyPurposeKey[] = [
  "workspaceRecords",
  "importsAndExports",
  "snapshotsAndReview",
  "marketData",
  "securityAndReliability",
  "browserPreferences",
];

const CATEGORY_GROUPS: PrivacyCategoryGroup[] = [
  {
    title: "Finance records you or your operator keep in the workspace",
    items: [
      "Accounts, balances, currencies, institutions, opening-balance dates, and account notes.",
      "Assets and liabilities, including optional market tickers, exchanges, balances, quantities, and valuation notes.",
      "Transactions, categories, budgets, and recurring definitions, including descriptions, notes, counterparties, and transfer references.",
    ],
  },
  {
    title: "Imported and derived records",
    items: [
      "CSV uploads and parsed import rows used for preview or apply.",
      "Import batch summaries, validation issues, and export package metadata.",
      "Net-worth snapshots and review-supporting history derived from the workspace totals.",
    ],
  },
  {
    title: "Technical and preference data",
    items: [
      "Idempotency records, hashed request fingerprints, and short-lived operation state used to protect writes.",
      "Loopback access checks based on request metadata while authentication is disabled.",
      "Browser-side theme, privacy-display, and session flags stored on the device you use to access the app.",
    ],
  },
  {
    title: "Third-party data that may appear in your records",
    items: [
      "Counterparty, payee, institution, and memo/note fields can contain information about other people or organisations.",
      "Imported files may include personal data supplied by another service or another person before the file reached finhance.",
    ],
  },
];

const SOURCE_OF_DATA = [
  "Directly from you when you enter, edit, review, or delete finance records inside the app.",
  "From files you upload to the import flow, including files that may contain data about third parties such as counterparties, institutions, and notes.",
  "From the market data provider when you ask finhance to refresh quotes or FX rates for supported assets and currencies.",
];

const DEFAULT_LOCAL_LEGAL_BASES: Record<
  PrivacyPurposeKey,
  PrivacyLegalBasisInput
> = {
  workspaceRecords: {
    basis:
      "Art. 6(1)(b) GDPR — performance of a contract or steps you ask the operator to take before providing the workspace.",
    explanation:
      "Used to keep the finance workspace available, consistent, and usable for the records you choose to store in it.",
  },
  importsAndExports: {
    basis:
      "Art. 6(1)(b) GDPR — performance of a contract or steps you ask the operator to take before providing the import/export workflow.",
    explanation:
      "Used to preview, merge, restore, or export the files you intentionally submit through the migration flow.",
  },
  snapshotsAndReview: {
    basis:
      "Art. 6(1)(b) GDPR — performance of a contract for the history and review features you choose to use.",
    explanation:
      "Used to capture net-worth history and to explain monthly changes with snapshot boundaries.",
  },
  marketData: {
    basis:
      "Art. 6(1)(b) GDPR — performance of a contract when you request quote or FX refresh features.",
    explanation:
      "Used only when the workspace refreshes market prices or FX rates for supported assets and currencies.",
  },
  securityAndReliability: {
    basis:
      "Art. 6(1)(f) GDPR — legitimate interests in protecting the service, preventing duplicate writes, and keeping the local API reliable.",
    explanation:
      "Used to prevent duplicate submissions, enforce the local-only trust boundary while authentication is disabled, and keep operational state consistent.",
    legitimateInterests:
      "Maintaining the integrity of the workspace, limiting accidental duplicate writes, and preventing requests from non-local origins while authentication is disabled.",
  },
  browserPreferences: {
    basis:
      "Art. 6(1)(f) GDPR — legitimate interests in remembering your local UI choices on the device you use to access the app.",
    explanation:
      "Used to remember theme and privacy-display preferences without asking you to set them again on every page load.",
    legitimateInterests:
      "Providing a stable user interface and letting users hide monetary values locally on their device.",
  },
};

const BUILTIN_PROCESSORS: PrivacyProcessor[] = [
  {
    name: "Yahoo Finance public quote API",
    role: "Market data provider",
    purpose:
      "Provides quote and FX responses when a user refreshes supported market or currency valuations.",
    location: "Provider-managed infrastructure",
    dataCategories: [
      "Requested market symbols and currency pairs.",
      "Technical request metadata associated with the outbound API call.",
    ],
    website: "https://finance.yahoo.com/",
  },
];

const BUILTIN_TRANSFERS: PrivacyTransfer[] = [
  {
    destination: "Provider-managed Yahoo Finance infrastructure",
    purpose:
      "Quote and FX refresh requests for supported assets and currencies.",
    dataCategories: [
      "Requested market symbols and currency pairs.",
      "Technical request metadata associated with the outbound API call.",
    ],
    safeguard:
      "The request is sent over HTTPS, but this codebase does not embed a separate operator-specific transfer agreement or region lock for Yahoo Finance. Operators should assess whether remote quote refresh is appropriate for their deployment and jurisdiction.",
  },
];

const DEFAULT_RETENTION: Record<
  PrivacyRetentionKey,
  {
    title: string;
    retention: string;
    detail: string;
  }
> = {
  workspaceData: {
    title: "Workspace finance records",
    retention:
      "Stored until the operator edits or removes the relevant record, or until the deployment's own database retention/back-up policy removes it.",
    detail:
      "This includes accounts, transactions, categories, assets, recurring rules, and budgets. The product stores them as the working dataset for the workspace.",
  },
  importPreviewPayloads: {
    title: "Import preview payloads and import batches",
    retention:
      "Successful preview payloads are stripped after about 15 minutes. Import batch summaries and issue metadata can remain until the underlying records are removed from the database.",
    detail:
      "The current API clears expired preview payloads from storage after the preview TTL, but batch-level metadata is still retained for workflow history.",
  },
  snapshotHistory: {
    title: "Net-worth snapshot history",
    retention:
      "Stored until the operator removes the records or applies an external retention policy.",
    detail:
      "The current product version does not provide an end-user self-service delete action for snapshot history, so erasure requests must go through the configured rights contact.",
  },
  requestSafety: {
    title: "Idempotency and request-safety records",
    retention:
      "Completed idempotency records are deleted after about 24 hours. Stale in-progress records are deleted after about 10 minutes. In-memory market quote cache entries live for about 5 minutes per process.",
    detail:
      "These records exist to prevent duplicate writes, coordinate retries, and avoid repeating the same market quote lookup unnecessarily.",
  },
  browserPreferences: {
    title: "Browser-side preferences",
    retention:
      "Stored on your device until you clear browser storage, change the setting, or end the current browser session where session storage is used.",
    detail:
      "Theme and hide-balances preferences live in local storage. The dashboard refresh-attempt flag lives in session storage.",
  },
};

function readValue(env: EnvSource, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function parseDeploymentMode(env: EnvSource): PrivacyDeploymentMode {
  const value = readValue(env, "FINHANCE_PRIVACY_DEPLOYMENT_MODE");

  if (!value) {
    return "local";
  }

  if (value === "local" || value === "managed" || value === "mixed") {
    return value;
  }

  throw new Error(
    `FINHANCE_PRIVACY_DEPLOYMENT_MODE must be one of "local", "managed", or "mixed". Received "${value}".`,
  );
}

function parseJsonValue(env: EnvSource, name: string): unknown | null {
  const raw = readValue(env, name);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${name}: ${error instanceof Error ? error.message : "Unable to parse value."}`,
    );
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function normalizeHttpsUrl(
  value: string | null,
  fieldName: string,
): string | null {
  if (!value) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid absolute HTTPS URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use the https: scheme.`);
  }

  return parsed.toString();
}

function createContact(
  env: EnvSource,
  prefix: string,
  required: boolean,
  fallback?: PrivacyContactFallback,
): CreatedContactResult {
  const configuredName = readValue(env, `${prefix}_NAME`);
  const name = configuredName ?? fallback?.name ?? null;
  const email = readValue(env, `${prefix}_EMAIL`);
  const website = normalizeHttpsUrl(
    readValue(env, `${prefix}_WEBSITE`),
    `${prefix}_WEBSITE`,
  );
  const postalAddress = readValue(env, `${prefix}_POSTAL_ADDRESS`);
  const configuredInstructions = readValue(env, `${prefix}_INSTRUCTIONS`);
  const instructions = configuredInstructions ?? fallback?.instructions ?? null;

  if (!name) {
    if (!required) {
      return {
        contact: null,
        usedFallback: false,
      };
    }
    throw new Error(`Missing required privacy configuration: ${prefix}_NAME`);
  }

  return {
    contact: {
      name,
      email,
      website,
      postalAddress,
      instructions,
    },
    usedFallback:
      fallback !== undefined &&
      (configuredName === null || configuredInstructions === null),
  };
}

function hasReachableContactChannel(contact: PrivacyContact): boolean {
  return Boolean(contact.email || contact.website || contact.postalAddress);
}

function assertReachableContactChannel(
  contact: PrivacyContact,
  prefix: string,
  deploymentMode: PrivacyDeploymentMode,
): void {
  if (deploymentMode !== "local" && !hasReachableContactChannel(contact)) {
    throw new Error(
      `${prefix} must include at least one reachable contact channel: ${prefix}_EMAIL, ${prefix}_WEBSITE, or ${prefix}_POSTAL_ADDRESS.`,
    );
  }
}

function parseLegalBases(
  env: EnvSource,
  deploymentMode: PrivacyDeploymentMode,
): PrivacyLegalBasis[] {
  const raw = parseJsonValue(env, "FINHANCE_PRIVACY_LEGAL_BASES_JSON");
  const source =
    raw === null
      ? deploymentMode === "local"
        ? DEFAULT_LOCAL_LEGAL_BASES
        : null
      : raw;

  if (source === null) {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_LEGAL_BASES_JSON",
    );
  }

  if (!isObjectRecord(source)) {
    throw new Error(
      "FINHANCE_PRIVACY_LEGAL_BASES_JSON must be a JSON object keyed by privacy purpose.",
    );
  }

  return PURPOSE_ORDER.map((key) => {
    const entry = source[key];

    if (!isObjectRecord(entry)) {
      throw new Error(
        `FINHANCE_PRIVACY_LEGAL_BASES_JSON is missing the "${key}" entry.`,
      );
    }

    const basis = entry.basis;
    const explanation = entry.explanation;
    const legitimateInterests = entry.legitimateInterests;

    if (typeof basis !== "string" || typeof explanation !== "string") {
      throw new Error(
        `FINHANCE_PRIVACY_LEGAL_BASES_JSON.${key} must contain string "basis" and "explanation" fields.`,
      );
    }

    return {
      key,
      title: PROCESSING_ACTIVITY_DEFINITIONS[key].title,
      basis,
      explanation,
      legitimateInterests:
        typeof legitimateInterests === "string" ? legitimateInterests : null,
    };
  });
}

function parseProcessors(
  env: EnvSource,
  deploymentMode: PrivacyDeploymentMode,
): PrivacyProcessor[] {
  const raw = parseJsonValue(env, "FINHANCE_PRIVACY_PROCESSORS_JSON");

  if (raw === null && deploymentMode !== "local") {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_PROCESSORS_JSON",
    );
  }

  if (raw !== null && !Array.isArray(raw)) {
    throw new Error("FINHANCE_PRIVACY_PROCESSORS_JSON must be a JSON array.");
  }

  const configuredProcessors = (raw ?? []).map((entry, index) => {
    if (!isObjectRecord(entry)) {
      throw new Error(
        `FINHANCE_PRIVACY_PROCESSORS_JSON[${index}] must be a JSON object.`,
      );
    }

    const { name, role, purpose, location, dataCategories, website } = entry;

    if (
      typeof name !== "string" ||
      typeof role !== "string" ||
      typeof purpose !== "string" ||
      typeof location !== "string" ||
      !isStringArray(dataCategories)
    ) {
      throw new Error(
        `FINHANCE_PRIVACY_PROCESSORS_JSON[${index}] must contain string "name", "role", "purpose", "location", and string-array "dataCategories" fields.`,
      );
    }

    return {
      name,
      role,
      purpose,
      location,
      dataCategories,
      website:
        typeof website === "string"
          ? (normalizeHttpsUrl(
              website,
              `FINHANCE_PRIVACY_PROCESSORS_JSON[${index}].website`,
            ) ?? undefined)
          : undefined,
    } satisfies PrivacyProcessorInput;
  });

  return [
    ...configuredProcessors.map((processor) => ({
      ...processor,
      website: processor.website ?? null,
    })),
    ...BUILTIN_PROCESSORS,
  ];
}

function parseTransfers(
  env: EnvSource,
  deploymentMode: PrivacyDeploymentMode,
): PrivacyTransfer[] {
  const raw = parseJsonValue(env, "FINHANCE_PRIVACY_TRANSFERS_JSON");

  if (raw === null && deploymentMode !== "local") {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_TRANSFERS_JSON",
    );
  }

  if (raw !== null && !Array.isArray(raw)) {
    throw new Error("FINHANCE_PRIVACY_TRANSFERS_JSON must be a JSON array.");
  }

  const configuredTransfers = (raw ?? []).map((entry, index) => {
    if (!isObjectRecord(entry)) {
      throw new Error(
        `FINHANCE_PRIVACY_TRANSFERS_JSON[${index}] must be a JSON object.`,
      );
    }

    const { destination, purpose, dataCategories, safeguard } = entry;

    if (
      typeof destination !== "string" ||
      typeof purpose !== "string" ||
      !isStringArray(dataCategories) ||
      typeof safeguard !== "string"
    ) {
      throw new Error(
        `FINHANCE_PRIVACY_TRANSFERS_JSON[${index}] must contain string "destination", "purpose", "safeguard", and string-array "dataCategories" fields.`,
      );
    }

    return {
      destination,
      purpose,
      dataCategories,
      safeguard,
    } satisfies PrivacyTransferInput;
  });

  return [...configuredTransfers, ...BUILTIN_TRANSFERS];
}

function parseRetention(env: EnvSource): PrivacyRetentionEntry[] {
  const raw = parseJsonValue(env, "FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON");

  if (raw !== null && !isObjectRecord(raw)) {
    throw new Error(
      "FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON must be a JSON object keyed by retention area.",
    );
  }

  const overrides = (raw ?? {}) as PrivacyRetentionOverrideInput;
  const keys = Object.keys(DEFAULT_RETENTION) as PrivacyRetentionKey[];

  return keys.map((key) => {
    const override = overrides[key];

    if (override !== undefined && !isObjectRecord(override)) {
      throw new Error(
        `FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON.${key} must be a JSON object.`,
      );
    }

    const base = DEFAULT_RETENTION[key];

    return {
      key,
      title: typeof override?.title === "string" ? override.title : base.title,
      retention:
        typeof override?.retention === "string"
          ? override.retention
          : base.retention,
      detail:
        typeof override?.detail === "string" ? override.detail : base.detail,
    };
  });
}

function joinList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function formatRightsLine(contact: PrivacyContact): string {
  const channels: string[] = [];

  if (contact.email) {
    channels.push(`by email at ${contact.email}`);
  }

  if (contact.website) {
    channels.push(`using ${contact.website}`);
  }

  if (contact.postalAddress) {
    channels.push(`by post at ${contact.postalAddress}`);
  }

  const base =
    channels.length > 0
      ? `To exercise your rights, contact ${contact.name} ${joinList(channels)}.`
      : `To exercise your rights, contact ${contact.name}.`;

  if (!contact.instructions) {
    return base;
  }

  return `${base} ${contact.instructions}`;
}

function formatImportRecipientsSummary(input: {
  controllerName: string;
  processors: PrivacyProcessor[];
  transfers: PrivacyTransfer[];
}): string {
  const processorNames = input.processors.map((processor) => processor.name);
  const processorSummary =
    processorNames.length > 0
      ? `and the processors configured for this deployment, including ${joinList(processorNames)}`
      : "and the backing infrastructure configured for this deployment";
  const transferDestinations = Array.from(
    new Set(input.transfers.map((transfer) => transfer.destination)),
  );
  const transferSummary =
    transferDestinations.length > 0
      ? ` International transfers listed for this deployment include ${joinList(transferDestinations)}.`
      : "";

  return `Import files are handled by ${input.controllerName} ${processorSummary}.${transferSummary} The current import endpoints also reject non-loopback browser origins while authentication is disabled.`;
}

export function resolvePrivacyNoticeConfig(
  env: EnvSource,
): PrivacyNoticeConfig {
  const deploymentMode = parseDeploymentMode(env);
  const isLocalMode = deploymentMode === "local";
  const controller = createContact(
    env,
    "FINHANCE_PRIVACY_CONTROLLER",
    true,
    isLocalMode
      ? {
          name: "The operator of this finhance workspace",
          instructions:
            "If someone else runs or shares this workspace with you, contact that person or organisation for privacy questions and requests.",
        }
      : undefined,
  );
  const rightsContact = createContact(
    env,
    "FINHANCE_PRIVACY_RIGHTS",
    true,
    isLocalMode
      ? {
          name: "The operator of this finhance workspace",
          instructions:
            "Use the contact channel provided by the person or organisation operating this workspace if you need to exercise privacy rights.",
        }
      : undefined,
  );
  const dpo = createContact(env, "FINHANCE_PRIVACY_DPO", false).contact;
  assertReachableContactChannel(
    controller.contact!,
    "FINHANCE_PRIVACY_CONTROLLER",
    deploymentMode,
  );
  assertReachableContactChannel(
    rightsContact.contact!,
    "FINHANCE_PRIVACY_RIGHTS",
    deploymentMode,
  );
  const isUsingDefaultLocalNotice =
    isLocalMode && (controller.usedFallback || rightsContact.usedFallback);
  const legalBases = parseLegalBases(env, deploymentMode);
  const processors = parseProcessors(env, deploymentMode);
  const transfers = parseTransfers(env, deploymentMode);
  const retention = parseRetention(env);
  const lastUpdated =
    readValue(env, "FINHANCE_PRIVACY_LAST_UPDATED") ??
    (isLocalMode ? DEFAULT_LAST_UPDATED : null);

  if (!lastUpdated) {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_LAST_UPDATED",
    );
  }

  const supervisoryAuthorityName =
    readValue(env, "FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_NAME") ??
    (isLocalMode ? "Your local data protection authority" : null);
  const supervisoryAuthorityUrl = normalizeHttpsUrl(
    readValue(env, "FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_URL") ??
      (isLocalMode ? DEFAULT_SUPERVISORY_AUTHORITY_URL : null),
    "FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_URL",
  );

  if (!supervisoryAuthorityName) {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_NAME",
    );
  }

  if (!supervisoryAuthorityUrl) {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_URL",
    );
  }

  const legalBasisByKey = new Map(
    legalBases.map((entry) => [entry.key, entry] as const),
  );

  const processingActivities = PURPOSE_ORDER.map((key) => ({
    key,
    title: PROCESSING_ACTIVITY_DEFINITIONS[key].title,
    purpose: PROCESSING_ACTIVITY_DEFINITIONS[key].purpose,
    dataCategories: PROCESSING_ACTIVITY_DEFINITIONS[key].dataCategories,
    legalBasis: legalBasisByKey.get(key)!,
  }));

  const importBasis = legalBasisByKey.get("importsAndExports")!;
  const importRetention = retention.find(
    (entry) => entry.key === "importPreviewPayloads",
  )!;

  return {
    deploymentMode,
    lastUpdated,
    controller: controller.contact!,
    dpo,
    rightsContact: rightsContact.contact!,
    supervisoryAuthority: {
      name: supervisoryAuthorityName,
      complaintUrl: supervisoryAuthorityUrl,
    },
    isUsingDefaultLocalNotice,
    categoryGroups: CATEGORY_GROUPS,
    sourceOfData: SOURCE_OF_DATA,
    consequenceOfNotProviding:
      "You are not required to upload data you do not want finhance to process, but the app cannot import, reconcile, snapshot, or analyse records you choose not to provide. If you disable market-data refresh, quoted valuations and FX-based totals may be incomplete.",
    processingActivities,
    processors,
    transfers,
    retention,
    automatedDecisionMaking:
      "The current code reviewed for this notice does not use solely automated decision-making or profiling to make decisions with legal or similarly significant effects about a person.",
    importSummary: {
      controller: `${controller.contact!.name} decides how the import flow is run for this deployment.`,
      purpose: importBasis.explanation,
      legalBasis: importBasis.basis,
      retention: importRetention.retention,
      recipients: formatImportRecipientsSummary({
        controllerName: controller.contact!.name,
        processors,
        transfers,
      }),
      rights: formatRightsLine(rightsContact.contact!),
      fullNoticeHref: PRIVACY_NOTICE_PATH,
      fullNoticeLabel: "Read the full privacy notice",
    },
  };
}

export function getPrivacyNoticeConfig(): PrivacyNoticeConfig {
  return resolvePrivacyNoticeConfig(process.env);
}

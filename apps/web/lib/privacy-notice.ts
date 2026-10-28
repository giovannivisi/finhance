export type PrivacyDeploymentMode = "local" | "managed" | "mixed";

export type PrivacyPurposeKey =
  | "workspaceRecords"
  | "cloudDrafts"
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
  | "cloudDraftProcessing"
  | "authentication"
  | "appLock"
  | "backupsAndLogs"
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
  provider?: string;
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
  rightsStatements: string[];
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
  provider?: string;
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
const DEFAULT_LAST_UPDATED = "2026-10-01";
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
  cloudDrafts: {
    title: "Prepare optional cloud-enhanced transaction drafts",
    purpose:
      "To send selected, redacted free-form transaction text to Groq solely to return editable draft fields after the user explicitly enables the feature.",
    dataCategories: [
      "Redacted free-form transaction text that may still contain financial, counterparty, health, religious, or trade-union context supplied by the user.",
      "Provider, model, token-count, status, timestamp, and consent metadata retained by finhance without the prompt or provider response body.",
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
      "To fetch quote, historical chart, and exchange-rate data for supported market assets and currencies when you refresh valuations or load a brokerage performance range.",
    dataCategories: [
      "Requested market symbols, exchange suffixes, and currency pairs.",
      "Historical quote range and interval choices used for brokerage performance charts.",
      "Technical request metadata needed to call the external quote provider.",
    ],
  },
  securityAndReliability: {
    title: "Authenticate users, protect records, and keep the service reliable",
    purpose:
      "To sign users in, manage linked identities and passkeys, protect signed-in sessions, reject duplicate writes, throttle abuse, enforce local-only access while authentication is disabled, and protect the mobile app with an optional local app lock.",
    dataCategories: [
      "Idempotency keys, hashed request fingerprints, response status codes, and response bodies cached for replay protection; those responses may contain finance records.",
      "Loopback IP, host-header, origin, and referer checks used to enforce local-only access.",
      "Operational timestamps and short-lived process state used to coordinate imports, performance-series requests, or refresh jobs.",
      "For hosted mobile sign-in, hashed refresh credentials and generic device labels with session, expiry, and last-used timestamps used to secure and manage signed-in devices.",
      "Hosted identity records, hashed web session tokens, passkey credential identifiers and public keys, signature counters, device type, backup status, transport information, and authentication timestamps.",
      "IP-based rate-limit keys, request counts, and reset timestamps used to limit authentication abuse.",
      "On mobile, a salted passcode verifier, app-lock preferences, failed-attempt and lockout state, and timestamps stored locally. Biometric checks are performed by the operating system; finhance does not receive biometric templates.",
    ],
  },
  browserPreferences: {
    title: "Remember device preferences and mobile connection state",
    purpose:
      "To remember the selected theme, whether monetary values should be hidden, whether the dashboard refresh attempt already happened in this browser session, and how the mobile app reconnects to a chosen server.",
    dataCategories: [
      "Theme and hide-balances preferences stored in browser local storage or mobile device storage.",
      "Single-session dashboard refresh flag stored in browser session storage.",
      "Mobile server URL and server mode stored on the device.",
      "Hosted mobile access and refresh credentials stored in the device keychain so the app can authenticate future proxy requests.",
    ],
  },
};

const PURPOSE_ORDER: PrivacyPurposeKey[] = [
  "workspaceRecords",
  "cloudDrafts",
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
      "Hosted sign-in provider metadata such as provider name, linked email address, email verification status, display name, and linked timestamp.",
      "Profile information such as name, email address, verification status, and profile image, where supplied by your sign-in provider.",
      "Hosted web session records and essential authentication cookies; passkey identifiers, public keys, counters, device and backup metadata, and timestamps. Passkey private keys are not stored by finhance.",
      "IP-based authentication rate-limit records, counts, and reset timestamps.",
      "Browser-side theme, privacy-display, and session flags stored on the device you use to access the app.",
      "Mobile server connection details and hosted mobile access and refresh credentials stored on the device.",
      "For hosted sign-in, a server-side device-session record containing a hashed refresh credential, generic device label, and session timestamps.",
      "Cloud-parser consent events and AI usage metadata, excluding the transaction prompt and provider response body.",
      "Local mobile app-lock passcode verifier, biometric preference, attempt counters, lockout state, and timestamps. Finhance does not collect biometric templates.",
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
  "From market data providers when you ask finhance to refresh quotes or FX rates, or load brokerage performance chart data for supported assets and currencies.",
  "From hosted sign-in providers when you connect Google or GitHub to your account.",
  "From Groq when an explicitly enabled cloud-parser request returns transaction draft fields.",
  "From the mobile app when you save a server URL, choose local display preferences, or sign in to a hosted workspace.",
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
  cloudDrafts: {
    basis:
      "Art. 6(1)(a) GDPR — consent; where submitted text reveals special-category data, Art. 9(2)(a) explicit consent.",
    explanation:
      "Used only after the user explicitly enables cloud-enhanced drafts. You can withdraw consent at any time by turning off cloud-enhanced parsing in Settings; basic parsing remains available. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.",
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
      "Art. 6(1)(b) GDPR — performance of a contract when you request quote or FX refresh, or brokerage performance chart features.",
    explanation:
      "Used only when the workspace refreshes market prices or FX rates, or loads historical chart data for supported assets and currencies.",
  },
  securityAndReliability: {
    basis:
      "Art. 6(1)(f) GDPR — legitimate interests in authenticating users, protecting accounts and records, preventing abuse and duplicate writes, and keeping the service reliable.",
    explanation:
      "Used for hosted sign-in, linked identities, passkeys, session security, rate limiting, optional local app lock, duplicate-write protection, and local-only access while authentication is disabled.",
    legitimateInterests:
      "Protecting users' accounts and financial records, preventing unauthorised access and abuse, and maintaining workspace integrity.",
  },
  browserPreferences: {
    basis:
      "Art. 6(1)(f) GDPR — legitimate interests in remembering your local UI choices and mobile connection state on the device you use to access the app.",
    explanation:
      "Used to remember theme, privacy-display, server connection, and hosted mobile session state without asking you to repeat the same setup on every visit or app launch.",
    legitimateInterests:
      "Providing a stable user interface, letting users hide monetary values locally, and keeping the mobile app connected to the selected workspace.",
  },
};

const BUILTIN_PROCESSORS: PrivacyProcessor[] = [
  {
    name: "Groq",
    role: "Optional cloud transaction-draft processor",
    purpose:
      "Processes selected, redacted free-form transaction text solely to return editable draft fields after explicit opt-in.",
    location: "United States",
    dataCategories: [
      "Redacted free-form transaction text that may still contain financial, counterparty, or special-category context supplied by the user.",
      "Technical request metadata and model usage information associated with the outbound API call.",
    ],
    website: "https://groq.com/",
  },
  {
    name: "EODHD",
    role: "Global exchange-listed security market data provider",
    purpose:
      "Provides latest end-of-day quotes and historical responses for supported exchange-listed securities outside Marketstack's routed coverage.",
    location: "Provider-managed infrastructure",
    dataCategories: [
      "Requested market symbols, provider exchange codes, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    website: "https://eodhd.com/",
  },
  {
    name: "Marketstack",
    role: "Global exchange-listed security market data provider",
    purpose:
      "Provides latest end-of-day quotes and historical responses for exchanges in its published coverage.",
    location: "Provider-managed infrastructure",
    dataCategories: [
      "Requested market symbols, exchange MICs, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    website: "https://marketstack.com/",
  },
  {
    name: "Yahoo Finance public quote API",
    role: "FX, crypto, and Tokyo market data provider",
    purpose:
      "Provides FX, crypto, and Tokyo listing responses when a user requests a supported refresh or historical chart.",
    location: "Provider-managed infrastructure",
    dataCategories: [
      "Requested currency pairs, crypto or Tokyo symbols, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    website: "https://finance.yahoo.com/",
  },
];

const BUILTIN_TRANSFERS: PrivacyTransfer[] = [
  {
    provider: "Groq",
    destination: "Groq infrastructure in the United States",
    purpose:
      "Optional cloud-enhanced transaction draft generation after explicit user consent.",
    dataCategories: [
      "Redacted free-form transaction text and technical request metadata.",
    ],
    safeguard:
      "The operator has not specified a legal transfer mechanism in this notice. Contact the controller for the applicable adequacy decision or contractual safeguards and how to obtain a copy. HTTPS and requesting provider-side storage to be disabled are technical protections, not a legal transfer mechanism.",
  },
  {
    provider: "EODHD",
    destination: "Provider-managed EODHD infrastructure",
    purpose:
      "Quote and historical-price requests for supported exchange-listed securities.",
    dataCategories: [
      "Requested market symbols, provider exchange codes, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    safeguard:
      "The operator has not specified the destination countries or legal transfer mechanism for this provider. Contact the controller for the applicable locations, safeguards and how to obtain a copy. HTTPS is a technical protection, not a legal transfer mechanism.",
  },
  {
    provider: "Marketstack",
    destination: "Provider-managed Marketstack infrastructure",
    purpose:
      "Quote and historical-price requests for supported exchange-listed securities.",
    dataCategories: [
      "Requested market symbols, exchange MICs, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    safeguard:
      "The operator has not specified the destination countries or legal transfer mechanism for this provider. Contact the controller for the applicable locations, safeguards and how to obtain a copy. HTTPS is a technical protection, not a legal transfer mechanism.",
  },
  {
    provider: "Yahoo Finance public quote API",
    destination: "Provider-managed Yahoo Finance infrastructure",
    purpose:
      "FX, crypto, and Tokyo quote or historical-price requests for supported currencies and assets.",
    dataCategories: [
      "Requested currency pairs, crypto or Tokyo symbols, and historical quote ranges.",
      "Technical request metadata associated with the outbound API call.",
    ],
    safeguard:
      "The operator has not specified the destination countries or legal transfer mechanism for this provider. Contact the controller for the applicable locations, safeguards and how to obtain a copy. HTTPS is a technical protection, not a legal transfer mechanism.",
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
      "Stored until the operator edits or removes the relevant record, or until a hosted user permanently deletes their account.",
    detail:
      "This includes accounts, transactions, categories, assets, recurring rules, budgets, brokerage records, and settings. Hosted account deletion removes the live user-owned dataset immediately.",
  },
  importPreviewPayloads: {
    title: "Import preview payloads and import batches",
    retention:
      "Successful previews expire after 15 minutes and can no longer be applied. Their stored payloads are cleared during a subsequent import operation for that workspace, so an idle workspace may retain an expired payload longer. Import batch summaries and issue metadata remain until removed or the hosted account is deleted.",
    detail:
      "Expiry prevents applying a preview; it does not schedule deletion at the 15-minute boundary. Batch-level metadata is retained for workflow history.",
  },
  snapshotHistory: {
    title: "Net-worth snapshot history",
    retention:
      "Stored until the operator removes the records, a hosted user permanently deletes their account, or an external retention policy applies.",
    detail:
      "Hosted account deletion permanently removes all snapshot and net-worth history owned by that user as part of the same database transaction.",
  },
  requestSafety: {
    title: "Idempotency and request-safety records",
    retention:
      "Completed idempotency records are deleted after about 24 hours. Stale in-progress records are deleted after about 10 minutes. In-memory market quote cache entries live for about 5 minutes per process, and historical performance-series cache entries range from about 5 minutes to 24 hours depending on the selected chart range.",
    detail:
      "These records exist to prevent duplicate writes, coordinate retries, and avoid repeating the same market quote lookup unnecessarily.",
  },
  cloudDraftProcessing: {
    title: "Optional cloud transaction drafts",
    retention:
      "Finhance does not store the transaction prompt or provider response in its AI usage tables. Consent events and provider, model, token-count, status, and timestamp metadata remain until the hosted account is deleted or the operator removes them under its retention policy.",
    detail:
      "Groq-side handling and retention are governed by the operator's Groq agreement. Requests ask the provider not to store the completion, but operators should verify the applicable provider terms before enabling cloud parsing.",
  },
  authentication: {
    title: "Hosted identity, passkey, and session records",
    retention:
      "Linked identity and passkey records remain until unlinked, removed, or the account is deleted. Web sessions become unusable at expiry and are removed on sign-out or account deletion; expiry alone does not guarantee immediate database deletion. Mobile sessions expire after 30 days by default, with expired records removed during subsequent mobile-session operations.",
    detail:
      "Consumed mobile refresh-token hashes remain with the corresponding session for replay protection. IP-based authentication rate-limit records expire at their reset time and are deleted during a subsequent request within the same rate-limit scope.",
  },
  appLock: {
    title: "Local mobile app-lock records",
    retention:
      "Kept on this device until app lock is disabled or its secure-storage record is removed. On iOS, keychain records can survive uninstalling the app; reinstalling alone may not erase them.",
    detail:
      "The record includes a salted passcode verifier, biometric preference, failed-attempt and lockout state, and timestamps. It is stored in device-only secure storage and is not sent to the workspace server. Biometric templates remain under the operating system's control.",
  },
  backupsAndLogs: {
    title: "Infrastructure backups and security logs",
    retention:
      "The operator has not supplied backup or infrastructure-log retention periods for this notice. Contact the controller for the applicable periods or criteria.",
    detail:
      "Account deletion removes live user-owned application records. Any copies in infrastructure backups or logs follow the hosting providers' separate retention and deletion procedures.",
  },
  browserPreferences: {
    title: "Device preferences and mobile connection state",
    retention:
      "Stored on your device until you clear browser or app storage, change the setting, disconnect the mobile app, sign out, or end the current browser session where session storage is used. Hosted mobile-session records expire after 30 days by default and are removed during mobile-session operations once expired.",
    detail:
      "Theme and hide-balances preferences live in browser local storage or mobile app storage. The dashboard refresh-attempt flag lives in browser session storage. The mobile server URL and mode live in app storage. Hosted mobile credentials use device-only keychain storage on iOS; keychain items can survive uninstalling the app. Disconnecting or signing out removes these credentials.",
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
    const entry =
      source[key] ??
      (key === "cloudDrafts" ? DEFAULT_LOCAL_LEGAL_BASES.cloudDrafts : null);

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

    const { provider, destination, purpose, dataCategories, safeguard } = entry;

    if (
      provider !== undefined &&
      (typeof provider !== "string" ||
        !BUILTIN_TRANSFERS.some((transfer) => transfer.provider === provider))
    ) {
      throw new Error(
        `FINHANCE_PRIVACY_TRANSFERS_JSON[${index}].provider must name a built-in provider.`,
      );
    }

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
      provider: provider as string | undefined,
      destination,
      purpose,
      dataCategories,
      safeguard,
    } satisfies PrivacyTransferInput;
  });

  const overriddenProviders = new Set(
    configuredTransfers.map((transfer) => transfer.provider),
  );
  return [
    ...configuredTransfers,
    ...BUILTIN_TRANSFERS.filter(
      (transfer) => !overriddenProviders.has(transfer.provider),
    ),
  ];
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
}): string {
  const processorNames = input.processors
    .filter(
      (processor) =>
        !BUILTIN_PROCESSORS.some((builtin) => builtin.name === processor.name),
    )
    .map((processor) => processor.name);
  const processorSummary =
    processorNames.length > 0
      ? `and the processors configured for this deployment, including ${joinList(processorNames)}`
      : "and the backing infrastructure configured for this deployment";
  return `Import files are handled by ${input.controllerName} ${processorSummary}. CSV uploads are not sent to Groq or market-data providers by the import workflow. See the full notice for recipients and transfers for each processing purpose. The current import endpoints also reject non-loopback browser origins while authentication is disabled.`;
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
  const configuredLastUpdated =
    readValue(env, "FINHANCE_PRIVACY_LAST_UPDATED") ??
    (isLocalMode ? DEFAULT_LAST_UPDATED : null);

  if (!configuredLastUpdated) {
    throw new Error(
      "Missing required privacy configuration: FINHANCE_PRIVACY_LAST_UPDATED",
    );
  }

  // A deployed operator date must not hide a newer product disclosure revision.
  const lastUpdated =
    configuredLastUpdated > DEFAULT_LAST_UPDATED
      ? configuredLastUpdated
      : DEFAULT_LAST_UPDATED;

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
    rightsStatements: [
      "Depending on the law that applies to you, you may have rights of access, rectification, erasure, restriction, objection, portability, and complaint to a supervisory authority.",
      formatRightsLine(rightsContact.contact!),
      "Where processing relies on consent, you may withdraw it at any time without affecting the lawfulness of earlier processing. Turn off cloud-enhanced parsing in Settings to withdraw cloud-parser consent; basic parsing remains available.",
      "Hosted users can permanently delete their account from Account settings, then Delete account. The flow requires recent authentication and an exact email confirmation. It immediately removes live user-owned application records, including snapshot history; the application retains no separate audit copy.",
      "Infrastructure backups, security logs, or processor records, where present, follow separate retention and deletion procedures described in this notice. Contact the controller for requests concerning those copies.",
    ],
    importSummary: {
      controller: `${controller.contact!.name} decides how the import flow is run for this deployment.`,
      purpose: importBasis.explanation,
      legalBasis: importBasis.basis,
      retention: importRetention.retention,
      recipients: formatImportRecipientsSummary({
        controllerName: controller.contact!.name,
        processors,
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

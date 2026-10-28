# Web App

This app is the Next.js frontend for Finhance. In local development it should
run on `http://localhost:3001`, while the Nest API runs on
`http://127.0.0.1:3000`.

## Local Setup

Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to one of:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
# or
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Start the full repo from the workspace root:

```bash
pnpm dev
```

Then open [http://localhost:3001](http://localhost:3001).

`AUTH_MODE=local` is intentionally loopback-only. Do not expose the web app to
non-loopback traffic unless you switch to the hosted auth flow.

If you prefer to start services separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

## Expected Ports

- Web: `3001`
- API: `3000`

The API CORS defaults already assume the web app runs on `3001`, so keeping the
frontend and backend on separate local ports avoids sending API requests to the
Next.js server by mistake.

## Troubleshooting

If the dashboard says it could not reach the API:

- confirm the API returns JSON at `http://127.0.0.1:3000/dashboard`
- confirm the web app is running at `http://localhost:3001`
- confirm `NEXT_PUBLIC_API_URL` is not pointing at the web server

If `NEXT_PUBLIC_API_URL` points at the web app, the frontend may receive an
HTML page instead of API JSON.

Local example env lives in
[.env.local.example](/Users/giovannivisi/Code/finhance/apps/web/.env.local.example).

## Hosted deployment

The hosted shape for this repo is:

- `apps/web` on Vercel
- `apps/api` on Render
- Neon as the database

The browser authenticates with Auth.js on the web app. Browser-side mutations
then go through the same-origin proxy route in the web app, which mints
short-lived ES256 JWTs for the API.

The detailed deployment guide lives in:

- [docs/deploy/private-hosted.md](/Users/giovannivisi/Code/finhance/docs/deploy/private-hosted.md)

Key hosted requirements:

- Vercel project Root Directory set to `apps/web`
- `AUTH_MODE=hosted`
- `AUTH_SIGNUP_MODE=bootstrap` or unset to keep private bootstrap-only signup
- `AUTH_SIGNUP_MODE=open` to allow new verified Google/GitHub OAuth users
- `AUTH_URL` set to the public web URL
- `NEXT_PUBLIC_API_URL` set to the public API URL
- provider credentials for both Google and GitHub
- ES256 private key configured on the web side

`AUTH_BOOTSTRAP_EMAIL` is required only in bootstrap signup mode. Hosted
passkeys are account security credentials: users first create an account with a
verified OAuth provider, then register passkeys from user settings.

### Mobile passkey sign-in (iOS)

The mobile app can sign in with a passkey natively (Face/Touch ID) via
`/api/mobile/passkey/options` and `/api/mobile/passkey/verify`, reusing the same
`auth_authenticators` records as the web. For the app to assert those passkeys,
iOS requires an Associated Domain, so the web app serves an Apple App Site
Association file at `/.well-known/apple-app-site-association`:

- `APPLE_TEAM_ID` — optional override; defaults to this project's public Apple
  Team ID. The published app identifier is `<APPLE_TEAM_ID>.<IOS_BUNDLE_ID>`.
- `IOS_BUNDLE_ID` — optional override; defaults to `app.finhance.mobile`.
- `AUTH_WEBAUTHN_RP_ID` — optional; defaults to `finhance-web.vercel.app`. Must
  match the host your web passkeys were registered against and the app's
  `webcredentials:` Associated Domain.
- `AUTH_WEBAUTHN_ORIGIN` — optional; defaults to `https://<AUTH_WEBAUTHN_RP_ID>`.

The app side needs `ios.associatedDomains` (already set to
`webcredentials:finhance-web.vercel.app` in `apps/mobile/app.json`) and a native
build — passkeys need `react-native-passkeys`, which is not available in Expo
Go, so use an EAS build or a local dev client.

## Privacy Notice Configuration

`/privacy` is backed by a server-side notice resolver. For purely local
self-hosted work it can render built-in defaults, but any managed or mixed
deployment should set explicit privacy variables before relying on that page.

### Required top-level fields for managed or mixed deployments

```bash
FINHANCE_PRIVACY_DEPLOYMENT_MODE=managed # or mixed
FINHANCE_PRIVACY_LAST_UPDATED=2026-10-01

FINHANCE_PRIVACY_CONTROLLER_NAME="Example Operator Ltd."
FINHANCE_PRIVACY_CONTROLLER_EMAIL=privacy@example.com
FINHANCE_PRIVACY_CONTROLLER_WEBSITE=https://example.com/privacy
FINHANCE_PRIVACY_CONTROLLER_POSTAL_ADDRESS="1 Example Street, Rome, Italy"
FINHANCE_PRIVACY_CONTROLLER_INSTRUCTIONS="Use the operator's support workflow for privacy questions."

FINHANCE_PRIVACY_RIGHTS_NAME="Example Privacy Team"
FINHANCE_PRIVACY_RIGHTS_EMAIL=rights@example.com
FINHANCE_PRIVACY_RIGHTS_WEBSITE=https://example.com/privacy-requests
FINHANCE_PRIVACY_RIGHTS_POSTAL_ADDRESS="1 Example Street, Rome, Italy"
FINHANCE_PRIVACY_RIGHTS_INSTRUCTIONS="State the workspace and data set involved in your request."

FINHANCE_PRIVACY_DPO_NAME="Example DPO" # optional
FINHANCE_PRIVACY_DPO_EMAIL=dpo@example.com # optional
FINHANCE_PRIVACY_DPO_WEBSITE=https://example.com/dpo # optional
FINHANCE_PRIVACY_DPO_POSTAL_ADDRESS="1 Example Street, Rome, Italy" # optional
FINHANCE_PRIVACY_DPO_INSTRUCTIONS="Optional extra routing note." # optional

FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_NAME="Garante per la protezione dei dati personali"
FINHANCE_PRIVACY_SUPERVISORY_AUTHORITY_URL=https://www.garanteprivacy.it/
```

For managed or mixed deployments, the controller contact and rights contact
must each expose at least one reachable contact channel:

- `*_EMAIL`
- `*_WEBSITE`
- `*_POSTAL_ADDRESS`

`*_INSTRUCTIONS` is supplemental routing text and does not count as the only
contact route by itself.

The displayed update date is the later of the operator's configured date and
the built-in product disclosure revision (currently 2026-10-01). Updating the
product disclosures does not verify the operator's contact details, contracts,
provider locations, or retention policies.

### Structured JSON fields

`FINHANCE_PRIVACY_LEGAL_BASES_JSON` must be a JSON object with one entry for
each fixed processing purpose:

- `workspaceRecords`
- `cloudDrafts`
- `importsAndExports`
- `snapshotsAndReview`
- `marketData`
- `securityAndReliability`
- `browserPreferences`

Each entry must contain:

- `basis`: short legal basis label, for example `Art. 6(1)(b) GDPR`
- `explanation`: why that basis applies in this deployment
- `legitimateInterests`: optional extra detail for Art. 6(1)(f) use cases

Example:

```bash
FINHANCE_PRIVACY_LEGAL_BASES_JSON='{
  "workspaceRecords": {
    "basis": "Art. 6(1)(b) GDPR",
    "explanation": "To operate the main workspace records."
  },
  "cloudDrafts": {
    "basis": "Art. 6(1)(a) GDPR; Art. 9(2)(a) where applicable",
    "explanation": "Optional cloud parsing after explicit consent, withdrawable in Settings without affecting earlier processing."
  },
  "importsAndExports": {
    "basis": "Art. 6(1)(b) GDPR",
    "explanation": "To preview, merge, and export uploaded data."
  },
  "snapshotsAndReview": {
    "basis": "Art. 6(1)(b) GDPR",
    "explanation": "To capture history and review boundaries."
  },
  "marketData": {
    "basis": "Art. 6(1)(b) GDPR",
    "explanation": "To refresh quote and FX data on request."
  },
  "securityAndReliability": {
    "basis": "Art. 6(1)(f) GDPR",
    "explanation": "To authenticate users, protect sessions and records, prevent duplicate writes, and keep the service reliable.",
    "legitimateInterests": "Account protection, service integrity and abuse prevention."
  },
  "browserPreferences": {
    "basis": "Art. 6(1)(f) GDPR",
    "explanation": "To remember display preferences on the device in use.",
    "legitimateInterests": "Stable UI preferences."
  }
}'
```

`FINHANCE_PRIVACY_PROCESSORS_JSON` must be a JSON array. Each item must contain:

- `name`
- `role`
- `purpose`
- `location`
- `dataCategories`: array of strings
- `website`: optional

Example:

```bash
FINHANCE_PRIVACY_PROCESSORS_JSON='[
  {
    "name": "Neon",
    "role": "Hosted Postgres",
    "purpose": "Primary database hosting",
    "location": "EU region selected by the operator",
    "dataCategories": ["Workspace finance records", "Snapshot history"],
    "website": "https://neon.tech/"
  }
]'
```

`FINHANCE_PRIVACY_TRANSFERS_JSON` must be a JSON array. Each item must contain:

- `destination`
- `purpose`
- `dataCategories`: array of strings
- `safeguard`
- `provider`: optional built-in provider name; replaces that provider's default
  transfer entry instead of appending a contradictory second entry. Supported
  names are `Groq`, `EODHD`, `Marketstack`, and `Yahoo Finance public quote API`.

For each applicable international transfer, supply the actual destination,
legal mechanism (such as an applicable adequacy decision or SCCs), and a way to
obtain the safeguards. HTTPS and a provider's no-storage option are technical
protections, not legal transfer mechanisms. Confirm these facts against the
operator's agreements before publishing; do not copy an example as a statement
of an agreement that has not been verified.

Example:

```bash
FINHANCE_PRIVACY_TRANSFERS_JSON='[
  {
    "destination": "United States",
    "purpose": "Support escalation",
    "dataCategories": ["Support-relevant transaction excerpts"],
    "safeguard": "SCCs and operator access controls."
  }
]'
```

### Optional retention overrides

`FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON` can override the built-in retention
text for these keys:

- `workspaceData`
- `importPreviewPayloads`
- `snapshotHistory`
- `requestSafety`
- `cloudDraftProcessing`
- `authentication`
- `appLock`
- `backupsAndLogs`
- `browserPreferences`

Each override can provide `title`, `retention`, and `detail`.

Supply `backupsAndLogs` with the actual hosting backup and log periods or the
criteria used to determine them, and explain what happens to deleted records
in backups. The default explicitly says that these periods have not been
provided. Authentication expiry and import-preview expiry are distinct from
physical deletion: expired previews are cleared during a subsequent import
operation, and idle workspaces can retain the stored payload longer than the
15-minute period in which a preview can be applied.

Example:

```bash
FINHANCE_PRIVACY_RETENTION_OVERRIDES_JSON='{
  "snapshotHistory": {
    "retention": "180 days unless the operator extends the period.",
    "detail": "Configured override for this hosted deployment."
  }
}'
```

The notice also appends code-owned facts automatically, including the built-in
EODHD, Marketstack, and Yahoo Finance market-data provider entries, the
15-minute import-preview validity period and request-driven payload cleanup,
the idempotency cleanup periods, authentication and local app-lock storage,
consent withdrawal, and device preference storage notes. The native mobile
privacy screen renders the full public notice with a fixed Back button;
optional external links open in the device browser.

Before publishing a substantive change, confirm the deployment-specific facts
and communicate material changes to affected users. Changing the date alone
does not complete this review.

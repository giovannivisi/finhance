# Phase 3 — Hosted QA And Hardening

## Objective

Use the hosted deployment as the real validation surface for daily private use,
with special focus on mobile browser behavior and production-like security
checks.

At the end of this phase:

- the app is viable for real desktop use
- the app is viable for real phone-browser use
- no auth/session/security blocker remains
- key usability defects are classified and either fixed or consciously deferred

## Scope

In scope:

- desktop QA
- mobile browser QA
- hosted auth/session validation
- security and authorization checks
- defect triage

Out of scope:

- native-client work
- shared-workspace features
- large-scale observability platform work

## QA Matrix

Primary matrix:

- Desktop Chrome
- Desktop Safari
- Mobile Safari on iPhone
- Mobile Chrome on Android if available

Use the real hosted deployment, not localhost mirrors, for this phase.

## Security Validation

### Browser/session checks

- logged-out user cannot access protected pages
- logged-out user cannot access proxy endpoints
- logout invalidates access cleanly
- expired sessions fail safely
- no auth artifacts appear in:
  - localStorage
  - sessionStorage
  - URL query strings
  - URL fragments

### API checks

- direct unauthenticated API requests fail
- expired JWTs fail
- invalid-signature JWTs fail
- wrong issuer/audience JWTs fail
- cross-user data exposure does not occur

### Account security checks

Because provider auth strength matters now:

- Google account used for login must have 2FA enabled
- GitHub account used for login must have 2FA enabled
- verified-email assumptions must be validated in actual provider responses

## Functional QA

### Desktop

Desktop should remain materially consistent with the current intended product
experience.

Test:

- login and logout
- dashboard load
- activity flow
- wallets/accounts flow
- budgets flow
- recurring flow
- import flow
- analytics/review/privacy reading flow

Watch for:

- regressions from auth wrapping
- latency pain around first loads
- any desktop layout drift introduced during hosted work

### Mobile browser

Mobile browser testing is the main new value of this phase.

Test:

- login and logout
- tab bar and More panel usage
- create transaction flow
- forms with keyboard open
- select/date/number fields
- modal height and scroll locking
- long-page reading and scrolling
- import flow practicality

Watch for:

- top header spacing
- bottom tab overlap
- modal clipping
- number/date/select control quality
- friction caused by real mobile browsers rather than responsive emulation

## Defect Triage Rules

Classify issues into:

- auth/security
- hosted infrastructure
- desktop regression
- mobile-only usability
- latency/cold-start friction

Triage rules:

- blocker = must fix before phase close
- serious recurring annoyance for daily use = should fix before phase close
- cosmetic/polish only = queue for later if the app remains usable

## Acceptance Criteria

- full sign-in/out flow works on hosted desktop and hosted phone browser
- all primary routes are usable on phone browser
- no auth or authorization blocker remains
- no core mutation workflow is blocked on mobile browser
- daily private use is realistic on the hosted deployment

## Verification Checklist

Minimum explicit checklist:

1. hosted login on desktop Chrome
2. hosted login on desktop Safari
3. hosted login on iPhone Safari
4. create transaction on desktop
5. create transaction on phone browser
6. create/edit account on phone browser
7. edit budget on phone browser
8. recurring action on phone browser
9. import preview on desktop and, if realistic, smoke check on phone browser
10. logout and confirm protected routes are no longer accessible

## Nice-To-Have Hardening

These are useful if phase time permits, but they are not the core objective:

- structured auth event logging without token leakage
- lightweight hosted error monitoring
- explicit rate-limiting review around auth-related web endpoints

## Deliverables

- completed hosted QA checklist
- prioritized defect list
- fixes for blockers discovered during hosted validation
- explicit sign-off that the hosted app is usable privately from desktop and
  phone browser

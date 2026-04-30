# Phase 4 — App Readiness

## Objective

Prepare the app for an installable, app-like mobile experience without throwing
away the hosted browser-first architecture or the API auth model established in
phase 1.

At the end of this phase:

- a PWA-first path is defined and, if implemented, working
- the API remains reusable for future direct clients
- no phase 4 work forces redesign of phases 1 or 2

This phase starts only after hosted browser use is already solid.

## Scope

In scope:

- PWA readiness
- installability planning
- future direct-client readiness checkpoints

Out of scope:

- React Native rewrite
- shared workspaces
- public release growth features unrelated to mobile experience

## Strategy

The order is intentional:

1. browser-hosted experience becomes reliable
2. PWA is evaluated and, if worthwhile, implemented
3. only if PWA is insufficient do we consider wrapper/native paths

The browser-hosted app remains the reference implementation.

## PWA-First Work

### 1. Manifest and installability

Add and validate:

- web manifest
- icons
- app name/short name
- theme/background colors
- standalone display mode
- start URL and scope

### 2. Mobile launch behavior

Validate:

- home-screen launch flow
- standalone layout behavior
- safe-area handling
- app-like startup polish

### 3. Offline stance

Define the offline model explicitly.

Safe default:

- cache shell/static assets if useful
- do not cache authenticated finance API responses in a way that risks stale or
  misleading finance data

The goal is not “offline everything,” but “no unsafe offline behavior.”

## Future Direct-Client Readiness

The API contract from phase 1 must remain reusable:

- bearer JWT authentication stays first-class
- internal user identity stays canonical
- browser-session assumptions do not leak into the API contract

If a true direct client is built later, it should get a proper first-party token
acquisition flow rather than relying on browser-only session semantics.

## Decision Gate For Anything Beyond PWA

Only consider the next step if PWA proves insufficient.

Possible order:

1. PWA only
2. thin wrapper if needed
3. true native rewrite only as a last resort

The burden of proof should be high before moving beyond PWA.

## Acceptance Criteria

- PWA path is documented and technically feasible
- install flow works if phase 4 implementation proceeds
- API auth model remains unchanged in principle
- no phase 4 work requires redesign of earlier phases

## Verification

Minimum verification if PWA work is implemented:

1. install from iPhone Safari
2. install from Android Chrome
3. standalone launch succeeds
4. authenticated navigation still works after install
5. no unsafe cached finance data behavior is introduced

## Risks To Watch

- overengineering mobile packaging before hosted browser use is mature
- unsafe caching of authenticated financial data
- slipping browser-session assumptions into a future direct-client auth path

## Deliverables

- documented PWA-first roadmap
- manifest/installability work if phase 4 is executed
- explicit decision point for whether anything beyond PWA is still justified

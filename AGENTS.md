# AGENTS.md

This file defines repo-specific standing instructions for Codex and similar coding agents working in this repository.

## Instruction Priority

1. Direct user instructions
2. This `AGENTS.md`
3. Task-specific guidance files referenced by this document
4. General assistant defaults

If a user request conflicts with this file, point it out but follow the user request.

## Scope Conventions

### Branch Scope

When the user asks for a check or audit "on the branch", treat the scope as the current checked-out branch and review the changes introduced by that branch relative to the parent branch (relatively to the new one) when that comparison is available, otherwise against repository's default branch.

If the default branch cannot be determined cleanly, fall back to reviewing the current branch diff and uncommitted changes that are part of the current work.

### Full Project Scope

When the user asks for a "full" audit or check, treat the scope as the entire repository, not just the current branch diff.

## Security Audit Workflow

### Trigger Phrases

If the user asks for any of the following, run a branch-scoped security audit:

- "run a security audit on the branch"
- "security audit on the branch"
- equivalent wording that clearly requests a security audit for the current branch

If the user asks for any of the following, run a full-project security audit:

- "run a full security audit"
- "full security audit"
- equivalent wording that clearly requests a security audit for the whole project

### Required Behavior

For any security audit request:

1. Read [security-audit.md](docs/instructions/security-audit.md) first.
2. Follow the workflow and reporting structure defined in that file.
3. Apply the instructions to the correct scope:
   - branch request: current branch only
   - full request: entire repository
4. Prioritize findings by severity.
5. Include concrete file references and remediation guidance.

Unless the user explicitly asks for fixes, default to reporting findings rather than changing code.

## Best Practices Check Workflow

### Trigger Phrases

If the user asks for any of the following, run a branch-scoped best-practices review:

- "run a best practices check for the branch"
- "best practices check on the branch"
- equivalent wording that clearly requests a best-practices review for the current branch

If the user asks for any of the following, run a full-project best-practices review:

- "run a full best practices check"
- "full best practices check"
- equivalent wording that clearly requests a best-practices review for the whole project

### Required Behavior

For any best-practices review request:

1. Read [check-best-practices.md](docs/instructions/check-best-practices.md) first.
2. Follow the workflow and reporting structure defined in that file.
3. Apply the instructions to the correct scope:
   - branch request: current branch only
   - full request: entire repository
4. Use project context and existing conventions when evaluating code.
5. Prioritize meaningful issues over stylistic nitpicks.

Unless the user explicitly asks for fixes, default to reporting findings rather than changing code.

## Output Expectations

When performing either kind of review:

- Be explicit about the scope used.
- Use actionable findings, not vague summaries.
- Include file paths and line references where possible.
- Avoid inventing issues when the code context does not support them.
- Keep the review aligned with the referenced markdown guidance file.

## Commit Message Convention

All commit messages **must** start with one of the prefixes defined in
[docs/instructions/commit-prefix.md](docs/instructions/commit-prefix.md),
followed by a colon and a short description in lowercase:

```
<prefix>: <short description>
```

Examples: `feat: add budget currency picker`, `fix: correct fx rate rounding`,
`chore: bump prisma to 6.3`.

Never write a commit message without one of these prefixes, even for tiny
changes. If unsure which prefix fits, `chore` is the fallback.

### Common mistakes

- **`feat` is strictly for user-facing functionality.** Adding a README,
  CONTRIBUTING.md, ADR, or any other documentation file is `docs:`, not `feat:`.
- **Scopes (`feat(scope):`) are allowed but rarely needed.** Never use a scope
  that just repeats the prefix (e.g. `docs(docs):` is redundant). Omit the
  scope unless it meaningfully narrows the context (e.g. `fix(brokerage):`
  when the fix is isolated to that module).

## Branch Naming Convention

Branch names follow `<prefix>/<short-slug>` using the same prefixes as commits:

```
feat/add-budget-picker
fix/fx-rate-rounding
chore/bump-prisma
```

Use kebab-case slugs of 3–5 words. Never use a bare prefix with no slug (e.g.
`fix` alone is not a valid branch name).

## Code Review Workflow

### Trigger Phrases

If the user asks for any of the following, run a code review:

- "review this PR"
- "review this diff"
- "review my changes"
- equivalent wording that clearly requests a review of code changes

### Required Behavior

Run the `code-review` skill. Use medium effort by default. If the user says
"thorough review" or "full review", use high effort.

## Database Migration Safety Check

### Trigger Phrases

If the user asks for any of the following, run a migration safety check:

- "check this migration"
- "is this migration safe"
- equivalent wording requesting a review of a Prisma migration file

### Automatic Trigger

Whenever you create or modify any file inside `packages/db/prisma/migrations/`,
automatically run the migration safety check on that file before considering
the task complete — even if the user did not ask for it.

### Required Behavior

1. Read [docs/instructions/migration-checklist.md](docs/instructions/migration-checklist.md) first.
2. Apply the checklist to the migration file(s) in question.
3. Report any concerns with concrete file and line references.

Unless the user explicitly asks for fixes, default to reporting findings only.

## Chat Handoff Context

- Session handoff file: [docs/handoffs/chat-context.md](docs/handoffs/chat-context.md)
- When resuming work after a chat switch, read the latest relevant handoff section there first.
- When ending a chat and the project context has materially changed, append a concise dated handoff section there instead of reconstructing context from scratch in the next chat.
- Also append a handoff entry mid-session when a significant milestone is reached: a major feature lands, a complex bug is resolved, a refactor completes, or the direction of work changes substantially. Do not wait for the explicit end-of-chat trigger.

### Trigger Phrases

Treat the following user phrases, or close equivalents, as explicit handoff workflow triggers:

- "Let's start where we left off"
  - Read the latest relevant section in [docs/handoffs/chat-context.md](docs/handoffs/chat-context.md) before continuing. Do NOT check if the app runs.
- "Let's continue to another chat"
  - Append a concise dated handoff section to [docs/handoffs/chat-context.md](docs/handoffs/chat-context.md) before ending the conversation.

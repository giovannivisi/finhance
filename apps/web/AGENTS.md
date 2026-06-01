# Web — Conventions & Context

Next.js 16 App Router. TypeScript with `moduleResolution: "bundler"`. Turbopack
in development. Vitest + Testing Library for tests.

## Component model

- **Server Components** by default — fetch data directly, no `"use client"`
- **Client Components** only when interactivity is needed — add `"use client"`
  at the top of the file; keep them as leaf nodes where possible
- Page-level data fetching happens in `app/**/page.tsx` (server); client state
  and event handling live in `*PageClient.tsx` or `*Form.tsx` components

## Path aliases

```
@/*          → app/*
@components/* → app/components/*
@lib/*       → lib/*
```

Never use deep relative imports (`../../`) — use the aliases.

## UI patterns

### Modal

Use `<Modal>` from `@components/Modal`. It renders via `createPortal` and
handles focus trapping, `Escape` to close, and aria attributes. Pass `open`,
`onClose`, `title`, and `maxWidth`.

### SearchablePicker

Use `<SearchablePicker>` from `@components/SearchablePicker` for any dropdown
that needs search. In production it uses the native Popover API (renders in
the browser top layer, no z-index issues). In jsdom (tests) it falls back to
`createPortal`. Pass `id`, `value`, `onChange`, `options` (array of
`PickerOption`), and `placeholder`. Currency and exchange options come from
`@lib/currency-ui` helpers.

Do not use `<select>` for currency or exchange fields — always use
`SearchablePicker`.

### OverflowMenu

Use `<OverflowMenu>` from `@components/OverflowMenu` for kebab/action menus.
Pass `sections` as `OverflowMenuSection[]`.

## CSS conventions

- BEM-ish class names, kebab-case: `.transaction-form`, `.transaction-form-row`
- State modifiers as separate classes: `.is-open`, `.is-disabled`, `.is-error`
- All custom properties (colours, spacing) defined in `app/globals.css` as
  CSS variables on `:root` and `[data-theme="dark"]`
- Tailwind is available through `app/globals.css`; use utility classes only for
  one-off spacing, sizing, and typography. Prefer the CSS class system for
  reusable layouts, component surfaces, and stateful UI.
- Avoid inline styles for static layout and visual styling. Inline styles are
  acceptable for dynamic runtime values such as chart geometry, popover
  placement, or data-driven colours.

## Testing

- Vitest + `@testing-library/react`
- Test files live alongside the component: `Foo.test.tsx`
- Mock `next/navigation`, `next/link`, and server actions at the top of the
  file using `vi.mock`
- `SearchablePicker` renders as a `<button>` trigger (not `<select>` or
  `<input>`), so use `toHaveTextContent` not `toHaveValue` to assert the
  selected value; use `userEvent.click` to open and select options

## Shared package imports

Import from `@finhance/shared`, `@finhance/shared/currencies`,
`@finhance/shared/exchanges`, etc. — never via relative paths outside the
web app boundary. See `docs/decisions/003-shared-package-hash-imports.md` for
why new files in `packages/shared/src/` require `#`-prefixed internal imports.

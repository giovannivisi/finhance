# finhance

This repository contains the complete codebase for **finhance**, the financial management platform designed to provide accurate accounting, automated categorization, insightful analytics, and robust asset tracking. The project is implemented as a multi‑application monorepo to keep domain logic organized, maximize code reuse, and support scalable feature development.
finhance was created to unify all services, modules, and tooling related to personal and business financial operations into a single, coherent architecture.

## Structure

- `apps/` – Application layer (front-end and back-end services)
- `packages/` – Shared libraries used across the project
- `infrastructure/` – Deployment- and platform-related configuration
- `scripts/` – Utility scripts for development and automation

## Requirements

- Node.js 18+
- PNPM / npm / yarn (depending on project setup)
- TypeScript

## Development

Run the development environment:

```
pnpm dev
```

or, depending on your setup:

```
npm run dev
```

## Build

Build all project components:

```
pnpm build
```

## Contribution

All changes must follow the internal coding standards and pass linting and type checks before merging.

## License

Private project. All rights reserved.

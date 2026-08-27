# Restaurant Management System — Agent Guide

## Purpose

This file defines how coding agents must work in this repository. It is normative for agent behavior, not for product behavior.

## Required reading order

Before changing application behavior, read:

1. `docs/index.md`
2. The relevant `US-*`, `AC-*`, and `NFR-*` requirements
3. `docs/product/mvp-scope.yaml`
4. Relevant decisions in `docs/product/decision-register.md`
5. `docs/domain/model.md` and `docs/domain/workflows.yaml`
6. `docs/config/features.yaml` and `docs/security/permissions.yaml`
7. `docs/architecture/modules.yaml` and relevant ADRs
8. `docs/architecture/express-implementation-guide.md`
9. The affected HTTP/event contracts
10. The affected data-model and test-strategy sections

## Source-of-truth rules

- Product outcomes and acceptance criteria: `restaurant-management-system-requirements.md`
- Release inclusion: `docs/product/mvp-scope.yaml`
- Product decisions: `docs/product/decision-register.md`
- State transitions and workflow guards: `docs/domain/workflows.yaml`
- Cross-cutting business invariants: `docs/domain/business-rules.md`
- Feature defaults and dependencies: `docs/config/features.yaml`
- Permission identifiers and scope: `docs/security/permissions.yaml`
- Module ownership and dependencies: `docs/architecture/modules.yaml`
- Technical choices: accepted ADRs in `docs/architecture/adr/`
- HTTP behavior: `docs/contracts/openapi.yaml`
- Event behavior: `docs/contracts/events.yaml`
- Physical database schema: versioned migrations, once code exists
- Verification evidence: automated tests and `docs/quality/traceability.yaml`

No artifact may silently override another artifact that is authoritative for a different topic. If approved sources conflict, stop the affected implementation slice and report the conflicting IDs.

## Current repository state

Slice 001 is complete. The executable pnpm workspace uses Node.js `24.18.0`, pnpm `11.17.0`, Express `5.2.1`, strict TypeScript `6.0.3`, Zod `4.4.3`, PostgreSQL `18.1`, React `19.2.8`, and Vite `8.1.5`. The API and worker are separate processes; customer, staff, and administration clients are separate React applications. The current staff visual authority is `Restaurant POS design system/Mise Staff Shell v2.dc.html`; older artifacts are historical only.

Exact workspace commands:

- install: `corepack pnpm install --frozen-lockfile`
- start local PostgreSQL: `docker compose up -d postgres`
- apply migrations: `corepack pnpm db:migrate`
- develop API, worker, and staff web: `corepack pnpm dev`
- develop the isolated professional demo environment: `corepack pnpm dev:demo`
- open isolated Playwright demo contexts: `corepack pnpm demo:contexts`
- develop one process: `corepack pnpm dev:api`, `corepack pnpm dev:worker`, or `corepack pnpm dev:staff`
- format: `corepack pnpm format` or verify with `corepack pnpm format:check`
- lint: `corepack pnpm lint`
- type check: `corepack pnpm typecheck`
- unit and PostgreSQL integration tests: `corepack pnpm test` (`TEST_DATABASE_URL` enables PostgreSQL tests)
- architecture tests: `corepack pnpm test:architecture`
- OpenAPI and event-contract validation: `corepack pnpm contracts:lint`
- production builds: `corepack pnpm build`
- React static health audit: `corepack pnpm react:doctor`
- production diagnostic-exclusion test: `corepack pnpm test:frontend:diagnostics`
- mocked UI/contract browser tests: `corepack pnpm test:browser:mocked`
- real-stack browser gate: `corepack pnpm test:browser:real`
- browser and accessibility tests (mocked classification plus real-stack gate): `corepack pnpm test:browser`
- full non-browser verification: `corepack pnpm check`
- production-dependency audit: `corepack pnpm audit --prod --audit-level high`

Copy `.env.example` to `.env` for local development. The API, worker, and migration configuration load it when present. CI applies migrations and supplies `TEST_DATABASE_URL`, so integration tests must not be allowed to skip there. Do not invent replacement commands; update this section atomically when a verified command changes.

## Mandatory implementation rules

- Implement only requirements marked `mvp` and `ready` in `docs/product/mvp-scope.yaml`.
- Express is permitted only in HTTP/presentation adapters; domain and application code must not import it.
- Use strict TypeScript and runtime validation for every external input.
- Routers are created by factories and mounted only in the API composition root.
- Route handlers contain no domain rules, direct SQL, or foreign-module infrastructure imports.
- The background worker imports application/module contracts without starting Express.
- Never resolve an open or blocked product decision implicitly.
- Preserve the write ownership defined in `docs/architecture/modules.yaml`.
- A module must not update another module's tables directly.
- Cross-module synchronous work must use an explicit module contract and the consistency mode documented for that use case.
- Persist aggregate changes and their outbox events in the same database transaction.
- Treat payment, refund, correction, audit, and stock-movement records as append-only.
- Derive tenant and branch scope from an authenticated staff session or validated guest session, never from an untrusted identifier alone.
- Recalculate prices and totals on the server.
- Store timestamps in UTC and render them in the branch's IANA time zone.
- Do not log secrets, session tokens, raw credentials, or unnecessary personal data.
- Do not add generic repositories, a message broker, microservices, or a dynamic workflow engine without an accepted ADR.

## Change format

Every implementation task must declare:

- `implements`: `US-*`, `AC-*`, `NFR-*`, and `BR-*` IDs
- `obeys`: applicable `PD-*`, `ADR-*`, `CFG-*`, and `PERM-*` IDs
- `changes`: modules, API operations, events, schema, and UI
- `tests`: happy path, validation, authorization, tenant isolation, concurrency, retry, and failure cases
- `docs`: normative documents that must be updated atomically

## Definition of Done

A change is complete only when:

- Acceptance criteria are met and traceability is updated.
- Server-side authorization and tenant scope are tested.
- State transitions use the canonical workflow definitions.
- API/event contracts and migrations match the implementation.
- Idempotency and concurrency behavior are tested where applicable.
- Sensitive actions emit the required audit record.
- User-visible errors are actionable and do not expose internals.
- Relevant unit, integration, contract, and end-to-end tests pass.
- Documentation contains no new unlinked `TBD`.

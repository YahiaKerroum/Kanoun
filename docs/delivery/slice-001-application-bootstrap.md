---
id: SLICE-001-CHANGE
status: verified
version: 1.0
owner: engineering
last_reviewed: 2026-07-27
---

# Slice 001 — Application Bootstrap

## Change declaration

- `implements`: infrastructure evidence for `AC-NFR-02-02`,
  `AC-NFR-02-04`, `AC-NFR-03-01`, `AC-NFR-03-02`, `AC-NFR-03-03`,
  `AC-NFR-03-05`, `AC-NFR-12-04`, `AC-NFR-12-05`,
  `AC-NFR-13-01`, and `AC-NFR-13-05`; no `US-*` product story is claimed.
- `obeys`: `PD-031`, `ADR-0001`, `ADR-0002`, `ADR-0003`, `ADR-0004`,
  `ADR-0005`, `ADR-0006`, and `BR-024`. No feature (`CFG-*`) or permission
  (`PERM-*`) behavior is introduced by this infrastructure slice.
- `changes`: creates the API, worker, customer web, staff web, and administration
  web applications; establishes the ten logical module entry points,
  `ServiceWorkflow`, shared contracts/building blocks, the platform migration,
  `/health/live`, `/health/ready`, CI, and the MISE v2 staff shell. It does not
  add a product event or a restaurant-domain schema.
- `tests`: liveness and readiness happy/failure paths, external configuration
  validation, bounded JSON and canonical error behavior, correlation IDs and
  redaction, migration and database constraints, event-envelope validation,
  module dependency boundaries, keyboard semantics, responsive layout, and
  automated WCAG A/AA checks. Product authorization, tenant isolation,
  concurrency, and retry behavior remain mandatory in Slice 002 because Slice
  001 exposes no protected product operation.
- `docs`: updates `README.md`, `AGENTS.md`,
  `docs/delivery/implementation-progress.md`, `docs/quality/traceability.yaml`,
  `docs/index.md`, and the OpenAPI lint metadata atomically with the workspace.

## Pinned toolchain

| Component | Version |
|---|---:|
| Node.js | 24.18.0 |
| pnpm | 11.17.0 |
| Express | 5.2.1 |
| TypeScript | 6.0.3 |
| Zod | 4.4.3 |
| PostgreSQL | 18.1 |
| Drizzle ORM / Kit | 0.45.2 / 0.31.10 |
| React | 19.2.8 |
| Vite | 8.1.5 |
| Vitest | 4.1.10 |
| Playwright | 1.62.0 |
| dependency-cruiser | 18.1.0 |
| Redocly CLI | 2.41.0 |

Exact transitive resolution is recorded in `pnpm-lock.yaml`.

## Verification evidence

- `TEST-MIGRATION-001`: the versioned migration applies to PostgreSQL 18.1 and
  its platform constraints pass an integration test.
- `TEST-ARCH-001`: dependency-cruiser and Vitest enforce Express placement,
  worker separation, and package boundaries.
- `TEST-CONTRACT-001`: the OpenAPI document validates and all 21 event
  definitions satisfy the shared envelope rules.
- `TEST-API-HEALTH-001`: API liveness is process-only; readiness fails closed
  when PostgreSQL is unavailable and reports ready when it responds.
- `TEST-RESPONSIVE-001`: the staff shell is exercised at desktop and 768-pixel
  tablet viewports, with additional visual inspection at 390 pixels.
- `TEST-A11Y-001`: Playwright and axe report no WCAG A/AA violations in the
  staff shell smoke path; keyboard focus, text status, touch targets,
  reduced-motion, and forced-colors behavior are encoded in the shell.

The complete command inventory is maintained in `AGENTS.md` and `README.md`.

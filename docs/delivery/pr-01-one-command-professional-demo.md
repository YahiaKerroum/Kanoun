---
id: PR-01-ONE-COMMAND-DEMO
status: complete
version: 1.0
owner: engineering
last_reviewed: 2026-08-09
---

# PR-01 implementation declaration: one-command professional demo environment

This declaration is published before application edits. It is subordinate to
the approved sources in `docs/index.md` and to
`docs/delivery/professional-readiness-plan.md`.

## implements

- `AC-NFR-01-04`
- `NFR-06`, `NFR-07`, `NFR-08`, `NFR-13`
- `BR-001`, `BR-002`, `BR-024`

## obeys

- `PD-001`, `PD-006`, `PD-007`, `PD-010`, `PD-013`, `PD-015`, `PD-017`
- `ADR-0003`, `ADR-0005`
- MVP-applicable `CFG-001` through `CFG-015`
- Existing module ownership, Tables/IdentityAccess contracts, and the private
  bootstrap contract. No public owner-signup endpoint is added.

## changes

- Add the documented `corepack pnpm dev:demo` command.
- Add a safety-checked, deterministic local demo reset/seed path that applies
  migrations, provisions four synthetic role identities, and issues an active
  table QR through the existing Tables contract.
- Add a loopback-only launcher that exposes run-scoped role entry information,
  customer URLs, service walkthrough guidance, isolated-context guidance, and
  reset/restart instructions without exposing raw authorization tokens.
- Reuse the shared MISE design-system tokens, saffron stage, clipped neutral
  shell, and interaction-state contract across the launcher and customer menu.
- Supervise PostgreSQL when Docker is available, API, worker, Customer, Staff,
  Administration, and the launcher; wait for readiness and shut down only
  processes started by this command.
- Update command/configuration, demo test-support, operations, README,
  traceability evidence, and PR progress documentation atomically.

## tests

- Fresh creation, deterministic second-run reset, and forgotten-password
  recovery through reset.
- Production-mode, non-loopback host, unexpected database name, missing marker,
  missing safety configuration, and unrelated-data-preservation refusal cases.
- All four role logins, real QR exchange, launcher/customer URL resolution,
  API/worker readiness, reset reproducibility, tenant/branch scope, and token
  redaction checks.
- Process supervision and shutdown ownership checks.
- Existing mocked browser suite plus focused real-stack launcher/entry-point
  smoke evidence; no PR-05 full-stack E2E suite.

## docs

- `package.json` scripts and `AGENTS.md` exact commands.
- `.env.example`, `README.md`, and relevant demo/test-support/operations notes.
- `docs/quality/traceability.yaml` only for evidence actually produced.
- `docs/delivery/professional-readiness-plan.md` progress and this declaration.
- Affected architecture/operations documentation only where the local demo
  supervision and safety contract require it.

## Verification evidence

- `corepack pnpm dev:demo` completed on Node `24.18.0` with Docker unavailable
  and a restricted local PostgreSQL role; the supervisor started and removed an
  owned loopback PostgreSQL 18 cluster, seeded Dar Nedjma / Hydra, started all
  five application surfaces plus the worker, and printed the loopback launcher.
- `corepack pnpm check` passed: formatting, lint, strict typecheck, 148 tests
  across 25 files, architecture checks, contract validation, and production
  builds. `corepack pnpm audit --prod --audit-level high` reported no known
  vulnerabilities.
- `corepack pnpm exec playwright test --workers=1` passed all 26 browser/WCAG
  tests. The default parallel run had one timing failure in the existing
  Administration route-navigation spec; that spec passed in isolation and the
  complete serial suite passed.
- Fresh responsive captures are stored under the ignored
  `output/playwright/pr01-demo-20260809/` directory. Two independent visual
  gate reviews returned `PASS` with no blocking findings.

## explicit non-goals

- PR-02 account lifecycle work.
- Public production owner signup or production demo credentials.
- Message brokers, microservices, dynamic workflow engines, or post-MVP
  product features.
- GitHub pull request or other external-system changes.

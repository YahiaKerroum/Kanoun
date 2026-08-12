---
id: PR-05-REAL-STACK-E2E
status: verified
version: 1.0
owner: engineering
last_reviewed: 2026-08-11
---

# PR-05 — Real-stack E2E proof

## Change declaration

- `implements`: the PR-05 real-stack journeys for setup, menu/table/QR, order
  idempotency, service close, correction/cancellation/refund, feature
  disablement, tenant isolation, worker recovery, SSE recovery, and session
  revocation; `NFR-01`, `NFR-06`, `NFR-07`, `NFR-08`, `NFR-12`, `NFR-16`,
  `NFR-18`; and the applicable business rules
  exercised by those journeys.
- `obeys`: `ADR-0001` through `ADR-0006`, `PD-025`, module write ownership,
  transactional audit/outbox behavior, canonical workflow guards, feature
  dependency rules, and the applicable `CFG-*` and `PERM-*` identifiers in
  `docs/quality/traceability.yaml`.
- `changes`: a separate real-stack Playwright configuration; a run-scoped,
  loopback-only PostgreSQL database; migration and tenant provisioning
  harnesses; production-like API, worker, Customer, Staff, and Administration
  previews; read-only database evidence helpers; the real-stack browser suite;
  mocked-suite naming; CI jobs and failure-artifact upload; and verification
  documentation.
- `tests`: the eleven `TEST-E2E-PR05-*` cases in
  `apps/web/staff/e2e/real/real-stack-journeys.real-stack.spec.ts`, plus the
  source guard that rejects first-party Playwright request interception.
- `docs`: `AGENTS.md`, `README.md`, `docs/quality/test-strategy.md`,
  `docs/quality/traceability.yaml`, `docs/delivery/professional-readiness-plan.md`,
  `docs/delivery/implementation-progress.md`, `docs/index.md`, and the CI
  workflow.

## Real-stack boundary

`corepack pnpm test:browser:real` builds the workspace sequentially, creates a
fresh `rms_e2e_*` database or starts an owned isolated PostgreSQL cluster when
the loopback server cannot create databases, applies migrations, provisions two
synthetic tenants, starts all five production-like processes, and removes the
run database and owned processes on success or failure. The base URL must be
loopback PostgreSQL and the target namespace is mandatory. The original
`corepack pnpm test:browser:mocked` suite remains available as UI/contract
component coverage; it is not the real-stack product gate.

The real suite uses separate owner, general-staff, kitchen, cashier,
administrator, and customer browser contexts. First-party API calls are not
intercepted; the source guard rejects route interception and HAR replay usage
in the real suite. Database access is limited to read-only invariant assertions
and never advances a user journey. Recovery delivery is a run-scoped,
loopback-only in-memory substitute; no external email is used.

## Verification evidence

On 2026-08-11, the real-stack suite passed all 11 tests in each of two fresh
built runs, each with its own run-scoped database. The suite observed the built
Administration setup flow, customer QR menu and order submission, malformed and
revoked QR handling, same-key idempotent retry, kitchen/service/cashier
handoffs, payment/refund ledger, append-only correction and cancellation,
dependency-safe feature disablement with preserved reads and blocked new work,
cross-tenant 404 isolation, worker backlog after stop and drain after restart,
offline-to-online notification recovery with a fresh EventSource connection,
loopback recovery delivery opened and completed through the staff UI, and
revoked-session rejection followed by sign-in UI.

The runner retains no Playwright browser artifacts and removes successful-run
output. Trace archives, screenshots, and video stay off because recovery links
contain a single-use bearer token. CI uploads the redacted failure directory
when the real-stack job fails. PR-06 visual/performance and
cross-browser release coverage remain out of scope.

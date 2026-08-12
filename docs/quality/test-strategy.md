---
id: TEST-STRATEGY
status: approved
version: 1.0
owner: quality
last_reviewed: 2026-07-27
source_of_truth_for:
  - verification-levels
  - release-quality-gates
---

# Test Strategy

## Test levels

### Domain tests

Fast tests cover state transitions, guards, money, menu option validation, table-session closure, permission delegation, and configuration resolution. State machines should use table-driven or property-based tests where useful.

### Application tests

Test use-case orchestration with module contracts, including authorization, idempotency, expected-version conflicts, transactional audit, outbox creation, and rollback.

These tests import application handlers without Express.

### Integration tests

Run against real PostgreSQL. Verify mappings, constraints, transactions, tenant-scoped foreign keys, partial unique indexes, outbox leases, handler inboxes, migrations, and query plans for critical screens.

### Contract tests

Validate implementation against OpenAPI and event schemas. Consumer/provider tests protect module contracts and event compatibility across adjacent deployments.

Express router tests construct the application through its factory without listening on a real external port. They verify middleware order, runtime validation, canonical problem responses, secure session behavior, request limits, and SSE authorization.

### End-to-end tests

Prioritize complete vertical flows:

1. Owner bootstrap, branch setup, employee invitation, and permissions.
2. Create menu/table QR, exchange QR, and view branch menu.
3. Submit an order twice with the same idempotency key and create only one order.
4. Process kitchen items, mark served, record payment, and complete.
5. Correct/cancel/refund without deleting historical records.
6. Disable a capability while an active order exists and preserve its completion path.
7. Prove one guest, branch, or tenant cannot access another's records or event stream.

PR-03 adds focused coverage for the guided owner setup route and its server-
derived readiness model: cross-day overnight-hour overlap, restaurant/branch
optimistic concurrency, tenant-scoped lifecycle authorization, reasoned service-
status changes, permission-aware workforce loading, scope-aware Staff handoff,
workforce/menu/table/QR readiness states, deep links, responsive fallback,
keyboard/focus behavior, and the Staff handoff gate. The existing branch-closure
acceptance authority remains the source of truth for order acceptance; PR-03
adds the approved branch status update reason to the existing branch update
contract.

## PR-03 evidence matrix

- `TEST-PR03-UNIT-001`: `corepack pnpm exec vitest run apps/web/admin/src/setup-readiness-api.test.ts apps/web/admin/src/setup-readiness-model.test.ts apps/web/admin/src/use-setup-readiness-data.test.ts packages/service-workflow/src/tenant-owner-service.test.ts` — 16 tests covering caller cancellation, stale/unmounted reload cleanup, readiness state matrices, selected-restaurant context, split-period round trips, overnight-hour validation, and service-status reason enforcement.
- `TEST-PR03-HTTP-001`: `corepack pnpm exec vitest run apps/api/src/restaurant-configuration-routes.test.ts` — six route validation and service-forwarding tests.
- `TEST-PR03-DB-001`: pinned `corepack pnpm test` with `TEST_DATABASE_URL` — 35 files and 237 tests, including branch status persistence, explicit order-override behavior, tenant isolation, optimistic concurrency, permission-check ordering, audit, and outbox paths.
- `TEST-PR03-BROWSER-001`: the committed PR-03 E2E set — 31 tests across the setup, accessibility, responsiveness, and route suites; the open/closed/open mutation and two-restaurant readiness-context switch are covered by `apps/web/staff/e2e/pr-03-guided-setup.spec.ts`.
- `TEST-PR03-A11Y-001`: the committed browser set includes axe, keyboard/focus, and responsive assertions; the separate untracked user-owned `admin-routes.spec.ts` file is excluded.
- `TEST-PR03-REAL-STACK-001`: pinned `corepack pnpm dev:demo` with real PostgreSQL, API, worker, and the focused `test:browser:pr03:real-stack` journey. The owner creates a restaurant and branch through Administration, opens service with an operational reason, and reaches the server-derived setup gate; the manual continuation covers Staff handoff, Staff workspace, and customer table QR menu.
- `TEST-PR03-VISUAL-001`: fresh 1280x900 and 375x844 captures covering ready, closed, and restored-open setup states, reviewed by two independent read-only visual oracles.

## PR-04 evidence matrix

- `TEST-PR04-UNIT-001`: focused Staff navigation tests cover stable route mapping, deterministic permission-aware landing, and safe return-target handling in `apps/web/staff/src/staff-navigation.test.ts`.
- `TEST-PR04-BROWSER-001`: focused Staff browser coverage exercises native route links, direct URL recovery, invalid-route fallback, permission-filtered destinations, bill-ledger selection without UUID entry, and the existing order/kitchen/payment browser boundaries in `apps/web/staff/e2e/shell.spec.ts`.
- `TEST-PR04-A11Y-001`: the focused browser set retains axe, keyboard/focus, responsive, reduced-motion, and state-label assertions; the full browser verification is run as part of PR-04 publication.
- `TEST-PR04-REAL-STACK-001`: the manual `corepack pnpm dev:demo` gate covers the separate owner, staff, customer, kitchen, cashier, and manager contexts through submission, preparation, serving, billing, payment, completion, table release, notification, report, audit, and permitted refund/correction handoffs.
- `TEST-PR04-VISUAL-001`: fresh 375px Customer, 768px Staff, and 1280px Staff/Administration captures cover navigation, task links, payment ledger, refund, loading/empty/error/stale/session-ended states, focus, reduced motion, zoom, and kitchen readability, with independent visual review.

## PR-05 evidence matrix

The browser commands have an explicit confidence classification:

- `TEST-BROWSER-MOCKED-001`: `corepack pnpm test:browser:mocked` runs the
  existing intercepted UI/contract component suite. It is useful for fast
  deterministic states but is not evidence that the full product stack works.
- `TEST-E2E-PR05-REAL-001`: `corepack pnpm test:browser:real` builds the
  workspace, creates an isolated run-scoped PostgreSQL database, applies
  migrations, starts API/worker/Customer/Staff/Administration previews, and
  runs `playwright.real-stack.config.ts`. It is the primary product CI gate.
- `TEST-E2E-PR05-GUARD-001`: `corepack pnpm exec tsx
  scripts/real-e2e-guard.ts` rejects first-party route interception in the real
  suite.
- `TEST-E2E-PR05-JOURNEYS-001`: the eleven real-stack cases prove owner setup;
  menu/table/QR including malformed and revoked links; idempotent order retry;
  kitchen/service/cashier/refund close; correction/cancellation/refund
  invariants and stale-version conflict; dependency-safe feature disablement
  with active work completion; cross-tenant isolation; worker stop/backlog
  drain; genuine EventSource SSE reconnect recovery; delivered-token recovery
  completion through the loopback inbox; and session revocation.
  `packages/test-support/src/real-e2e-readers.ts` performs read-only
  persisted-invariant checks.

The real suite provisions its own synthetic tenants and does not write directly
to PostgreSQL to advance a journey. It uses one Playwright worker for ordered
stateful evidence and a fresh database per run; the harness tears down owned
processes and only databases carrying its safety marker. CI retains
Playwright video/screenshot/error-context artifacts for failed real runs. Trace
archives are disabled so recovery bearer tokens cannot enter uploaded artifacts.

## Mandatory negative coverage

For every protected resource:

- No session.
- Inactive/revoked session.
- Missing permission.
- Wrong branch.
- Wrong tenant using a valid identifier.
- Feature disabled.
- Invalid state transition.
- Stale expected version.
- Duplicate idempotency key with same and different payload.
- Invalid or oversized input.

## Non-functional verification

- Accessibility: automated checks plus keyboard and screen-reader review against WCAG 2.2 AA.
- Performance: load profile in PD-025; report p50, p95, and p99.
- Resilience: worker stopped, event duplicated/out of order, SSE disconnected, cache unavailable, and projection rebuilt.
- Security: CSRF, XSS, IDOR/tenant substitution, QR abuse, permission escalation, session revocation, and secret scanning.
- Recovery: restore a production-like backup and verify critical flows and tenant boundaries.
- Browser: current supported Chromium, Firefox, and Safari policy recorded at release.

## Release gates

- All tests referenced by MVP acceptance criteria pass.
- No critical/high unresolved security finding.
- OpenAPI and event schemas validate.
- No forbidden module dependency.
- No domain/application import of Express and no HTTP-handler import of the PostgreSQL client.
- Database migrations pass forward and rollback/forward-fix rehearsal as applicable.
- Tenant-isolation suite passes for HTTP, jobs, exports, and real-time channels.
- Performance and availability targets are met or a time-bound exception is approved.
- Backup restore has been exercised within the target RTO.

## Test data

Fixtures use synthetic names and payment references. Every integration fixture includes at least two tenants and two branches to make missing scope filters visible. Production personal data must never be copied into local tests.

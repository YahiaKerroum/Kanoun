---
id: IMPLEMENTATION-PROGRESS
status: active
version: 1.0
owner: engineering
last_reviewed: 2026-07-28
---

# Implementation Progress

## Current slice

`SLICE-006 — kitchen_and_serving` (complete, fully verified, committed, and
published on its feature branch; not integrated)

## Slice status

- `SLICE-001 — application_bootstrap`: complete.
- `SLICE-002 — tenant_branch_and_owner_bootstrap`: complete.
- `SLICE-003 — employees_permissions_and_configuration`: complete.
- `SLICE-004 — menu_tables_and_qr`: complete and published.
- `SLICE-005 — order_submission`: complete, verified locally, committed, and
  pushed to `origin/slice-005-order-submission`; not integrated into `main`.
- `SLICE-006 — kitchen_and_serving`: complete and verified on
  `slice-006-kitchen-and-serving`; implementation commit
  `e80e9608f375344903943bbafe5ed384651a65db` was confirmed on the remote
  feature branch.
- `SLICE-007 — payment_completion_and_correction`: not started.
- `SLICE-008 — notifications_reporting_and_audit`: not started.

## Completed

- Approved product and architecture documentation baseline.
- Exact runtime, package-manager, framework, database, migration, and test-tool
  versions pinned with a frozen lockfile.
- Executable API, worker, customer web, staff web, and administration web
  projects created using the approved modular-monolith boundaries.
- Versioned PostgreSQL migration proven against PostgreSQL 18.1 for platform
  idempotency, inbox-checkpoint, and transactional-outbox tables.
- Structured request logging, correlation IDs, security headers, bounded JSON
  input, readiness/liveness endpoints, and canonical problem responses in the
  Express composition root.
- Architecture dependency checks, OpenAPI/event validation, unit/integration
  tests, production builds, dependency audit, and GitHub CI.
- Responsive and accessibility-checked MISE staff shell implemented from
  `Restaurant POS design system/Mise Staff Shell v2.dc.html`.
- Supplied MISE design artifacts preserved in `Restaurant POS design system/`;
  the older artifacts and `design-exploration/` are historical only.
- Repository hygiene baseline: ignore rules, editor settings, line endings, and onboarding README.
- Slice 002 private atomic tenant/owner provisioning, restaurant and branch
  configuration, grants-only authorization, revocable sessions, single-use
  invitation/recovery, transactional audit/outbox, tenant isolation, and
  concurrent final-administrator protection.
- Protected MISE administration sign-in and truthful restaurant/assigned-branch
  context.
- Slice 003 employee profiles without mandatory accounts, delegated branch
  employment, grants-only permission replacement, per-branch scopes,
  copy-on-apply templates, affected-session invalidation, immutable
  configuration versions, permission-aware portal capabilities, and audited
  time-limited support access.
- Responsive MISE employee, permission, and feature administration with fixed
  MVP strategies shown truthfully and WCAG A/AA automation.
- Capability-aware MISE staff navigation that loads the authenticated branch
  boundary and omits destinations unless both the required permission and
  feature are effective.
- Private support inspection limited to the implemented restaurant/branch
  snapshot, with a trusted two-person approval reference, no emergency-policy
  bypass, hashed grant tokens, and immediate token expiry/revocation.
- Slice 004 restaurant-owned menu categories, dishes, structured options,
  fixed-precision prices, branch overrides, physical tables, derived table
  states, QR issue/rotation/revocation, scoped guest sessions, and current
  branch menu browsing.
- Capability-aware staff Menu/Tables workspaces and administration
  Menu/Tables/QR workspaces, including standard-URL QR PNG download, print,
  copy, and revocation behavior.
- Slice 004 server-side permission, feature, tenant, restaurant, and branch
  enforcement with transactional audit/outbox evidence and revoked/unknown QR
  equivalence.
- Slice 005 backend order-submission path: immutable server-priced item
  snapshots, scoped idempotency, branch references, automatic acceptance,
  table-session claim/join concurrency, queued Kitchen-owned work,
  transactional audit/outbox writes, guest cancellation requests, and exact
  permission-scoped staff creation/listing.
- Slice 005 customer cart, review, submission, receipt, progress-refresh, and
  cancellation-request UI.
- Slice 005 staff active-order and order-entry workspace is implemented with
  exact permission gates, approved filters, elapsed time, runtime validation,
  CSRF, and idempotency. The React 19 event-lifetime defect was fixed across
  seven filter callbacks and analogous callbacks were audited.
- Visual review found and fixed stale dish option controls after adding a
  draft item. The staff list, filters, and order-entry dialog were then
  inspected at desktop and narrow widths.
- Final isolated PostgreSQL 18.1 verification applied all five migrations from
  empty and passed 167 tests across 21 files, architecture checks across 123
  modules and 208 dependencies, OpenAPI and 41 event contracts, all production
  builds, all 17 browser/WCAG tests, formatting, lint, strict TypeScript, and
  the production dependency audit.
- `PD-036` preserves the no-stations MVP strategy while defining the approved
  active-order filters and elapsed-time presentation.
- Slice 006 Kitchen-owned display snapshots and versioned queued/preparing/
  ready transitions, including UTC times and authenticated/effective actors.
- Slice 006 first-start and all-items-ready Ordering projections, authoritative
  whole-order serving guard, transactional audit/idempotency/outbox behavior,
  and branch-scoped ready-order operational alert.
- Slice 006 grouped staff kitchen display with item options, notes, elapsed
  time, explicit new-state label, ready-order collection, two-second
  authoritative refresh, stale-state preservation, and reconnect recovery.
- Final isolated PostgreSQL 18.1 verification applied all six migrations from
  empty and passed 173 tests across 22 files, architecture checks across 128
  modules and 224 dependencies, OpenAPI and 41 event contracts, every
  production build, all 19 browser/WCAG tests, formatting, lint, strict
  TypeScript, frozen install, and the production dependency audit.
- Slice 006 implementation commit
  `e80e9608f375344903943bbafe5ed384651a65db` was published to
  `origin/slice-006-kitchen-and-serving` and verified with `git ls-remote`.

## In progress

- No Slice 006 implementation, verification, commit, or feature-branch
  publication work remains.
- Active handoff:
  `docs/delivery/handoff-2026-07-28-slice-006-checkpoint.md`.
- Slices 005 and 006 remain unintegrated; `main`, pull requests, and main
  publication remain outside the user's authorization.

## Current limitations

- Customer web has scoped QR exchange, explicit table confirmation, real
  branch menu browsing, and a browser/WCAG-tested cart/order journey.
- Menu and physical-table administration and the staff Orders workspace are
  present and their complete browser/WCAG suite passes. Table-session and
  queued kitchen records support Slice 005 submission, but kitchen processing,
  payment, durable notification, reporting, and audit-query screens remain in
  their owning later slices.
- Slice 005 persists item notes and carries them into queued Kitchen work, but
  it does not claim completion of configurable free-text note policy or later
  employee note presentation. Optional customer-name configuration also
  remains incomplete and must not be overstated in final traceability.
- Slice 003 does not claim `AC-US-B01-03` downstream automation or
  `AC-US-C07-02` task proxying. Slice 004 does not claim historical order
  snapshots, note persistence, table assignment, or fabricated occupancy.
- `US-F04` remains assigned to Slice 007 by the approved
  `docs/delivery/mvp-slices.yaml`; older Slice 005 prose must not be used to
  pull it into Slice 004.
- The private support adapter creates no derived support session or real-time
  subscription; expiry and revocation invalidate its direct grant token.
- Local verification requires Node.js 24.18.0; other Node releases are outside
  the supported toolchain even if some commands happen to run.
- Production deployment is blocked by proposed `ADR-0007`.
- `MISE` remains a working product name until product approves a final name.

## Next slice

`SLICE-007 — payment_completion_and_correction` only after separate explicit
authorization. Do not integrate Slice 005 or Slice 006 into `main` and do not
open a pull request without explicit authorization.

---
id: IMPLEMENTATION-PROGRESS
status: active
version: 1.0
owner: engineering
last_reviewed: 2026-07-29
---

# Implementation Progress

## Current slice

`SLICE-007 — payment_completion_and_correction` (complete and verified;
feature branch published, pull request and integration pending)

## Slice status

- `SLICE-001 — application_bootstrap`: complete.
- `SLICE-002 — tenant_branch_and_owner_bootstrap`: complete.
- `SLICE-003 — employees_permissions_and_configuration`: complete.
- `SLICE-004 — menu_tables_and_qr`: complete and published.
- `SLICE-005 — order_submission`: complete, verified, and integrated into
  `main` as the prerequisite history for Slice 006.
- `SLICE-006 — kitchen_and_serving`: complete and verified on
  `slice-006-kitchen-and-serving`; implementation commit
  `e80e9608f375344903943bbafe5ed384651a65db` and publication follow-up
  `0670c04d1441ef2729ee6263c4736d4571251b2c` are integrated into `main`.
- `SLICE-007 — payment_completion_and_correction`: complete and verified on
  `slice-007-payment-completion-and-correction`; implementation commit
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7` is published to the matching
  remote feature branch.
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
- `main` was fast-forwarded to the Slice 006 publication commit
  `0670c04d1441ef2729ee6263c4736d4571251b2c` without history rewriting.
- GitHub Actions run `30442851671` succeeded for that exact integration SHA;
  both `verify` and `dependency-audit` passed.
- The documentation-only Slice 006 main-publication record was committed and
  pushed at `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`.
- GitHub Actions run `30443206834` succeeded for that exact documentation
  commit; both `verify` and `dependency-audit` passed.
- Slice 007 whole-session table movement; append-only order correction,
  payment, and refund history; bill-request operations; reasoned cancellation;
  served/paid and critical unpaid completion; guarded table-session closure;
  customer/staff experiences; and transactional audit/idempotency/outbox
  behavior.
- Final Slice 007 verification applied all seven migrations from empty
  PostgreSQL 18.1 and passed 189 tests across 24 files, architecture checks
  across 136 modules and 247 dependencies, OpenAPI and 42 event contracts, all
  production builds, all 23 browser/WCAG tests, frozen installation,
  formatting, lint, strict TypeScript, and the production dependency audit.
- Responsive traced states for customer bill requests, the staff
  payment/refund desk, correction retry, and whole-session movement were
  visually inspected after the complete browser suite passed.
- Slice 007 implementation commit
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7` was published to
  `origin/slice-007-payment-completion-and-correction` and verified with
  `git ls-remote`.

## In progress

- Slice 007 is published on its feature branch. No pull request or `main`
  integration exists; those remain separately authorized actions.
- The isolated PostgreSQL verification cluster was stopped, only its exact
  data/log artifacts were removed, and port `55437` was confirmed free.
- Active handoff:
  `docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md`.
- Historical compaction continuation prompt:
  `docs/delivery/continuation-prompt-2026-07-29-slice-007-compaction-2.md`.

## Current limitations

- Customer web has scoped QR exchange, explicit table confirmation, real
  branch menu browsing, and a browser/WCAG-tested cart/order journey.
- Menu and physical-table administration and the staff Orders workspace are
  present and their complete browser/WCAG suite passes. Kitchen processing,
  payment/completion/correction, and bill-request operations are now present;
  durable notification delivery, reporting projections, and audit-query
  screens remain in Slice 008.
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

Open or integrate `SLICE-007 — payment_completion_and_correction` only after
explicit authorization and a fresh protected-path-aware review. Do not begin
`SLICE-008 — notifications_reporting_and_audit` from this handoff.

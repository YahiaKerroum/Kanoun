---
id: IMPLEMENTATION-PROGRESS
status: active
version: 1.0
owner: engineering
last_reviewed: 2026-07-28
---

# Implementation Progress

## Current slice

`SLICE-004 — menu_tables_and_qr` (local verification complete; publication in
progress)

## Slice status

- `SLICE-001 — application_bootstrap`: complete.
- `SLICE-002 — tenant_branch_and_owner_bootstrap`: complete.
- `SLICE-003 — employees_permissions_and_configuration`: complete.
- `SLICE-004 — menu_tables_and_qr`: locally verified; integration, push, and CI
  confirmation remain.
- `SLICE-005 — order_submission`: not started.
- `SLICE-006 — kitchen_and_serving`: not started.
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

## In progress

- Slice 004 `main` integration, push, and GitHub Actions publication evidence.

## Current limitations

- Customer web supports scoped QR exchange, explicit table confirmation, and
  real branch menu browsing. It has no cart or order submission.
- Menu and physical-table administration and read-only staff workspaces are
  present. Operational order, table-session, kitchen, payment, task,
  notification, reporting, and audit-query screens remain in their owning
  later slices.
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

## Next slice after Slice 004 delivery

`SLICE-005 — order_submission`, after Slice 004 final verification and
publication complete.

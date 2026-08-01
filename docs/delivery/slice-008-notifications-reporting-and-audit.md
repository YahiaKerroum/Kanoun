---
id: SLICE-008-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-29
branch: slice-008-notifications-reporting-and-audit
base: 1a5c265a455a9fa758c5495b3a963570849b9181
---

# Slice 008 — Notifications, Reporting, and Audit

## Change declaration

- `implements`: `US-A03`; `US-O01`, `US-O02`, `US-O03`; `US-P01`,
  `US-P02`; `US-Q01`, `US-Q02`; `AC-US-A03-01` through
  `AC-US-A03-03`; `AC-US-O01-01` through `AC-US-O03-03`;
  `AC-US-P01-01` through `AC-US-P02-03`; `AC-US-Q01-01` through
  `AC-US-Q02-03`; relevant `NFR-01`, `NFR-02`, `NFR-03`, `NFR-04`,
  `NFR-05`, `NFR-06`, `NFR-07`, `NFR-08`, `NFR-09`, `NFR-10`,
  `NFR-11`, `NFR-12`, `NFR-13`, `NFR-15`, `NFR-16`, `NFR-17`, and
  `NFR-18`; `BR-001`, `BR-002`, `BR-003`, `BR-006`, `BR-007`,
  `BR-013`, `BR-016`, `BR-018`, `BR-020`, `BR-021`, `BR-023`,
  `BR-024`, and `BR-025`.
- `obeys`: `PD-001`, `PD-004`, `PD-005`, `PD-013`, `PD-019`, `PD-022`,
  `PD-024`, `PD-025`, `PD-026`, `PD-027`, `PD-028`, `PD-030`,
  `PD-032`, and `PD-036`; `ADR-0001` through `ADR-0006`; `CFG-001`,
  `CFG-002`, `CFG-003`, `CFG-005`, `CFG-006`, `CFG-007`, `CFG-011`,
  `CFG-013`, `CFG-014`, and `CFG-015`; `PERM-004`, `PERM-005`,
  `PERM-007`, `PERM-008`, `PERM-010`, `PERM-015`, `PERM-018`,
  `PERM-022`, `PERM-023`, `PERM-024`, `PERM-025`, `PERM-029`,
  `PERM-030`, `PERM-031`, `PERM-032`, `PERM-033`, and `PERM-034`.
- `changes`: Notifications-owned durable inbox, read/acknowledgement state,
  delivery attempts, recipient-gap warnings, retention, authoritative query,
  and SSE hint delivery; Reporting-owned branch-operation and per-order sales
  projections, branch metadata, projection checkpoints, rebuild behavior,
  dashboards, and filtered traceable reports; Audit-owned tenant/branch-scoped
  paginated queries over append-only evidence; IdentityAccess-owned safe
  permission-template deactivation; existing source-module deactivation
  surfaces; database-backed outbox worker leases, retries, quarantine, replay,
  retention, and projection processing; runtime-validated REST/SSE operations;
  enriched compatible event payloads; responsive permission-aware staff and
  administration UI.
- `tests`: notification eligibility, sensible permission defaults,
  configuration and assignment changes, grouping, duplicate delivery, read,
  acknowledgement, handled/unhandled state, 30-day retention, recipient-gap
  warnings, reconnect and missed-message recovery, tenant and branch
  isolation; outbox claim concurrency, checkpoint advancement, duplicate and
  same-event replay, retry, restart recovery, poison-event quarantine,
  recovery replay, and projection rebuild; report authorization, restaurant,
  branch, date, payment-method and order-state filters, IANA business dates,
  multi-currency grouping, cancelled/refunded separation, underlying-order
  traceability, and disabled-module widgets; audit authorization, scope,
  immutable evidence, before/after availability, sensitive-data minimization,
  and support-event compatibility; employee, dish, table, template, and branch
  deactivation, historical-reference preservation, active-work consequences,
  optimistic concurrency, idempotency where applicable, last-administrator
  safety, and rollback; transport validation and actionable problem responses;
  desktop/narrow responsive layouts, keyboard and focus behavior,
  loading/empty/error/retry/reconnect states, automated WCAG checks, and visual
  review.
- `docs`: `docs/contracts/openapi.yaml`, `docs/contracts/events.yaml`,
  `docs/architecture/modules.yaml`, `docs/architecture/consistency.md`,
  `docs/data/model.md`, `docs/quality/traceability.yaml`,
  `docs/delivery/implementation-progress.md`, `docs/index.md`, this
  declaration, and the final Slice 008 handoff.

## Approved implementation boundary

- Real-time delivery is an in-app SSE hint over a durable, authoritative inbox.
  Reconnects and replay gaps reload normal queries; no external email, SMS, or
  push provider is introduced.
- Recipient defaults are the approved notification-type-to-permission mapping.
  Eligibility is resolved from the current active employee identity,
  restaurant/branch assignment, effective grants, and enabled features.
  Critical source events record and surface a configuration warning when no
  eligible recipient exists.
- One source event creates at most one inbox item per eligible recipient.
  Read and acknowledgement timestamps are independent of source task state,
  while acknowledgement marks the inbox work handled. Inbox items expire after
  30 days without changing audit, order, payment, refund, or correction
  retention.
- Reporting consumes transactional outbox events after commit. It never writes
  source-module tables. Cross-branch results keep restaurant and branch
  identity visible, group totals by ISO currency, and derive business dates in
  each branch's IANA time zone.
- The dashboard exposes authoritative active-order, state, occupancy, pending
  request, daily-sales, and kitchen elapsed-time information only for enabled
  modules. It does not label or classify an item as delayed: `PD-036` leaves
  urgency/delay concepts and thresholds post-MVP.
- Sales totals use recorded order, payment, and refund facts. Cancelled order
  value and refunded money remain separate, and every aggregate row links to
  its underlying order.
- Audit queries expose actor, action, target, UTC time, branch, outcome,
  reason, and available redacted before/after evidence. They do not add a
  mutation path for audit history.
- Employee, dish, table, branch, and permission-template deactivation blocks
  future use while preserving identifiers, snapshots, grants already copied
  from templates, and operational history. Custom template creation remains
  post-MVP; deactivating one of the four predefined copy-on-apply templates
  affects only future application of that template.

## Explicit exclusions

- Message brokers, microservices, generic repositories, dynamic workflow
  engines, external notification providers, report exports, menu-performance
  reporting, inventory reporting, currency conversion, urgency/delay
  classification, hard deletion, and a general privacy-deletion workflow.
- Slice 008 pull-request creation, integration into `main`, post-MVP work, and
  any later slice.

## Verification evidence

Node `v24.18.0` and pnpm `11.17.0` were used with isolated PostgreSQL 18.1 at
`127.0.0.1:55437`, database `rms_slice008_verify`, after all eight migrations
had applied from an empty database. The following passed on the final
application worktree: frozen install; format check; lint; strict typecheck;
PostgreSQL-backed Vitest suite (28 files, 207 tests); architecture tests (154
modules, 295 dependencies, 3 tests); OpenAPI/event lint (43 event contracts);
production build; full `check`; and production dependency audit.

The browser/WCAG suite passed 25 Playwright tests. The focused visual tests
exercise the staff dashboard, durable inbox, report, and audit workspaces plus
administration report/audit/recipient-warning evidence at 1440px, 1024px, and
390px. They assert no outer horizontal overflow, WCAG A/AA automation, visible
focus and keyboard horizontal scrolling for report tables, and capture the
review images linked from the root README. The suite continues to emit harmless
Vite proxy `ECONNREFUSED 127.0.0.1:3000` lines for intentionally unmocked
dashboard requests in an existing browser fixture.

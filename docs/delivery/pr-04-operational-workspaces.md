---
id: PR-04
status: verified
version: 1.0
owner: engineering
---

# PR-04 — Join the operational workspaces into one service

## Declaration

implements:

- US-C08, US-E02, US-E03, US-E04 within PD-006
- US-F02, US-F04, US-F05
- US-G01, US-G02, US-G03, US-G04, US-G05, US-G06
- US-H02, US-H03 within PD-036, US-H04, US-H05
- US-I01, US-I03, US-I04
- US-J01, US-J03
- US-K01, US-K02, US-K03, US-K04
- US-O01, US-O02, US-O03
- US-P01, US-P02
- US-Q01, US-Q02
- NFR-01, NFR-02, NFR-03, NFR-06, NFR-07, NFR-08, NFR-10, NFR-13
- NFR-16, NFR-17, NFR-18
- applicable BR-001 through BR-024

obeys:

- PD-006 through PD-019, PD-022, PD-023, PD-024, PD-026, PD-029 through
  PD-036
- ADR-0001 through ADR-0006
- relevant CFG-003 through CFG-015 and PERM-009 through PERM-034
- canonical approval, fulfilment, financial, closure, kitchen, table-session,
  QR, and bill-request workflows

changes:

- Staff navigation is URL-backed for Home, Notifications, Orders, Tables,
  Kitchen, Payments, Menu, Reports, and Audit. Staff and Setup resolve to
  permission-aware Administration routes.
- `/` selects a deterministic useful landing from effective permissions and
  enabled features. Invalid and unauthorized routes show an actionable scoped
  boundary without fetching unauthorized data.
- Orders expose trusted task links to order evidence, Kitchen, serving, payment
  ledgers, corrections, cancellation, table movement, completion, refunds, and
  report/audit context. Workflow guards remain server-owned.
- Payment staff select bill requests, unpaid orders, and recent financial orders
  by visible reference, table, time, and state. The editable UUID lookup was
  removed; payment and refund history remains append-only and authoritative.
- Customer status, Kitchen queue, ready serving, bill request, payment,
  completion, table release, notification, report, and audit handoffs retain
  the existing module contracts and recovery states.
- MISE route, task-link, lifecycle-status, and ledger-selection primitives are
  documented in `DESIGN.md` and shared design tokens.

tests:

- `apps/web/staff/src/staff-navigation.test.ts` covers route mapping, role-aware
  landing, and safe return-target rejection.
- Staff browser coverage verifies URL-addressable landing, invalid-route
  recovery, native link navigation, existing kitchen/payment/refund/order
  regressions, responsive states, keyboard behavior, and Axe WCAG checks.
- Existing PR-01, PR-02, and PR-03 browser and unit suites remain in the
  repository and are run by the pinned verification commands.
- Server-side state guards, idempotency, optimistic concurrency, tenant and
  branch scope, append-only payment/refund/correction/audit behavior, and SSE
  snapshot recovery remain covered by the existing module/integration suites.

docs:

- `DESIGN.md`
- `apps/web/design-system.css`
- `README.md`
- `docs/index.md`
- `docs/delivery/implementation-progress.md`
- `docs/delivery/professional-readiness-plan.md`
- `docs/quality/traceability.yaml`
- `docs/quality/test-strategy.md`

PR-05 real-stack CI conversion is not implemented or claimed by this
declaration.

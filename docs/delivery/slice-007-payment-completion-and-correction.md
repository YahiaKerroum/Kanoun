---
id: SLICE-007-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-29
---

# Slice 007 — Payment, Completion, and Correction

## Change declaration

- `implements`: `US-F04`, `US-H04`, `US-H05`, `US-K01`, `US-K02`,
  `US-K03`, `US-K04`; relevant `NFR-01`, `NFR-02`, `NFR-03`, `NFR-04`,
  `NFR-06`, `NFR-07`, `NFR-08`, `NFR-09`, `NFR-10`, `NFR-11`, `NFR-12`,
  `NFR-13`, `NFR-15`, `NFR-16`, `NFR-17`, and `NFR-18`.
- `obeys`: `PD-001`, `PD-009`, `PD-012`, `PD-013`, `PD-015`, `PD-016`,
  `PD-017`, `PD-018`, `PD-022`, `PD-024`, `PD-025`, `PD-026`, `PD-027`,
  `PD-029`, `PD-030`, `PD-032`, `PD-034`; `ADR-0001`–`ADR-0006`;
  `CFG-005`, `CFG-006`, `CFG-007`, `CFG-011`, `CFG-013`, `CFG-015`;
  `PERM-014`, `PERM-016`, `PERM-018`, `PERM-022`, `PERM-023`,
  `PERM-025`, `PERM-026`, `PERM-029`, `PERM-030`, `PERM-031`; `BR-001`,
  `BR-002`, `BR-003`, `BR-006`, `BR-007`, `BR-008`, `BR-013`, `BR-015`,
  `BR-016`, `BR-017`, `BR-018`, `BR-019`, `BR-021`, `BR-022`, `BR-023`,
  and `BR-024`.
- `changes`: Tables-owned whole-session movement and movement history;
  Ordering-owned bill requests, append-only item-revision corrections,
  cancellation/closure history, and financial read projection; Kitchen-owned
  cancellation and changed-work presentation; Payments-owned append-only
  payment/refund ledgers and balance derivation; transactional audit,
  idempotency, and outbox behavior; REST operations and staff/customer
  payment, bill, correction, cancellation, table-move, refund, and completion
  experiences.
- `tests`: happy paths; runtime validation; permission, feature, branch, and
  tenant isolation; stale versions; same-key replay and payload conflicts;
  destination-table concurrency; immutable correction/payment/refund
  history; over/underpayment and over-refund rejection; cancellation with
  prepared work and recorded money; normal and unpaid-override completion;
  table-session closure guards; transaction rollback; responsive, keyboard,
  confirmation, stale-state, and WCAG behavior.
- `docs`: workflows and consistency precision where required; module, HTTP,
  and event contracts; conceptual data model; traceability; implementation
  progress; documentation index; this declaration; and the final handoff.

## Approved implementation boundary

- A staff table change moves the entire open table session to one available
  table in the same branch. It never combines table sessions.
- A correction replaces the effective item revision only while an order is
  active, unpaid, and not yet started in Kitchen. Current menu rules and
  server pricing are reapplied. Prior item revisions and the reason/actor/time
  remain append-only history; old queued work is cancelled and replacement
  work is explicitly marked as changed.
- Staff cancellation requires a reason, cancels only unstarted Kitchen work,
  preserves prepared work as history, resolves open requests, and records any
  required refund without deleting the original payment.
- A bill request belongs to one order. At most one is open, repeated requests
  return it, and payment or cancellation resolves it. Payments-authorized
  branch staff receive it through an authoritative operational view; the
  durable general notification inbox remains Slice 008.
- MVP payment is one manually recorded `cash` or `card` payment for the exact
  outstanding balance of one order and one currency. No gateway call occurs.
- Refunds are append-only, reasoned, permission-gated records against one
  immutable payment. Their cumulative amount cannot exceed that payment.
- Normal completion requires Served and Paid. Unpaid completion requires
  `orders.complete_unpaid`, recent authentication, explicit confirmation, and
  a reason. Completion preserves final financial and actor/time evidence.
- Table-session closure is evaluated after terminal order transitions and
  occurs only when every order is terminal and no bill or fulfilment work is
  unresolved.

## Explicit exclusions

- Customer-side order mutation, combined-table billing, partial payments,
  split payments, table-level payments, tips, discounts, service charges,
  fiscal receipts, payment gateways, charge capture, table combining, partial
  serving, and hard deletion.
- Durable notification inbox/delivery attempts, reporting projections, and
  audit-query screens remain Slice 008; this slice writes their source events
  and audit evidence transactionally.

## Implemented outcome

- Migration `0006_payment_completion_and_correction.sql` adds append-only
  correction, movement, payment, refund, completion, cancellation, bill, and
  Kitchen change/cancellation evidence with tenant/branch integrity,
  concurrency constraints, immutable-ledger triggers, and reachable default
  permissions.
- `PaymentCompletionService` coordinates guest bill requests, exact-balance
  manual payments, reasoned refunds, active-order corrections, cancellations,
  normal and unpaid-override completion, whole-session moves, and guarded
  table-session closure through owning module contracts in one local
  transaction.
- Customer and staff clients expose the permission- and feature-gated
  operational flows with CSRF, stable retry keys, explicit critical-action
  confirmation, authoritative refresh, responsive layouts, and actionable
  error states.
- OpenAPI, the 42-event catalog, module/consistency documentation, conceptual
  data design, permissions, and traceability match the implementation.

## Verification evidence

Using Node.js `v24.18.0`, pnpm `11.17.0`, and an empty native PostgreSQL 18.1
database:

- all seven migrations applied successfully;
- frozen installation, formatting, ESLint, and strict TypeScript passed;
- PostgreSQL-enabled tests passed `189/189` across 24 files;
- architecture verification passed across 136 modules and 247 dependencies,
  plus `3/3` architecture tests;
- OpenAPI and all 42 integration-event contracts validated;
- all 10 workspace production build targets passed;
- all `23/23` Chromium responsive/WCAG browser tests passed, and traced
  customer, payment/refund, correction-retry, and table-move states were
  visually inspected;
- the production dependency audit reported no known vulnerabilities.

## Feature-branch publication

The verified implementation is committed as
`6c167913edaaeff7b5e47e0999b950efd7ffbae7` and published to
`origin/slice-007-payment-completion-and-correction`. No pull request or
`main` integration is included in this publication step.

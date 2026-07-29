---
id: DATA-MODEL
status: approved
version: 1.0
owner: data-and-domain
last_reviewed: 2026-07-29
source_of_truth_for:
  - conceptual-data-design
  - retention-and-history-baseline
---

# Data Model

Versioned migrations are authoritative for the physical PostgreSQL schema.
This document records the conceptual ownership, references, and historical
rules that migrations must preserve.

## Tenant and operational scope

Every tenant-owned aggregate root carries `business_account_id`. High-volume
operational records repeat restaurant or branch scope where it makes tenant
and branch enforcement explicit. Client-supplied identifiers never establish
scope without a validated staff or guest session.

## Ordering

`ordering.orders` belongs to one branch and one Tables-owned table session. It
stores:

- a branch-unique reference;
- guest-session or creating-staff ownership;
- the immutable configuration-version reference active at submission;
- separate approval, fulfilment-projection, financial-projection, and closure
  states;
- server-calculated total and one ISO currency;
- the current append-only item-revision number;
- optional completion or cancellation reason, actor, and UTC time; and
- UTC submission and acceptance timestamps.

`ordering.order_items` is append-only. Each item repeats tenant and branch
scope and preserves source identifiers, menu version, dish name, base and
final unit prices, selected option names and price deltas, quantity, note,
tax-inclusive treatment, currency, line total, and revision. A correction
appends a complete replacement item revision and advances the order's current
revision; menu changes and later corrections never update prior rows.

`ordering.order_corrections` is append-only evidence linking an order and
replacement revision to its reason, before/after totals and item snapshots,
authenticated actor, effective employee, and UTC time. A correction is valid
only for an active, unpaid order whose Kitchen work has not started.

`ordering.cancellation_requests` preserves the requesting guest session,
reason, status, and UTC time. At most one request is open for an order.

`ordering.bill_requests` belongs to one order and preserves request/resolution
times and requesting guest scope. A partial unique index permits at most one
open request per order. Payment, completion, or cancellation resolves rather
than deletes it.

`ordering.branch_order_sequences` allocates references under a branch-scoped
row lock. A unique database constraint remains the final concurrency guard.

## Tables and customer sessions

A physical table has at most one open `tables.table_sessions` row, enforced by
a partial unique index. Submission locks the physical table before it joins or
opens the session. The first successful order opens occupancy; QR exchange
alone does not.

`tables.table_session_movements` is append-only. Each movement records the
whole session version, source and destination table, authenticated actor,
effective employee, and UTC time. A move locks the destination, stays within
one branch, never combines sessions, and atomically updates all live Ordering
and Kitchen table references.

`ordering.customer_sessions` begins with a pending table claim from a
table-specific QR. Its first successful submission binds it to the open table
session. Whole-session moves update its current table reference. The session
stores only keyed hashes of the session and CSRF tokens.

## Kitchen handoff

Automatic order acceptance creates one queued `kitchen.work_items` row per
submitted order item in the same local transaction. Kitchen owns subsequent
preparation state and timestamps; Ordering never updates those rows.

An eligible correction cancels only superseded queued work and appends
replacement work whose change kind is `corrected` and whose correction
reference is preserved. Cancellation also affects only unstarted work;
preparing and ready rows remain immutable operational history.

## Payments and completion

`payments.payments` is an append-only, branch-scoped record for one order. The
MVP permits one manual cash or card payment equal to the order's full
outstanding amount and currency, with actor, effective employee, optional
external reference, and UTC time.

`payments.refunds` is append-only and belongs to one immutable payment and
order. It preserves amount, currency, reason, source, actor, effective
employee, and UTC time. Composite scope references prevent a refund from
crossing tenant, branch, order, or payment boundaries. Transactional locking
and constraints prevent cumulative refunds from exceeding the payment.

Ordering owns the order's financial read projection; Payments owns the
ledger. ServiceWorkflow updates both through module contracts in the same
transaction. Normal completion requires Served and Paid. The separately
authorized unpaid override preserves its reason, actor, and time. Completion
or cancellation closes a table session only when all session orders are
terminal and no bill or fulfilment work remains unresolved.

## Idempotency and events

Order commands use `platform.idempotency_records`, scoped by tenant,
actor/session, operation, and keyed request identifier. The request hash and
response reference are committed with the order. Reuse with another payload is
a conflict.

Audit rows and outbox messages commit atomically with operational state.
Outbox consumers are eventually consistent and may not roll back submission.

## Retention and deletion

Orders, submitted items, cancellation history, audit evidence, payments,
refunds, and corrections are retained as operational history and are never
hard-deleted through normal restaurant operations. Production retention or
privacy deletion schedules require an approved deployment-market policy.

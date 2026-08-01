---
id: CONSISTENCY-MODEL
status: approved
version: 1.0
owner: architecture
last_reviewed: 2026-07-29
source_of_truth_for:
  - transaction-boundaries
  - consistency-classification
---

# Consistency and Transaction Model

## Principles

- The MVP uses one PostgreSQL database.
- A module writes only its owned tables.
- `ServiceWorkflow` may coordinate public module commands inside one local database transaction.
- Aggregate changes, transactional audit entries, and outbox records commit together.
- Notifications and reporting are eventually consistent and never roll back an operational command.
- Domain events are in-process facts used during a transaction. Integration events are versioned outbox messages handled after commit.

## Use-case consistency matrix

| Use case | Transaction owner | Atomic work | After-commit work | Failure behavior |
|---|---|---|---|---|
| Bootstrap tenant owner | ServiceWorkflow | Create tenant, restaurant, branch, employee, owner identity, administrator grants, audit, outbox | Provisioning confirmation | Any failure rolls back the complete tenant graph |
| Change restaurant or branch | ServiceWorkflow | Authorize scope, update expected version and hours, audit, outbox | Cache/UI refresh | Stale versions commit no business, audit, or event row |
| Invite or recover staff | ServiceWorkflow | Hash single-use token, update identity, audit, outbox where applicable | Deliver raw token through configured adapter | Raw tokens are never persisted; expired/used tokens fail closed |
| Deactivate or transfer administrator | ServiceWorkflow | Lock tenant, preserve an effective administrator, change grants/identity, revoke sessions, audit, outbox | Notify affected users | A blocked final-administrator command commits only failed-attempt audit evidence |
| Exchange table QR | Tables | Validate QR, create pending guest/table context | Security metric | Invalid/revoked QR returns a non-sensitive error |
| Submit order | ServiceWorkflow | Validate branch/configuration, validate/claim table, resolve menu snapshots, create order, auto-accept, create kitchen work, audit, outbox | Notify staff, update reporting | Entire command rolls back; idempotency key replays the original result |
| Request order cancellation | ServiceWorkflow | Verify guest ownership and active order, preserve one open request and reason, audit, idempotency, outbox | Notify relevant staff | Duplicate idempotency key replays; another guest or terminal order fails closed |
| Request bill | ServiceWorkflow | Lock and verify the guest-owned active order, preserve at most one open bill request, idempotency, outbox | Refresh the authoritative Payments view; durable notification delivery | Repeated requests return the existing open request; another guest, branch, or tenant fails closed |
| Start/ready kitchen item | ServiceWorkflow | Validate permission/version, update Kitchen work, derive and update the Ordering fulfilment projection when the first item starts or all required items are ready, audit, idempotency, outbox | Refresh branch operational views; durable notification delivery | Any Kitchen, Ordering, audit, idempotency, or outbox failure rolls back; conflict returns current version and retry is safe |
| Mark order served | ServiceWorkflow | Verify all work ready, update Ordering, audit, outbox | Reporting and customer update | Entire state change fails if readiness changed |
| Correct order | ServiceWorkflow | Lock and version-check the active unpaid order, reprice a full replacement revision through Menu, append Ordering history, cancel superseded queued Kitchen work, create changed replacement work, audit, idempotency, outbox | Refresh customer, Kitchen, and reporting views | Any stale version, started work, payment, menu change, or downstream write failure commits nothing |
| Move table session | ServiceWorkflow | Lock the source order and destination table, move the whole Tables session, append movement history, update all Ordering guest/order references and Kitchen live-work snapshots, audit, idempotency, outbox | Refresh table and operational views | Occupied/cross-branch destinations, stale session versions, or any projection failure roll back the whole move; sessions are never combined |
| Record payment | ServiceWorkflow | Lock and verify the Ordering bill snapshot, append one exact-balance Payments record, update the Ordering financial projection, resolve the open bill request, audit, idempotency, outbox | Reporting, notifications, and customer refresh | Duplicate idempotency key replays; over/underpayment, another payment, or any projection/event failure commits nothing |
| Record refund | ServiceWorkflow | Require recent authentication and permission, lock the order then payment, append one reasoned Payments refund, update the Ordering financial projection, audit, idempotency, outbox | Reporting, notifications, and customer refresh | A nonpositive, wrong-currency, or over-refund request fails; payment/refund history is never updated or deleted |
| Complete order | ServiceWorkflow | Lock and version-check the order, require Served and Paid or the recent-auth unpaid override, append Ordering completion, resolve the bill request, close an eligible Tables session, audit, idempotency, outbox | Reporting, notifications, and table UI refresh | Fails closed if payment, fulfilment, permission, confirmation, session guards, or any atomic write changed |
| Cancel order | ServiceWorkflow | Lock and version-check the order, append any required full remaining refund, cancel only unstarted Kitchen work, append Ordering cancellation, resolve open requests, close an eligible Tables session, audit, idempotency, outbox | Notifications, reporting, and table UI refresh | Prepared items and all financial history remain; any refund, Kitchen, Ordering, audit, session, or event failure rolls back |
| Close table session | ServiceWorkflow | While completing or cancelling an order, verify every session order is terminal and no bill or fulfilment work remains, lock and close the Tables session, audit, outbox | Table UI update; future cleaning task | Cannot close while any guard fails; a concurrent change leaves the session open |
| Permission change | IdentityAccess | Validate delegation, update grants, revoke/invalidate affected sessions/cache, audit, outbox | Notify affected user | Entire change rolls back if delegation is invalid |
| Feature change | RestaurantConfiguration | Validate dependencies/in-flight policy, append configuration version, audit, outbox | Cache invalidation and UI refresh | Reject if it would strand active work |

## Idempotency

For protected commands:

- Scope keys by tenant, actor/session, and operation.
- Persist request hash, status, response status/body reference, and expiry.
- A concurrent request with the same key waits for or receives the first result.
- Reuse with a different request hash returns `409 idempotency_conflict`.
- Minimum retention is 24 hours for order and payment commands.

## Optimistic concurrency

Mutable aggregates carry an integer version. Commands supply the expected version. A mismatch returns `409 concurrency_conflict` with the current version but no unauthorized data.

Use a database constraint or short row lock where optimistic concurrency alone cannot protect:

- One open table session per table.
- One successful idempotency record per scope/key.
- Tenant-scoped unique order references.
- Refund total not exceeding recorded payment.

## Outbox and inbox

Outbox rows contain event ID, type, schema version, tenant/branch, aggregate ID/version, UTC occurrence time, correlation/causation IDs, payload, attempt count, and next-attempt time.

Workers use leases and process events at least once. Each handler stores an inbox/checkpoint record keyed by event ID and handler. Failures use bounded exponential backoff with jitter; exhausted events enter quarantine and alert operations. Ordering is guaranteed only per aggregate.

## Reporting projection source boundary

Reporting owns and writes only the `reporting` schema. Its outbox handler and
explicit rebuild operation may read the narrow, tenant-scoped projection
sources exposed by Restaurant Configuration, Tables, Ordering, Kitchen, and
Payments. These adapter-level reads are read-only, always include
`business_account_id`, and may not become command-side foreign-table writes.
Event application remains idempotent through the platform inbox checkpoint;
rebuild replaces only the selected tenant's Reporting-owned projections.

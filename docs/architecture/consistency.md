---
id: CONSISTENCY-MODEL
status: approved
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
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
| Start/ready kitchen item | Kitchen | Validate permission/version, update work item, audit, outbox | Update Ordering fulfilment projection, notify staff | Conflict returns current version; retry is safe |
| Mark order served | ServiceWorkflow | Verify all work ready, update Ordering, audit, outbox | Reporting and customer update | Entire state change fails if readiness changed |
| Record payment | Payments | Verify immutable bill snapshot and outstanding balance, append payment, audit, outbox | Reporting and customer update | Duplicate idempotency key replays; over/underpayment rejected |
| Complete order | ServiceWorkflow | Verify served and paid through module contracts, update closure, audit, outbox | Reporting; evaluate table-session closure | Fails closed if payment or fulfilment is not authoritative |
| Cancel order | ServiceWorkflow | Validate policy, close order, cancel unstarted kitchen work, append required payment correction, audit, outbox | Notifications and reporting | Prepared items remain as waste/history; no row is deleted |
| Close table session | Tables | Verify all orders terminal and requests resolved, close session, audit, outbox | Table UI update; future cleaning task | Cannot close while any guard fails |
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

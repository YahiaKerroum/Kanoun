---
id: OBSERVABILITY-RUNBOOK
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-07-27
source_of_truth_for:
  - observability-baseline
  - operational-response
---

# Observability and Operational Runbook

## Service indicators

Measure:

- API availability and p50/p95/p99 latency.
- Order-submission success, conflict, and duplicate-prevention rate.
- Payment-recording success and conflict rate.
- SSE connection count, delivery latency, reconnects, and replay gaps.
- Outbox oldest-message age, attempts, quarantine count, and throughput.
- Projection lag and rebuild status.
- PostgreSQL connection saturation, query latency, locks, storage, and replication/backup health.
- Authentication failures, rate limits, QR abuse signals, and break-glass activity.

Tenant IDs may appear in structured logs under access control, but must not be unbounded metric labels.

## Initial service objectives

Under the PD-025 workload:

- Monthly API availability: at least 99.9%, excluding pre-announced maintenance.
- Customer menu usable: p95 within 3 seconds on the agreed mobile test profile.
- Routine server-side authenticated reads: p95 within 500 ms.
- Order and payment command response: p95 within 1 second, excluding client network time.
- Connected-client operational event delivery: p95 within 2 seconds after commit.
- Outbox oldest unprocessed event: below 60 seconds during normal operation.

## Logging and tracing

- Structured logs carry correlation and trace IDs.
- Integration events carry correlation and causation IDs.
- Sensitive values are redacted at the logging boundary.
- Audit logs are separate from diagnostic logs.
- Unexpected client errors return a correlation ID, not exception detail.

## Alert priorities

- Critical: database unavailable, tenant-isolation signal, backup/PITR failure, payment ledger corruption, sustained order submission failure.
- High: outbox lag over five minutes, quarantine growth, SSE outage, permission-cache invalidation failure.
- Medium: projection lag, export failure, elevated rate limiting, capacity trend.

## Incident checklist

1. Confirm scope, start time, affected tenants/branches, and current deployment.
2. Protect integrity: stop unsafe writes or fail closed if required.
3. Check database, API, worker, outbox, and event-stream health.
4. Correlate failures using trace/correlation IDs without exposing personal data.
5. Restore service using rollback, forward-fix, worker restart, or database recovery.
6. Reconcile idempotency records, outbox, projections, payments, and active table sessions.
7. Communicate status and recovery guidance.
8. Record timeline, root cause, corrective actions, and required ADR/runbook updates.


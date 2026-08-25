---
id: OBSERVABILITY-RUNBOOK
status: approved
version: 1.1
owner: operations
last_reviewed: 2026-08-25
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

## Quarantined outbox replay

1. Locate one quarantined row by exact `event_id`; record its
   `business_account_id`, optional restaurant/branch scope, `event_type`,
   `aggregate_id`, `aggregate_version`, attempts, and failure code. Do not
   include the event payload in tickets or routine logs.
2. Correct the handler or source-data fault and confirm earlier aggregate
   versions are processed. A quarantined predecessor intentionally blocks its
   aggregate successors.
3. Build the worker, then schedule only that event for replay:

   ```powershell
   corepack pnpm --filter @rms/worker build
   corepack pnpm --filter @rms/worker replay:quarantined -- <event-id>
   ```

4. A missing or non-quarantined event exits unsuccessfully and changes
   nothing. A successful replay clears only that event's attempts, lease,
   quarantine marker, error code, and handler checkpoints.
5. Observe the structured event/tenant/aggregate identity, confirm the event
   and its successors process in order, and record the outcome. Never bulk
   replay or delete quarantined rows.

## Appendix: implemented metrics and alert rules (PR-07)

Added by the pilot-operations package
(`docs/delivery/pr-07-pilot-operations-and-production-gates.md`). The
registry, service-metrics facade, and alert evaluator live in
`packages/building-blocks/src/observability`; portable dashboard panel
definitions are in `docs/operations/dashboards/`.

### Metric-to-indicator map

See `docs/operations/dashboards/README.md` for the complete table. Every
metric is bounded-label and free of tenant identifiers, secrets, session
tokens, and event payloads.

### Alert rules (`alert-rules.ts`)

| Alert id | Priority | Condition | Status |
|---|---|---|---|
| `database-unavailable` | Critical | `api.database_ready` gauge is 0 | Live |
| `sustained-order-submission-failure` | Critical | ≥5 order errors and 0 successes since the previous evaluation | Live |
| `backup-restore-point-at-risk` | Critical | `platform.backup_last_success_age_seconds` > 900s | Drill-only; no production backup scheduler exists yet |
| `tenant-isolation-signal` | Critical | `platform.tenant_isolation_signals_total` increased | Drill-only; not wired to a live per-request signal |
| `payment-ledger-integrity` | Critical | `payments.reconciliation_failures_total` increased | Drill-only; not wired to a live reconciliation job |
| `outbox-lag` | High | `outbox.oldest_pending_age_seconds` > 300s | Live |
| `quarantine-growth` | High | New quarantined outbox events since the previous evaluation | Live |
| `sse-outage` | High | Zero open SSE connections with poll failures while the database is ready | Live |
| `permission-invalidation-failure` | High | `identity.session_invalidation_failures_total` increased | Defined; not wired to a live call site |
| `projection-lag` | Medium | Any `projections.checkpoint_age_seconds` > 120s | Live |
| `export-failure` | Medium | `reporting.export_failures_total` increased | Defined; not wired to a live call site |
| `elevated-rate-limiting` | Medium | ≥20 rate-limited authentication attempts since the previous evaluation | Live |

"Drill-only" and "not wired to a live call site" alerts have working alert
logic and unit coverage but no production data source yet; they are honestly
scoped gaps for a later package, not claimed capabilities of this one. Every
alert transition is delivered to a structured-log sink by default
(`createLoggingAlertSink`) and to an in-process active-alert list read
through `/health/metrics` (API) or the worker's optional loopback metrics
listener. External channel routing (paging, chat) requires a real
production deployment; `ADR-0007`'s Fly.io/Neon environment is a
synthetic-data scale-validation environment only, and the real production
hosting model (self-hosted locally once a client is confirmed) remains a
deferred, separate decision.

---
id: OPERATIONS-DASHBOARDS
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
source_of_truth_for:
  - dashboard-definitions
---

# Operational Dashboards

Portable, tool-agnostic panel definitions for the eight indicator areas required
by `docs/operations/observability-and-runbook.md`. Each area has its own file
with panels expressed as metric name, visualization type, and grouping labels
so they can be imported into Grafana, a hosted PostgreSQL/Node metrics
platform, or any dashboard tool that reads the metrics registry's JSON
snapshot (exposed locally at `GET /health/metrics` and, when enabled, the
worker's loopback `WORKER_METRICS_HOST`/`WORKER_METRICS_PORT` listener).

No production dashboard platform is deployed by this package; these
definitions are the panel specification to import once a metrics/dashboard
sink is chosen. `ADR-0007`'s Fly.io/Neon environment is a synthetic-data
scale-validation environment, not the real production target — the actual
production hosting model (self-hosted locally once a client is confirmed)
is a deferred, separate decision, and these panels will need re-pointing
once it lands.

## Areas

| Area | File | Primary source |
|---|---|---|
| API availability and latency | `api.md` | API process (`rms-api`) |
| Order and payment commands | `order-and-payment.md` | API process |
| SSE connections and delivery | `sse.md` | API process (notifications stream) |
| Outbox and quarantine | `outbox-and-quarantine.md` | Worker process |
| Projections | `projections.md` | Worker process |
| PostgreSQL | `postgresql.md` | API and worker pool observation |
| Authentication abuse | `authentication-abuse.md` | API process |
| Backups | `backups.md` | Restore-drill/backup process |

## Metric-to-indicator map

Every metric below is produced by `packages/building-blocks/src/observability`
and carries no tenant identifiers, secrets, session tokens, or event payloads
in its labels, per `AGENTS.md` and `docs/security/threat-model.md`.

| Metric | Kind | Labels | Runbook indicator |
|---|---|---|---|
| `api.requests_total` | counter | `method`, `route`, `status_class` | API availability |
| `api.request_duration_ms` | histogram | `method`, `route`, `status_class` | API p50/p95/p99 latency |
| `api.database_ready` | gauge | — | Database availability (critical alert) |
| `orders.submissions_total` | counter | `outcome` | Order-submission success/conflict/duplicate/error rate |
| `payments.recordings_total` | counter | `outcome` | Payment-recording success/conflict rate |
| `idempotency.duplicates_prevented_total` | counter | `operation` | Duplicate-prevention rate |
| `payments.reconciliation_failures_total` | counter | — | Payment ledger corruption (critical alert) |
| `sse.open_connections` | gauge | — | Connected-client count |
| `sse.delivered_total` / `sse.delivery_latency_ms` | counter / histogram | — | Connected-client delivery latency |
| `sse.reconnects_total` / `sse.replay_gaps_total` | counter | — | Reconnect and replay-gap rate |
| `sse.session_ended_total` | counter | — | Server-initiated session termination rate |
| `sse.poll_failures_total` | counter | — | SSE outage (high alert) |
| `outbox.events_total` | counter | `outcome` | Outbox throughput and quarantine growth (high alert) |
| `outbox.oldest_pending_age_seconds` | gauge | — | Outbox lag (high alert, >300s) |
| `outbox.event_age_ms` | histogram | — | Outbox processing latency distribution |
| `outbox.pending_events` / `outbox.quarantined_events` | gauge | — | Outbox backlog and quarantine size |
| `outbox.handler_duration_ms` | histogram | `handler` | Per-handler processing time |
| `projections.checkpoint_age_seconds` | gauge | `handler` | Projection lag (medium alert, >120s) |
| `db.pool_connections` | gauge | `state` (total/idle/waiting) | PostgreSQL connection saturation |
| `db.query_duration_ms` | histogram | — | PostgreSQL query latency |
| `db.errors_total` | counter | — | PostgreSQL connection error rate |
| `auth.failures_total` | counter | `reason` | Authentication abuse and rate limiting (medium alert) |
| `qr.exchange_failures_total` | counter | `reason` | QR abuse signal |
| `support.access_changes_total` | counter | `action` | Break-glass activity |
| `identity.session_invalidation_failures_total` | counter | — | Permission/session invalidation failure (high alert) |
| `platform.tenant_isolation_signals_total` | counter | — | Tenant-isolation signal (critical alert) |
| `platform.backup_last_success_age_seconds` | gauge | — | Backup/PITR freshness (critical alert, >900s) |
| `metrics.dropped_series{metric}` | counter | `metric` | Registry cardinality-guard activity (operational, not a runbook alert) |

Alert priorities and thresholds for the above are implemented in
`packages/building-blocks/src/observability/alert-rules.ts` and are restated
in the appendix of `docs/operations/observability-and-runbook.md`.

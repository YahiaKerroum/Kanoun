---
id: OPERATIONS-DASHBOARD-OUTBOX
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Outbox and quarantine dashboard

Source: `rms-worker` process, loopback metrics listener (`WORKER_METRICS_HOST`/`WORKER_METRICS_PORT`) when enabled.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Outcomes by kind | `outbox.events_total` | Rate graph, group by `outcome` | processed / retry_scheduled / quarantined |
| Oldest pending age | `outbox.oldest_pending_age_seconds` | Gauge over time, alert overlay | Backs the `outbox-lag` high alert at 300 seconds; the runbook's normal-operation target is 60 seconds |
| Pending and quarantined counts | `outbox.pending_events`, `outbox.quarantined_events` | Dual gauge | Backlog size independent of age |
| Quarantine growth | `outbox.events_total{outcome="quarantined"}` | Rate graph, alert overlay | Any increase backs the `quarantine-growth` high alert; follow the quarantined-replay procedure in the runbook |
| Event age distribution | `outbox.event_age_ms` | Histogram/heatmap | Time from event occurrence to processing |
| Per-handler duration | `outbox.handler_duration_ms` | p50/p95 lines, group by `handler` | Identifies a slow handler before it causes lag |

Alert bindings: `outbox-lag` (high), `quarantine-growth` (high).

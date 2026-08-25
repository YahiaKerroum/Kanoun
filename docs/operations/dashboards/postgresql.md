---
id: OPERATIONS-DASHBOARD-POSTGRESQL
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# PostgreSQL dashboard

Source: `rms-api` and `rms-worker` connection-pool observation hooks
(`createDatabasePool`'s optional `observation` argument).

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Pool saturation | `db.pool_connections` | Stacked gauge, group by `state` (total/idle/waiting) | Sustained `waiting > 0` indicates pool exhaustion |
| Query latency | `db.query_duration_ms` | p50/p95/p99 lines | Measured client-side around every pool query, API and worker combined |
| Connection errors | `db.errors_total` | Rate graph, alert overlay | Pool-level `error` events (lost connections, refused connects) |
| Database readiness | `api.database_ready` | Single-stat, alert overlay | Cross-referenced from the API dashboard; backs `database-unavailable` |

Locks, storage, and replication/backup health from the runbook's PostgreSQL
indicator line are platform-level metrics (`pg_stat_activity`,
`pg_stat_replication`, disk usage) that require the eventual managed
PostgreSQL platform's own monitoring surface; they are not produced by this
package's in-process registry.

Alert bindings: `database-unavailable` (critical).

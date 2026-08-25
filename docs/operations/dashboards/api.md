---
id: OPERATIONS-DASHBOARD-API
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# API availability and latency dashboard

Source: `rms-api` process, `GET /health/metrics` snapshot.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Requests per status class | `api.requests_total` | Stacked rate graph, group by `status_class` | Split success/client_error/server_error |
| Latency percentiles | `api.request_duration_ms` | p50/p95/p99 lines, group by `route` | Compare against NFR-04 targets (menu 3s, reads 500ms, commands 1s) |
| Top routes by volume | `api.requests_total` | Table, group by `route`, `method` | Route label is the URL pattern, never a concrete ID |
| Database readiness | `api.database_ready` | Single-stat (0/1) with alert overlay | Backs the `database-unavailable` critical alert |
| Unrouted requests | `api.requests_total{route="unrouted"}` | Rate graph | Spikes indicate scanning or a client using a stale path |

Alert bindings: `database-unavailable` (critical), `sustained-order-submission-failure` (critical, shared with the order/payment dashboard).

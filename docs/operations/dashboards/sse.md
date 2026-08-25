---
id: OPERATIONS-DASHBOARD-SSE
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# SSE connections and delivery dashboard

Source: `rms-api` process, notifications stream (`GET /api/v1/staff/notification-events`).

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Open connections | `sse.open_connections` | Gauge over time | Drops to zero with the database still ready backs `sse-outage` |
| Delivery latency | `sse.delivery_latency_ms` | p50/p95/p99 lines | Compare against the 2-second connected-client delivery target |
| Delivered notifications | `sse.delivered_total` | Rate graph | Overall throughput |
| Reconnects and replay gaps | `sse.reconnects_total`, `sse.replay_gaps_total` | Dual rate graph | A replay gap forces a client-side reload; sustained growth suggests a cursor or retention problem |
| Session-ended terminations | `sse.session_ended_total` | Rate graph | Server-initiated session end (permission/session change); expected on deactivation |
| Poll failures | `sse.poll_failures_total` | Rate graph, alert overlay | Backs the `sse-outage` high alert together with `sse.open_connections` |

Alert bindings: `sse-outage` (high).

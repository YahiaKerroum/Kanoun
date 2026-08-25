---
id: OPERATIONS-DASHBOARD-PROJECTIONS
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Projections dashboard

Source: `rms-worker` process, outbox inbox-checkpoint ages per handler.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Checkpoint age by handler | `projections.checkpoint_age_seconds` | Gauge over time, group by `handler` | Reporting, notifications, and audit projections each have their own handler checkpoint |
| Lag alert threshold | `projections.checkpoint_age_seconds` > 120s | Alert overlay | Backs the `projection-lag` medium alert |
| Export failures | `reporting.export_failures_total` | Rate graph, alert overlay | Backs the `export-failure` medium alert; not yet wired to a live counter (see below) |

The `export-failure` alert rule and its counter name are defined in
`alert-rules.ts` so the panel and threshold exist ahead of wiring, but no
application code increments `reporting.export_failures_total` yet — the
reporting module's export jobs do not currently report outcomes to the
metrics registry. This is an explicit, honestly-scoped gap for a future
package, not a claimed capability of this one.

Alert bindings: `projection-lag` (medium, live), `export-failure` (medium, not yet wired).

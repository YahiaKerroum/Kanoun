---
id: OPERATIONS-DASHBOARD-BACKUPS
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Backups dashboard

Source: isolated restore drill (`scripts/drill-restore.ts`); no production
backup process exists yet.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Last successful backup age | `platform.backup_last_success_age_seconds` | Gauge over time, alert overlay | Backs the `backup-restore-point-at-risk` critical alert at 900 seconds (RPO 15 minutes) |
| Restore-drill RTO | Drill report `timing.totalElapsedMs` | Single-stat, compared to the 4-hour RTO target | Recorded in each drill's JSON/Markdown report under ignored `output/drills/` |
| Restore-drill relation parity | Drill report `relationComparisons` | Table (relation, source count, restored count, match) | Confirms order, payment, refund, and audit rows survive backup/restore per tenant |
| Tenant isolation on restore | Drill report `tenantIsolationHeld` | Pass/fail indicator | Confirms no cross-tenant rows appear after restore |

This package proves the reporting mechanism against isolated, run-scoped
local PostgreSQL databases that this script creates and drops; it does not
schedule or run a production backup job, and the `platform_last_success_age`
gauge is set only when a drill runs. `ADR-0007` names Neon (Frankfurt) as a
synthetic-data scale-validation database only, with Amazon RDS in
`eu-west-3` as its documented fallback if Neon's PITR window does not meet
the 15-minute RPO target during that validation. Neither is the real
production backup target — the actual production hosting model is deferred
to a self-hosted local decision once a client is confirmed, and this panel's
data will need re-pointing once that decision lands.

Alert bindings: `backup-restore-point-at-risk` (critical, drill-only today).

---
id: OPERATIONS-DASHBOARD-AUTH-ABUSE
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Authentication abuse dashboard

Source: `rms-api` process, `GET /health/metrics` snapshot.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Authentication failures | `auth.failures_total` | Rate graph, group by `reason` | invalid_credentials / rate_limited / other |
| Elevated rate limiting | `auth.failures_total{reason="rate_limited"}` | Rate graph, alert overlay | Backs the `elevated-rate-limiting` medium alert at 20 events per evaluation window |
| QR abuse signal | `qr.exchange_failures_total` | Rate graph, group by `reason` | rejected (bad/revoked token) vs error |
| Break-glass activity | `support.access_changes_total` | Rate graph, group by `action` | granted vs revoked; every event is also independently audited (Slice 003 support-access grants) |
| Session/permission invalidation failures | `identity.session_invalidation_failures_total` | Single-stat counter, alert overlay | Defined on the `ServiceMetrics` interface and covered by the `permission-invalidation-failure` high alert rule; not yet wired to a live call site in `tenant-owner-service.ts`'s session-revocation paths, which remain out of scope for this instrumentation-only package |
| Tenant-isolation signal | `platform.tenant_isolation_signals_total` | Single-stat counter, alert overlay | Reported by the isolated restore drill when it detects cross-tenant rows; not yet wired to a live per-request signal |

Alert bindings: `elevated-rate-limiting` (medium, live), `permission-invalidation-failure` (high, not yet wired), `tenant-isolation-signal` (critical, drill-only today).

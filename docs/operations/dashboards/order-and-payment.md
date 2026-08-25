---
id: OPERATIONS-DASHBOARD-ORDER-PAYMENT
status: approved
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Order and payment command dashboard

Source: `rms-api` process, `GET /health/metrics` snapshot.

| Panel | Metric | Visualization | Notes |
|---|---|---|---|
| Order submissions by outcome | `orders.submissions_total` | Rate graph, group by `outcome` | success/conflict/duplicate/rejected/error |
| Payment recordings by outcome | `payments.recordings_total` | Rate graph, group by `outcome` | Mirrors order-submission outcome taxonomy |
| Duplicate-prevention rate | `idempotency.duplicates_prevented_total` | Rate graph, group by `operation` | order_submission / payment_recording / kitchen_serving |
| Payment ledger integrity | `payments.reconciliation_failures_total` | Single-stat counter, alert overlay | Reported by the isolated restore drill (`scripts/drill-restore.ts`) when it compares source and restored payment ledgers; not yet wired to a live production reconciliation job |
| Sustained failure guard | `orders.submissions_total{outcome="error"}` vs `{outcome="success"}` | Dual-line delta graph | Backs the `sustained-order-submission-failure` critical alert |

Alert bindings: `sustained-order-submission-failure` (critical), `payment-ledger-integrity` (critical).

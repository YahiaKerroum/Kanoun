---
id: DEPLOYMENT-RECOVERY
status: proposed
version: 1.0
owner: operations
last_reviewed: 2026-07-27
source_of_truth_for:
  - deployment-baseline
  - backup-and-recovery
---

# Deployment and Recovery

Hosting details remain proposed until the deployment platform ADR is accepted.

## Production process model

```text
HTTPS load balancer
├── Node.js/Express API instance(s)
└── Server-Sent Event connections

Node.js background worker instance(s)
├── Outbox processing
├── Projection updates
└── Scheduled retention/reconciliation

Managed PostgreSQL
Object storage for expiring exports/media
Central logs, metrics, traces, and alerts
```

API and worker use the same TypeScript workspace and module packages but run as separate Node.js processes in production for failure isolation. The worker does not start or import the Express application.

## Deployment requirements

- Separate development, test, staging, and production environments.
- TLS at the edge and encrypted database connections.
- Secrets supplied by a secret manager, never source control.
- Readiness, liveness, and startup probes.
- Graceful shutdown stops accepting new Express connections, drains bounded in-flight requests/SSE connections, and releases worker leases.
- A process supervisor restarts failed Node.js processes; an uncaught fatal error terminates rather than continuing with uncertain state.
- Proxy trust, forwarded headers, request limits, and SSE timeouts are configured explicitly for the selected platform.
- Backward-compatible expand/migrate/contract database changes for rolling deployments.
- Application rollback only when compatible with the deployed schema; otherwise use forward-fix.
- SSE uses a shared replay/checkpoint mechanism when several API instances run.

## Backup and recovery

- Target RPO: 15 minutes.
- Target RTO: 4 hours for a major recoverable failure.
- Automated encrypted backups and PostgreSQL point-in-time recovery.
- Backup retention and legal retention finalized before production launch.
- Quarterly restore drills in an isolated environment.
- Restore validation includes authentication, tenant isolation, order history, payment ledger, audit records, and outbox reconciliation.
- Recovery access is least-privilege and audited.

## Failure behavior

| Failure | User/system behavior | Recovery |
|---|---|---|
| Database unavailable | State-changing commands fail closed; no false success | Alert, restore connectivity, clients retry with same idempotency key |
| Outbox worker unavailable | Core transactions continue; notifications/reports show delay | Restart worker, process backlog, monitor lag |
| SSE unavailable | UI marks data stale and polls/reloads snapshots | Reconnect with cursor; reload on gap |
| Cache unavailable | Fall back to authoritative source where safe | Alert and rebuild; never authorize from stale indefinite cache |
| Poison event | Other events continue; event quarantined | Alert, inspect, fix handler/data, replay |
| Object storage unavailable | Export remains failed/retryable; operations continue | Retry job; expire partial artifact |
| Partial deployment/version skew | Only compatible contracts/events accepted | Halt rollout or forward-fix |

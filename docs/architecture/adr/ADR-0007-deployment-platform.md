---
id: ADR-0007
status: proposed
version: 1.0
owner: architecture-and-operations
last_reviewed: 2026-07-27
source_of_truth_for:
  - deployment-platform
---

# ADR-0007 — Deployment Platform

## Context

The deployment must support an HTTPS API, long-lived SSE connections, a separate background worker, managed PostgreSQL with point-in-time recovery, object storage, secrets, metrics, logs, and rolling migrations.

## Required platform capabilities

- Region appropriate to the initial market.
- Managed PostgreSQL with automated backups and PITR.
- Independently scalable API and worker processes.
- Health probes, graceful shutdown, TLS, and secret management.
- SSE-compatible load balancing and connection timeouts.
- Central logs, metrics, traces, and alert routing.
- Staging and production isolation.

## Status and gate

This ADR is proposed because no hosting vendor, budget, region, or data-residency requirement has been approved. Production infrastructure work is blocked until those inputs are known and this ADR is accepted or superseded.


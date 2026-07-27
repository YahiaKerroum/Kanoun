---
id: ADR-0004
status: accepted
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - reliable-event-delivery
---

# ADR-0004 — Transactional Outbox

## Decision

Persist integration events to an outbox in the same transaction as business state. Process them at least once with idempotent handlers and per-handler inbox/checkpoint records.

No message broker is required for the MVP. A database-backed worker is sufficient. Broker adoption requires measured need and a new ADR.

## Consequences

- Event consumers must tolerate duplicates.
- Poison messages require quarantine, replay tooling, metrics, and alerts.
- Notifications and reports may lag but cannot make the originating transaction fail.


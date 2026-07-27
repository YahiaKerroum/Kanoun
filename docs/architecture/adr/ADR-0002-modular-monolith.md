---
id: ADR-0002
status: accepted
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - application-architecture-style
---

# ADR-0002 — Modular Monolith

## Decision

Build one deployable modular monolith with business-oriented modules, one relational database, explicit public module contracts, and architecture tests.

Modules own their writes. Cross-module critical workflows use the application composition layer and a local database transaction. Non-critical reactions use the outbox.

## Consequences

- No microservices or network calls between internal modules.
- No direct foreign-module table writes.
- Modules may later be extracted only after their contracts and ownership are stable and measured operational need exists.


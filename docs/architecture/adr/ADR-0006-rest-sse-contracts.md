---
id: ADR-0006
status: accepted
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - api-style
  - realtime-style
---

# ADR-0006 — REST and Server-Sent Events

## Decision

Use versioned REST/JSON endpoints described by OpenAPI for commands and queries. Use Server-Sent Events for server-to-client operational updates in the MVP.

Every command uses a stable `operationId`, consistent problem response, and explicit concurrency/idempotency semantics. SSE events contain an event ID and cursor; clients reconnect with the last received ID and reload authoritative snapshots when a gap cannot be replayed.

## Consequences

- Clients never treat SSE as the sole source of truth.
- Bidirectional WebSocket transport is not needed for the MVP.
- Breaking contract changes require a new API or event schema version.


---
id: ADR-INDEX
status: approved
version: 1.0
owner: architecture
last_reviewed: 2026-08-25
source_of_truth_for:
  - adr-status
---

# Architecture Decision Records

| ADR | Decision | Status | Gate |
|---|---|---|---|
| ADR-0001 | Express and TypeScript application stack | Accepted | Bootstrap must pin exact versions and tools |
| ADR-0002 | Modular monolith | Accepted | None |
| ADR-0003 | PostgreSQL and tenancy | Accepted | None |
| ADR-0004 | Transactional outbox | Accepted | None |
| ADR-0005 | Staff and guest sessions | Accepted | Express adapter follows the Express implementation guide |
| ADR-0006 | REST and Server-Sent Events | Accepted | None |
| ADR-0007 | Deployment platform — phase 1 synthetic-data validation environment (Fly.io + Neon, Paris/Frankfurt) | Accepted for phase 1 only | Phase 2 (real client, local hosting) is a deferred, separate superseding ADR |

An accepted ADR is immutable. A changed decision uses a new ADR that supersedes the old record.

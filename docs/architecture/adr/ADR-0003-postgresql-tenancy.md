---
id: ADR-0003
status: accepted
version: 1.0
owner: architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - primary-database
  - tenant-storage-model
---

# ADR-0003 — PostgreSQL and Shared-Database Tenancy

## Decision

Use PostgreSQL and a shared database with tenant-owned rows. `business_account_id` is mandatory on aggregate roots and repeated on high-volume operational tables where it improves enforcement and indexing.

Tenant-scoped composite foreign keys and unique constraints prevent cross-tenant references. The application applies mandatory tenant query scopes. PostgreSQL row-level security should be evaluated during bootstrap as defense in depth; enabling it requires a follow-up accepted ADR and integration tests.

## Consequences

- Backups and migrations operate on all tenants.
- Every job, event, cache key, export, object key, and real-time subscription carries validated tenant context.
- Platform support access cannot use an unscoped normal repository.


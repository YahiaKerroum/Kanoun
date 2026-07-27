---
id: TEST-STRATEGY
status: approved
version: 1.0
owner: quality
last_reviewed: 2026-07-27
source_of_truth_for:
  - verification-levels
  - release-quality-gates
---

# Test Strategy

## Test levels

### Domain tests

Fast tests cover state transitions, guards, money, menu option validation, table-session closure, permission delegation, and configuration resolution. State machines should use table-driven or property-based tests where useful.

### Application tests

Test use-case orchestration with module contracts, including authorization, idempotency, expected-version conflicts, transactional audit, outbox creation, and rollback.

These tests import application handlers without Express.

### Integration tests

Run against real PostgreSQL. Verify mappings, constraints, transactions, tenant-scoped foreign keys, partial unique indexes, outbox leases, handler inboxes, migrations, and query plans for critical screens.

### Contract tests

Validate implementation against OpenAPI and event schemas. Consumer/provider tests protect module contracts and event compatibility across adjacent deployments.

Express router tests construct the application through its factory without listening on a real external port. They verify middleware order, runtime validation, canonical problem responses, secure session behavior, request limits, and SSE authorization.

### End-to-end tests

Prioritize complete vertical flows:

1. Owner bootstrap, branch setup, employee invitation, and permissions.
2. Create menu/table QR, exchange QR, and view branch menu.
3. Submit an order twice with the same idempotency key and create only one order.
4. Process kitchen items, mark served, record payment, and complete.
5. Correct/cancel/refund without deleting historical records.
6. Disable a capability while an active order exists and preserve its completion path.
7. Prove one guest, branch, or tenant cannot access another's records or event stream.

## Mandatory negative coverage

For every protected resource:

- No session.
- Inactive/revoked session.
- Missing permission.
- Wrong branch.
- Wrong tenant using a valid identifier.
- Feature disabled.
- Invalid state transition.
- Stale expected version.
- Duplicate idempotency key with same and different payload.
- Invalid or oversized input.

## Non-functional verification

- Accessibility: automated checks plus keyboard and screen-reader review against WCAG 2.2 AA.
- Performance: load profile in PD-025; report p50, p95, and p99.
- Resilience: worker stopped, event duplicated/out of order, SSE disconnected, cache unavailable, and projection rebuilt.
- Security: CSRF, XSS, IDOR/tenant substitution, QR abuse, permission escalation, session revocation, and secret scanning.
- Recovery: restore a production-like backup and verify critical flows and tenant boundaries.
- Browser: current supported Chromium, Firefox, and Safari policy recorded at release.

## Release gates

- All tests referenced by MVP acceptance criteria pass.
- No critical/high unresolved security finding.
- OpenAPI and event schemas validate.
- No forbidden module dependency.
- No domain/application import of Express and no HTTP-handler import of the PostgreSQL client.
- Database migrations pass forward and rollback/forward-fix rehearsal as applicable.
- Tenant-isolation suite passes for HTTP, jobs, exports, and real-time channels.
- Performance and availability targets are met or a time-bound exception is approved.
- Backup restore has been exercised within the target RTO.

## Test data

Fixtures use synthetic names and payment references. Every integration fixture includes at least two tenants and two branches to make missing scope filters visible. Production personal data must never be copied into local tests.

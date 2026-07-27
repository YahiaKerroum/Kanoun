---
id: ADR-0005
status: accepted
version: 1.0
owner: security
last_reviewed: 2026-07-27
source_of_truth_for:
  - session-model
  - guest-authentication-model
---

# ADR-0005 — Staff and Guest Sessions

## Decision

- Staff web authentication uses server-managed, revocable sessions in secure, HTTP-only, same-site cookies.
- Guest QR exchange creates a scoped opaque session token stored in a secure cookie. The QR identifier itself is not continuing authorization.
- Session identifiers are stored only as cryptographic hashes.
- State-changing browser requests use Express middleware for origin validation and anti-CSRF protection appropriate to secure cookie sessions.
- Real-time streams reauthorize at connection time and terminate after session revocation.

The credential/session persistence implementation is pinned during Slice 001 and adapted behind the IdentityAccess module. Express-specific behavior follows `docs/architecture/express-implementation-guide.md`.

---
id: SLICE-002-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-27
---

# Slice 002 — Tenant, Branch, and Owner Bootstrap

## Change declaration

- `implements`: `US-A01`, `US-A02`, `US-A04`, `US-R01`, `US-R02`, `US-R03`, `US-R04`; relevant `NFR-03`, `NFR-07`, `NFR-08`, `NFR-10`, `NFR-12`.
- `obeys`: `PD-001`, `PD-004`, `PD-027`, `PD-030`, `PD-032`, `PD-035`; `ADR-0002`–`ADR-0006`; `CFG-001`, `CFG-002`, `CFG-015`; `PERM-001`–`PERM-004`, `PERM-007`, `PERM-008`; `BR-001`–`BR-003`, `BR-021`, `BR-024`.
- `changes`: versioned restaurant/identity/audit schema; private tenant provisioning; restaurant/branch configuration; sessions, invitations, recovery, branch switching, administrator guard/transfer; HTTP/event contracts; MISE administration sign-in/setup UI.
- `tests`: bootstrap, validation, authorization, tenant/branch substitution,
  scoped-grant filtering, hashed secrets, invitation/recovery single use,
  session revocation, stale versions and rollback, concurrent
  final-administrator removal, blocked self-transfer, append-only audit, and
  accessible sign-in.
- `docs`: workflows, consistency, data model, contracts, traceability, progress, and handoff.

Tenant provisioning requires a server-side bootstrap secret and is not public signup. Staff credentials use Argon2id; only keyed hashes of opaque session, CSRF, invitation, and recovery tokens are stored. Cookie writes require origin and CSRF verification. The final-administrator command locks the tenant row and commits blocked-attempt audit evidence without changing grants.

Credential recovery delivery is an explicit post-commit HTTPS adapter. Production configuration fails closed unless secure cookies and delivery credentials are configured.

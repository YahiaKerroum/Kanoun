---
id: OPERATIONS-RETENTION-PRIVACY
status: proposed
version: 0.1
owner: operations-and-product
last_reviewed: 2026-08-25
---

# Retention and Privacy Policy (proposed draft)

This document is a proposed draft only. It does not close `AC-NFR-09-05`
(retention/deletion) or `AC-NFR-10-04` (audit retention), both of which
require an approved deployment-market policy before production release. It
exists so a pilot reviewer has a concrete starting point rather than an
empty gate.

## What this draft is blocked on

- The real production hosting model. `ADR-0007` accepts Fly.io/Neon
  (France/Germany) only as a synthetic-data scale/restore validation
  environment, never a home for real customer data. The intended production
  model is local self-hosting once a real client is confirmed, which is a
  deferred, separate decision (see the ADR's "phase 2" section) — this
  document cannot fix a retention/privacy policy against a hosting location
  that is not yet chosen.
- Confirmation of any Algeria Law 18-07 (personal data protection)
  obligations once that hosting location is known, including any
  cross-border transfer question if the eventual choice is not purely local.
  This requires local counsel, not an engineering judgment call.
- A named data controller/processor relationship for the pilot restaurant(s).
- Product approval of the specific retention windows below.

## Data categories and proposed retention

| Category | Current behavior | Proposed retention | Basis |
|---|---|---|---|
| Guest order/session data (`ordering.customer_sessions`, orders, items) | Retained indefinitely as operational history (`docs/data/model.md`) | Retain for the pilot duration; revisit before any production commitment | Needed for service, corrections, and dispute resolution during the pilot |
| Payments, refunds, corrections | Append-only, never deleted (`PD-032`) | Retain per applicable financial record-keeping law once the market is known | Financial and tax record-keeping is jurisdiction-specific |
| Audit events (`audit.audit_events`) | Append-only, no delete operation exposed | Retain at least as long as the payment records they evidence | Closes `AC-NFR-10-04` once a specific duration is approved |
| Outbox messages (`platform.outbox_messages`) | Pruned after `OUTBOX_RETENTION_DAYS` (default 90 days) once processed | Keep the existing 90-day operational default; not a privacy-driven window | Operational replay/debugging window, not customer data retention |
| Employee credentials and sessions | Retained while the employee profile is active; sessions revoked on deactivation (Slice 002/PR-02) | No change proposed | Already governed by existing account-lifecycle behavior |
| Recovery/invitation tokens | Single-use, time-limited, already expire | No change proposed | Already time-bounded |

## Privacy handling already in place

- Guest ordering requires no permanent account (`AC-NFR-09-01`) and collects
  only an optional display name, session security data, order contents, and
  the operational metadata in `docs/data/model.md` (`AC-NFR-09-02`).
- Structured logs redact sensitive values at the logging boundary; the
  observability metrics added by this package carry no tenant identifiers,
  secrets, session tokens, or event payloads (`AGENTS.md`,
  `docs/security/threat-model.md`).
- Access to employee and customer information follows the grants-only
  permission model (`AC-NFR-09-04`).
- Platform support access to tenant data is deny-by-default, time-limited,
  reasoned, and audited (`PD-028`, `AC-NFR-09-06`).

## Open questions for product/legal approval

1. Does any pilot jurisdiction require a guest data-subject deletion request
   path beyond what the current append-only model provides?
2. What is the approved invitation/recovery delivery channel and its own
   retention rule for delivered messages (email/SMS provider logs)?
3. Is a fixed audit-retention duration (for example, 7 years for financial
   records) acceptable, or does the pilot market require a different figure?
4. Who is the named data controller for the pilot, and does that change the
   support break-glass audit's own retention requirement?

## Status

This draft remains `proposed` until product and legal approve specific
answers to the open questions above. Do not cite this document as evidence
that `AC-NFR-09-05` or `AC-NFR-10-04` are closed.

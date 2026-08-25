---
id: ADR-0007
status: accepted
version: 2.0
owner: architecture-and-operations
last_reviewed: 2026-08-25
source_of_truth_for:
  - deployment-platform
---

# ADR-0007 — Deployment Platform

## Context

The deployment must support an HTTPS API, long-lived SSE connections, a separate background worker, managed PostgreSQL with point-in-time recovery, object storage, secrets, metrics, logs, and rolling migrations.

The initial market is Algeria/MENA (consistent with the existing demo/seed
data's `Africa/Algiers` time zone and `DZD` currency). The business has two
distinct phases, not one deployment target:

1. **Now — scale/reliability validation with synthetic data only.** No real
   restaurant or customer is on the product yet. The immediate need is
   somewhere to run the PD-025 load profile and the backup/restore drill
   (`docs/delivery/pr-07-pilot-operations-and-production-gates.md`) against a
   real, network-reachable, production-like deployment, at effectively zero
   cost, to prove the architecture holds up at scale.
2. **Later — the first real client.** The stated business intent is to
   self-host locally at that point rather than remain on a third-party
   cloud platform. The exact shape of "local" (on-premises hardware at the
   restaurant, or a self-managed server the business controls) is not yet
   decided and is explicitly deferred to that time — this ADR does not
   invent that answer.

This ADR accepts a platform for phase 1 only. Phase 2 is tracked as
explicitly open below and will be its own decision (a superseding ADR) once
a client and a hosting site are real.

## Required platform capabilities

Whichever environment is in use — the phase 1 validation environment or the
eventual phase 2 local deployment — must support:

- Region appropriate to the initial market (phase 1) or the client's actual
  site (phase 2).
- Managed or self-administered PostgreSQL with automated backups and PITR.
- Independently scalable/separable API and worker processes.
- Health probes, graceful shutdown, TLS, and secret management.
- SSE-compatible load balancing and connection timeouts.
- Central logs, metrics, traces, and alert routing.
- Staging and production isolation.

## Decision (phase 1 — synthetic-data validation environment)

No hyperscale or PaaS vendor operates a data center inside Algeria; every
option below serves the market from the nearest reachable region rather than
in-country hosting. This is acceptable here because no real customer data
will be placed in this environment — see Consequences.

- **Compute (API and worker):** Fly.io, region `cdg` (Paris, France) — the
  closest low-cost PaaS region to Algeria with good connectivity. Each of the
  API and the worker runs as its own Fly app/machine, satisfying independent
  scaling; Fly supports long-lived HTTP connections without an imposed
  request timeout, which SSE requires. Per-second billing keeps cost near
  zero at pilot traffic levels.
- **Database:** Neon (managed PostgreSQL), region `eu-central-1` (Frankfurt,
  Germany) — the nearest Neon region to North Africa. Neon provides
  automated backups and point-in-time restore within its retention window on
  paid tiers, and branching for a safe staging copy. If the required RPO (15
  minutes, per `docs/operations/deployment-and-recovery.md`) is not met at
  the pilot's chosen tier, the documented fallback is Amazon RDS for
  PostgreSQL in `eu-west-3` (Paris), which provides continuous PITR at every
  tier.
- **Object storage:** deferred until an actual export/media artifact needs
  it; current volume is low. Cloudflare R2 (S3-compatible, no egress fee) is
  the default choice when it is needed.
- **Secrets:** platform-native secret injection (Fly secrets, Neon connection
  strings via environment variables) — never source control, per
  `docs/operations/deployment-and-recovery.md`.
- **Logs, metrics, traces, alert routing:** the in-process metrics registry
  and alert evaluator added in
  `docs/delivery/pr-07-pilot-operations-and-production-gates.md` are the
  application-side source; forwarding them to a hosted sink (for example,
  Grafana Cloud's free tier) is the next step and is not wired yet.
- **Staging and production isolation:** not meaningful for this environment
  — it holds synthetic load/restore-drill data only, never a real tenant.

## Deferred (phase 2 — first real client)

Not decided by this ADR. Before onboarding a real paying client:

- Confirm the local hosting model (on-premises at the restaurant vs. a
  self-managed server the business controls) with whoever operates it.
- Re-derive the required-capabilities checklist above against that model —
  self-hosted PostgreSQL backup/PITR, TLS, secret management, and log/metric
  collection typically require deliberate setup that a managed PaaS gives
  for free.
- Confirm Algeria's Law 18-07 data-protection obligations for wherever that
  client's data actually ends up (local hosting likely simplifies this
  versus phase 1's cross-border question, but does not automatically resolve
  every obligation — physical security, breach notification, and access
  control still apply).
- Record the outcome as a new ADR that supersedes this one for production
  use; do not silently repoint phase 1's environment at real customer data.

## Consequences

- Phase 1 (Fly.io/Neon, France/Germany) carries no real customer or tenant
  data, so Algeria's cross-border personal-data-transfer question does not
  apply to it. It must not be repurposed to hold real restaurant data before
  phase 2 is decided.
- Neon's PITR retention window at the pilot's cost tier has not been
  measured against the 15-minute RPO target; confirm before relying on it
  for anything beyond validation, or move the database to the RDS fallback
  if it falls short.
- This decision unblocks running the load-profile and restore-drill scripts
  against a real network-reachable deployment. It does not authorize or
  imply a production launch, and does not resolve `AC-NFR-09-05` (retention
  policy) or any legal question, both of which remain phase-2 items.
- A materially different phase-1 need (budget, market, or a decision to
  validate at scale some other way) supersedes this ADR with a new one
  rather than editing this record in place. Phase 2 will always be a new,
  superseding ADR by design.


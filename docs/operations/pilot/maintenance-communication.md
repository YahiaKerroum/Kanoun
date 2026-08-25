---
id: OPERATIONS-PILOT-MAINTENANCE-COMMUNICATION
status: proposed
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Pilot Maintenance Communication Guide (proposed)

## Planned maintenance

1. Schedule outside service hours where possible; the branch's own
   configured hours are the reference (`US-A04`).
2. Notify the pilot owner at least 24 hours ahead with: date, time window,
   expected duration, and what will be unavailable (ordering, payments, or
   both).
3. Planned maintenance windows are excluded from the monthly API
   availability objective (`docs/operations/observability-and-runbook.md`),
   consistent with the 99.9% target's "excluding pre-announced maintenance"
   qualifier.
4. Confirm completion to the owner once verified against the golden journey
   (or a reduced smoke check) rather than assuming success from a clean
   deploy log.

## Unplanned incidents

1. Follow the incident checklist in
   `docs/operations/observability-and-runbook.md` internally.
2. Tell the pilot owner as soon as scope and impact are known: what is
   affected (ordering, payments, kitchen display, sign-in), since when, and
   the current workaround if any.
3. Give a next-update time even if there is nothing new yet; do not go
   silent during an active incident.
4. On resolution, confirm to the owner what was fixed and whether any
   guest- or staff-facing action is needed (for example, re-signing in).

## Post-incident

- Record timeline, root cause, and corrective action per the runbook.
- If the incident affected financial data (payments, refunds, corrections),
  explicitly confirm reconciliation to the owner, not just service
  restoration.

## Channel

The actual notification channel (email, SMS, phone) depends on the
approved invitation/recovery delivery decision
(`docs/operations/retention-and-privacy.md`) and is not finalized here.

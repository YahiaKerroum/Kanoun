---
id: OPERATIONS-PILOT-FEEDBACK-CAPTURE
status: proposed
version: 1.0
owner: operations-and-product
last_reviewed: 2026-08-25
---

# Pilot Feedback Capture Guide (proposed)

## What to capture

For each piece of feedback: who (role, not necessarily name), when, what
screen/flow, what they expected vs. what happened, and whether it blocked
service or was a suggestion.

## Sources

- Direct staff/owner reports during or after service.
- Support escalations that turn out to be usability confusion rather than
  defects (`docs/operations/pilot/support-escalation.md`).
- A short structured check-in with the pilot owner at an agreed cadence
  (weekly is a reasonable default until a different cadence is approved).

## Categorizing feedback

| Category | Example | Handling |
|---|---|---|
| Blocking defect | Cannot complete a payment | Fix before continuing the pilot; treat as a support escalation first |
| Usability friction | Staff repeatedly confused by a label or flow | Track for the PR-06 professional UX gate; do not silently redesign mid-pilot without the owner's awareness |
| Missing capability | Feature explicitly out of MVP scope | Record against `docs/product/mvp-scope.yaml`; do not implicitly promise it |
| Positive signal | A flow that worked well | Keep — useful for the final sellable-product gate's evidence |

## Where it goes

Feedback becomes part of the pilot report referenced by the professional
readiness plan's final gate ("pilot report and accepted risks"). Do not let
feedback live only in an informal chat; consolidate it before the pilot
review.

## What not to do

- Do not use pilot feedback to justify a scope change without an approved
  product decision (see `docs/product/decision-register.md`).
- Do not treat a single owner's preference as a universal design decision;
  note it as one data point.

---
id: OPERATIONS-PILOT-SUPPORT-ESCALATION
status: proposed
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Pilot Support Escalation Guide (proposed)

Pilot support hours, contact channel, and named on-call are outstanding
product/operations decisions (see `docs/delivery/pr-07-readiness.md`). This
document defines the escalation shape now so it can be filled in once those
decisions land, rather than inventing a channel unilaterally.

## What to report and how

| Situation | Who reports | What to include |
|---|---|---|
| Cannot sign in / locked out | Any staff member, to their owner/manager first | Business code, email, approximate time, error message shown |
| A screen shows stale or broken data during service | Staff, to on-call support | Screen name, table/order reference if visible, screenshot if possible |
| A payment or refund did not behave as expected | Cashier, to on-call support immediately (do not retry blindly) | Order reference, amount, what was expected vs. observed |
| Suspected data mixing between restaurants/branches | Any staff member, to on-call support immediately as a critical issue | Exact screen and data observed |
| General feedback, not urgent | Anyone, through `docs/operations/pilot/feedback-capture.md` | — |

## Severity guide

- **Critical** (page immediately): payment/financial discrepancy, suspected
  cross-tenant data exposure, complete inability to take orders during
  service.
- **High**: a single role or workspace broken, but service can continue
  through a workaround.
- **Normal**: cosmetic issues, non-blocking confusion, feature requests.

## What support will ask for

- Correlation ID from the error screen, if shown (never share your password
  or a raw session cookie).
- Approximate time and the business code — never the raw database ID of a
  restaurant, branch, or order.

## What support will not ask for

Support will never ask for your password, a one-time recovery/invitation
token to relay by phone, or direct database access. Treat such a request as
suspicious and stop.

## Filling in the operational details

Before the pilot begins, product/operations must confirm and publish here:
named on-call contact, hours, response-time targets per severity, and the
actual contact channel (phone, chat, ticketing).

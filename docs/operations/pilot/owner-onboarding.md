---
id: OPERATIONS-PILOT-OWNER-ONBOARDING
status: proposed
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# Pilot Owner Onboarding Guide (proposed)

For the named pilot owner, after a controlled operator has provisioned the
tenant and the initial owner account (`US-R01`). No SQL, curl, or UUID
copying is required for any step below.

## 1. Sign in

1. Open the Administration URL provided by your onboarding contact.
2. Sign in with the business code, email, and password from your invitation.
3. If you forget your password, use "Forgot password" — a recovery link is
   sent through the approved delivery channel (final channel pending
   product decision; see `docs/operations/retention-and-privacy.md`).

## 2. Complete guided setup

Administration's `/setup` page shows a resumable checklist (PR-03). Work
through it in order:

1. Restaurant profile and branding.
2. Branch profile: address, contact, time zone, currency, opening hours,
   overnight periods.
3. Service status (open/closed) — orders are only accepted while open.
4. Features you want enabled for this branch.
5. Workforce: invite general staff, kitchen, and cashier accounts. Each
   invitation produces a one-time acceptance link you send to that person.
6. Permissions: assign responsibilities per employee, or apply a template.
7. Menu: categories, dishes, options, prices.
8. Tables and QR codes: create your physical tables, then issue and print a
   QR code per table.

The checklist links directly to the editor for any incomplete item and never
implies a closed or unconfigured branch is accepting orders.

## 3. Verify before opening

Before your first real service, verify the golden journey once yourself:

1. Open a table's QR link on your own phone and confirm the menu looks
   right.
2. Have one invited staff member accept their invitation and sign in.
3. Submit one test order, take it through kitchen preparation, serving, and
   payment.
4. Confirm the sale, table release, and audit entry appear where you expect
   (staff dashboard / reports / audit workspace, permission-dependent).

## 4. Ongoing operation

- Add or deactivate employees at any time from Administration; deactivation
  immediately ends that person's active sessions.
- Watch the readiness checklist after any change — an incomplete item is
  called out, not hidden.
- If you lose access to Administration, use the recovery flow above; the
  last-administrator protection prevents your account from being removed or
  demoted without another administrator in place (`US-R04`).

## Support

See `docs/operations/pilot/support-escalation.md` for how to report a
problem during the pilot.

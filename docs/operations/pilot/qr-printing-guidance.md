---
id: OPERATIONS-PILOT-QR-PRINTING
status: proposed
version: 1.0
owner: operations
last_reviewed: 2026-08-25
---

# QR Printing Guidance (proposed)

## Issuing and printing

1. In Administration, open **Tables**, select a table, and issue its QR
   code if one is not already active.
2. Download the QR code as a PNG or use the print action directly from the
   same screen.
3. Print at a size that scans reliably from normal seated distance —
   roughly 4–5 cm (1.5–2 in) square minimum on a table tent or sticker;
   larger for standing-height mounting.
4. Laminate or use a stand that survives spills and cleaning; a damaged or
   unreadable code is equivalent to a guest having no menu access.

## Placement

- One code per physical table, matching the table identity shown in
  Administration and Staff.
- Keep the code flat and unobstructed; avoid folds, glare-heavy plastic
  sleeves, or placing it where cutlery/plates routinely cover it.

## Rotating or revoking a code

- If a table's QR is compromised, lost, or you are decommissioning a table,
  revoke and reissue from the same Tables screen. A revoked or unknown code
  shows the guest the same safe "can't find that table" recovery screen —
  it never silently serves stale data or exposes another table's session.
- Reprint and replace the physical code immediately after rotation; the old
  printed code stops working the moment you revoke it.

## Verifying a printed code

Before service, scan every printed code once yourself (or have a staff
member do it) and confirm:

1. It opens the customer menu for the correct table.
2. The branch name and menu match what you expect.
3. It does not show a stale/expired/error state.

## Standard, not proprietary

Every QR code encodes a standard HTTPS URL and opens in the guest's default
camera/browser — no proprietary scanning app is required (`AC-NFR-17-03`).

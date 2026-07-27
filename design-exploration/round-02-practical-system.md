# Round 02 — Quiet Service

## Why the reset

Round 01 proved that the product can have a restaurant-specific character, but
it also made the visual metaphor carry too much of the interaction. A real MVP
should not require custom timing rails, animated object travel, three visual
worlds, or an interactive workflow blueprint before the basic restaurant
workflows are dependable.

Round 02 keeps the warmth, discipline, and timing awareness while returning to
familiar product patterns.

## Visual thesis

A warm, precise operations workspace built from familiar lists, tables, queues,
forms, drawers, and tickets. It feels distinctive through composition,
typography, operational language, and one restrained status treatment—not
through novel interaction.

## Content plan

1. **Run the shift** — the next task, active orders, payments, tables, and kitchen.
2. **Maintain the restaurant** — menu, dishes, people, access, modules, and QR codes.
3. **Control and review** — inventory availability, reports, audit, and history.
4. **Customer order** — browse, customize, review, submit, and track.

## Interaction thesis

- Selecting a row opens one standard right-side inspector; mobile detail becomes
  a full page or bottom sheet.
- Every operational object shows one next valid action. Uncommon actions live
  under **More**.
- A small five-step progress line appears only inside order detail.
- Motion is limited to 120–180 ms drawer, focus, and row-update transitions.

## Shared shell

### Desktop

- 224 px left navigation.
- 56 px top bar with restaurant, branch, service status, connection freshness,
  notifications, and user.
- Fluid primary workspace.
- 400 px right inspector when a record is selected.

Primary destinations appear only when enabled and authorized:

- Today
- Orders
- Tables
- Kitchen
- Menu
- Inventory
- Staff
- Reports
- Settings
- Audit

### Tablet

- Compact 72 px rail.
- Two-pane layout when space permits.
- Inspector overlays when the workspace would become too narrow.

### Mobile staff

- Up to four bottom destinations plus **More**.
- Filters open in a sheet.
- Detail is a full page.

### Customer

- Separate restaurant-branded mobile shell.
- Familiar categories, dish rows, customization sheet, and sticky cart action.
- No account required.

## Visual system

- Canvas: `#F4F1EA`
- Surface: `#FFFEFA`
- Ink: `#1E211D`
- Muted text: `#686D66`
- Rules: `#D8D5CC`
- Primary/action: `#9B3F30`
- Success: `#2F6A4E`
- Warning: `#946000`
- Critical: `#A83232`
- Informational: `#315F86`

Typography:

- IBM Plex Sans-like neutral sans for staff UI.
- Condensed companion for order numbers, timers, and station headings.
- Optional restrained serif only for restaurant-facing customer headings.
- Staff scale: 12 caption, 14 control, 16 body, 20 section, 28 page heading.

Geometry:

- 8 px spacing system.
- 40 px desktop controls and 48 px touch controls.
- 48 px operational rows on desktop, 56 px on tablet.
- 6 px default radius.
- One-pixel rules and spacing before shadows.

## Ownable but buildable detail: Service Edge

Operational rows and tickets may use a 4 px vertical edge. The edge is always
paired with:

- explicit status text,
- an icon or shape,
- order/table identity,
- elapsed time where relevant.

It never replaces a label and never becomes a new navigation model.

## Simplicity rules

1. One obvious primary action per page or current selection.
2. List-first defaults; board or map view is optional.
3. Hide disabled modules and unauthorized actions.
4. Put advanced workflow options behind **Advanced**.
5. Keep branch, table, order, payment, and freshness visible where mistakes are costly.
6. Use a standard drawer everywhere instead of object-specific inspectors.
7. Use common language by default; specialist kitchen vocabulary is configurable.
8. Cards are reserved for directly selectable objects, tickets, or a very small metric strip.
9. No gradient, glassmorphism, paper texture, pill soup, large welcome hero, or AI insight card.
10. Every action supports touch and keyboard; drag-and-drop is never required.

## What is deferred

- Editable spatial floor plans as the default table workspace.
- Animated order travel and universal service rails.
- Individual cook or kitchen-station assignment.
- Graph-based module dependency editing.
- Advanced inventory deduction and restocking workflow.
- Cleaning assignment, reviews, online payment, and advanced analytics.
- Split payment, partial serving, and granular workflow options until explicitly enabled.

## Round 02 screen set

All screens use the same Nacre / Central / Table 12 / Order 184 scenario.

1. `round-02/01-today.png` — role-aware branch home and task queue.
2. `round-02/02-orders.png` — active orders list with a selected-order inspector.
3. `round-02/03-payment.png` — record payment and close order.
4. `round-02/04-menu.png` — searchable category and dish management.
5. `round-02/05-dish-editor.png` — dish form, options, availability, and branch override.
6. `round-02/06-employee-access.png` — employee branch access, template, and overrides.
7. `round-02/07-modules.png` — modules and simple workflow settings with impact warning.
8. `round-02/08-inventory.png` — ingredient availability and low-stock list.
9. `round-02/09-reports.png` — restrained sales report with traceable transactions.
10. `round-02/10-audit.png` — actor/action history and before/after detail.
11. `round-02/11-qr-tables.png` — table list, QR status, preview, and print/download.
12. `round-02/12-customer-customize.png` — mobile dish customization and sticky add action.
13. `round-02/13-customer-review.png` — mobile basket review and order submission.

## Acceptance test for this round

The direction succeeds if a developer can reproduce each layout using ordinary
navigation, table/list, drawer, form, tabs, modal, and bottom-sheet components;
and a new restaurant employee can identify the page purpose and next action
without learning the design metaphor.

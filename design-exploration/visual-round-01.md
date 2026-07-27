# Restaurant Management UI/UX — Visual Round 01

## Design stance

This product should feel like a live restaurant operating system, not a generic SaaS dashboard with food vocabulary.

### Visual thesis

A living service ledger: warm and editorial at the guest and management edges, dark and decisive at the kitchen pass, spatial on the dining-room floor. One restrained signal language connects every handoff from table to kitchen to payment.

### Content plan

1. **Guest surface** — what can I order, where is my order, and how do I get help?
2. **Live service** — what needs attention now, where is it, and who owns the next handoff?
3. **Kitchen** — what must be prepared next, what changed, and what is partially ready?
4. **Management** — what changed, what is blocked, and what decision is required?

### Interaction thesis

- An order moves along a visible **service spine**: Submitted → Preparing → Ready → Served → Paid.
- Operational urgency grows through elapsed time, position, wording, and pattern—not color alone.
- Selecting a table, order, employee, or configuration node opens a contextual sidecar while preserving the working surface.
- Sensitive changes end with a visible reason and audit receipt.

## Three product-native visual modes

### 1. House Ledger

Best for guest ordering, menu authoring, permissions, reports, and audit.

- Ledger bone `#F2E9D8`
- Ink `#191A16`
- Bottle green `#28473A`
- Oxblood `#963E32`
- Muted brass `#B69A63`
- Editorial serif for restaurant moments; compact sans for controls; tabular sans numerals.
- Open columns, fine rules, margin notes, and redline-style change previews.

### 2. The Pass

Best for incoming orders, kitchen preparation, expediting, and runner handoff.

- Soot `#171A19`
- Prep steel `#39413E`
- Ticket bone `#F3EAD8`
- Tomato `#D94A35`
- Herb `#71886C`
- Condensed order references and timers; highly legible sans for item detail.
- Hard-edged docket strips and full-height workflow lanes, not rounded Kanban cards.

### 3. Room Pulse

Best for table assignment, floor service, assistance, bill requests, and cleaning turnover.

- Plaster `#ECE9DF`
- Charcoal `#161A1E`
- Service cobalt `#3156D8`
- Urgent coral `#ED6A4C`
- Available sage `#6F8D77`
- The actual room plan is the interface, with a selected-table sidecar and a slim service-event rail.

## Shared system

- Persistent restaurant, branch, service period, and connection freshness.
- Dynamic navigation based on enabled modules, branch scope, and permission.
- Explicit labels and icons accompany every state color.
- Square or lightly softened surfaces; no glass, decorative gradients, pill soup, or KPI-card mosaic.
- Restaurant-native language: covers, fire, hold, expo, at pass, 86, comp, void, open check.
- Designed from the beginning for French, Arabic, English, RTL, longer translations, local currency, and branch-local time.

## Round 01 screens

1. **Guest menu** — editorial mobile menu with verified table context, availability, structured modifiers, and a persistent service dock.
2. **Guest table session** — multiple orders on one table, honest service timeline, add-another-round, help, bill, and connection state.
3. **Kitchen queue** — station-routed docket lanes, dominant timers, changed-item interruption, allergy note, partial readiness, undo/recall.
4. **Dining-room floor** — spatial table states, selected-table sidecar, bill and assistance events, runner handoff, cleaning turnover.
5. **Live service board** — exception-first temporal surface showing the next handoff instead of a dashboard-card grid.
6. **Operations blueprint** — modules and the active order lifecycle shown as a dependency flow with recipient coverage and change impact.

## UX stress cases included in the mockups

- Long modifier and allergy note.
- Item changed after kitchen receipt.
- Partial readiness.
- Bill request and assistance request.
- Split or partial payment.
- Sold-out dish.
- Stale real-time connection.
- Action hidden or blocked by permission and object state.
- No eligible notification recipient.
- Configuration change affecting active orders.

## Benchmark grounding

- Kitchen tools consistently prioritize station routing, ticket timers, modifiers, item completion, recall, and expo workflows:
  - https://pos.toasttab.com/hardware/kitchen-display-system
  - https://squareup.com/us/en/point-of-sale/restaurants/kitchen-display-system
- Credible table-service tools use a real spatial floor plan and table state:
  - https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656709-Creating-and-managing-floor-plans-and-tables
- QR flows are table-aware, account-free, mobile-first, and connected directly to the kitchen:
  - https://pos.toasttab.com/uk/products/mobile-order-and-pay
  - https://squareup.com/us/en/online-ordering/qr-code-ordering

## Decision for discussion

Choose whether the product should lean:

1. warmer and more boutique (**House Ledger**),
2. faster and more industrial (**The Pass**), or
3. more spatial and service-led (**Room Pulse**).

The recommended system uses all three as context modes while keeping one shared identity and interaction model.

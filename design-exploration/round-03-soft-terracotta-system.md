# Round 03 — Soft Terracotta System

> **Status:** selected visual direction for implementation reference  
> **Scope:** staff desktop/tablet shell and the core dine-in service workflow  
> **Working product name in mockups:** `SAVORA`  
> **Important:** `SAVORA` is a placeholder wordmark, not a final naming decision.

## Reference screens

1. [Dashboard](round-03-savora/01-dashboard.png)
2. [Order entry](round-03-savora/02-order-entry.png)
3. [Active orders](round-03-savora/03-active-orders.png)
4. [Kitchen](round-03-savora/04-kitchen.png)
5. [Tables and payment](round-03-savora/05-tables-payment.png)

The images establish visual hierarchy, density, composition, and tone. They are
not literal data specifications. Generated labels, totals, timestamps, and state
combinations must be replaced by validated product data and business rules.

---

## 1. Direction

The product should feel warm, energetic, and practical without becoming a
generic purple SaaS dashboard or an overly themed restaurant interface.

The selected direction uses:

- Soft terracotta and apricot as the brand/action family.
- Warm white working surfaces on a pale peach canvas.
- A slim, stable navigation rail.
- A compact context bar containing branch, service, sync, and user state.
- Familiar lists, grids, inspectors, forms, and operational lanes.
- Food photography only where it improves dish recognition.
- One obvious next action in each selected context.

The interface should remain calm during a rush. Terracotta provides identity;
semantic colors communicate operational state.

## 2. Product principles

### 2.1 Service first

The first screen answers:

1. What needs attention?
2. Where is it happening?
3. What is the next valid action?

Sales and popular dishes are supporting information, not the primary workflow.

### 2.2 Simple by default

- Hide disabled modules.
- Hide actions the current employee cannot perform.
- Keep advanced workflow controls behind a clearly labeled secondary area.
- Do not require a restaurant to create separate accounts for every
  responsibility.

### 2.3 Context is persistent

Where a wrong action would be costly, keep the following visible:

- Restaurant and branch.
- Current service state.
- Connection freshness.
- Table and order identity.
- Payment/balance state.
- Employee acting on the record.

### 2.4 Color is never the only signal

Every operational state uses at least two of:

- Explicit text.
- Icon or shape.
- Position/grouping.
- Color.
- Elapsed time.

### 2.5 Familiar interaction patterns

Use standard rows, cards, filters, drawers, forms, tabs, and confirmation
dialogs. Drag and drop may be optional, but no critical task can require it.

---

## 3. Information architecture

Navigation is permission-aware and module-aware.

### Run the service

- Dashboard
- Orders
- Tables
- Kitchen

### Maintain the restaurant

- Menu
- Inventory
- Staff

### Control and review

- Reports
- Settings
- Audit

Disabled or unauthorized destinations do not leave empty gaps or locked menu
items in normal navigation.

---

## 4. Shared application shell

### Desktop

- Navigation rail: `88px`.
- Page gutter: `20–24px`.
- Top context bar: `84–88px`.
- Content uses a fluid 12-column grid.
- Minimum practical desktop width: `1180px`.
- Detail inspectors are attached to the workspace, not floating over unrelated
  content.

### Tablet

- Navigation rail: `72px`.
- Top bar may wrap branch and sync context into a second compact row.
- Two-pane layouts remain where both panes can retain usable touch targets.
- Otherwise, inspectors become a full-height overlay or a dedicated page.

### Mobile staff

- Replace the rail with up to four bottom destinations and **More**.
- Filters open in a bottom sheet.
- Record detail becomes a full page.
- Kitchen cards become one or two lanes, depending on width.

### Shell invariants

The shell always exposes:

- Current branch.
- Service open/closed state.
- Connection freshness or stale-data warning.
- Notifications relevant to the employee.
- Current user and responsibility context.

---

## 5. Design tokens

### 5.1 Color

Final values should be checked in the browser and adjusted to meet contrast
requirements. These are the implementation starting points.

| Token | Value | Use |
|---|---:|---|
| `brand-700` | `#B95035` | Deep clay, pressed/strong emphasis |
| `brand-600` | `#C96042` | Navigation and top context bar |
| `brand-500` | `#D96F4B` | Primary action |
| `brand-400` | `#E98562` | Hover and selected accent |
| `brand-100` | `#F8DED3` | Selected row and soft highlight |
| `brand-050` | `#FFF1EB` | Very quiet brand tint |
| `canvas` | `#FBF7F4` | Application background |
| `surface` | `#FFFCFA` | Primary panel |
| `surface-raised` | `#FFFFFF` | Drawer, menu, focused panel |
| `border` | `#E7DDD7` | Dividers and input borders |
| `text` | `#252122` | Primary text |
| `text-muted` | `#6F6764` | Secondary text |
| `text-subtle` | `#938A86` | Captions and disabled copy |
| `success` | `#3F8F55` | Available, ready, paid |
| `success-soft` | `#E7F3E9` | Success background |
| `warning` | `#D98A17` | Reserved, partial, needs action |
| `warning-soft` | `#FFF1D9` | Warning background |
| `danger` | `#D83B35` | Allergy, delayed, destructive |
| `danger-soft` | `#FDE9E7` | Danger background |
| `neutral-state` | `#7B8187` | Served, cleaning, inactive |

#### Color rules

- Terracotta identifies the product and the primary action.
- Do not use brand terracotta as a substitute for every status.
- Red is reserved for allergy, error, delay, destructive action, or an
  exceptional unpaid override.
- Large terracotta surfaces require white text that meets WCAG contrast.
- Avoid gradients in production UI.

### 5.2 Typography

Recommended starting family:

```text
Manrope, Inter, system-ui, sans-serif
```

Use one family throughout the staff application.

| Style | Size / line height | Weight |
|---|---|---:|
| Page title | `28 / 36` | 700 |
| Section title | `20 / 28` | 700 |
| Panel title | `18 / 24` | 700 |
| Body | `14 / 21` | 400 |
| Control | `14 / 20` | 600 |
| Caption | `12 / 18` | 500 |
| Operational number | `24–32 / 32–38` | 700 |

Requirements:

- Use tabular numerals for prices, timers, quantities, and order references.
- Avoid all-caps body copy.
- Do not use a decorative restaurant font in the staff shell.
- Test longer French labels and future Arabic/RTL layouts.

### 5.3 Spacing

Use a 4px base scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48
```

Common application values:

- Panel padding: `20–24px`.
- Row gap: `12px`.
- Section gap: `24px`.
- Dense operational row: `52px` minimum.
- Standard touch row: `56px` minimum.
- Touch target: at least `44 × 44px`; prefer `48 × 48px`.

### 5.4 Radius and elevation

| Element | Radius |
|---|---:|
| Button/input | `8px` |
| Card/row group | `10–12px` |
| Major panel | `12–14px` |
| Avatar/status circle | Fully circular |

Use borders before shadows.

```text
panel shadow: 0 4px 18px rgba(74, 48, 38, 0.05)
menu shadow:  0 10px 30px rgba(74, 48, 38, 0.12)
```

Do not stack several elevated cards inside another elevated card.

### 5.5 Icons

- Use one outline icon family.
- Default size: `20px`.
- Operational emphasis: `24px`.
- Stroke: approximately `1.75–2px`.
- Pair ambiguous icons with text.
- Keep the same meaning for an icon across all modules.

### 5.6 Food photography

Use food photography in:

- Order entry.
- Menu management.
- Customer menu.
- The small **Popular tonight** dashboard strip.

Avoid food photography in:

- Active order lists.
- Kitchen tickets.
- Payments.
- Permissions.
- Inventory tables.
- Audit history.

Photo treatment:

- Natural light and color.
- Consistent crop ratio per component.
- Neutral plate/background.
- No text baked into images.
- Provide a structured fallback when an image is missing.

---

## 6. Core components

### Navigation rail

- Wordmark at the top on desktop.
- Icon destinations centered in a vertical rhythm.
- Active destination uses a warm-white tile and brand-colored icon.
- Notification count is attached to the relevant destination or global bell.
- User avatar and availability sit at the bottom.

### Context bar

Contains:

- Page title.
- Branch selector.
- Service status.
- Search where relevant.
- Sync freshness.
- Notifications.
- Current user.

Do not turn these into separate cards.

### Operational row

Minimum contents:

- Identity: order, table, ingredient, employee, or request.
- Explicit status.
- Elapsed or changed time where relevant.
- Supporting context.
- One next valid action or a chevron to detail.

### Attached inspector

- Opens from a selected row/table/card.
- Keeps the selected object visible.
- Uses a consistent header, content body, and fixed action area.
- Mobile equivalent is a full page.

### Status badge

- Short explicit label.
- Semantic icon or dot.
- Quiet tinted background.
- Never show color without readable text.

### Primary action

- Filled soft terracotta.
- Verb-led label: **Send to kitchen**, **Mark ready**, **Record payment**.
- Only one filled primary action per selected working state.

### Destructive action

- Not brand-colored.
- Red text or red button only inside a clear destructive context.
- Requires confirmation and a reason when history, payment, or service state is
  affected.

---

## 7. Page specifications

### 7.1 Dashboard

Reference: [01-dashboard.png](round-03-savora/01-dashboard.png)

#### Purpose

Show current branch activity and the work that needs attention now.

#### Layout

- Large **Live floor** panel.
- Attached selected-table summary.
- **Needs attention** queue.
- Small **Popular tonight** strip.
- One restrained **Service pace** chart.

#### Required states

- Available, occupied, reserved, awaiting payment, needs cleaning.
- Delayed order.
- Bill request.
- Ready-to-serve handoff.
- Assistance request.
- Stale connection.

#### Rules

- Exceptions precede analytics.
- Selecting a table does not navigate away from the floor.
- Dashboard modules appear only when enabled and authorized.
- Sales is branch-scoped and traceable to underlying orders.

### 7.2 Order entry

Reference: [02-order-entry.png](round-03-savora/02-order-entry.png)

#### Purpose

Let an authorized employee create a dine-in order quickly.

#### Layout

- `68%` menu browser.
- `32%` persistent order summary.
- Category tabs above a two-row dish grid.
- Order type, table, covers, items, totals, and action stay visible.

#### Required interactions

- Search and category filter.
- Add dish.
- Open customization.
- Change quantity.
- Remove item.
- Change table.
- Hold/restore draft.
- Clear with confirmation.
- Submit once with idempotent pending/success/failure feedback.

#### Rules

- An unavailable dish cannot be newly added.
- Required options must be resolved before submission.
- Price and item snapshots are created at submission.
- The displayed total must be calculated from actual data; do not copy totals
  from the visual mockup.

### 7.3 Active orders

Reference: [03-active-orders.png](round-03-savora/03-active-orders.png)

#### Purpose

Let service staff scan, filter, select, and move an order to its next valid
state.

#### Layout

- `62%` filterable order list.
- `38%` attached detail inspector.
- Desktop columns: order, table, status, elapsed, items, total, payment.

#### Required states

- Submitted.
- Preparing.
- Part ready.
- Ready.
- Served.
- Awaiting payment.
- Paid/completed.
- Cancelled/rejected/refunded.
- Delayed.
- Changed after kitchen receipt.

#### Rules

- The inspector exposes only the next valid action.
- Allergy and change notices remain above the item list.
- Cancellation or rejection requires a reason.
- Sensitive changes appear in activity/audit history.

### 7.4 Kitchen

Reference: [04-kitchen.png](round-03-savora/04-kitchen.png)

#### Purpose

Make preparation work readable at a practical distance and operable by touch.

#### Layout

- Station filters at the top.
- Four lanes: New, Preparing, Part ready, Ready to run.
- Large ticket cards with a fixed next-action position.
- Service-health strip at the bottom.

#### Ticket hierarchy

1. Order reference and elapsed time.
2. Table and covers.
3. Quantity and dish.
4. Options, notes, allergy, and changed state.
5. Station or assignee.
6. Next valid action.

#### Rules

- Changes after preparation begins use explicit **CHANGED** wording.
- Allergy information is never collapsed.
- Each order item can maintain an independent preparation state.
- Cook or station assignment appears only when the workflow is enabled.
- Audio is supplementary; visual notification remains required.

### 7.5 Tables and payment

Reference: [05-tables-payment.png](round-03-savora/05-tables-payment.png)

#### Purpose

Coordinate table state, table sessions, related orders, requests, and payment.

#### Layout

- `64%` floor/table workspace.
- `36%` selected table session and payment panel.
- Area tabs and state filters remain above the floor.

#### Rules

- Table session and individual orders remain distinct.
- Several orders can belong to one table session.
- The payment panel shows amount, method, remaining balance, and responsible
  employee.
- Partial and split payments appear only when enabled.
- Completion is blocked while a balance remains unless an authorized override
  includes a reason.
- Payment edits, refunds, and overrides are audited.

---

## 8. Extension rules for remaining pages

These pages should reuse the shell and component rules above.

### Menu and dish editor

- Category list on the left.
- Searchable dish list/grid in the center.
- Selected dish inspector on the right.
- Show branch price/availability overrides explicitly.
- Use food photography.
- Show why a dish became automatically unavailable.

### Inventory

- Default to a table/list, not metric cards.
- Columns: ingredient, availability, on hand, unit, par, affected dishes,
  last update.
- Restock requests open in the standard inspector.
- Corrections require a reason and permission.

### Staff access

- Employee list on the left.
- Branch scope and permission groups in the main workspace.
- Template is a starting point; individual overrides remain visible.
- Never imply that a job title is the authorization source.

### Modules and workflow

- Full-width module rows with enabled/disabled state.
- Configuration appears only for enabled modules.
- Impact/dependency summary uses the standard inspector.
- Active orders keep their existing workflow when configuration changes.

### Reports

- One summary strip, one primary chart, and a traceable transaction table.
- Cancelled and refunded amounts remain distinct.
- Exports inherit filters and branch scope.

### Audit

- Append-only event list.
- Columns: actor, action, target, branch, time.
- Before/after detail opens in the standard inspector.
- No edit or delete control in normal restaurant interfaces.

### Customer mobile

- Separate mobile shell with restaurant branding.
- Verify table context before order submission.
- Category navigation, dish rows/cards, customization sheet, and sticky cart.
- After submission, the home state becomes the table-session hub:
  order progress, add another order, request help, and request bill.
- Account creation is not required.

---

## 9. Interaction and state behavior

### Loading

- Use structural skeletons only where content will appear.
- Keep branch and connection context visible.
- Do not replace operational rows with a full-page spinner.

### Pending mutation

- Disable only the action being submitted.
- Show explicit **Sending…** or **Recording…** text.
- Preserve a client request identifier to prevent duplicate order/payment
  creation.

### Success

- Update the row or inspector in place.
- Announce the state change to assistive technology.
- Use a brief confirmation message only when the result is not already obvious.

### Failure

- Keep the user’s input.
- Explain whether retry is safe.
- Distinguish validation, permission, conflict, and connection failures.

### Stale connection

- Replace **Updated just now** with a clear stale-data warning.
- Show the last confirmed update time.
- Do not imply that an unconfirmed action succeeded.

### Motion

- `120–180ms` for focus, row update, drawer, and selection changes.
- No decorative page transitions.
- Respect reduced-motion preferences.

---

## 10. Responsive behavior

| Desktop composition | Tablet | Mobile staff |
|---|---|---|
| List + inspector | List + overlay inspector | List then detail page |
| Floor + session panel | Floor + collapsible panel | Table list then session |
| Four kitchen lanes | Two lanes, horizontal paging | One lane per state |
| Dish grid + order panel | Two-column grid + order drawer | One-column list + cart sheet |

Horizontal scrolling may be used for kitchen lanes, but not for financial tables
or forms without a clear mobile alternative.

---

## 11. Accessibility and localization

- Target WCAG 2.2 AA.
- Provide visible keyboard focus.
- Keep DOM order aligned with visual reading order.
- Use programmatic labels for every form control.
- Announce live order-state changes without stealing focus.
- Ensure the customer menu remains usable at 200% browser text size.
- Do not encode state through color alone.
- Store and display Unicode correctly.
- Format currency, date, time, number, and tax by branch settings.
- Keep layouts compatible with future Arabic and RTL support.

---

## 12. Implementation guardrails

### Do

- Use the same shell across staff modules.
- Keep the active branch and connection state visible.
- Use lists for operational work and cards for genuinely selectable objects.
- Use food photos to support dish recognition.
- Put one strong primary action in the current context.
- Reuse one attached inspector pattern.
- Preserve historical names, prices, options, and actors.

### Do not

- Add a large welcome hero.
- Create a dashboard made entirely of KPI cards.
- Use glassmorphism or decorative gradients.
- Turn every label into a pill.
- Use terracotta for success, warning, and error simultaneously.
- Hide allergies, balances, branch scope, or stale connection state.
- Treat UI visibility as authorization.
- Implement generated mockup totals as product logic.

---

## 13. Initial component inventory

1. App shell and responsive navigation.
2. Branch/service context bar.
3. Operational row.
4. Status badge.
5. Timer/elapsed label.
6. Search and filter bar.
7. Attached inspector.
8. Dish card and food-image fallback.
9. Order line item.
10. Order progress stepper.
11. Table shape and table-state legend.
12. Kitchen ticket.
13. Money summary.
14. Payment method selector.
15. Confirmation dialog with reason field.
16. Toast/live-region feedback.
17. Stale connection banner.
18. Empty, loading, permission-denied, and error states.

---

## 14. Definition of visual completion

A page is ready for product review when:

- It uses the shared shell and tokens.
- The current branch and connection state are visible.
- Every status has text in addition to color.
- The primary action is obvious and state-valid.
- Unauthorized and disabled features are absent.
- Loading, empty, error, stale, and permission states are designed.
- Keyboard and touch operation are both possible.
- Mobile/tablet behavior is specified.
- Destructive and financial actions have confirmation and audit behavior.
- Displayed calculations come from validated domain logic.

---

## 15. Open design decisions

Before the visual system is treated as final:

1. Replace or confirm the `SAVORA` working name.
2. Confirm the production font and verify Arabic glyph coverage.
3. Validate terracotta contrast on the actual displays used in the restaurant.
4. Confirm whether payment is primarily per order or per table session.
5. Confirm split/partial payment scope for the first release.
6. Confirm whether the MVP kitchen groups work by order, item, or station.
7. Confirm the first supported language, tax rules, currency formatting, and
   receipt requirements.

## Generation note

The five reference screens were created with the built-in image-generation
workflow. The final prompt set consistently specified:

- A realistic shippable restaurant UI.
- The soft terracotta, clay, apricot, ivory, and peach token family.
- A slim navigation rail and compact branch/service context bar.
- Familiar, practical components.
- No purple, bright neon orange, gradients, glassmorphism, or experimental
  metaphors.

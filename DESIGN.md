# Kanoun Design System

The source of truth for how Kanoun looks and reads. Tokens live in
`apps/web/design-system.css` and are shared by the staff, back-office, and
guest apps and by the desktop launcher. Brand assets live in
`apps/web/brand/`.

## 1. Atmosphere & Identity

A _kanoun_ is the clay brazier at the centre of an Algerian kitchen, the
thing everything else is cooked around. The product takes its name and its
mark from it: a brazier seen from the front, with its rim, three pot-rests, a
horseshoe-arch opening, and a saffron ember inside (`kanoun-mark.svg` and
`kanoun-ember.svg`, drawn on a 64-unit grid). The mark is plate-white on the
harissa rail and harissa on light ground; the ember is always saffron. The
app icon (`kanoun-icon.svg`, `apps/desktop/src-tauri/icons/mark.svg`) puts the
white mark on a harissa tile. The wordmark is "Kanoun" in Young Serif, never
set in capitals.

Kanoun serves restaurants, so it borrows from the food: an Algerian spice
market. Harissa paprika marks the brand and the main action, semolina and
warm plate-white make the working surfaces, date-brown ink carries the text,
saffron flags what needs attention, and olive confirms what is done.

The one bold element is the **harissa rail**: the navigation column in the
staff and back-office apps, the launcher, and the sign-in panel. Everything
else stays quiet and task-led. Guest screens are photographic and welcoming;
staff and back-office screens are denser and built for speed under pressure.

## 2. Color

| Role               | Token                      | Value                 | Usage                                             |
| ------------------ | -------------------------- | --------------------- | ------------------------------------------------- |
| Harissa            | `--harissa`                | `#a8361f`             | Rail, primary actions, active selection           |
| Harissa deep       | `--harissa-deep`           | `#852714`             | Links, hover on primary, emphasis on light ground |
| Semolina           | `--semolina`               | `#f4ecdf`             | Application canvas                                |
| Plate              | `--plate`                  | `#fffcf7`             | Cards, forms, panels                              |
| Ink                | `--ink`                    | `#2c1d15`             | Primary text                                      |
| Saffron            | `--saffron`                | `#d8961a`             | Attention, in-progress states, focus ring         |
| Olive              | `--olive`                  | `#5a6b25`             | Success and "done" states                         |
| Beet               | `--beet`                   | `#8c1d4a`             | Danger and destructive actions                    |
| Line / line strong | `--line` / `--line-strong` | `#e6dac7` / `#d4c3a8` | Dividers and control borders                      |

Danger is beet-wine, not red, so it is never mistaken for the harissa brand.
Text on harissa is always white. Older token names (`--brand-fill`,
`--brand-050` to `--brand-700`) map onto the harissa scale so existing
component styles keep resolving; prefer the named tokens in new code.

## 3. Typography

| Role      | Face                                     | Notes                                                                         |
| --------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Display   | Young Serif 400                          | Page titles, section titles, dish names, table codes, the wordmark            |
| Interface | Schibsted Grotesk (variable, 400–900)    | Body, labels, buttons, tables                                                 |
| Figures   | Schibsted digits only ("Kanoun Figures") | Digits in display text, and every number that must line up (`--font-figures`) |
| Ticket    | IBM Plex Mono 500/600                    | Kitchen tickets and the guest's receipt only (`.kanoun-ticket__face`)         |

Young Serif has old-style figures, so the display stack starts with
`Kanoun Figures`, a 2.5 KB face holding Schibsted Grotesk's tabular digits.
Do not use `font-variant-numeric: tabular-nums` on Schibsted text: its `tnum`
feature also widens full stops, commas, and colons ("3 , 100 . 00"). Numbers
that must align switch family to `var(--font-figures)` instead. The ticket
face stands in for a thermal printer and appears nowhere else; it is not for
small data labels. Body text is never smaller than 13px; labels are sentence
case, never all caps or tracked out. Fonts are self-hosted so the desktop app
renders offline.

## 4. Spacing & Layout

Base unit 4px (8, 12, 16, 20, 24, 32). Radii are small and tile-like:
6px on controls, 8–10px on panels. Borders establish hierarchy; shadows only
lift overlays (menus, dialogs, the cart).

- **Staff:** a 104px harissa rail on the left, a sticky white context bar with
  the page title, branch, and connection, then the page on semolina. Below
  820px the rail becomes a bottom bar.
- **Back office:** the same structure with a 232px rail of text links. Below
  760px the rail becomes a top bar with a scrolling link row.
- **Guest:** single column on phones, the menu as photographic dish cards,
  and a harissa cart bar.

One visible title per page: the context-bar `h1`. Section headings inside a
page that would repeat it stay in the document outline but are visually
hidden. No eyebrow labels above headings and no decorative numbering.

## 5. Components

### Harissa rail

- **Structure:** brand mark (`.kanoun-mark`, the brazier drawn with two CSS
  masks), the wordmark, then navigation. The active item is a plate-white tile with ink
  text; other items are white at 80% opacity.
- **States:** default, hover (white at 9% overlay), focus (saffron ring),
  current (`aria-current="page"`).
- **Accessibility:** native links; every target at least 40px tall.

### Primary action

- **Structure:** native `button`, harissa fill, white text, 40–46px tall.
- **States:** hover darkens to harissa deep, saffron focus ring, disabled at
  55% opacity. Secondary actions are plate-white with a line-strong border and
  ink text; destructive actions use beet.

### Desktop launcher

- **Structure:** harissa rail with the mark, restaurant name, and live status
  for the database and services; the main area shows one step at a time:
  choose where data lives, starting (a numbered sequence), set up the
  restaurant, then the workspaces with sample sign-ins and password-reset
  links.
- **States:** setup, starting (per step), welcome, ready, error with a retry,
  and closing.
- **Accessibility:** radio-group storage choice, visible labels on every
  field, validation only after the user has interacted, live status region.

### Kitchen ticket and guest receipt

- **Structure:** a plate-white slip with a torn bottom edge (`.kanoun-ticket`,
  a CSS mask), a dashed rule under the header, and the ticket face for the
  order reference, quantities, and times. On the kitchen board the table code
  leads in large ticket type; each line has one action (Start, then Ready in
  olive). Ready lines are struck through in olive.
- **States:** waiting, preparing (saffron text), ready, changed by a
  correction, selected from a link (saffron outline).
- **Motion:** a new ticket feeds down out of the printer once
  (`clip-path` reveal, 340 ms); tickets already on the board never animate.
  The guest's receipt prints the same way once, after the order is sent.

### Guest menu row and dish sheet

- **Structure:** the menu reads like a printed one: dish name in Young Serif,
  a dotted leader, the price in figures, two lines of description, and the
  names of any choices. A round "+" adds a dish with no required choices in
  one tap and then shows how many are in the order; tapping the dish opens a
  sheet with the photograph, choices, note, a quantity stepper, and "Add 2 for
  DZD 700".
- **Layout:** one column up to 640px, sticky header and category tabs that
  follow the scroll, a harissa order bar fixed to the bottom. Sheets rise from
  the bottom on phones and centre on larger screens.
- **States:** available, sold out (dimmed, no add), in the order (count on the
  button), choices required.

## Writing

Write for the person at the counter, not for the system. Name things by what
people do (Orders, Kitchen, Payments, Staff, Reports), use sentence case and
plain verbs, and say what to do next. Never surface implementation words such
as tenant, scope, server-side, authoritative, append-only, contract, or
permission keys like `orders.view`. A permission message says who can grant
access ("Ask a manager to add order access").

### Auth and account lifecycle

- **Structure:** stable public sign-in, recovery, and invitation routes; the
  signed-out staff boundary always exposes a sign-in action with a validated
  internal return target. Authenticated shells expose the employee display name,
  restaurant, active branch, effective responsibility labels, and a discoverable
  sign-out action.
- **States:** default, hover, focus, pressed, disabled, pending, success,
  validation error, invalid/expired/used, revoked, and session-ended. Sensitive
  URL tokens are captured once and removed from browser history immediately.
- **Lifecycle controls:** Administration keeps employee profile editing,
  branch replacement, reactivation, invitation copy, deactivation confirmation,
  administrator transfer, and final-administrator protection in the existing
  tenant-scoped surfaces. Invitation URLs are held in memory only and are never
  written to local storage, analytics, logs, or error text.
- **Responsive behavior:** auth forms remain usable at 320px and 200% zoom;
  account context stacks below the shell header at narrow widths; focus moves to
  the first heading or actionable error after route/state changes.
- **Accessibility:** every field has a visible label and autocomplete hint,
  validation is announced through a live region, errors are associated with
  fields, keyboard order is logical, contrast is WCAG AA, and reduced motion
  removes non-essential transitions.

### Guided setup and readiness

- **Structure:** a server-derived checklist sits above direct restaurant,
  branch, hours, workforce, menu, table, and QR links. The checklist never
  stores a client-owned completion flag.
- **States:** loading, unavailable, blocked, needs setup, ready, pending,
  conflict, and successful refresh. Status uses an icon, label, and copy, not
  color alone.
- **Layout:** the Administration `setup-content` region is the single vertical
  scroll owner. Readiness rows use an intrinsic grid and wrap into one column
  below the existing 760px navigation breakpoint; branch hours use a labelled
  day row with explicit closed-day and overnight guidance.
- **Accessibility:** every editor field has a visible label, native controls,
  focus-visible treatment, actionable errors, and 44px primary actions. The
  Staff handoff link is rendered only after the core server state is ready.

### Operational route navigation

- **Structure:** Staff uses native URL-backed links for `/`, `/notifications`,
  `/orders`, `/tables`, `/kitchen`, `/payments`, `/menu`, `/reports`, and
  `/audit`. Staff and Setup are permission-aware Administration links; they are
  not local placeholder screens.
- **States:** current route, hover, focus, pressed, invalid route, unauthorized
  route, signed-out return, and feature-disabled absence. A route change keeps
  the branch scope server-derived and preserves browser back/forward behavior.
- **Accessibility:** use native anchors with `aria-current="page"`; retain
  modifier-click and new-tab behavior; every target is at least 44px and has a
  visible focus ring.

### Task link and lifecycle status

- **Structure:** a visible order reference and table lead each task row. Links
  carry trusted route state to order evidence, Kitchen, the payment ledger, or
  read-only report/audit context. Internal identifiers are never editable or
  displayed as workflow labels.
- **Status vocabulary:** Received, Waiting for kitchen, Preparing, Ready for
  service, Served, Bill requested, Paid, Completed, Cancelled, Partially
  refunded, and Refunded. Labels and supporting copy always accompany status
  color or icon; elapsed time is descriptive and never a delay classification.
- **Handoff states:** loading, empty, unavailable, stale, pending, succeeded,
  failed, conflicted, and session ended each expose a recovery action or the
  responsible next role. Acknowledging a notification never completes its task.

### Ledger selection

- **Structure:** payment staff select an order from visible bill requests,
  unpaid orders, or recent paid/refunded orders by reference, table, time, and
  financial state. An existing ledger opens through a trusted application link;
  there is no editable order UUID field.
- **Financial controls:** payment is exact-balance, append-only, and server
  authoritative. Refund forms require amount, reason, confirmation, permission,
  and recent authentication; history remains visible after reload.
- **Accessibility:** selection controls are labelled, keyboard reachable, and
  announce pending, success, stale, and failed outcomes without relying on
  color alone.

## 6. Motion & Interaction

Motion answers an action: a page settling after navigation (6px, 200 ms), the
active rail item sliding to its new place, a sheet rising, a count changing
on the order bar. Use short ease-out tweens (`--ease-out`,
`--duration-fast` 140 ms, `--duration` 200 ms, `--duration-slow` 320 ms);
never springs, overshoot, or hover growth. Pressing a control settles it to
97% in CSS. The one orchestrated moment is a ticket printing. Nothing
animates on its own except the launcher's starting indicator and the guest's
loading ember. `prefers-reduced-motion` removes non-essential transitions.

## 7. Depth & Surface

Borders do the work: plate-white panels on semolina with warm lines. A single
warm shadow lifts floating surfaces only.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA: 4.5:1 body-text contrast, 3:1 control contrast, visible
keyboard focus (saffron ring), native controls, alt text for dish photography,
and full keyboard ordering flows. No accepted visual-accessibility debt is
recorded.

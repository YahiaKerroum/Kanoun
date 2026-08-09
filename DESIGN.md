# MISE Design System

## 1. Atmosphere & Identity

MISE is a warm, high-tempo restaurant operating system: saffron gold frames
calm ivory work surfaces, while compact operational controls remain clear under
pressure. Its signature is the saffron frame around an otherwise quiet,
food-forward product surface; guest ordering is welcoming and photographic,
while staff and administration are denser and task-led.

## 2. Color

| Role        | Token          | Value     | Usage                                  |
| ----------- | -------------- | --------- | -------------------------------------- |
| Brand field | `--brand-fill` | `#ffb300` | App-stage surround and primary actions |
| Brand dark  | `--brand-700`  | `#6e4700` | Focus, links, restrained emphasis      |
| Brand soft  | `--brand-100`  | `#fff0cc` | Selected and supporting surfaces       |
| Canvas      | `--canvas`     | `#faf8f4` | Main application canvas                |
| Surface     | `--surface`    | `#ffffff` | Cards, forms, content panels           |
| Line        | `--line`       | `#efe7da` | Low-contrast dividers and outlines     |
| Text        | `--text`       | `#1e1b14` | Primary text                           |
| Muted       | `--muted`      | `#565044` | Secondary copy                         |
| Success     | `--success`    | `#1e7a47` | Confirmed states                       |
| Danger      | `--danger`     | `#c22c23` | Destructive and unavailable states     |

Accent color communicates action or status, never decoration. Warm neutrals are
used throughout; customer, staff, and administration must not introduce a cool
gray or unrelated accent family.

## 3. Typography

| Level   | Font                | Size                         | Usage                    |
| ------- | ------------------- | ---------------------------- | ------------------------ |
| Display | Bricolage Grotesque | `clamp(2.1rem, 5vw, 4.2rem)` | Page and category titles |
| H1      | Bricolage Grotesque | `2rem–2.6rem`                | Workspace titles         |
| H2/H3   | Bricolage Grotesque | `1.1rem–1.75rem`             | Sections and cards       |
| Body    | Plus Jakarta Sans   | `1rem`                       | Interface copy           |
| Caption | Plus Jakarta Sans   | `0.75rem`                    | Labels and metadata      |

Headings use tight tracking and body copy stays at or above 14px. Monetary
values use tabular figures where the platform supports them.

## 4. Spacing & Layout

The base unit is 4px. Use 8, 12, 16, 20, 24, 32, 48, and 64px for component
intent. Application shells use a saffron outer frame, a white or ivory inner
surface, 18–20px outer radii, and a single clear scroll owner. Guest menu cards
use responsive grids: two columns when space permits and one readable column
below 720px.

## 5. Components

### Saffron frame

- **Structure:** brand-colored stage around a neutral app surface.
- **States:** static; never used as a clickable decoration.
- **Accessibility:** it carries no semantic meaning by color alone.

### Primary action

- **Structure:** native `button` with a minimum 44px hit area.
- **States:** default saffron, darker/raised hover, pressed transform, visible
  brand-dark focus, disabled opacity.
- **Accessibility:** keyboard operable with an accessible label.

### Access indicator

- **Structure:** a 36px warm-tinted tile containing one centered 19px line
  icon, followed by a text summary and a compact state label.
- **States:** ready, waiting, and unavailable use the established semantic
  color tokens; the tile remains a non-interactive visual aid.
- **Layout:** the tile is a centering grid and the state label is an inline
  flex container. Text-only selectors must not override either display mode.
- **Accessibility:** the icon is decorative because the adjacent copy names
  the capability and its current state.

### Administration section navigation

- **Structure:** URL-backed links inside the administration shell; one link is
  current and one page owns the content scroll region.
- **States:** default, hover, keyboard focus, and current page. The current page
  uses the saffron selection surface and `aria-current="page"`.
- **Responsive layout:** a fixed vertical rail on wide screens and a visible,
  horizontally scrollable navigation reel below 760px. Navigation is never
  removed at tablet or mobile widths.
- **Accessibility:** native links support direct URLs, browser history, opening
  in a new tab, and keyboard navigation. Every target remains at least 44px.

### Dish card

- **Structure:** optional descriptive image, dish copy, price, availability,
  configured options, and ordering controls.
- **States:** available, unavailable, focused control, options expanded,
  disabled order action.
- **Layout:** responsive grid item; source images preserve aspect ratio with
  `object-fit: cover` and meaningful alternative text.

### Local demo launcher

- **Structure:** a saffron-framed, loopback-only entry page with a clear local-synthetic label, business and branch context, four role links, one run-scoped password reveal/copy control, customer table-menu links, and the golden scenario.
- **States:** ready, unavailable, and reset-by-restart guidance. The launcher never presents production credentials or claims public access.
- **Layout:** two-column operational overview on wide screens, one readable column below 820px, and role cards that remain keyboard reachable at narrow widths.
- **Accessibility:** native links and buttons, visible focus, live copy feedback, semantic headings/lists, and no status communicated by color alone.

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

## 6. Motion & Interaction

Use only `transform` and `opacity`. Controls use 160–200ms ease-out feedback.
Respect `prefers-reduced-motion`; no decorative autonomous motion is required.

## 7. Depth & Surface

Use a mixed strategy: low-contrast ivory borders establish routine hierarchy;
the saffron frame and a single warm shadow distinguish floating surfaces.
Cards are more restrained than dialogs and never use a generic gray shadow.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA: 4.5:1 body-text contrast, 3:1 control contrast, visible
keyboard focus, native controls, alt text for dish photography, and full
keyboard ordering flows. No accepted visual-accessibility debt is recorded.

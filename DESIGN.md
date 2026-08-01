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

### Dish card

- **Structure:** optional descriptive image, dish copy, price, availability,
  configured options, and ordering controls.
- **States:** available, unavailable, focused control, options expanded,
  disabled order action.
- **Layout:** responsive grid item; source images preserve aspect ratio with
  `object-fit: cover` and meaningful alternative text.

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

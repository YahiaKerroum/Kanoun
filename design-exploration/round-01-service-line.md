# Round 01 — The Service Line

> **Status:** art-direction probe only. This round intentionally pushed the
> restaurant metaphor to expose a recognizable visual language. It is not the
> implementation target. The simpler, buildable direction is documented in
> `round-02-practical-system.md`.

## Design objective

Keep the product simple enough to operate during a rush, while giving it one
recognizable interaction language that could only belong to a restaurant.

## Visual thesis

Translate the restaurant pass into a precise digital line: warm chalk surfaces,
black service typography, one ember-red signal, hard alignment, and almost no
decorative chrome. Orders, tables, stations, and handoffs attach to the same
line-and-notch grammar across every device.

This is not faux paper, a POS terminal theme, or a generic dashboard with a
restaurant palette.

## Content plan

1. **Guest menu and session**
   - Restaurant and table identity
   - One strong food image
   - Editorial menu rows
   - A persistent, compact order slip
   - The current order shown on the Service Line
2. **Live floor**
   - Spatial table map as the primary workspace
   - A narrow event rail for assistance, payment, and ready-food handoffs
   - Table-session detail opens without leaving the floor
3. **Kitchen pass**
   - Continuous station lanes separated by rules, not floating cards
   - Order items sit on timing rails
   - Changes, partial readiness, and lateness use shape, wording, and time
4. **Manager briefing**
   - Exceptions and causes before summary metrics
   - A service timeline that can be traced to orders
   - Reports and configuration open from the exact row that prompted action

## Interaction thesis

- An order mark travels along the Service Line from received to preparing, pass,
  table, and completion.
- New work enters from its origin: customer, kitchen station, table, or manager
  action. It never appears as an unrelated toast.
- Detail opens from the selected point as a sheet or inspector, preserving the
  user's spatial and scroll position.
- Reduced-motion mode replaces travel with an immediate state change and a short
  emphasis outline.

## Ownable UI grammar

- **Service Line:** a 3–4 px rule carrying state, time, and handoffs.
- **Time notch:** small perpendicular marks at meaningful elapsed-time intervals.
- **Order mark:** a circle with a clipped edge; its label is always visible.
- **Table disc:** circular only because the object is spatial; it includes the
  table number and a text state.
- **Exception flag:** a triangular cut into the line plus an explicit label.
- **Action edge:** a solid edge treatment for the one primary action in context.
- **Inspector sheet:** attached to the selected object, never a floating glass card.

## Base visual system

- Chalk: `#F2EFE7`
- Ink: `#151513`
- Ember: `#D44A32`
- Stainless gray: `#767A74`
- Quiet rule: `#CBC8BF`
- Kitchen surface: `#181A18`
- Kitchen text: `#F4F1E9`

Ember is reserved for an action, exception, or current handoff. Status is never
communicated through color alone.

Typography is deliberately plain and sturdy:

- A narrow grotesk for identifiers, elapsed time, and station headings.
- A highly legible sans for controls and operational copy.
- A restrained editorial face may be supplied by the restaurant only on the
  guest menu; it is not part of the staff shell.

## Composition rules

- No KPI-card mosaic.
- No glassmorphism, decorative gradients, pill soup, or large generic welcome hero.
- No more than one primary action per working state.
- Rules, spacing, type scale, and position create hierarchy before backgrounds or shadows.
- Staff surfaces use very small radii; table discs and status marks are the only
  recurring circular forms.
- Branch, table, order, and stale/pending context remain visible wherever a
  mistaken action would be costly.

## First visual set

All mockups use one dinner-service scenario so that the system can be judged as a
flow rather than as isolated pretty pages:

- Restaurant: **Nacre**
- Branch: **Central**
- Table: **12**
- Order: **184**
- Stations: **Grill**, **Cold**, **Drinks**
- Representative exceptions: modified dish, partial readiness, bill request,
  and a delayed item

Planned views:

1. Cross-device system board
2. Guest menu and order progress
3. Tablet live floor
4. Widescreen kitchen pass
5. Desktop manager service briefing

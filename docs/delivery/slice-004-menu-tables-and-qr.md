---
id: SLICE-004-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-28
---

# Slice 004 — Menu, Tables, and QR

## Change declaration

- `implements`: `US-D01`, `US-D02`, `US-D03`, `US-D04`, `US-E01`,
  `US-E02`, `US-E03`, `US-E04`, `US-F01`, `US-F02`; relevant `NFR-01`,
  `NFR-02`, `NFR-03`, `NFR-06`, `NFR-07`, `NFR-08`, `NFR-09`, `NFR-10`,
  `NFR-12`, `NFR-13`, `NFR-15`, `NFR-16`, `NFR-17`, `NFR-18`.
- `obeys`: `PD-001`, `PD-003`, `PD-006`, `PD-007`, `PD-008`, `PD-010`,
  `PD-011`, `PD-018`, `PD-020`, `PD-026`, `PD-030`, `PD-032`, `PD-033`;
  `ADR-0001`–`ADR-0006`; `CFG-003`, `CFG-004`, `CFG-006`; `PERM-009`–
  `PERM-015`; `BR-001`, `BR-002`, `BR-003`, `BR-006`, `BR-008`, `BR-009`,
  `BR-010`, `BR-013`, `BR-021`, `BR-024`.
- `changes`: restaurant-owned menu categories, dishes, structured option
  groups/options, fixed-precision prices, branch dish overrides, derived table
  state, table QR issue/rotation/revocation, scoped guest-session exchange and
  menu browse, transactional audit/outbox evidence, versioned PostgreSQL
  migration, REST contracts, customer web, capability-aware staff Menu/Tables
  workspaces, and administration Menu/Tables/QR workspaces.
- `tests`: money and menu-pricing domain rules; table-state precedence;
  guest idle/absolute expiry; runtime HTTP validation; authentication,
  authorization, tenant/restaurant/branch isolation, feature-disabled
  behavior, expected-version conflicts, duplicate table conflicts, atomic
  audit/outbox rollback, QR rotation, concurrent table behavior,
  revoked/unknown QR equivalence, responsive
  customer/staff/administration browser flows,
  keyboard operation, 200% zoom-equivalent customer use, minimum target size,
  and automated WCAG A/AA scanning.
- `docs`: QR lifecycle workflow, HTTP contracts, traceability, progress,
  implementation declaration, documentation index, and dated handoff.

The menu, tables, and ordering stores retain write ownership within their
modules. `MenuTablesService` coordinates only their public contracts and the
Audit contract through one local `ServiceWorkflow` transaction where atomic
evidence is required.

## Delivered behavior

- Authorized administration users can create and maintain restaurant menu
  categories, dishes, option groups/options, branch price/availability/
  visibility overrides, physical tables, and branch/table QR codes.
- Menu structural changes require `menu.manage`; price changes require
  `menu.manage_prices`; availability changes require
  `menu.manage_availability`. Table and QR actions require their exact
  catalogue permissions and authenticated branch scope.
- `CFG-003`, `CFG-004`, and `CFG-006` block new work according to their
  authoritative disable policies while staff history/recovery reads remain
  available. Public feature-disabled and unavailable resources fail with the
  same non-sensitive problem shape.
- QR rotation revokes the prior active code in the issuance transaction. Raw
  QR and guest-session tokens are returned only to their intended client and
  stored only as keyed hashes.
- A table-specific QR creates a branch/table-scoped guest session; a branch QR
  creates a browse-only session. Scanning does not occupy a table.
- The customer confirms the detected table before browsing. The menu applies
  the active branch override, displays structured choices and explicit
  availability, and truthfully states that ordering is not yet available.
- Staff Menu and Tables workspaces fetch only when the exact view permission
  and effective feature are present. They show real menu data and server-
  derived table state without fabricating occupancy or downstream work.
- Administration produces downloadable PNG QR images from the issued standard
  customer URL, supports safe print/copy behavior, and records explicit
  revocation reasons.

## Truthful delivery boundaries

- `US-D04` remains in the approved Slice 004 delivery row, but its acceptance
  criteria require an order-item note producer and staff order consumer. Slice
  004 exposes no fabricated note field. Slice 005 adds the customer disclaimer,
  note persistence, and queued Kitchen handoff. Configurable note policy and
  later employee note presentation remain incomplete and are not claimed.
- Category/dish deactivation and price changes preserve the mutable menu
  record. Historical-order preservation (`AC-US-D01-03`,
  `AC-US-D02-04`, and `US-D05`) is verified when Slice 005 persists immutable
  order-item snapshots.
- The optional customer name is local to the browser in Slice 004 and is not
  submitted to the server. Slice 005 adds optional operational order storage;
  required-versus-optional customer-name configuration remains incomplete.
- The `ordering` module is started narrowly with `customer_sessions` only.
  Carts, orders, order items, item snapshots, cancellation, bills, and order
  submission are absent.
- `table_sessions` exists only so table reads can derive truthful state. Slice
  004 does not open, close, move, claim, join, or assign table sessions and
  does not create `table_session_movements`.
- `validate_menu_version` is available for Slice 005 order submission but has
  no Slice 004 caller.
- `US-F05` is owned by Slice 005. `US-F04` is owned by Slice 007 in the
  approved `docs/delivery/mvp-slices.yaml`; older Slice 005 prose is not used.
- Slice 004 follows the MVP table-change policy by accepting table identity
  only from a fresh table-specific QR exchange. It exposes no manual
  customer table selection or table-session move path.
- Guest endpoints in this slice exchange an unauthenticated, abuse-limited QR
  token and then perform cookie-authenticated reads. Guest CSRF/idempotency
  controls must be added with the state-changing order commands in Slice 005.

## Verification evidence

Focused and real-browser evidence obtained before the final repository suite:

- Focused PostgreSQL `MenuTablesService` integration suite: 26 tests passed.
- Focused menu, table/QR, and public HTTP router suites: 26 tests passed.
- Root ESLint, strict TypeScript, OpenAPI/event contract validation, customer
  production build, and the complete 13-test Chromium browser/WCAG suite
  passed.
- A headed, real API-backed browser journey created a category, dish,
  structured option, branch override, table, and QR through administration;
  confirmed table `T-12`; browsed the resolved `DZD 1,750` menu and option;
  revoked the QR; and observed identical public `404 resource_not_found`
  bodies for revoked and never-issued tokens apart from correlation IDs.
- Customer axe coverage initially found serious contrast failures. Muted text
  colors, unavailable-dish treatment, and opacity fades were corrected; axe
  then passed confirmation, menu, unavailable-dish, and error states.

Final verification used Node.js `24.18.0`, pnpm `11.17.0`, and an isolated
PostgreSQL 18 database created empty at
`postgresql://rms@127.0.0.1:55433/rms_final`:

- All four migration entries applied from empty. The resulting owned table
  counts were `platform` 3, `audit` 1, `identity` 8, `restaurant` 8, `menu` 6,
  `tables` 3, and `ordering` 1.
- `corepack pnpm format` and `corepack pnpm format:check`: passed. Narrow
  Prettier exclusions protect workspace-local history, SDD, and database
  artifacts from the root formatter.
- `corepack pnpm lint` and `corepack pnpm typecheck`: passed.
- PostgreSQL-enabled `corepack pnpm test`: 147 tests passed across 17 files
  with no skips.
- `corepack pnpm test:architecture`: no dependency violations across 114
  modules and 181 dependencies; all 3 architecture tests passed.
- `corepack pnpm contracts:lint`: OpenAPI passed without warnings and all 40
  integration-event contracts validated.
- `corepack pnpm build`: every package and application production build
  passed.
- `corepack pnpm test:browser`: all 13 Chromium tests passed, including
  customer, staff, and administration WCAG A/AA coverage.
- `corepack pnpm audit --prod --audit-level high`: no known vulnerabilities.

Publication evidence is recorded in the active engineering handoff after
`main` integration and GitHub Actions complete.

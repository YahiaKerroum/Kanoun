---
id: HANDOFF-2026-07-27-SLICE-004-CHECKPOINT
status: slice-004-in-progress
owner: engineering
last_reviewed: 2026-07-27
supersedes_active_handoff: docs/delivery/handoff-2026-07-27.md
---

# Engineering Handoff — SLICE-004 mid-slice checkpoint (2026-07-27)

## Current state

`SLICE-004 — menu_tables_and_qr` is **in progress, uncommitted, and not published**.
Nothing in this checkpoint has been committed to git — every change described
below is a working-tree change on top of the verified Slice 003 commit
`60fd9052809b5f3665f8397db03b3d4d78a9394e`. This document supersedes
`docs/delivery/handoff-2026-07-27.md` as the active handoff; that file is
retained for its historical Slice 003 publication evidence and must not be
overwritten.

Do not assume any Slice 004 work is finished beyond what is explicitly listed
as done below. In particular: no tests have been written for the new backend
code, no frontend work has started, and no full verification suite has been
run.

## Plan file

The full approved implementation plan is saved at
`C:\Users\HP\.claude\plans\gleaming-rolling-kite.md`. Read it in full before
continuing — it records the architecture decisions (narrow `ordering` module
now, `US-F04` deferred to Slice 005, Money value object design, QR lifecycle
modeling, no new event type for QR actions, `GUEST_ACCESS_SECRET` secret, no
CSRF on guest endpoints yet) and the intended file-by-file design for
everything not yet built.

## Done and verified in this checkpoint

- **Migration** `migrations/0003_menu_tables_and_qr.sql` (+ matching
  `migrations/meta/_journal.json` entry) — creates `menu`, `tables`, and
  `ordering` schemas: `menu.menus/categories/dishes/option_groups/options/branch_dish_overrides`,
  `tables.tables/table_qr_codes/table_sessions`, `ordering.customer_sessions`.
  **Not yet applied to any database** — no local Postgres cluster has been
  started for this slice. `table_session_movements` is deliberately not
  created (deferred to Slice 005, see plan).
- **Money value object**: `packages/building-blocks/src/types/money.ts`
  (fixed-precision decimal arithmetic via integer minor units), exported from
  `packages/building-blocks/src/index.ts`.
- **`menu` module** fully built: `packages/modules/src/menu/{domain,contracts,infrastructure,http,index.ts}`.
  Staff CRUD router (`createMenuRouter`) for categories/dishes/option-groups/options/branch-overrides,
  plus `createPublicMenuRouter` (`getGuestMenu`). Pricing validation
  (`isPricingConfigurationValid`/`worstCaseDishPrice`) satisfies `AC-D03-06`.
- **`tables` module** fully built: same shape, `createTablesRouter` (staff
  CRUD + QR issue/rotate/revoke/list) and `createPublicTablesRouter`
  (`exchangeTableQr`).
- **`ordering` module** started narrowly (per plan decision): only
  `customer_sessions` — `domain/models.ts`, `domain/session-policy.ts`
  (idle 4h / absolute 12h expiry per `PD-010`), `contracts/ordering-store.ts`,
  `infrastructure/postgres-ordering-store.ts`,
  `http/guest-session-middleware.ts` (`rms_guest_session` cookie, mirrors
  `identity-access`'s staff session middleware). No `orders`/`order_items`
  code exists — that is entirely Slice 005's job.
- **`packages/modules/src/shared/application-error.ts`**: `ApplicationErrorCode`
  extended with `menu_changed`, `dish_unavailable`, `table_unavailable`
  (already present in the OpenAPI `Problem.code` enum since Slice 001, never
  wired to a TS type until now).
- **`packages/modules/src/index.ts`**: now re-exports `ordering`, `menu`,
  `tables` (was previously only forward-declared in `moduleNames`).
- **`packages/service-workflow/src/menu-tables-service.ts`**: `MenuTablesService`
  composes `MenuStore`/`TablesStore`/`OrderingStore`/`RestaurantConfigurationStore`
  behind one class implementing every staff, public, and guest-session-auth
  use case, mirroring `TenantOwnerService`'s transaction/permission/audit
  pattern. Exported from `packages/service-workflow/src/index.ts`.
- **Composition wiring**: `apps/api/src/composition-root.ts` (stores, service,
  all four new routers pushed into `apiRouters`), `apps/api/src/app.ts` (new
  optional `guestSessionMiddleware` dependency, mounted the same
  non-blocking way as `staffSessionMiddleware`), `apps/api/src/config.ts` +
  `apps/api/src/config.test.ts` + `.env.example` (new `GUEST_ACCESS_SECRET`
  and `CUSTOMER_WEB_ORIGIN`).
- **OpenAPI contract** (`docs/contracts/openapi.yaml`): new `Menu`/`Tables`
  tags; new parameters (`CategoryId`, `DishId`, `OptionGroupId`, `TableId`,
  `QrCodeId`); full staff CRUD path set for categories/dishes/option-groups/options/branch-overrides/tables/QR
  issuance-rotation-revocation-listing; new schemas (`Category`, `AdminDish`,
  `AdminOptionGroup`, `BranchDishOverride`, `AdminTable`, `TableQrCode`,
  `IssuedQrCode`, and their create/update input schemas). Fixed a real
  pre-existing contract gap: `GuestSession.tableId` was `required`/non-nullable,
  contradicting `AC-US-E01-02` (browse-only branch QR has no table) — now
  nullable, plus added `tableCode` for `AC-US-F02-01` on-screen verification.
- **`docs/domain/workflows.yaml`**: added a `table_qr_code` state machine
  block (`active → revoked`, trigger `revoke_qr_code`) for documentation
  consistency with every other lifecycle in that file.

### Verification run so far (all passing)

- `corepack pnpm typecheck` — clean.
- `corepack pnpm lint` — clean.
- `corepack pnpm format` — applied (Prettier auto-formatted several new
  files; no semantic changes).
- `corepack pnpm test:architecture` — clean, 108 modules / 167 dependencies
  cruised, no violations, 3 architecture tests passed.
- `corepack pnpm contracts:lint` — clean, zero warnings, 40 event contracts
  validated (fixed four `operation-4xx-response` warnings by adding `404`
  responses to the new list endpoints).

**Not yet run this checkpoint**: `pnpm test` (no new tests exist yet to run),
`pnpm build`, `pnpm test:browser`, `pnpm audit`. No migration has been applied
to any database — the store implementations are untested against real
Postgres.

## Explicitly not started yet

- `docs/quality/traceability.yaml` — the `menu` and `guest_qr_and_tables`
  groupings still have **no `operations:` list populated** (this was the very
  next edit in progress when this checkpoint was written — the file was open
  and read, but the edit was not yet applied). Needs: populate `operations:`
  for both groupings with the new operationIds above, and add
  `cross_slice_acceptance` notes (matching the style already used under
  `tenant_and_configuration`/`identity_and_access`) disclosing that `US-D05`
  (order-item snapshot), `US-F04` (assign a table as an employee), and
  `US-F05` (multiple orders per table) are **not** delivered by Slice 004
  despite appearing in that grouping's `implements`/thematic list — they
  require Slice 005's `ordering` module.
- **No backend tests exist yet** for any new code: `packages/modules/src/menu/**/*.test.ts`,
  `packages/modules/src/tables/**/*.test.ts`, `packages/modules/src/ordering/**/*.test.ts`,
  `apps/api/src/menu-routes.test.ts`, `apps/api/src/tables-routes.test.ts`,
  `apps/api/src/public-routes.test.ts`, plus integration tests against real
  Postgres for tenant-scoping/constraint/QR-rotation/derived-state behavior.
- **`apps/web/customer`** is still the Slice-001 placeholder
  (`CustomerFoundation` in `main.tsx`) — the QR landing / table verification /
  guest menu browse UI has not been started.
- **`apps/web/staff/src/App.tsx`** — `Menu` and `Tables` nav destinations
  already exist (forward-declared in Slice 003, gated correctly by
  capability), but still render the generic `DeferredWorkspace` placeholder.
  Real `TablesWorkspace`/`MenuWorkspace` components have not been written.
- **`apps/web/admin/src/App.tsx`** — no Menu/Tables administration sections
  have been added yet (categories/dishes/options CRUD, branch overrides,
  table/QR management).
- **Browser/e2e tests** (`apps/web/staff/e2e/`, new customer-flow spec,
  WCAG scans) — not started.
- **`docs/delivery/slice-004-menu-tables-and-qr.md`** declaration doc — not
  written. **`docs/delivery/implementation-progress.md`** and
  **`docs/index.md`** — not updated.
- **Full verification suite** (isolated local Postgres cluster, `pnpm check`,
  `pnpm test:browser`, `pnpm audit --prod --audit-level high`) — not run.
  **No commit has been made.**

## Continuation prompt

```text
Continue SLICE-004 — menu_tables_and_qr in C:\Users\HP\Desktop\mvp.

Read AGENTS.md, docs/index.md, and
docs/delivery/handoff-2026-07-27-slice-004-checkpoint.md in full, then read
the approved plan at C:\Users\HP\.claude\plans\gleaming-rolling-kite.md in
full. Run `git status` and review the working-tree diff before changing
anything — everything described as "done" in the checkpoint doc is an
uncommitted working-tree change on top of verified commit
60fd9052809b5f3665f8397db03b3d4d78a9394e; nothing has been committed yet.

The backend (menu, tables, and a narrow ordering module; migration
0003_menu_tables_and_qr.sql; MenuTablesService composition; composition-root/
app/config wiring; full OpenAPI contract authoring; a table_qr_code state
machine entry in workflows.yaml) is written and passes typecheck, lint,
architecture tests, and contracts:lint. It has NOT been tested against a real
database and has NO test coverage yet.

Continue in this order:
1. Finish docs/quality/traceability.yaml: populate the `operations:` lists for
   the `menu` and `guest_qr_and_tables` groupings with the new operationIds
   from docs/contracts/openapi.yaml, and add cross_slice_acceptance notes
   disclosing that US-D05, US-F04, and US-F05 are not delivered by Slice 004
   (they need Slice 005's ordering module) — mirror the existing style under
   `tenant_and_configuration`/`identity_and_access` in that file.
2. Write backend unit and integration tests for the menu, tables, and
   ordering modules and their API routes, following the existing conventions
   in apps/api/src/restaurant-configuration-routes.test.ts and
   packages/service-workflow/src/tenant-owner-service.integration.test.ts.
   Start a local isolated Postgres cluster under .tmp/ (same approach as the
   Slice 003 verification evidence), apply migrations from empty, and run
   TEST_DATABASE_URL=... corepack pnpm test.
3. Build the customer web app's QR landing → table verification → guest menu
   browse flow (apps/web/customer), replacing the Slice 001 placeholder.
4. Replace DeferredWorkspace with real TablesWorkspace/MenuWorkspace
   components for exactly the "Tables" and "Menu" staff-shell nav sections in
   apps/web/staff/src/App.tsx (every other section stays deferred).
5. Add Menu and Tables administration sections to apps/web/admin/src/App.tsx
   (categories/dishes/options CRUD, branch overrides, table/QR management),
   matching the existing Employees/Permissions/Features section conventions.
6. Add Playwright browser/e2e coverage for the new flows, including
   accessibility scans, matching the Slice 003 pattern.
7. Write docs/delivery/slice-004-menu-tables-and-qr.md (mirror the Slice 003
   declaration template: change declaration, truthful delivery boundaries,
   verification evidence), and update docs/delivery/implementation-progress.md
   and docs/index.md.
8. Run the full verification suite (format, lint, typecheck, test,
   test:architecture, contracts:lint, build, test:browser, audit) against a
   fresh isolated local Postgres cluster, manually exercise the golden path in
   a browser, then stop the database server and clean up the cluster
   directory exactly as Slice 003's evidence describes.

Do not implement order submission, order snapshots, table-session
open/close/move, or US-F04 (table assignment) — those remain Slice 005's
scope per the approved plan's truthful-boundary decisions.
```

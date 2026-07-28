---
id: HANDOFF-2026-07-28-SLICE-004-CHECKPOINT
status: slice-004-locally-verified-publication-pending
owner: engineering
last_reviewed: 2026-07-28
supersedes_active_handoff: docs/delivery/handoff-2026-07-27-slice-004-checkpoint.md
---

# Engineering Handoff — SLICE-004 continuation checkpoint (2026-07-28)

## Current state — local verification complete

Slice 004 implementation and local verification are complete. The branch has
not yet been integrated into `main` or pushed, and GitHub Actions publication
evidence is therefore pending.

- Branch: `slice-004-menu-tables-and-qr`
- Implementation HEAD before the final documentation/verification commit:
  `66abd0831ef7ed29d9adc3b2c31a8570b7ae6ca4`
- `main` and `origin/main` before integration:
  `6573696b7c0269cbf15802d4483adc5e409af546`
- The final documentation/verification increment includes the Slice 004
  declaration, implementation progress, traceability, index, active handoff,
  narrow Prettier workspace-artifact exclusions, and formatting of the
  previously identified tables router test.

Final verification used Node.js `24.18.0`, pnpm `11.17.0`, and the fresh
PostgreSQL database
`postgresql://rms@127.0.0.1:55433/rms_final`:

- all four migration entries applied from empty;
- root formatting and format check passed;
- root lint and strict TypeScript passed;
- PostgreSQL-enabled Vitest passed 147 tests across 17 files;
- dependency-cruiser found no violations across 114 modules and 181
  dependencies, and all 3 architecture tests passed;
- OpenAPI passed without warnings and all 40 event contracts validated;
- every production build passed;
- all 13 Chromium browser/WCAG tests passed;
- the production dependency audit found no known vulnerabilities.

Focused suites and the real API-backed administration-to-customer QR lifecycle
recorded below remain valid; no focused or golden-path rerun was needed after
documentation and formatting-only changes.

Remaining publication work:

1. Review and commit the final documentation/verification increment.
2. Resolve and verify both workspace-local database targets, stop both
   clusters, and remove only their explicitly named data directories/logs.
3. Integrate the Slice 004 branch safely into `main`, push `main`, and wait for
   GitHub Actions.
4. Record the exact published commit and successful Actions run in this
   handoff.

## Current stop point — third compaction

Context compacted again after the real API-backed golden path, browser/WCAG
coverage, and two coherent commits were completed, and immediately after a
fresh final-verification PostgreSQL cluster was initialized. Per the user
agreement, implementation stopped immediately. No migrations, final suite,
documentation completion, integration, push, or CI work was performed after
the compaction boundary.

- Branch: `slice-004-menu-tables-and-qr`
- Implementation HEAD:
  `66abd0831ef7ed29d9adc3b2c31a8570b7ae6ca4`
- Latest commit: `66abd08 test: cover customer QR menu accessibility`
- `main` and `origin/main`:
  `6573696b7c0269cbf15802d4483adc5e409af546`
- New commits since the prior checkpoint:
  - `057e1d0` — `fix: enforce menu table feature boundaries`
  - `66abd08` — `test: cover customer QR menu accessibility`
- Intentional actionable worktree state:
  - modified `docs/index.md`
  - modified `docs/delivery/implementation-progress.md`
  - modified `docs/quality/traceability.yaml`
  - untracked `docs/delivery/slice-004-menu-tables-and-qr.md`
  - untracked
    `docs/delivery/handoff-2026-07-28-slice-004-checkpoint.md`
- Protected untracked state contains two `.cc-history/` files and 2,706
  `.tmp/` database/log files. Preserve `.cc-history/` and `.tmp/`; never
  stage or remove either directory broadly.

Completed since the prior checkpoint:

- Added and passed same-tenant, cross-restaurant branch/dish override
  integration coverage for read and write `404` behavior with no persistence.
- The focused PostgreSQL `MenuTablesService` suite passed all 26 tests.
- The focused menu, table, and public HTTP router suites passed all 26 tests.
- OpenAPI/event contract lint, root lint, and root typecheck passed before
  commit `057e1d0`.
- Exercised the real administration-to-customer path against the live API:
  created menu/category/dish/options, branch pricing, table, and QR data;
  confirmed table `T-12`; browsed the real menu; revoked the QR; and verified
  revoked and unknown tokens have the same public `404` problem shape apart
  from their correlation IDs.
- Added customer Playwright/WCAG coverage, fixed real contrast and unavailable
  dish presentation failures, and passed the focused customer suite (3 tests)
  and the full browser suite (13 tests).
- Root lint, root typecheck, and the customer production build passed after
  the accessibility work.
- Began the Slice 004 declaration and corrected traceability overclaims.
  These documentation edits are intentionally uncommitted and are not final.
- Browser and development web/API processes were stopped. Generated
  `.playwright-cli` artifacts were removed after their exact workspace-local
  paths were verified.

Database state at this stop:

- Development database
  `postgresql://rms@127.0.0.1:55432/rms_test` is accepting connections from
  `.tmp/postgres-slice004`; its log is `.tmp/postgres-slice004.log`.
- Fresh final-verification database
  `postgresql://rms@127.0.0.1:55433/rms_final` exists and is accepting
  connections from `.tmp/postgres-slice004-final`; its log is
  `.tmp/postgres-slice004-final.log`.
- The fresh database was only initialized and created. Slice migrations and
  the final verification suite have not been run against it.

Remaining work:

1. Review and finish the uncommitted declaration, traceability, index, active
   handoff, and implementation-progress documentation without overstating
   Slice 004 scope.
2. Apply migrations to the fresh `rms_final` database and run the complete
   final suite with Node.js `24.18.0` and pnpm `11.17.0`: formatting and
   format check, lint, typecheck, PostgreSQL tests, architecture tests,
   contract lint, builds, browser tests, and production dependency audit.
3. Fix only failures attributable to Slice 004, rerun affected checks, and
   make the final documentation/verification commit coherently.
4. Resolve and verify each workspace-local database target before stopping
   clusters and cleaning only the explicitly named database paths. Never
   remove `.tmp/` or `.cc-history/` broadly.
5. Integrate safely into `main`, push `main`, and wait for the resulting
   GitHub Actions run to complete successfully.

Do not restart Slice 004 or redo completed work.

## Prior stop point — second compaction

Context compacted after the staff and administration work was committed and
while the remaining application-boundary Definition-of-Done work was being
completed. Per the user agreement, implementation stopped immediately and
this handoff was refreshed before any further work.

- Branch: `slice-004-menu-tables-and-qr`
- Implementation HEAD:
  `42608433dce0c967771491cc3fc896c239400e53`
- `main` and `origin/main`:
  `6573696b7c0269cbf15802d4483adc5e409af546`
- The working tree contains intentional, uncommitted audit/feature-enforcement
  work described below.
- `docs/index.md` and this checkpoint are intentionally uncommitted.
- `.cc-history/` and `.tmp/` are user/session and live database artifacts.
  Preserve them, never stage them, and never remove either directory broadly.

Do not restart Slice 004 or redo completed work.

## Required reading and runtime

Before changing behavior, read in full:

1. `AGENTS.md`
2. `docs/index.md`
3. This handoff
4. `C:\Users\HP\.claude\plans\gleaming-rolling-kite.md`
5. `.superpowers/sdd/gleaming-rolling-kite-tasks/progress.md`
6. The relevant normative sources in the order required by `AGENTS.md`

Then run `git status --short --untracked-files=all`, inspect recent commits,
and review all tracked and untracked state. Ordinary `git diff` does not show
untracked files.

Use Node.js `24.18.0` and pnpm `11.17.0`:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack enable
```

## Completed commits

- `8c61b4e` — backend checkpoint
- `9fb3245` — traceability operations
- `8f344d4` — domain unit tests
- `c450596` — staff menu HTTP tests
- `0ea85eb` — staff tables/QR HTTP tests
- `e5aebc6` — public guest HTTP tests
- `cacf37d` — PostgreSQL MenuTablesService integration tests
- `1024ede` — transaction, table-conflict, and stale-time hardening
- `b073182` — customer QR verification and menu-browse journey
- `b30bf19` — capability-aware staff Menu and Tables workspaces
- `4260843` — administration Menu, Tables, and QR workspaces

### Staff work committed at `b30bf19`

- Replaced only the Menu and Tables deferred workspaces.
- Uses real category, dish, and table endpoints with runtime Zod validation.
- Applies exact `menu.view` and `tables.view` capability gates and does not
  fetch protected lists without the corresponding permission.
- Derives the active restaurant cautiously from scoped session grants.
- Covers loading, empty, error, reload, stale-snapshot, and access-denied
  states.
- Shows only real derived table states and does not fabricate occupancy or
  downstream order/session behavior.
- Fixed the responsive bottom navigation after visual inspection.
- Seven staff Playwright tests, automated WCAG checks, lint, typecheck, and
  the staff production build passed.

### Administration work committed at `4260843`

- Added read contracts and adapters for dish option groups and current branch
  dish overrides.
- Added category creation/editing/order/status, dish creation/editing,
  structured option-group/options management, branch price/availability/
  visibility overrides, table creation/editing/status/out-of-service, and QR
  list/issue/rotate/revoke.
- Added real QR PNG generation from the issued HTTPS URL plus Download PNG,
  safe print-popup behavior, and Copy URL.
- Added permission-aware and feature-state-aware administration UI.
- Separated dish-update authorization:
  - structure requires `menu.manage`;
  - base price requires `menu.manage_prices`;
  - availability requires `menu.manage_availability`.
- Corrected the QR timestamp field names in OpenAPI.
- Added `qrcode` `1.5.4` and `@types/qrcode` `1.5.6`.
- Nine menu router tests, twenty PostgreSQL MenuTablesService integration
  tests, three administration browser/WCAG tests, lint, typecheck,
  contracts lint, and the administration production build passed.
- Staff table, administration QR, and administration menu screenshots were
  visually inspected; temporary screenshot hooks/files were removed.

## Current uncommitted implementation

Review these diffs before editing:

- `packages/service-workflow/src/menu-tables-service.ts`
  - enforces `CFG-003` for menu mutations and customer menu access;
  - enforces `CFG-004` for new QR issuance/exchange;
  - enforces `CFG-006` for table mutations and table-specific QR issuance/
    exchange;
  - keeps staff reads and QR list/revoke available for recovery/history;
  - returns actionable staff `409 invalid_state_transition` errors;
  - returns the same public `404 resource_not_found` shape for feature-disabled
    QR exchange/menu access as for an unavailable resource;
  - adds atomic audit events for category, dish, option-group/options, branch
    override, and table mutations, including before/after evidence;
  - verifies a branch override's branch belongs to the dish's restaurant;
  - verifies guest branch and restaurant scope agree.
- `packages/service-workflow/src/menu-tables-service.integration.test.ts`
  - adds direct helpers to persist disabled restaurant/branch feature states;
  - proves all ten non-QR menu/table mutation audit actions;
  - proves an audit-write failure rolls back category persistence;
  - proves disabled `CFG-003`, `CFG-004`, and `CFG-006` behavior.
- `docs/contracts/openapi.yaml`
  - adds the newly possible `409` responses for feature-disabled staff
    mutations;
  - adds public menu `404`;
  - this latest OpenAPI edit has not yet been contract-linted.
- `docs/index.md`
  - points to this active checkpoint and retains the prior checkpoint as
    historical.

Current tracked diff size at stop:

```text
docs/contracts/openapi.yaml                        |   7 +
docs/index.md                                      |   5 +-
packages/service-workflow/src/menu-tables-service.integration.test.ts | 374 +
packages/service-workflow/src/menu-tables-service.ts                  | 556 +-
```

The service diff is large because mutation flows were converted to async
transactions that write audit evidence before commit.

## Verification of current uncommitted work

Run with Node.js `24.18.0`:

- Root `corepack pnpm typecheck`: passed.
- First PostgreSQL integration run: 24 passed, 1 failed because a newly
  created branch override had no persisted pre-image.
- The implementation was corrected to audit a version-zero pre-image for a
  new override.
- Rerun:
  `corepack pnpm exec vitest run packages/service-workflow/src/menu-tables-service.integration.test.ts`
  with `TEST_DATABASE_URL=postgresql://rms@127.0.0.1:55432/rms_test`:
  25 tests passed.

The latest OpenAPI response additions and the full repository suite have not
yet been rerun. Do not treat the current uncommitted work as committed or
fully verified.

## PostgreSQL state

PostgreSQL 18 is accepting connections at:

```text
postgresql://rms@127.0.0.1:55432/rms_test
```

- Port: `55432`
- Data directory: `.tmp/postgres-slice004`
- Log: `.tmp/postgres-slice004.log`
- Migrations were applied from empty earlier in this slice.

Keep this cluster for development. Final evidence must use a separate fresh,
isolated database.

At final cleanup, first resolve and verify the targets are workspace-local,
then stop the cluster with:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" `
  -D ".tmp/postgres-slice004" -m fast -w stop
```

Remove only the verified paths:

- `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice004`
- `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice004.log`

Never remove `.tmp` or `.cc-history` broadly.

## Immediate next work

1. Review the full uncommitted diff for authorization, scope, feature-policy,
   and transaction correctness.
2. Add or confirm focused coverage for the new same-restaurant branch
   override guard.
3. Run formatting on only the changed source files, root lint, root
   typecheck, focused router/service tests, and contracts lint.
4. Commit the audit/feature-enforcement increment coherently.
5. Exercise the real API-backed golden path in a browser:
   administer menu/table/QR data, open the issued customer URL, confirm the
   table, browse the real menu, revoke the QR, and prove revoked and unknown
   tokens expose the same public `404`.
6. Complete formal Playwright/WCAG coverage if the real golden path reveals
   missing cases.
7. Update the Slice 004 declaration, traceability, progress, index, and final
   dated handoff atomically.
8. Review the whole branch and run final verification against a fresh
   database:
   - migrations from empty;
   - `corepack pnpm format`;
   - `corepack pnpm format:check`;
   - `corepack pnpm lint`;
   - `corepack pnpm typecheck`;
   - `corepack pnpm test` with `TEST_DATABASE_URL`;
   - `corepack pnpm test:architecture`;
   - `corepack pnpm contracts:lint`;
   - `corepack pnpm build`;
   - `corepack pnpm test:browser`;
   - `corepack pnpm audit --prod --audit-level high`.
9. Clean only explicitly verified database targets, integrate safely into
   `main` without destructive history rewriting, push `main`, and confirm the
   resulting GitHub Actions run succeeds.

An earlier `format:check` investigation encountered non-product files under
`.cc-history/`/`.superpowers/` and a tracked tables route test that Prettier
would change. Reassess the exact current output before deciding whether a
targeted format or ignore-file correction is appropriate. Do not modify or
stage `.cc-history/`.

## Scope boundaries

Do not implement or imply:

- carts or order submission;
- orders, order items, or menu snapshots;
- table-session open, close, move, claim, or join behavior;
- employee table assignment;
- downstream automatic actions that do not exist;
- occupied tables through fabricated database rows.

Keep the `ordering` module narrow: customer sessions only.

The approved `docs/delivery/mvp-slices.yaml` assigns US-F04 to Slice 007,
while older plan/traceability prose says Slice 005. Keep US-F04 out of Slice
004 and correct/report that documentation mismatch through the authoritative
process; do not silently choose a source.

## Current standalone continuation prompt

```text
Continue SLICE-004 — menu_tables_and_qr in C:\Users\HP\Desktop\mvp.
Do not restart the slice or redo completed work.

First read in full:
1. AGENTS.md
2. docs/index.md
3. docs/delivery/handoff-2026-07-28-slice-004-checkpoint.md
4. C:\Users\HP\.claude\plans\gleaming-rolling-kite.md
5. .superpowers/sdd/gleaming-rolling-kite-tasks/progress.md
6. all relevant normative sources in the AGENTS.md reading order

Then run `git status --short --untracked-files=all`, inspect recent history,
and review the complete working tree before editing. Preserve .cc-history/
and .tmp/ and never stage or remove them broadly.

Current state:
- branch: slice-004-menu-tables-and-qr
- HEAD before the final documentation/verification commit:
  66abd0831ef7ed29d9adc3b2c31a8570b7ae6ca4
- main and origin/main:
  6573696b7c0269cbf15802d4483adc5e409af546
- Slice 004 implementation and local verification are complete
- actionable tracked paths are .prettierignore,
  apps/api/src/tables-routes.test.ts, docs/index.md,
  docs/delivery/implementation-progress.md, and
  docs/quality/traceability.yaml
- actionable untracked paths are
  docs/delivery/slice-004-menu-tables-and-qr.md and this checkpoint
- PostgreSQL development database:
  postgresql://rms@127.0.0.1:55432/rms_test
- final-verification database:
  postgresql://rms@127.0.0.1:55433/rms_final
  All four migrations and the final suite passed against it.

Use Node.js 24.18.0 and pnpm 11.17.0 via fnm/corepack.

Do not repeat completed suites unless a later implementation change requires
it. Final evidence:
- focused PostgreSQL MenuTablesService: 26/26
- focused menu/table/public HTTP routers: 26/26
- fresh-database PostgreSQL repository tests: 147/147 across 17 files
- architecture: no violations across 114 modules / 181 dependencies; 3/3
- OpenAPI and 40 event contracts passed
- all production builds passed
- full browser suite: 13/13
- format, format:check, root lint, and typecheck passed
- production dependency audit found no known vulnerabilities
- real API-backed administration-to-customer QR lifecycle passed, including
  equivalent revoked/unknown public 404 problem shapes

Review the final diff and commit the documentation/verification increment
coherently. Then resolve and verify the exact workspace-local database paths,
stop both clusters, and remove only the named data directories/logs. Integrate
safely into main, push main, wait for GitHub Actions, and record exact
publication evidence in this handoff.

If context compacts again, stop implementation immediately. Update the
progress ledger and current handoff with exact HEAD, worktree, database state,
verification, remaining work, and a standalone continuation prompt, then end
the chat without continuing implementation.
```

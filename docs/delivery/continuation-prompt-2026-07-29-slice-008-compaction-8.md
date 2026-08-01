# Slice 008 continuation after eighth context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

Working context compacted an eighth time during the complete draft review,
after the authoritative context had been reconstructed from source. Work
stopped immediately under the mandatory checkpoint rule. Resume only after
reconstructing context from the repository. Do not infer correctness or final
verification from this prompt's summary.

Do not repeat Slice 007 publication/integration. Do not recreate the Slice 008
branch. Do not open a pull request or integrate Slice 008 into `main`. Do not
begin another slice.

## Required reading and initial inspection

Read in full and in this order:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
4. `docs/delivery/implementation-progress.md`
5. `docs/delivery/mvp-slices.yaml`
6. `docs/delivery/slice-008-notifications-reporting-and-audit.md`
7. `docs/delivery/continuation-prompt-2026-07-29-slice-008.md`
8. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-1.md`
9. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-2.md`
10. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-3.md`
11. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-4.md`
12. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-5.md`
13. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-6.md`
14. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-7.md`
15. this continuation prompt

The original Slice 008 execution prompt remains authoritative for scope,
quality, verification, publication boundaries, and exclusions. Its Slice 007
publication and Slice 008 branch-creation steps are complete and must not be
re-executed.

Before changing repository state, activate the pinned toolchain:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
```

Require `node --version` to be exactly `v24.18.0`.

Then use read-only checks to inspect:

- current branch, `HEAD`, local `main`, and `origin/main`;
- all branches, upstreams, recent history, and independent remote refs;
- complete staged, tracked, and untracked worktree state;
- the full diff and contents of every Slice 008 edit;
- the exact protected `.cc-history` paths and hashes;
- `.tmp` content, including the isolated PostgreSQL artifacts;
- PostgreSQL processes and listeners on ports `5432` and `55437`;
- database `rms_slice008_verify` and its migration state; and
- whether any command or external operation is in flight.

At this checkpoint, require:

- active branch:
  `slice-008-notifications-reporting-and-audit`;
- `HEAD`, local `main`, and local remote-tracking `origin/main`:
  `1a5c265a455a9fa758c5495b3a963570849b9181`;
- no Slice 008 upstream or local remote-tracking ref;
- nothing staged;
- only the application, documentation, protected, and isolated-database paths
  recorded below;
- unrelated PostgreSQL parent PID `7236`, launched under `pg_ctl` PID `5676`,
  listening on `5432`, unchanged;
- isolated PostgreSQL 18.1 parent PID `23876`, listening on
  `127.0.0.1:55437`, unless normal process restart evidence is fully
  explained;
- database `rms_slice008_verify` with eight migration rows; and
- no Slice 008 verification command in flight.

The independent remote check at the eighth checkpoint returned only:

`1a5c265a455a9fa758c5495b3a963570849b9181 refs/heads/main`

for:

```powershell
git ls-remote --heads origin main slice-008-notifications-reporting-and-audit
```

This means no remote Slice 008 branch was present at capture time. Repeat the
independent check before relying on remote state and stop on any unexpected
remote ref.

Any unexpected ref, remote branch, staged path, worktree path, protected-file
hash, temporary file, listener/process change, database change, or
unexplained artifact is a conflict. Stop and report it. Do not repair,
discard, rewrite, reset, clean, rebase, or force-push.

Never stage, remove, rewrite, or broadly clean `.cc-history` or `.tmp`. Never
stop, reuse, or delete the unrelated PostgreSQL cluster on port `5432`.

## Completed prerequisite evidence

Slice 007 is fully published and verified:

- implementation:
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7`;
- feature publication/integration head:
  `db38e98b169375650dadb9534e5ab65567234552`;
- exact integration CI run `30456268068`: successful;
- main-publication record:
  `1a5c265a455a9fa758c5495b3a963570849b9181`; and
- exact documentation CI run `30456680467`: successful.

Both runs passed `verify` and `dependency-audit`. Do not repeat these actions.

## Exact unstaged worktree

Tracked modified paths:

- `apps/api/src/composition-root.ts`
- `apps/api/src/identity-routes.test.ts`
- `apps/web/admin/src/main.tsx`
- `apps/web/admin/src/styles.css`
- `apps/web/staff/e2e/admin-setup.spec.ts`
- `apps/web/staff/src/App.tsx`
- `apps/web/staff/src/styles.css`
- `apps/worker/package.json`
- `apps/worker/src/composition-root.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/worker.ts`
- `docs/architecture/modules.yaml`
- `docs/contracts/events.yaml`
- `docs/contracts/openapi.yaml`
- `docs/delivery/implementation-progress.md`
- `migrations/meta/_journal.json`
- `packages/building-blocks/src/index.ts`
- `packages/modules/src/audit/index.ts`
- `packages/modules/src/identity-access/contracts/identity-access-store.ts`
- `packages/modules/src/identity-access/http/router.ts`
- `packages/modules/src/identity-access/http/schemas.ts`
- `packages/modules/src/identity-access/http/session-middleware.ts`
- `packages/modules/src/identity-access/index.ts`
- `packages/modules/src/identity-access/infrastructure/postgres-identity-access-store.ts`
- `packages/modules/src/index.ts`
- `packages/modules/src/notifications/index.ts`
- `packages/modules/src/ordering/contracts/ordering-store.ts`
- `packages/modules/src/ordering/infrastructure/postgres-ordering-store.ts`
- `packages/modules/src/reporting/index.ts`
- `packages/modules/src/restaurant-configuration/contracts/restaurant-configuration-store.ts`
- `packages/modules/src/restaurant-configuration/infrastructure/postgres-restaurant-configuration-store.ts`
- `packages/modules/src/tables/contracts/tables-store.ts`
- `packages/modules/src/tables/infrastructure/postgres-tables-store.ts`
- `packages/service-workflow/src/menu-tables-service.integration.test.ts`
- `packages/service-workflow/src/menu-tables-service.ts`
- `packages/service-workflow/src/order-submission-service.integration.test.ts`
- `packages/service-workflow/src/order-submission-service.ts`
- `packages/service-workflow/src/payment-completion-service.integration.test.ts`
- `packages/service-workflow/src/tenant-owner-service.integration.test.ts`
- `packages/service-workflow/src/tenant-owner-service.ts`
- `pnpm-lock.yaml`

Untracked Slice 008 application/declaration paths:

- `apps/web/admin/src/InsightsAdministration.tsx`
- `apps/web/staff/src/InsightsWorkspaces.tsx`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`
- `migrations/0007_notifications_reporting_and_audit.sql`
- `packages/building-blocks/src/database/outbox-processor.integration.test.ts`
- `packages/building-blocks/src/database/outbox-processor.ts`
- `packages/modules/src/audit/application/audit-query-service.ts`
- `packages/modules/src/audit/contracts/audit-reader.ts`
- `packages/modules/src/audit/http/router.ts`
- `packages/modules/src/audit/http/schemas.ts`
- `packages/modules/src/audit/infrastructure/postgres-audit-reader.ts`
- `packages/modules/src/notifications/application/notification-service.ts`
- `packages/modules/src/notifications/contracts/notification-store.ts`
- `packages/modules/src/notifications/http/router.ts`
- `packages/modules/src/notifications/http/schemas.ts`
- `packages/modules/src/notifications/infrastructure/postgres-notification-store.ts`
- `packages/modules/src/reporting/application/reporting-service.ts`
- `packages/modules/src/reporting/contracts/reporting-store.ts`
- `packages/modules/src/reporting/http/router.ts`
- `packages/modules/src/reporting/http/schemas.ts`
- `packages/modules/src/reporting/infrastructure/postgres-reporting-store.ts`

Expected untracked checkpoint documents:

- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-1.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-2.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-3.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-4.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-5.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-6.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-7.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-8.md`
- `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`

Key untracked application SHA-256 hashes:

- `apps/web/admin/src/InsightsAdministration.tsx`:
  `33933F6F18B72CDDFFE101B70E255A4EF728DE011F790BBCE8D52FF9B6759E28`
- `apps/web/staff/src/InsightsWorkspaces.tsx`:
  `E88B2733BFD6062378EA9674D24AA2E650255DD96AF5E589B94B120B5700169A`
- `migrations/0007_notifications_reporting_and_audit.sql`:
  `B9BC17BF33301A4C13E624EA7B6C07CF950C245012EF1D800DF7FEFE2790D914`
- `packages/building-blocks/src/database/outbox-processor.ts`:
  `C848B64E9DBEA5CB66439035DC366909CA386CBD51458F450460F0B1273E4523`
- `packages/building-blocks/src/database/outbox-processor.integration.test.ts`:
  `B03B1D0C416147DF30EBBF74F0EF0A078A685B70BE27B10FC75F6EDE8272F28A`

Protected untracked paths:

- `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - SHA-256
    `FA3F171F40D66A8B37E2643445898EA8536A20B15677BA467B2F2506C98331CD`
- `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
  - SHA-256
    `783083FA453B8CD61E4974AA40347F50C8C5FBC4D8403C8CBA6490C94F3DCFE2`

Expected `.tmp` top-level content at the eighth checkpoint:

- `golden-admin.err.log` — 19 bytes
- `golden-admin.out.log` — 386 bytes
- `golden-api-rebuilt.err.log` — 26 bytes
- `golden-api-rebuilt.out.log` — 151,935 bytes
- `golden-api.err.log` — 530 bytes
- `golden-api.out.log` — 0 bytes
- `golden-customer.err.log` — 19 bytes
- `golden-customer.out.log` — 642 bytes
- `postgres-slice008` — isolated native PostgreSQL data directory, 1,526
  files and 73,139,792 bytes at eighth-checkpoint capture time
- `postgres-slice008.log` — 17,444 bytes at eighth-checkpoint capture time

Database-managed file counts and log size may change during normal operation.
Reconcile rather than infer, and never clean them broadly.

## Isolated PostgreSQL checkpoint

The isolated database remains:

- PostgreSQL version: `18.1`;
- parent PID: `23876`;
- host: `127.0.0.1`;
- port: `55437`;
- database: `rms_slice008_verify`;
- data directory:
  `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008`;
- log:
  `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008.log`.

Read-only inspection found eight rows in
`drizzle.__drizzle_migrations`. Migration 8 has hash:

`b9bc17bf33301a4c13e624ea7b6c07cf950c245012ef1d800df7fefe2790d914`

This matches migration `0007`. The log preserves known historical start,
migration, negative-test, and first outbox-test failures. Do not clean it.
The current cluster may be reused for development checks, but final
verification must safely recreate its database from empty against the frozen
final worktree without touching port `5432`.

## Reconstructed normative boundary

All eight stories remained `mvp` and `ready`:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

The complete `AGENTS.md` normative reading order was repeated before the
eighth compaction. No approved-source conflict was found.
`AC-US-P01-01` read with `PD-036` permits elapsed-time presentation but not a
delayed/urgent classification or invented threshold. Verify this again from
source before relying on it.

`PERM-008` makes `employees.manage_permissions` restaurant-scoped. The draft
permission-template state is tenant-wide, which could let a
restaurant-scoped actor affect another restaurant. The approved permission
authority therefore rules out that cross-restaurant effect, but no consistent
schema, concurrency, event, contract, API, or UI repair has been implemented.
Reconfirm all authorities and apply one consistent restaurant-scoped
solution; stop if another approved source conflicts.

The `frontend-skill` and `accessibility` skills were loaded. Their concrete
influence remains an operational, utility-first presentation, explicit
loading/error/empty/session-ended states, labelled native controls, 44-pixel
targets, responsive behavior, visible focus, and reduced-motion handling. The
UI drafts have no final browser, WCAG, or visual-review evidence.

## Review completed before the eighth compaction

The following draft areas were read in full during the eighth continuation:

- migration `0007`;
- outbox processor and focused PostgreSQL integration test;
- Notifications application, contract, HTTP schemas/router, and PostgreSQL
  store;
- Identity Access contract/router/schemas/session middleware/export/store
  diffs;
- Reporting application, contract, HTTP schemas/router/export, and complete
  PostgreSQL store;
- Audit application, contract, HTTP schemas/router, and PostgreSQL reader;
- Restaurant Configuration, Tables, and Ordering diffs;
- Menu/Tables, order-submission, payment-completion, and tenant-owner service
  and fixture diffs;
- API and worker composition, worker config/loop, and module exports; and
- the complete administration insights component.

The following were not yet fully reviewed when context compacted:

- `apps/web/staff/src/InsightsWorkspaces.tsx`;
- the complete administration `main.tsx` integration and style diff;
- the complete staff `App.tsx` integration and style diff;
- the remaining browser/e2e patterns extended by Slice 008; and
- the frozen complete diff as a whole.

Presence and partial review do not imply correctness.

## Unresolved review findings

### Worker and outbox

- The focused aggregate-ordering/checkpoint, poison-quarantine/replay, and
  competing-worker tests passed historically.
- Leasing, transaction boundaries, restart, retry limits, replay operations,
  quarantine observability, retention, and concurrency still need final
  review and complete evidence.
- Quarantine logging lacks event/tenant identity, and replay exists as a
  processor method without a reviewed operational interface.

### Notifications and SSE

- Recipient resolution, branch/restaurant scope, effective features, cursor
  ownership, replay gaps, reauthentication, session termination, and
  retention are drafted.
- Polling uses an interval and may overlap when a poll runs longer than the
  interval. The initial cursor is captured late enough to risk missing
  notifications between request start and cursor capture.
- Dedicated recipient/effective-feature, tenant-wide grant, inactive-branch,
  cursor-race, stream-termination, retry, and retention tests remain required.

### Reporting

- Disabled widgets are masked; event-specific projection refreshes, rebuild,
  feature history, filters, and table-session restaurant derivation are
  drafted.
- The PostgreSQL adapter reads source-module schemas directly. Confirm and
  document an explicit narrow read-only projection contract/dependency
  boundary, or refactor without violating write ownership.
- Add dedicated idempotency, rebuild, calculation, authorization,
  branch/feature, and event-projection tests.

### Audit

- Tenant-wide, restaurant, and branch scope logic is drafted and
  administration paging is wired.
- Add dedicated least-privilege, support-role, tenant-wide, restaurant,
  branch, filtering, and pagination tests.

### Permission-template deactivation

- Migration state is keyed tenant-wide by business account and template key,
  while authorization uses restaurant-scoped
  `employees.manage_permissions`.
- Align state, authorization, concurrency, events, schema, contracts, and UI
  to the approved restaurant permission boundary. Do not allow one
  restaurant-scoped actor to deactivate another restaurant's template and do
  not silently override a conflicting approved source.

### Administration and staff UI

- Both insights workspaces are wired as responsive drafts.
- Review explicit initial loading, errors, empty/session-ended states, filter
  coupling, pagination, permission messaging, exact runtime enums,
  branch-local dates, and cross-restaurant permission behavior.
- Administration report and audit filters use separate restaurant values but
  one shared branch value, which can create a mismatched scope.
- Administration initial loading is not explicit, and default date values are
  derived in UTC rather than the selected branch's IANA time zone.
- The staff component and surrounding UI integration/styles were not fully
  reviewed during the eighth continuation.
- Neither UI has final browser, accessibility, or visual evidence.

### Configuration and documentation

- `.env.example` does not yet document the new worker settings.
- Architecture/consistency, conceptual data model, traceability, declaration,
  progress, index, and final handoff remain incomplete.
- Keep the declaration `planned` until every Definition of Done check has
  exact final evidence.

## Known preliminary verification

None of these results verifies the final worktree:

- an earlier non-database suite passed 124 tests, with database-backed
  coverage skipped;
- an earlier architecture run passed with 154 modules, 294 dependencies, and
  three tests;
- an earlier contract lint passed a valid OpenAPI document with 43 event
  contracts;
- an earlier repaired build completed all targets;
- all eight migrations applied from empty to the isolated database after the
  table-session projection repair;
- the existing PostgreSQL-backed suite passed 189/189 tests across 24 files;
- during the seventh continuation, `corepack pnpm format:check` passed;
- during the seventh continuation, `corepack pnpm typecheck` passed; and
- during the seventh continuation, the focused PostgreSQL-backed outbox
  processor suite passed one file and three tests.

No verification command ran during the eighth continuation. No final frozen
install, format check, lint, typecheck, complete test, architecture, contract,
build, browser/WCAG, full check, dependency audit, or visual-review evidence
exists.

## Re-establish the Slice 008 normative boundary

Before continuing behavior changes, repeat the complete `AGENTS.md` normative
reading order from source:

1. full stories, acceptance criteria, and applicable NFRs in
   `restaurant-management-system-requirements.md`;
2. `docs/product/mvp-scope.yaml`;
3. relevant decisions in `docs/product/decision-register.md`;
4. `docs/domain/model.md`, `docs/domain/workflows.yaml`, and
   `docs/domain/business-rules.md`;
5. `docs/config/features.yaml` and `docs/security/permissions.yaml`;
6. `docs/architecture/modules.yaml`, `docs/architecture/consistency.md`, the
   ADR index, and every relevant accepted ADR;
7. `docs/architecture/express-implementation-guide.md`;
8. the complete affected HTTP and event contracts;
9. `docs/data/model.md`, `docs/quality/test-strategy.md`, and
   `docs/quality/traceability.yaml`; and
10. every existing outbox, worker, audit, identity/scope, configuration,
    ordering, Kitchen, Payments, Tables, administration, staff UI, and test
    pattern that Slice 008 extends.

Compare approved sources by declared authority. Stop and report exact
conflicting IDs if a conflict exists. Do not invent a threshold, recipient
strategy, retention exception, privacy action, state, permission, event, or
product decision.

## Resume implementation safely

First complete the interrupted full draft review. Then review every current
edit for:

- exact source-module and table-write ownership;
- tenant, restaurant, branch, assignment, permission, and effective-feature
  scope;
- transactional outbox boundaries;
- idempotency, leasing, aggregate ordering, checkpoints, retry, restart,
  poison-event quarantine, replay, rebuild, retention, and concurrency;
- PostgreSQL 18.1 compatibility, constraints, foreign keys, and indexes;
- sensitive-data minimization and actionable failure behavior; and
- compliance with existing architecture, contracts, and naming conventions.

Correct or replace drafts when authoritative sources and existing patterns
require it. Finish the smallest complete vertical Slice 008 outcome across
migration, domain/application code, PostgreSQL adapters, worker composition,
runtime-validated HTTP/event contracts, responsive permission-aware staff and
administration UI, and dedicated tests.

Preserve every behavior, ownership, exclusion, deactivation boundary,
reporting rule, notification rule, audit rule, and UI/test requirement from
the original execution prompt. Do not introduce a broker, microservice split,
generic repository, dynamic workflow engine, external notification provider,
report export, menu/stock reporting, currency conversion, hard deletion, or
general privacy-deletion workflow.

## Required final verification

Final verification must use an isolated PostgreSQL 18.1 database and record
its exact database, port, process, and native data/log paths. Do not reuse the
unrelated listener on `5432`. Apply every migration from empty against the
final worktree and supply `TEST_DATABASE_URL` so integration tests cannot
skip.

With Node.js `24.18.0`, run the exact repository commands:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:architecture
corepack pnpm contracts:lint
corepack pnpm build
corepack pnpm test:browser
corepack pnpm check
corepack pnpm audit --prod --audit-level high
```

Run and record the complete responsive browser/WCAG suite and visual
inspection required by the original prompt. An earlier, focused, interrupted,
or pre-final-worktree run does not verify the final worktree.

Update implementation, migrations, contracts, architecture/consistency,
conceptual data model, configuration/permissions if approved scope requires
it, traceability, the Slice 008 declaration, progress, index, and final
handoff atomically. Do not add an unlinked `TBD`.

Do not claim completion until every original acceptance, verification,
worktree-review, isolated-database cleanup, port-free, documentation, and
Definition of Done requirement is satisfied.

## Publication boundary

Only after full final verification:

1. review the complete diff, status, branch, base, and protected paths;
2. stage only Slice 008 files;
3. confirm `.cc-history` and temporary database artifacts are not staged;
4. commit with an accurate conventional commit message;
5. push only `slice-008-notifications-reporting-and-audit` to its matching
   remote branch;
6. verify the remote ref independently against local `HEAD`; and
7. record exact implementation and publication evidence.

Do not open a pull request, merge, rebase, squash, force-push, integrate Slice
008 into `main`, begin post-MVP work, or start another slice without explicit
authorization.

## Mandatory context-compaction instruction

If working context compacts at any point before the current phase is fully
completed, verified, and safely checkpointed, stop immediately. Do not
continue integration, implementation, testing, staging, committing, pushing,
cleanup, or publication from summarized memory.

Perform only the minimum read-only inspection needed to capture the exact
branch, `HEAD`, refs, worktree, protected paths, database/process state,
commands in flight, and known/unknown verification results. Never infer that
an interrupted command passed.

Then refresh the active handoff and
`docs/delivery/implementation-progress.md`, create a new dated standalone
continuation prompt containing the complete current state and this same
context-compaction instruction, and return control to the user.

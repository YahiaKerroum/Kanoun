# Slice 008 continuation after ninth context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

The ninth continuation began by reading all required documents and performing
mandatory read-only state inspection. Work stopped immediately upon detecting
that the current worktree does not match the eighth-checkpoint record: five
key application file hashes differ and seven tracked modified paths are present
that were not recorded in the eighth compaction document. These are Slice 008
edits made after checkpoint-8 was written but not captured in a new document
before the session ended. Do not infer correctness or final verification from
this prompt's summary.

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
15. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-8.md`
16. this continuation prompt

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
- no Slice 008 verification command in flight; and
- the five key application SHA-256 hashes matching the ninth-checkpoint values
  recorded below.

The independent remote check at the ninth checkpoint returned only:

`1a5c265a455a9fa758c5495b3a963570849b9181 refs/heads/main`

for:

```powershell
git ls-remote --heads origin main slice-008-notifications-reporting-and-audit
```

This means no remote Slice 008 branch was present at capture time. Repeat the
independent check before relying on remote state and stop on any unexpected
remote ref.

Any unexpected ref, remote branch, staged path, worktree path, protected-file
hash, temporary file, or unexplained artifact is a conflict. Stop and report
it. Do not repair, discard, rewrite, reset, clean, rebase, or force-push.

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

## Detected conflicts from the ninth checkpoint

The ninth continuation detected the following conflicts between the
eighth-checkpoint record and the actual worktree state. These must be
reconciled by read-only inspection; do not repair, discard, or reset.

### Key application file hash mismatches

All five key file hashes differ from the eighth-checkpoint record.
The actual current hashes (ninth-checkpoint authoritative values) are:

- `apps/web/admin/src/InsightsAdministration.tsx`:
  `9004DE05B3853892D8CFB7859057E73CD0392C7EE046A9C7F6A9FA92ADF9CEEA`
  (19,221 bytes)
- `apps/web/staff/src/InsightsWorkspaces.tsx`:
  `A5DAFDC21701EDFEAEB11A8B1D0B476E0BB62FD16E230274121B512EBB210FB8`
  (25,823 bytes)
- `migrations/0007_notifications_reporting_and_audit.sql`:
  `D46AAA5DA066193D1F8AE445873E1C0EF730496486C268B76D6CA1705EE0D89C`
  (17,922 bytes)
- `packages/building-blocks/src/database/outbox-processor.ts`:
  `6917A8AE1C243F1FB270CDD6C883B16B343FCE68AA951A4AC2D7071DA2B1EB68`
  (12,446 bytes)
- `packages/building-blocks/src/database/outbox-processor.integration.test.ts`:
  `A237C9F54CC118F60383773FE23649C933CA1924239D5F3E75CF72AD835778B6`
  (7,079 bytes)

### Additional tracked modified paths not in the eighth checkpoint

These seven paths carry `7/29/2026` last-write timestamps and are Slice 008
edits that were made after the eighth compaction document was written:

- `.env.example` — now documents `WORKER_ID`, `OUTBOX_LEASE_MS`,
  `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETENTION_DAYS`
- `apps/api/src/restaurant-configuration-routes.test.ts`
- `apps/web/staff/e2e/shell.spec.ts`
- `docs/architecture/consistency.md`
- `docs/data/model.md`
- `docs/operations/observability-and-runbook.md`
- `packages/modules/src/restaurant-configuration/http/router.ts`

### PostgreSQL process changes

- The unrelated cluster's PIDs changed: `pg_ctl` is now `5852` (was `5676`);
  parent PostgreSQL is now `8016` (was `7236`). The cluster still listens on
  port `5432`. It was not touched by any continuation session.
- The isolated PostgreSQL 18.1 cluster (formerly PID `23876`) is **not
  running**. Port `55437` is not listening. The data directory
  `.tmp/postgres-slice008` exists (1,545 files, ~70,510,069 bytes). The log
  `.tmp/postgres-slice008.log` is 21,451 bytes, last written
  `7/30/2026 12:54:02 AM`. Database `rms_slice008_verify` exists in the
  data directory but its migration state cannot be read without a running
  cluster.

## Exact unstaged worktree at ninth checkpoint

Tracked modified paths (48 total):

- `.env.example`
- `apps/api/src/composition-root.ts`
- `apps/api/src/identity-routes.test.ts`
- `apps/api/src/restaurant-configuration-routes.test.ts`
- `apps/web/admin/src/main.tsx`
- `apps/web/admin/src/styles.css`
- `apps/web/staff/e2e/admin-setup.spec.ts`
- `apps/web/staff/e2e/shell.spec.ts`
- `apps/web/staff/src/App.tsx`
- `apps/web/staff/src/styles.css`
- `apps/worker/package.json`
- `apps/worker/src/composition-root.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/worker.ts`
- `docs/architecture/consistency.md`
- `docs/architecture/modules.yaml`
- `docs/contracts/events.yaml`
- `docs/contracts/openapi.yaml`
- `docs/data/model.md`
- `docs/delivery/implementation-progress.md`
- `docs/operations/observability-and-runbook.md`
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
- `packages/modules/src/restaurant-configuration/http/router.ts`
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

Untracked Slice 008 application and declaration paths:

- `apps/web/admin/src/InsightsAdministration.tsx`
- `apps/web/staff/src/InsightsWorkspaces.tsx`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`
- `migrations/0007_notifications_reporting_and_audit.sql`
- `packages/building-blocks/src/database/outbox-processor.integration.test.ts`
- `packages/building-blocks/src/database/outbox-processor.ts`
- `packages/modules/src/audit/application/` (directory)
- `packages/modules/src/audit/contracts/audit-reader.ts`
- `packages/modules/src/audit/http/` (directory)
- `packages/modules/src/audit/infrastructure/postgres-audit-reader.ts`
- `packages/modules/src/notifications/application/` (directory)
- `packages/modules/src/notifications/contracts/` (directory)
- `packages/modules/src/notifications/http/` (directory)
- `packages/modules/src/notifications/infrastructure/` (directory)
- `packages/modules/src/reporting/application/` (directory)
- `packages/modules/src/reporting/contracts/` (directory)
- `packages/modules/src/reporting/http/` (directory)
- `packages/modules/src/reporting/infrastructure/` (directory)

Expected untracked checkpoint documents:

- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-1.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-2.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-3.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-4.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-5.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-6.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-7.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-8.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-9.md`
- `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`

Protected untracked paths (unchanged, must not be staged or modified):

- `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - SHA-256
    `FA3F171F40D66A8B37E2643445898EA8536A20B15677BA467B2F2506C98331CD`
- `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
  - SHA-256
    `783083FA453B8CD61E4974AA40347F50C8C5FBC4D8403C8CBA6490C94F3DCFE2`

Expected `.tmp` top-level content at the ninth checkpoint:

- `golden-admin.err.log` — 19 bytes
- `golden-admin.out.log` — 386 bytes
- `golden-api-rebuilt.err.log` — 26 bytes
- `golden-api-rebuilt.out.log` — 151,935 bytes
- `golden-api.err.log` — 530 bytes
- `golden-api.out.log` — 0 bytes
- `golden-customer.err.log` — 19 bytes
- `golden-customer.out.log` — 642 bytes
- `postgres-slice008` — isolated native PostgreSQL data directory, 1,545
  files and approximately 70,510,069 bytes at ninth-checkpoint capture time
- `postgres-slice008.log` — 21,451 bytes at ninth-checkpoint capture time

Database-managed file counts and log size may change during normal operation.
Reconcile rather than infer, and never clean them broadly.

## Isolated PostgreSQL state at ninth checkpoint

- PostgreSQL version: `18.1` (from prior verification; cluster not currently
  running);
- data directory: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008`;
- log: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008.log`;
- port `55437`: **not listening** — cluster must be restarted or recreated
  for final verification.

Final verification must safely recreate or restart the isolated cluster,
drop and recreate `rms_slice008_verify` from empty, apply all eight migrations,
and confirm the correct migration count and hash before running the full suite.
Do not touch port `5432`.

## Reconstructed normative boundary

All eight stories remain `mvp` and `ready`:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

The complete `AGENTS.md` normative reading order was repeated before the
eighth compaction. No approved-source conflict was found. `AC-US-P01-01` read
with `PD-036` permits elapsed-time presentation but not a delayed/urgent
classification or invented threshold. Verify this again from source before
relying on it.

`PERM-008` makes `employees.manage_permissions` restaurant-scoped. The draft
permission-template state is tenant-wide, which could let a restaurant-scoped
actor affect another restaurant. The approved permission authority therefore
rules out that cross-restaurant effect, but no consistent schema, concurrency,
event, contract, API, or UI repair has been implemented. Reconfirm all
authorities and apply one consistent restaurant-scoped solution; stop if
another approved source conflicts.

## Work present in the worktree but not yet fully reviewed

The following were not fully reviewed before the eighth compaction:

- `apps/web/staff/src/InsightsWorkspaces.tsx`;
- the complete administration `main.tsx` integration and style diff;
- the complete staff `App.tsx` integration and style diff;
- the remaining browser/e2e patterns extended by Slice 008;
- the complete frozen diff as a whole; and
- **all seven additional paths discovered in this continuation** (see
  "Detected conflicts" section above).

The additional paths must be read in full before any further edits are made.
Presence does not imply correctness.

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

No verification command ran during the eighth or ninth continuations. No final
frozen install, format check, lint, typecheck, complete test, architecture,
contract, build, browser/WCAG, full check, dependency audit, or visual-review
evidence exists.

## Unresolved review findings carried from prior checkpoints

### Worker and outbox

- Leasing, transaction boundaries, restart, retry limits, replay operations,
  quarantine observability, retention, and concurrency still need final review
  and complete evidence.
- Quarantine logging lacks event/tenant identity, and replay exists as a
  processor method without a reviewed operational interface.

### Notifications and SSE

- Recipient resolution, branch/restaurant scope, effective features, cursor
  ownership, replay gaps, reauthentication, session termination, and retention
  are drafted.
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
  while authorization uses restaurant-scoped `employees.manage_permissions`.
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
  reviewed before the eighth compaction and remain unreviewed.
- Neither UI has final browser, accessibility, or visual evidence.

### Configuration and documentation

- The seven additional tracked paths discovered in this continuation
  (`docs/architecture/consistency.md`, `docs/data/model.md`,
  `docs/operations/observability-and-runbook.md`,
  `packages/modules/src/restaurant-configuration/http/router.ts`,
  `apps/api/src/restaurant-configuration-routes.test.ts`,
  `apps/web/staff/e2e/shell.spec.ts`, `.env.example`) have not been reviewed
  in any prior continuation. Read each in full against its authoritative source
  before relying on it.
- Architecture/consistency, conceptual data model, traceability, declaration,
  progress, index, and final handoff remain incomplete.
- Keep the declaration `planned` until every Definition of Done check has
  exact final evidence.

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

First read in full every path that was not yet reviewed: the seven new tracked
paths, the staff insights component, the complete administration/staff
integration and style diffs, the browser/e2e patterns, and the complete frozen
diff as a whole. Then review every current edit for:

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
unrelated listener on `5432`. The isolated cluster on `55437` is not running;
start or recreate it and apply every migration from empty against the final
worktree before running the suite. Supply `TEST_DATABASE_URL` so integration
tests cannot skip.

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

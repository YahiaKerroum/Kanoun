# Slice 008 continuation after fifth context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

Working context compacted a fifth time after draft repair and administration
UI integration, while a formatting/typecheck command was being invoked. Work
stopped immediately under the mandatory checkpoint rule. Resume only after
reconstructing context from the repository. Do not infer correctness or
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
12. this continuation prompt

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
- `.tmp` content;
- PostgreSQL processes and listeners, including ports `5432` and `55437`; and
- whether any command or external operation is in flight.

At this checkpoint, require:

- active branch:
  `slice-008-notifications-reporting-and-audit`;
- `HEAD`, local `main`, and `origin/main`:
  `1a5c265a455a9fa758c5495b3a963570849b9181`;
- no Slice 008 upstream or remote ref;
- nothing staged;
- only the application and documentation paths listed below, plus the two
  protected untracked `.cc-history` files;
- no isolated Slice 008 database;
- unrelated PostgreSQL parent PID `7236`, launched under `pg_ctl` PID `5676`,
  listening on `5432`, unchanged;
- port `55437` free; and
- no Slice 008 command in flight.

Independent checkpoint inspection returned only:

`1a5c265a455a9fa758c5495b3a963570849b9181 refs/heads/main`

for:

```powershell
git ls-remote --heads origin main slice-008-notifications-reporting-and-audit
```

Any unexpected ref, remote branch, staged path, worktree path,
protected-file hash, temporary file, listener/process change, isolated
database, or unexplained artifact is a conflict. Stop and report it. Do not
repair, discard, rewrite, reset, clean, rebase, or force-push.

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

Untracked Slice 008 application/declaration paths:

- `apps/web/admin/src/InsightsAdministration.tsx`
- `apps/web/staff/src/InsightsWorkspaces.tsx`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`
- `migrations/0007_notifications_reporting_and_audit.sql`
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
- `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`

Key untracked application snapshots:

- `apps/web/admin/src/InsightsAdministration.tsx`
  - 15,597 bytes
  - 474 lines
  - SHA-256
    `04E91253E21016E2ECAFE218926EB5824D4291363C8A037FB8F7577F88C592D6`
- `apps/web/staff/src/InsightsWorkspaces.tsx`
  - 24,816 bytes
  - 804 lines
  - SHA-256
    `2529FE6FDF1090FFDEABA96DD72D592CEB49BCE84015FB952C6E4F9A2989237B`
- `migrations/0007_notifications_reporting_and_audit.sql`
  - 17,501 bytes
  - 405 lines
  - SHA-256
    `DA134F1FD4D22AF8091DDC398BD0E6C6CB0651361DFD1A028ECB1DB084D8EBA6`
- `packages/building-blocks/src/database/outbox-processor.ts`
  - 11,485 bytes
  - 336 lines
  - SHA-256
    `75100BF9DDCFB43BC0AE2A06F02F78C2BCA8ED6DC4C491E36EE704416FD57931`

Protected untracked paths:

- `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - 340,755 bytes
  - SHA-256
    `FA3F171F40D66A8B37E2643445898EA8536A20B15677BA467B2F2506C98331CD`
- `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
  - 225,287 bytes
  - SHA-256
    `783083FA453B8CD61E4974AA40347F50C8C5FBC4D8403C8CBA6490C94F3DCFE2`

Expected `.tmp` content is exactly:

- `golden-admin.err.log` — 19 bytes
- `golden-admin.out.log` — 386 bytes
- `golden-api-rebuilt.err.log` — 26 bytes
- `golden-api-rebuilt.out.log` — 151,935 bytes
- `golden-api.err.log` — 530 bytes
- `golden-api.out.log` — 0 bytes
- `golden-customer.err.log` — 19 bytes
- `golden-customer.out.log` — 642 bytes

## Reconstructed boundary

All eight stories were still `mvp` and `ready` during the fifth
continuation:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

No approved-source conflict was found. `AC-US-P01-01` read with `PD-036`
permits elapsed-time presentation but not a delayed/urgent classification or
an invented threshold. Verify this conclusion from source again before
relying on it.

The `frontend-skill` and `accessibility` skills were loaded for UI work. Their
concrete influence was an operational, utility-first presentation, explicit
loading/error/empty states, labelled controls, 44-pixel targets, and
responsive/reduced-motion considerations. The resulting drafts have not been
visually or functionally verified.

## Latest unverified draft changes

Everything below is a draft. Presence does not imply correctness.

### Outbox

- Aggregate predecessor ordering now compares `aggregate_version`, followed by
  occurred time and event ID.
- Earlier draft work added tenant-isolated claims for tests, quarantined
  predecessor blocking, replay checkpoints, ready/quarantine indexes, and
  retention count semantics.

Leasing, transaction boundaries, ordering, restart, checkpoint, retry,
replay, poison-event, quarantine, retention, and concurrency remain untested.

### Notifications and SSE

- Inbox queries now use newest-first ordering initially and oldest-first
  ordering after a tuple cursor; the SSE loop follows the returned order.
- Notification rules were expanded for identity administrator changes,
  employee lifecycle/branch-scope changes, and branch lifecycle changes.
- Branch deactivation is resolved restaurant-wide while preserving the source
  branch on the inbox item.
- Earlier drafts added cursor ownership validation, replay-gap hints, periodic
  raw-session reauthentication, explicit revoked/scope-changed termination,
  recipient resolution, and retention.

Recipient/effective-feature behavior, restaurant-level events, inactive
branches, cursor races, stream termination, retries, and retention need tests.

### Reporting

- Disabled dashboard widgets are now masked in the service response.
- Requested restaurant filtering is applied before cross-branch permission
  evaluation.
- Earlier drafts changed normal event handling from full rebuilds to
  event-specific projection refreshes and added full-filter totals and
  historical feature evaluation.
- `docs/architecture/modules.yaml` now records the Restaurant Configuration
  dependency and expanded event subscriptions used by Reporting and
  Notifications.

The PostgreSQL adapter still reads source-module schemas directly. Confirm the
declared contract/dependency boundary, source/table write ownership,
incremental idempotency, rebuild behavior, and architecture documentation.

### Audit

- Audit queries now allow no `restaurantId` only when the actor has a
  tenant-wide unscoped `audit.view` grant.
- Selected-restaurant queries continue to exclude tenant-level null-restaurant
  rows and constrain branch-scoped results to authorized branches.

Least-privilege, support-role, tenant-wide, restaurant, and branch behavior
remain untested.

### Administration and staff UI

- `InsightsAdministration.tsx` was read and integrated into
  `apps/web/admin/src/main.tsx`.
- Administration permission-template responses require `active`; inactive
  templates cannot be applied; reasoned, expected-version deactivation
  controls were added.
- Administration report/audit/feature permissions are derived and supplied to
  the insights workspace, including tenant-wide audit scope.
- Administration and staff report/audit views gained pagination and caught
  runtime errors.
- Staff notification schemas were tightened and dashboard/report/audit loads
  gained explicit error behavior.
- Responsive styles were added for administration insights/template controls
  and staff pagination.
- `apps/web/staff/e2e/admin-setup.spec.ts` was updated so its existing
  permission-template fixture includes `active: true`.

Neither UI has been typechecked, browser-tested, accessibility-tested, or
visually inspected on the current worktree. Review permission handling,
runtime schemas, navigation, error/empty/session-ended behavior, filtering,
pagination, and responsive layout.

### Contracts

- OpenAPI now permits the audit restaurant filter to be omitted only for
  tenant-wide permission and documents full-filter sales totals.
- Earlier drafts tightened notification, dashboard, sales, and audit response
  schemas and added SSE `Last-Event-ID`.

Compare every response with runtime schemas and lint the final contracts.

## Interrupted verification

The final command before compaction was:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
corepack pnpm format
corepack pnpm typecheck
```

Its tool output was truncated by compaction. No matching command remains in
flight, but its exit status and both subcommand outcomes are unknown. Do not
infer that formatting or typechecking passed.

Earlier preliminary checks are not final evidence:

- typecheck passed on an earlier backend-only draft;
- contract lint passed on an earlier backend-only draft and reported a valid
  OpenAPI document with 43 integration events; and
- architecture checks passed on an earlier pre-repair worktree with 153
  modules, 290 dependencies, and three tests.

Migration `0007` has not been applied. No isolated Slice 008 database exists.
No final frozen install, format, lint, typecheck, test, architecture, contract,
build, browser/WCAG, full-check, dependency-audit, or visual-review evidence
exists.

## Re-establish the Slice 008 normative boundary

Before continuing behavior changes, repeat the complete `AGENTS.md` normative
reading order from source:

1. the full stories, acceptance criteria, and applicable NFRs in
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

Compare approved sources by their declared authority. Stop and report exact
conflicting IDs if a conflict exists. Do not invent a threshold, recipient
strategy, retention exception, privacy action, state, permission, event, or
product decision.

## Resume implementation safely

Review every current edit for:

- exact source-module and table-write ownership;
- tenant, restaurant, branch, assignment, permission, and effective-feature
  scope;
- transactional outbox boundaries;
- idempotency, leasing, aggregate ordering, checkpoint, retry, restart,
  poison-event, quarantine, replay, rebuild, retention, and concurrency;
- PostgreSQL 18.1 compatibility, constraints, foreign keys, and indexes;
- sensitive-data minimization and actionable failure behavior; and
- compliance with existing architecture, contracts, and naming conventions.

Correct or replace drafts when authoritative sources and existing patterns
require it. Then finish the smallest complete vertical Slice 008 outcome
across migration, domain/application code, PostgreSQL adapters, worker
composition, runtime-validated HTTP/event contracts, responsive,
permission-aware staff/administration UI, and dedicated tests.

Preserve every behavior, ownership, exclusion, deactivation boundary,
reporting rule, notification rule, audit rule, and UI/test requirement from
the original execution prompt. Do not introduce a broker, microservice split,
generic repository, dynamic workflow engine, external notification provider,
report export, menu/stock reporting, currency conversion, hard deletion, or
general privacy-deletion workflow.

Keep the declaration status `planned` until every Definition of Done check is
supported by exact final evidence.

## Required final verification

After implementation is complete, create a new isolated PostgreSQL 18.1
database for final verification and record its exact database, port, process,
and native data/log paths. Do not reuse the unrelated listener on `5432`.
Apply every migration from empty and supply `TEST_DATABASE_URL` so integration
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
conceptual data model, configuration/permissions if required by approved
scope, traceability, the Slice 008 declaration, progress, index, and final
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

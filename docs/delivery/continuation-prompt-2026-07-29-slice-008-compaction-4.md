# Slice 008 continuation after fourth context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

Working context compacted a fourth time during draft repair and
administration UI implementation. Work stopped immediately under the
mandatory checkpoint rule. Resume only after reconstructing context from the
repository. Do not infer correctness or verification from this prompt's
summary.

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
11. this continuation prompt

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
- unrelated PostgreSQL parent PID `7236` listening on `5432`, unchanged;
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

Tracked modified Slice 008 application paths:

- `apps/api/src/composition-root.ts`
- `apps/api/src/identity-routes.test.ts`
- `apps/web/staff/src/App.tsx`
- `apps/web/staff/src/styles.css`
- `apps/worker/src/composition-root.ts`
- `apps/worker/src/config.ts`
- `apps/worker/src/worker.ts`
- `docs/contracts/events.yaml`
- `docs/contracts/openapi.yaml`
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

Tracked checkpoint documentation:

- `docs/delivery/implementation-progress.md`

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

Expected untracked checkpoint/declaration documents:

- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-1.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-2.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-3.md`
- `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-4.md`
- `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
- `docs/delivery/slice-008-notifications-reporting-and-audit.md`

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

All eight stories were still `mvp` and `ready` during the fourth
continuation:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

No approved-source conflict was found. `AC-US-P01-01` read with `PD-036`
permits elapsed-time presentation but not a delayed/urgent classification or
an invented threshold. Verify this conclusion from source again before
relying on it.

The `frontend-skill` and `accessibility` skills were loaded for the UI work.
Their concrete influence was an operational, utility-first staff presentation,
explicit loading/error/empty states, labelled controls, 44-pixel targets, and
responsive/reduced-motion considerations. These drafts are not visually or
functionally verified.

## Work attempted before the fourth compaction

All items below are unverified drafts. Presence does not imply correctness.

### Migration and active-work guards

- Corrected migration and Tables guard references from
  `tables.table_sessions.state` to the source column `status`.
- Relaxed the permission-template-state version check to accept version one.
- Added partial ready-claim and quarantine indexes for outbox work.
- Added branch lifecycle row locking and used it in branch updates and order
  submission to serialize deactivation against new accepted work.
- Preserved optimistic-concurrency errors before classifying a table as
  occupied during deactivation.

### Permission templates

- Inactive predefined templates are returned by list queries.
- Template application rejects inactive templates.
- Template deactivation was rewritten as an expected-version, active-state
  concurrency operation.

### Outbox

- Added optional tenant isolation to outbox claiming for tests.
- A quarantined predecessor now blocks later work for the same aggregate.
- Retention returns the count of deleted outbox messages while deleting their
  replay checkpoints.

The SQL, transaction, lease, checkpoint, retry, replay, quarantine, and
retention behavior has not been tested.

### Notifications and SSE

- Added tuple-cursor inbox reads and cursor lookup.
- Added `Last-Event-ID` parsing and ownership validation.
- Added replay-gap reload hints when a cursor has expired.
- Added periodic raw-session reauthentication and explicit stream termination
  hints for revoked or scope-changed sessions.
- Retention now removes expired inbox records and notification delivery
  attempts older than 30 days.

Recipient resolution, effective-feature behavior, restaurant-level events,
resume races, stream termination, and authorization remain untested.

### Audit

- Removed a synchronous Restaurant Configuration dependency from the audit
  query service.
- A selected restaurant no longer includes tenant-level null-restaurant audit
  rows.
- Branch-scoped results are constrained to the selected/authorized branch set.

Least-privilege and support-role behavior remain untested.

### Reporting

- Changed normal event handling from full-tenant rebuilds to event-specific
  projection refreshes.
- Added branch lookup and full-filter sales-summary queries.
- Default branch selection now keeps branches on which the actor has
  `reports.view` and the effective reporting feature, rather than requiring
  access to every assigned branch.
- Sales totals are calculated across the full filtered result rather than the
  current page.
- Historical reporting feature evaluation uses restaurant configuration so an
  inactive branch does not automatically erase access to historical data.
- Fixed the projection rebuild's table-session column reference.

The adapter still reads source-module schemas directly. Confirm source/table
write ownership, the declared dependency boundary, explicit contracts,
incremental idempotency, rebuild behavior, and architecture documentation.
Reporting and Notifications currently use Restaurant Configuration contracts
without matching declared module dependencies.

### Contracts

- Tightened notification inbox/gap, branch dashboard, sales report, and audit
  search responses with explicit schemas and
  `additionalProperties: false`.
- Added the SSE `Last-Event-ID` request header and draft 403/422 responses.

The current OpenAPI/event documents have not been linted after these edits.
Review nullable enum syntax and every exact response against runtime schemas.

### Staff and administration UI

- Corrected the staff `Section` union syntax.
- Added Notifications navigation, notification-bell activation, dashboard,
  report, and audit routing, and responsive insight-workspace styles.
- Added nullable problem handling, SSE replay/session-ended behavior, and
  threshold-free elapsed-time language in the staff insight component.
- The last attempted patch created
  `apps/web/admin/src/InsightsAdministration.tsx`.

Checkpoint capture found the administration component at:

- 13,186 bytes;
- 420 lines; and
- SHA-256
  `55C74A48CFDE1A2F5EAE7BEF4F55EE3FF200D3A1C903E8462C7C6C246D8DE9CB`.

The patch output was truncated by compaction. The file must be read in full.
It has not been integrated into the administration application, typechecked,
tested, or visually inspected. Do not assume its import list, response
schemas, permission handling, filtering, or JSX is correct.

## Known unfinished work and risks

This list is not exhaustive:

- no dedicated Slice 008 tests exist;
- administration UI integration and styling are incomplete;
- staff/administration runtime-error, authorization-error, empty-state,
  navigation, and traceability behavior needs review;
- outbox leasing, ordering, restart, checkpoint, retry, replay, poison-event,
  quarantine, retention, and concurrency need tests;
- reporting projection idempotency, event refresh, rebuild, pagination totals,
  source-schema access, and module dependencies need review and tests;
- notification recipients, effective features, no-branch events, SSE resume,
  replay gaps, revocation, retry, and retention need tests;
- template deactivation/list/apply behavior needs authorization, concurrency,
  and tenant-isolation tests;
- branch/table active-work guards need authorization, tenant-isolation,
  concurrency, retry, and failure tests;
- audit support and restaurant/branch least-privilege behavior needs tests;
- the current OpenAPI schema edits need contract lint and runtime comparison;
- architecture/consistency, conceptual data model, traceability, index, final
  handoff, and related normative updates are incomplete.

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
composition, runtime-validated HTTP/event contracts, and responsive,
permission-aware staff/administration UI.

Preserve every behavior, ownership, exclusion, deactivation boundary,
reporting rule, notification rule, audit rule, and UI/test requirement from
the original execution prompt. Do not introduce a broker, microservice split,
generic repository, dynamic workflow engine, external notification provider,
report export, menu/stock reporting, currency conversion, hard deletion, or
general privacy-deletion workflow.

Keep the declaration status `planned` until every Definition of Done check is
supported by exact final evidence.

## Verification state and required final verification

Preliminary commands on earlier draft worktrees:

- `corepack pnpm typecheck` passed on a backend-only draft.
- `corepack pnpm contracts:lint` passed on a backend-only draft and reported a
  valid OpenAPI document with 43 integration event contracts.
- an architecture run passed on a pre-repair worktree with 153 modules, 290
  dependencies, and three tests.
- a later preliminary typecheck found one exact-optional-property error in
  `InsightsWorkspaces.tsx`; that line was edited, but typecheck was not rerun.

These results do not verify the current worktree and must not be used as final
evidence. No command was in flight at checkpoint capture.

Migration `0007` has not been applied. No isolated Slice 008 database exists.
No final frozen install, format, lint, typecheck, test, architecture, contract,
build, browser/WCAG, full-check, dependency-audit, or visual-review evidence
exists.

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

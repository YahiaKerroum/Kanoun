# Slice 008 continuation after third context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

Working context compacted a third time during required source reconstruction
and read-only draft review. Work stopped immediately under the mandatory
checkpoint rule. Resume only after reconstructing context from the repository.
Do not infer correctness or verification from this prompt's summary.

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
10. this continuation prompt

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

## Expected unstaged worktree

Tracked modified Slice 008 application paths:

- `apps/api/src/composition-root.ts`
- `apps/api/src/identity-routes.test.ts`
- `apps/web/staff/src/App.tsx`
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
- `packages/service-workflow/src/payment-completion-service.integration.test.ts`
- `packages/service-workflow/src/tenant-owner-service.integration.test.ts`
- `packages/service-workflow/src/tenant-owner-service.ts`

Tracked checkpoint documentation:

- `docs/delivery/implementation-progress.md`

Untracked Slice 008 application/declaration paths:

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

## Reconstructed boundary and unverified draft state

All eight stories were still `mvp` and `ready` during the third continuation:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

No approved-source conflict was found. `AC-US-P01-01` read with `PD-036`
permits elapsed-time presentation but not a delayed/urgent classification or
an invented threshold. Verify this conclusion from source again before
relying on it.

No application behavior was changed during the third continuation. Read-only
inspection found the following unverified defects and risks:

- `apps/web/staff/src/App.tsx` still contains:

  ```typescript
    | "Audit";
    | "Notifications";
  ```

  The new workspace imports landed, but notification navigation and workspace
  rendering did not. The notification bell is still disabled.
- `InsightsWorkspaces.tsx` exists, but no corresponding staff CSS changes
  landed. Its reports expose branch filters only; cross-restaurant and
  cross-branch administration UI is not established.
- Migration `0007` and the table active-work guard refer to
  `tables.table_sessions.state`, but the source schema uses `status`.
- Reporting deletes and rebuilds tenant projections on each supported event
  and reads several source-module schemas directly. Review write ownership,
  declared module dependencies, explicit contracts, event idempotency, and
  rebuild behavior.
- Reporting defaults to every authorized branch and then requires
  `reports.view` across all of them, which may deny actors whose report grant
  covers only a subset.
- Draft dashboard, sales-report, and audit OpenAPI responses use loose
  `additionalProperties: true` shapes instead of exact schemas.
- Audit search includes tenant-level null-restaurant rows even when a
  restaurant filter is supplied. Recheck least-privilege behavior for
  restaurant-scoped actors and support.
- Notification SSE polling has no `Last-Event-ID` handling and does not yet
  establish explicit termination on session revocation.
- Inactive predefined permission templates are filtered from list results
  even though an active flag was added. Deactivation is untested.
- Branch/table active-work guards lack concurrency, tenant-isolation,
  authorization, and failure tests.
- No Slice 008 tests were added. Existing integration-test edits only inject
  new `TenantOwnerService` dependencies.
- The outbox processor's aggregate ordering, replay-wide checkpoint deletion,
  and retention return semantics require review. Leasing, retry, quarantine,
  restart, replay, and poison-event behavior are untested.
- Notification recipient/effective-feature resolution, including
  restaurant-level events with no branch, remains unverified.
- No administration UI changes currently implement the broad reporting or
  audit scope.
- Architecture/consistency, conceptual data model, traceability, index, final
  handoff, and related normative updates remain incomplete.

This list is not exhaustive. Read every edit and affected existing pattern.
Presence does not imply correctness.

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

Only these preliminary commands completed before the original final UI patch:

- `corepack pnpm typecheck`: passed on the then-current backend worktree.
- `corepack pnpm contracts:lint`: passed on the then-current backend worktree,
  reporting a valid OpenAPI document and 43 integration event contracts.

They do not verify the current worktree and must not be used as final
evidence. No command was run during the third continuation.

Migration `0007` has not been applied. No isolated Slice 008 database exists.
No final format, lint, typecheck, test, architecture, contract, build,
browser/WCAG, full-check, dependency-audit, or visual-review evidence exists.

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

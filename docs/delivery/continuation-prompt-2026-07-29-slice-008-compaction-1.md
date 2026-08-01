# Slice 008 continuation after context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

Working context compacted during early implementation, so work stopped under
the mandatory checkpoint rule. Resume only after reconstructing context from
the repository. Do not infer correctness or verification from this prompt's
summary.

Do not repeat the completed Slice 007 publication/integration phases. Do not
open a Slice 008 pull request or integrate Slice 008 into `main`. Do not begin
another slice.

## Required reading and initial inspection

Read in full and in this order:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`
4. `docs/delivery/implementation-progress.md`
5. `docs/delivery/mvp-slices.yaml`
6. `docs/delivery/slice-008-notifications-reporting-and-audit.md`
7. `docs/delivery/continuation-prompt-2026-07-29-slice-008.md`
8. this continuation prompt

The original Slice 008 execution prompt remains authoritative for scope,
quality, verification, publication boundaries, and exclusions. Its Slice 007
publication and Slice 008 branch-creation steps are already complete and must
not be re-executed.

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
- the full diff of every existing Slice 008 edit;
- the exact protected `.cc-history` paths;
- `.tmp` content;
- PostgreSQL processes and listeners, including ports `5432` and `55437`; and
- whether any command or external operation is still in flight.

At this checkpoint, require:

- active branch:
  `slice-008-notifications-reporting-and-audit`;
- `HEAD`, local `main`, and `origin/main`:
  `1a5c265a455a9fa758c5495b3a963570849b9181`;
- no Slice 008 upstream or remote ref;
- nothing staged;
- only the application/declaration and checkpoint-documentation paths listed
  below, plus the two protected untracked `.cc-history` files;
- no isolated Slice 008 database;
- the unrelated PostgreSQL parent PID `7236` listening on `5432`, unchanged;
  and
- port `55437` free.

Any unexpected ref, remote branch, staged path, worktree path, protected-path
change, listener/process change, or unexplained artifact is a conflict. Stop
and report it. Do not repair, discard, rewrite, reset, clean, rebase, or
force-push.

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

## Expected unverified worktree

The early Slice 008 work is entirely unstaged and unverified:

- `docs/delivery/slice-008-notifications-reporting-and-audit.md` (untracked);
- `migrations/0007_notifications_reporting_and_audit.sql` (untracked);
- `migrations/meta/_journal.json` (modified);
- `packages/building-blocks/src/database/outbox-processor.ts` (untracked);
- `packages/building-blocks/src/index.ts` (modified);
- `packages/modules/src/identity-access/contracts/identity-access-store.ts`
  (modified);
- `packages/modules/src/identity-access/infrastructure/postgres-identity-access-store.ts`
  (modified);
- `packages/modules/src/restaurant-configuration/contracts/restaurant-configuration-store.ts`
  (modified); and
- `packages/modules/src/restaurant-configuration/infrastructure/postgres-restaurant-configuration-store.ts`
  (modified).

Checkpoint documentation is also expected and unstaged:

- `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`;
- `docs/delivery/implementation-progress.md`; and
- this continuation prompt.

The two protected untracked paths are:

- `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
- `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`

The existing `.tmp` files are the eight `golden-*` logs recorded in the
handoff. They are unrelated and must remain untouched.

The uncertain infrastructure edits were confirmed present after compaction:

- `PostgresIdentityAccessStore.listEligibleNotificationRecipients`; and
- `PostgresRestaurantConfigurationStore.isBranchFeatureEnabled`.

Presence does not imply correctness. Treat the declaration, migration,
journal, generic outbox processor, exports, contracts, SQL implementations,
and checkpoint documents as drafts. Review them line by line before keeping
or extending them.

## Re-establish the Slice 008 normative boundary

All eight stories were `mvp` and `ready` before compaction:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

Before continuing behavior changes, repeat the complete `AGENTS.md` normative
reading order from source:

1. their full stories, acceptance criteria, and applicable NFRs in
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
    implementation pattern that Slice 008 extends.

Compare approved sources by their declared authority. Stop and report exact
conflicting IDs if a conflict exists. Do not invent a threshold, recipient
strategy, retention exception, privacy action, state, permission, event, or
product decision.

The earlier review found no approved-source conflict. It specifically
interpreted `AC-US-P01-01` with `PD-036` as allowing elapsed-time
presentation, not delay/urgency classification or a delay threshold. Verify
that conclusion from source before relying on it.

## Resume implementation safely

First review the current migration, journal entry, outbox processor, exports,
contracts, and SQL implementations for:

- exact source-module ownership;
- tenant, restaurant, branch, assignment, permission, and effective-feature
  scope;
- transactional outbox boundaries;
- idempotency, leasing, ordering, checkpoint, retry, restart, poison-event,
  quarantine, replay, rebuild, and concurrency behavior;
- PostgreSQL 18.1 compatibility, constraints, foreign keys, retention, and
  indexes;
- sensitive-data minimization and actionable failure behavior; and
- compliance with the existing architecture and naming conventions.

Correct or replace draft work when the normative sources and existing patterns
require it. Then implement the smallest complete vertical Slice 008 outcome
across migrations, domain/application code, PostgreSQL adapters, worker
composition, runtime-validated HTTP and event contracts, and responsive
permission-aware staff/administration UI.

Preserve all behavior, ownership, exclusions, deactivation boundaries,
reporting rules, notification rules, audit rules, and UI/testing requirements
from the original Slice 008 execution prompt. Do not introduce a broker,
microservice split, generic repository, dynamic workflow engine, external
notification provider, report export, menu/stock reporting, currency
conversion, hard deletion, or general privacy-deletion workflow.

Keep the declaration status `planned` until every Definition of Done check is
supported by exact final evidence.

## Verification and documentation

No Slice 008 verification has run. Migration `0007` has not been applied. No
isolated Slice 008 database or visual-review evidence exists.

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
inspection required by the original prompt. An earlier, focused, or
interrupted run does not verify the final worktree.

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

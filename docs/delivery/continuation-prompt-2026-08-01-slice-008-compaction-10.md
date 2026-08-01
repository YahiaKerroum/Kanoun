# Slice 008 continuation after tenth context compaction

Work in `C:\Users\HP\Desktop\mvp`.

This is the standalone continuation prompt for:

`SLICE-008 — notifications_reporting_and_audit`.

The tenth continuation must not proceed from summarized memory. Context
compacted after the ninth-continuation reconciliation, one lint-only test
repair, isolated PostgreSQL verification, and repository verification commands,
but before responsive visual review, final documentation, cleanup, commit,
push, and publication were completed. Do not infer correctness or final
verification from this summary.

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
16. `docs/delivery/continuation-prompt-2026-07-29-slice-008-compaction-9.md`
17. this continuation prompt

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

- active branch: `slice-008-notifications-reporting-and-audit`;
- `HEAD`, local `main`, and local remote-tracking `origin/main`:
  `1a5c265a455a9fa758c5495b3a963570849b9181`;
- no Slice 008 upstream or local remote-tracking ref;
- nothing staged;
- no remote Slice 008 branch;
- only Slice 008 application, documentation, protected, and isolated-database
  paths recorded by the ninth and tenth checkpoint records;
- no Slice 008 verification command in flight; and
- protected `.cc-history` hashes unchanged.

The independent remote check at the tenth checkpoint returned only:

`1a5c265a455a9fa758c5495b3a963570849b9181 refs/heads/main`

for:

```powershell
git ls-remote --heads origin main slice-008-notifications-reporting-and-audit
```

Repeat the independent check before relying on remote state and stop on any
unexpected remote ref.

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

## State carried from ninth checkpoint

The ninth checkpoint reconciled the mismatch between checkpoint-8 and the
actual worktree. The actual ninth-checkpoint key application hashes were:

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

Seven tracked modified paths discovered at the ninth checkpoint had not been
captured by checkpoint-8 and must remain treated as Slice 008 edits:

- `.env.example`
- `apps/api/src/restaurant-configuration-routes.test.ts`
- `apps/web/staff/e2e/shell.spec.ts`
- `docs/architecture/consistency.md`
- `docs/data/model.md`
- `docs/operations/observability-and-runbook.md`
- `packages/modules/src/restaurant-configuration/http/router.ts`

## Delta from ninth checkpoint to tenth checkpoint

The ninth-continuation authority review and implementation review found no
approved-source conflict. `PERM-008` was confirmed to require restaurant-scoped
`employees.manage_permissions`, and the current draft now uses a
restaurant-scoped permission-template state:

- migration 0007 includes `restaurant_id` on
  `identity.permission_template_states`;
- uniqueness is scoped by business account, restaurant, and template key;
- `TenantOwnerService.deactivatePermissionTemplate` authorizes against the
  active restaurant; and
- integration coverage verifies that deactivation in one restaurant does not
  deactivate the same predefined template in a sibling restaurant.

Only one source file changed after checkpoint-9:

- `packages/modules/src/notifications/application/notification-service.test.ts`
  was patched to avoid `@typescript-eslint/unbound-method` by returning the
  concrete mocked `listEligibleNotificationRecipients` function from `setup()`
  and asserting against that mock.
- Current SHA-256:
  `79719EBC692EF781ADA5978AC9CFB38ED20BA8DF62BB114E020CB58B22C90AE4`.

TypeScript LSP diagnostics were unavailable because
`typescript-language-server` is not installed. The LSP installation decision
was recorded as declined; repository lint and typecheck were used instead.

## Exact worktree at tenth checkpoint

Before writing this checkpoint document, read-only capture showed:

- active branch:
  `slice-008-notifications-reporting-and-audit`;
- `HEAD`, local `main`, and local remote-tracking `origin/main`:
  `1a5c265a455a9fa758c5495b3a963570849b9181`;
- no Slice 008 upstream or local remote-tracking ref;
- independent remote check returned only `refs/heads/main`;
- nothing staged;
- 48 tracked modified paths;
- protected `.cc-history` hashes unchanged; and
- no Slice 008 verification command in flight.

Tracked modified paths remain the 48 paths listed in the ninth checkpoint, plus
the content change to
`packages/modules/src/notifications/application/notification-service.test.ts`
inside an already-untracked Slice 008 directory. This checkpoint documentation
update additionally modifies `docs/delivery/implementation-progress.md`,
updates `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md`, and adds
this file.

Protected untracked paths, unchanged:

- `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - SHA-256
    `FA3F171F40D66A8B37E2643445898EA8536A20B15677BA467B2F2506C98331CD`
- `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
  - SHA-256
    `783083FA453B8CD61E4974AA40347F50C8C5FBC4D8403C8CBA6490C94F3DCFE2`

## PostgreSQL and `.tmp` state at tenth checkpoint

- The unrelated PostgreSQL cluster listens on port `5432` at `0.0.0.0` and
  `::`; parent PostgreSQL PID `7608`, `pg_ctl` PID `5912`. It was not touched.
- The isolated PostgreSQL 18.1 cluster is running on `127.0.0.1:55437` with
  parent PID `23624`.
- Data directory:
  `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008`.
- Log:
  `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice008.log`.
- `.tmp/postgres-slice008` contained 1,538 files and 75,703,888 bytes at
  capture time.
- `.tmp/postgres-slice008.log` was 33,815 bytes at capture time.
- Database `rms_slice008_verify` exists and contains eight migration rows.
- Migration 8 hash is
  `d46aaa5da066193d1f8ae445873e1c0ef730496486c268b76d6ca1705ee0d89c`,
  matching `migrations/0007_notifications_reporting_and_audit.sql`.

Database-managed file counts and log size may change during normal operation.
Reconcile rather than infer, and never clean them broadly.

## Preliminary verification before tenth compaction

These results were captured before context compaction and before this
checkpoint document was written. They are strong preliminary evidence for the
application worktree, but do not complete the slice because visual review,
final documentation, cleanup, commit, push, and publication remain unfinished.

- `corepack pnpm install --frozen-lockfile`: passed.
- `corepack pnpm format:check`: passed after formatting the lint-repair test
  file.
- `corepack pnpm lint`: initially failed on three
  `@typescript-eslint/unbound-method` assertions in
  `notification-service.test.ts`, then passed after the lint-only test patch.
- `corepack pnpm typecheck`: passed.
- Isolated PostgreSQL migration application from empty database: passed with
  eight migration rows.
- `corepack pnpm test` with `DATABASE_URL` and `TEST_DATABASE_URL` pointing to
  the isolated cluster: passed 28 files and 207 tests.
- `corepack pnpm test:architecture`: passed with 154 modules, 295
  dependencies, and 3 tests.
- `corepack pnpm contracts:lint`: passed; OpenAPI valid and 43 event contracts
  validated.
- `corepack pnpm build`: passed.
- `corepack pnpm test:browser`: passed 23 Playwright tests. The output
  included Vite proxy `ECONNREFUSED 127.0.0.1:3000` lines for a dashboard
  request, but the browser suite passed.
- `corepack pnpm check`: passed.
- `corepack pnpm audit --prod --audit-level high`: passed with no known
  vulnerabilities.

No responsive visual-inspection evidence exists after these runs. Do not claim
completion until the visual/WCAG/manual review requirement is satisfied and any
verification invalidated by final doc or code edits is re-run.

## Resume implementation safely

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

Then complete the remaining Slice 008 work:

- perform responsive/WCAG visual review and manual inspection for the
  administration and staff insights surfaces at mobile, tablet, and desktop
  widths;
- refresh the root README into a professional GitHub-facing project guide with
  logo/branding, screenshots, setup and local-development guide, architecture
  and feature explanations, verification commands, and contribution/onboarding
  guidance;
- finalize documentation, traceability, declaration status, progress, index,
  and handoff with exact evidence;
- re-run any verification invalidated by final edits;
- stop or account for the isolated PostgreSQL cluster safely without touching
  port `5432`;
- review complete diff/status/branch/base/protected paths;
- stage only Slice 008 files, including the README refresh and excluding
  `.cc-history` and `.tmp`;
- commit with an accurate conventional commit message;
- push only `slice-008-notifications-reporting-and-audit` to its matching
  remote branch;
- independently verify the remote ref against local `HEAD`; and
- record exact implementation and publication evidence.

Do not open a pull request, merge, rebase, squash, force-push, integrate Slice
008 into `main`, begin post-MVP work, or start another slice without explicit
authorization.

## Mandatory context-compaction instruction

If working context compacts at any point before the current phase is fully
completed, verified, and safely checkpointed, stop immediately. Do not continue
integration, implementation, testing, staging, committing, pushing, cleanup, or
publication from summarized memory.

Perform only the minimum read-only inspection needed to capture the exact
branch, `HEAD`, refs, worktree, protected paths, database/process state,
commands in flight, and known/unknown verification results. Never infer that
an interrupted command passed.

Then refresh the active handoff and
`docs/delivery/implementation-progress.md`, create a new dated standalone
continuation prompt containing the complete current state and this same
context-compaction instruction, and return control to the user.

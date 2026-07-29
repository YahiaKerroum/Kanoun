---
id: CONTINUATION-2026-07-29-SLICE-008
status: ready-to-execute
owner: engineering
last_reviewed: 2026-07-29
---

# Slice 008 startup and implementation prompt

Work in `C:\Users\HP\Desktop\mvp`.

This is the explicit execution prompt to finish the Slice 007 publication
record, integrate the verified Slice 007 branch into `main`, and then plan,
implement, verify, commit, and publish:

`SLICE-008 — notifications_reporting_and_audit`.

Do not begin another slice. Do not open a Slice 008 pull request or integrate
Slice 008 into `main`; those remain separate future actions.

## Required reading and initial inspection

Read in full and in this order:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md`
4. `docs/delivery/implementation-progress.md`
5. `docs/delivery/mvp-slices.yaml`
6. `docs/delivery/slice-007-payment-completion-and-correction.md`
7. `docs/delivery/continuation-prompt-2026-07-29-slice-008.md`

The older
`docs/delivery/continuation-prompt-2026-07-29-slice-007-compaction-2.md`
is a superseded historical record. Do not execute its original checkpoint
instructions or treat its pre-verification state as current.

Before changing repository state, activate the pinned toolchain:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
```

Confirm `node --version` is exactly `v24.18.0`. Then use read-only checks to
inspect:

- the current branch, `HEAD`, `main`, and `origin/main`;
- all local and remote branches and their upstreams;
- recent history and every commit after the Slice 007 implementation commit;
- the complete tracked and untracked worktree;
- the exact protected `.cc-history` paths;
- any `.tmp` content and active PostgreSQL process/listener; and
- the remote Slice 007 branch through an independent remote-ref query.

At this prompt's authoring boundary:

- active branch:
  `slice-007-payment-completion-and-correction`;
- verified Slice 007 implementation commit:
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7`;
- current local and remote Slice 007 publication head:
  `7e2a829be77ca02a16d46ea2f8382d926a703be9`;
- `main` and `origin/main`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`;
- no Slice 007 pull request or `main` integration exists;
- no Slice 008 branch, declaration, implementation, commit, push, pull
  request, or integration exists;
- the isolated Slice 007 PostgreSQL cluster and its exact data/log artifacts
  have already been removed, and port `55437` is free;
- exactly these protected untracked files exist and must remain untouched:
  - `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
- the intended documentation-only authoring changes are:
  - the corrected current Slice 007 publication handoff;
  - the superseded/historical banner on the old compaction prompt; and
  - this Slice 008 execution prompt.

The Slice 007 feature branch may be a documentation-only descendant of
`7e2a829be77ca02a16d46ea2f8382d926a703be9` if those exact authoring changes
were committed and pushed after this prompt was written. In that case, verify
every intervening commit and require the local and remote feature-branch heads
to match. Any other divergence, unexplained path, staged content, remote
change, or application change is a conflict: stop and report it. Do not
repair, discard, rewrite, clean, or force-push.

Never stage, remove, rewrite, or broadly clean `.cc-history` or `.tmp`.

## Phase 1 — finish the Slice 007 publication record

If the three intended documentation changes remain local:

1. Review their complete diff and validate that they only make the verified,
   published Slice 007 state unambiguous and prepare this prompt.
2. Run formatting verification and `git diff --check`.
3. Stage only these exact documentation paths:
   - `docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md`
   - `docs/delivery/continuation-prompt-2026-07-29-slice-007-compaction-2.md`
   - `docs/delivery/continuation-prompt-2026-07-29-slice-008.md`
4. Confirm the two protected `.cc-history` files are not staged.
5. Commit the documentation correction with an accurate conventional commit
   message.
6. Push only
   `slice-007-payment-completion-and-correction` to its matching remote branch.
7. Verify the remote ref independently against the new local `HEAD`.

If those exact changes are already committed and published, do not recreate
or recommit them.

## Phase 2 — integrate verified Slice 007

This prompt explicitly authorizes a non-rewriting, fast-forward-only
integration of the verified and published Slice 007 branch into `main`.

Before integration:

- require a clean worktree except for the two protected untracked
  `.cc-history` files;
- fetch current remote refs without pruning or rewriting;
- confirm local `main` and `origin/main` still match at
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`;
- confirm the Slice 007 feature-branch history contains the verified
  implementation commit and only the reviewed publication-documentation
  descendants; and
- confirm the local and remote Slice 007 heads match exactly.

If any prerequisite differs, stop and report it. Otherwise:

1. Fast-forward local `main` to the reviewed Slice 007 feature-branch head.
   Do not merge with a merge commit, rebase, squash, cherry-pick, reset, or
   rewrite history.
2. Push `main` normally without force.
3. Verify `origin/main` independently.
4. Wait for the exact GitHub Actions run for the integrated SHA and require
   all repository-required jobs to pass. Never infer that an in-progress,
   cancelled, or unrelated run passed.
5. Update the handoff, implementation progress, documentation index, and
   Slice 007 declaration atomically with the exact integration SHA and CI
   evidence.
6. Commit and push that documentation-only main-publication record.
7. Require the exact CI run for that documentation commit to pass before
   starting Slice 008.

If CI fails, diagnose and report the exact failure. Do not begin Slice 008
while Slice 007 integration or its publication record is unverified.

## Phase 3 — establish the Slice 008 boundary

Create `slice-008-notifications-reporting-and-audit` from the verified,
up-to-date `main`. Confirm the new branch base and record it before changing
application behavior.

Slice 008 is defined by `docs/delivery/mvp-slices.yaml` and implements only:

- `US-A03`;
- `US-O01`, `US-O02`, and `US-O03`;
- `US-P01` and `US-P02`; and
- `US-Q01` and `US-Q02`.

All are marked `mvp` and `ready` at this prompt's authoring boundary. Verify
that remains true.

Before implementation, perform the complete `AGENTS.md` normative reading
order for those stories:

1. Read their full user stories, acceptance criteria, and applicable NFRs in
   `restaurant-management-system-requirements.md`.
2. Read `docs/product/mvp-scope.yaml`.
3. Read relevant decisions in
   `docs/product/decision-register.md`.
4. Read `docs/domain/model.md`, `docs/domain/workflows.yaml`, and
   `docs/domain/business-rules.md`.
5. Read `docs/config/features.yaml` and
   `docs/security/permissions.yaml`.
6. Read `docs/architecture/modules.yaml`,
   `docs/architecture/consistency.md`, the ADR index, and every relevant
   accepted ADR.
7. Read `docs/architecture/express-implementation-guide.md`.
8. Read the complete affected HTTP and event contracts.
9. Read `docs/data/model.md`, `docs/quality/test-strategy.md`, and
   `docs/quality/traceability.yaml`.
10. Inspect all existing outbox, worker, audit, identity/scope, configuration,
    ordering, Kitchen, Payments, Tables, administration, staff UI, and test
    implementation patterns that Slice 008 will extend.

Do not change behavior until this reading is complete. Compare every approved
source by its declared authority. If approved sources conflict, identify the
exact IDs, stop the affected slice, and report the conflict. Do not invent a
threshold, recipient strategy, retention exception, privacy action, state,
permission, event, or product decision.

Pay particular attention to reconciling `AC-US-P01-01` delayed-item
presentation with `PD-036` and any other approved source governing delay or
urgency. Do not invent a delay threshold or silently broaden the active-order
model.

Create
`docs/delivery/slice-008-notifications-reporting-and-audit.md` before
implementation. Its change declaration must contain:

- `implements`: all applicable `US-*`, `AC-*`, `NFR-*`, and `BR-*` IDs;
- `obeys`: all applicable `PD-*`, `ADR-*`, `CFG-*`, and `PERM-*` IDs;
- `changes`: module ownership, worker/application services, event
  subscriptions, HTTP operations, schema, projections, and UI;
- `tests`: happy path, validation, authorization, tenant isolation,
  concurrency, idempotency, retry, recovery, rebuild, retention, and failure
  cases; and
- `docs`: every normative and delivery artifact that must change atomically.

Do not mark the declaration verified until every Definition of Done check
passes.

## Slice 008 behavior to preserve

The authoritative sources, not this summary, decide behavior. At minimum,
preserve these approved boundaries unless the normative review finds a
conflict:

- Notification types cover new orders, correction/cancellation, ready orders,
  bill requests, payment/refund, and configuration or permission changes.
- Notification eligibility respects effective module configuration, branch
  scope, permission, and assignment.
- Recipient resolution uses branch scope and the permission associated with
  the notification type, provides approved sensible defaults, and warns for
  critical workflows with no eligible recipient.
- The durable notification inbox supports read/acknowledgement state,
  distinguishes handled from unhandled work, controls duplicates/noise, and
  retains inbox history for 30 days without changing audit or source-record
  retention.
- Real-time messages are hints. Reconnect and missed-message recovery use
  authoritative queries.
- Branch dashboards and sales reports enforce authenticated restaurant/branch
  scope and effective reporting permissions.
- Dashboard widgets reflect only enabled modules.
- Sales filters cover the approved restaurant, branch, date-range,
  payment-method, and order-state dimensions. Cancelled and refunded amounts
  remain distinguishable, and totals remain traceable to underlying orders.
- Cross-restaurant or cross-branch views never hide the originating
  restaurant/branch and remain limited to the owner's assigned scope.
- Cross-branch financial totals are grouped by ISO currency. Never perform an
  implicit currency conversion.
- Store timestamps in UTC and derive operating/business dates in each branch's
  IANA time zone.
- Audit queries expose the approved actor, action, target, timestamp, branch,
  and available before/after evidence while preserving tenant scope,
  least-privilege access, immutability, and sensitive-data minimization.
- Safe deactivation preserves historical employee, dish, table, template, and
  branch references and meaningful order snapshots. Referenced operational,
  financial, correction, refund, and audit history is never hard-deleted.
- Privacy deletion/anonymization follows only the approved data-model rules.
  Do not invent a general deletion workflow.

Preserve module ownership:

- Notifications owns its inbox, read/acknowledgement state, and delivery
  attempts.
- Reporting owns operational and daily-sales projections and projection
  checkpoints.
- Audit owns audit events, retention, and queries.
- Source modules keep ownership of their operational tables and publish
  transactional outbox events.
- Post-commit Notifications, Reporting, and Audit consumers process the
  outbox idempotently and recoverably without updating source-module tables.
- Cross-module synchronous work uses only approved contracts and consistency
  modes.

Do not add a broker, microservice split, generic repository, dynamic workflow
engine, external email/SMS/push provider, report export, menu-performance
reporting, stock reporting, implicit currency conversion, hard deletion, or
another post-MVP capability without explicit approved scope and decisions.

## Required implementation and verification quality

Implement the smallest complete vertical Slice 008 outcome across migrations,
domain/application code, PostgreSQL adapters, the worker, composition,
runtime-validated HTTP contracts, event contracts, and responsive
permission-aware administration/staff UI.

Review and test at least:

- transactional outbox consumption, checkpoint advancement, retry after
  failure, restart recovery, duplicate delivery, same-event replay,
  concurrency, poison-event behavior, and projection rebuild;
- notification recipient eligibility, feature/permission changes,
  branch/tenant isolation, grouping, acknowledgement, unread state,
  retention, reconnect recovery, and no-eligible-recipient warnings;
- report authorization and filters, per-branch IANA business dates,
  multi-currency grouping, cancelled/refunded separation, underlying-order
  traceability, replay/rebuild equivalence, and disabled-module widgets;
- audit-query authorization, tenant/branch scope, immutable evidence,
  before/after availability, sensitive-field handling, and existing
  transactional audit compatibility;
- deactivation guards, historical-reference preservation, active-work
  consequences, idempotency/concurrency, last-administrator safety, and
  rollback;
- validation and actionable problem responses without internal-data leakage;
  and
- responsive desktop/narrow layouts, keyboard operation, focus management,
  loading/empty/error/retry states, reconnect behavior, and automated plus
  visual WCAG review.

Update implementation, migrations, OpenAPI, event contracts, module and
consistency documentation, conceptual data model, permissions/features if
the approved boundary requires them, traceability, the Slice 008 declaration,
implementation progress, documentation index, and final handoff atomically.
Do not leave new unlinked `TBD` entries.

Use a new isolated PostgreSQL 18.1 database for final verification. Record the
exact database name, data/log paths if native, port, and process. Never stage
its data tree. Do not reuse or delete an unrelated database or temporary
directory.

With Node.js `24.18.0`, run the exact repository commands from `AGENTS.md`:

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

Supply `TEST_DATABASE_URL` so PostgreSQL integration tests cannot skip, and
apply all migrations from an empty PostgreSQL 18.1 database before the final
test evidence. A focused or earlier run does not verify the final worktree.

Run the complete responsive browser/WCAG suite and visually inspect the
important dashboard, notification inbox, sales-report, audit-query, and
deactivation states at representative desktop and narrow viewports. Record
exact pass counts and inspection evidence.

Do not claim Slice 008 complete until:

- every acceptance criterion and declared test category is satisfied;
- every exact verification command passes on the final worktree;
- all migrations apply from empty;
- contracts, implementation, tests, traceability, and documentation agree;
- the complete diff and worktree have been reviewed;
- the isolated database is stopped and only its exact temporary artifacts are
  removed;
- its port is confirmed free; and
- final evidence is recorded in the declaration, progress document, index,
  and a new Slice 008 handoff.

## Slice 008 publication boundary

After Slice 008 is complete and fully verified:

1. Review the complete diff, status, branch, base, and protected paths.
2. Stage only Slice 008 files. Never stage `.cc-history` or temporary database
   artifacts.
3. Commit with an accurate conventional commit message.
4. Push only `slice-008-notifications-reporting-and-audit` to its matching
   remote branch.
5. Verify the remote ref independently against the local `HEAD`.
6. Record the exact implementation and publication evidence.

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

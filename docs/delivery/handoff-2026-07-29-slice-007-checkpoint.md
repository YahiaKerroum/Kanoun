---
id: HANDOFF-2026-07-29-SLICE-007-CHECKPOINT
status: slice-007-published
owner: engineering
last_reviewed: 2026-07-29
---

# Slice 007 Publication Handoff

## Current status

Slice 007 is complete, verified, committed, and published to
`origin/slice-007-payment-completion-and-correction`. The implementation commit
is `6c167913edaaeff7b5e47e0999b950efd7ffbae7`, and the first remote
verification matched that exact SHA.

The earlier context-compaction sections below are retained as the exact
historical resume record and are superseded by the completion and publication
evidence at the end of this document. No pull request or `main` integration
has occurred. The two `.cc-history` files remain protected and outside the
publication scope.

## Why this checkpoint exists

Working context compacted during the first Slice 007 implementation pass.
The preceding Slice 006 publication checkpoint explicitly requires stopping
immediately at compaction, refreshing this handoff and implementation progress,
and producing a standalone continuation prompt.

Application work therefore stopped at that checkpoint. The work was later
resumed from the standalone prompt, reviewed, completed, and verified as
recorded in the final section of this handoff.

## Published prerequisite state

- Repository: `C:\Users\HP\Desktop\mvp`
- Active branch:
  `slice-007-payment-completion-and-correction`
- Branch base and current `HEAD`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`
- Local `main` and `origin/main`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`
- Slice 006 implementation:
  `e80e9608f375344903943bbafe5ed384651a65db`
- Slice 006 feature-branch publication:
  `0670c04d1441ef2729ee6263c4736d4571251b2c`
- `origin/slice-006-kitchen-and-serving`:
  `0670c04d1441ef2729ee6263c4736d4571251b2c`
- Slice 006 main-integration GitHub Actions run `30442851671` succeeded for
  `0670c04d1441ef2729ee6263c4736d4571251b2c`; both `verify` and
  `dependency-audit` passed.
- The documentation-only main-publication record is
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`.
- GitHub Actions run `30443206834` succeeded for that exact SHA; both
  `verify` and `dependency-audit` passed.
- Slice 006 is complete, verified, integrated, and published. Do not redo it.

## Slice 007 authorization and review

The user explicitly authorized integrating Slice 006 into `main`, then
planning and implementing Slice 007. Slice 006 integration is complete.

The full required normative review was completed before Slice 007 behavior was
changed:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/delivery/mvp-slices.yaml`
4. Exact requirement sections for `US-F04`, `US-H04`, `US-H05`, and
   `US-K01` through `US-K04`, plus the applicable NFRs
5. `docs/product/mvp-scope.yaml`
6. `docs/product/decision-register.md`
7. `docs/domain/model.md`
8. `docs/domain/workflows.yaml`
9. `docs/domain/business-rules.md`
10. `docs/config/features.yaml`
11. `docs/security/permissions.yaml`
12. `docs/architecture/modules.yaml`
13. The ADR index and `ADR-0001` through `ADR-0006`
14. `docs/architecture/consistency.md`
15. `docs/architecture/express-implementation-guide.md`
16. The affected HTTP contract and full event contract
17. `docs/data/model.md`
18. `docs/quality/test-strategy.md`
19. `docs/quality/traceability.yaml`
20. Relevant existing migrations and implementation patterns

All seven Slice 007 stories are marked `mvp` and `ready`. No conflict among
approved sources was found. The required change declaration and exact boundary
are in
`docs/delivery/slice-007-payment-completion-and-correction.md`.

## Approved boundary summary

- Move only a whole open table session to one available table in the same
  branch; never combine sessions.
- Correct only active, unpaid, not-started orders using append-only full item
  revisions. Cancel superseded queued Kitchen work and mark replacements as
  changed.
- Record exactly one manual cash/card payment for an order's full outstanding
  balance. No gateway, partial, split, combined, or table-level payment.
- Preserve payments and refunds as append-only records. Never over-refund.
- Complete normally only when Served and Paid. A critical unpaid override
  requires its permission, recent authentication, confirmation, and reason.
- Cancellation requires a reason, preserves prepared work, cancels only
  unstarted work, resolves open requests, and records required refunds.
- Permit at most one open bill request per order and expose it as an
  authoritative operational staff view. The durable inbox remains Slice 008.
- Close a table session only after every order is terminal and no bill or
  fulfilment work remains unresolved.

## Uncommitted implementation present

The first pass currently includes:

- Migration `0006_payment_completion_and_correction.sql` and journal entry for
  Payments-owned payment/refund ledgers; Ordering correction, bill,
  financial, completion, and cancellation state; table-session movement
  history; and Kitchen change/cancellation metadata.
- New Payments domain, contract, PostgreSQL store, schemas, router, and module
  exports.
- Expanded Ordering, Tables, and Kitchen models, contracts, PostgreSQL stores,
  HTTP schemas/routes, and exports.
- A new `PaymentCompletionService` coordinating permission, feature,
  recent-authentication, idempotency, audit, outbox, correction, payment,
  refund, cancellation, completion, table movement, and session-close work.
- API composition of the Payments store/service/router and the expanded
  Ordering routes.
- Initial customer bill-request UI/API/copy.
- Initial staff Payments workspace and expanded Orders operations for
  correction, table movement, cancellation, and completion.
- Kitchen UI presentation for changed work.
- Small fixture updates to existing API route tests.

This is an unreviewed implementation pass. Known unfinished work includes:

- Review the migration and all store/service transaction and concurrency
  behavior against the approved ownership and consistency rules.
- Apply all seven migrations from an empty PostgreSQL 18.1 database.
- Add comprehensive service integration and API route tests for every declared
  happy, validation, authorization, tenant, idempotency, concurrency, retry,
  rollback, and failure case.
- Review and complete responsive, keyboard, confirmation, stale-state, and
  WCAG behavior; add browser tests.
- Update OpenAPI operations, event contracts if required, conceptual data
  documentation, consistency/module documentation where required, and
  traceability atomically with the implementation.
- Run formatting, lint, strict TypeScript, all PostgreSQL tests, architecture,
  contracts, production builds, browser/WCAG, frozen install, and production
  audit using the pinned toolchain.

A strict TypeScript run was started after frontend fixes immediately before
compaction. Its result was not retained. Treat it as unknown and rerun it;
do not count it as verification evidence. An earlier intermediate type-check
does not verify the current worktree.

## Exact worktree at the stop boundary

Tracked implementation files modified before this documentation refresh:

```text
apps/api/src/composition-root.ts
apps/api/src/kitchen-routes.test.ts
apps/api/src/ordering-routes.test.ts
apps/web/customer/src/App.tsx
apps/web/customer/src/api.ts
apps/web/customer/src/copy.ts
apps/web/staff/src/App.tsx
apps/web/staff/src/KitchenWorkspace.tsx
apps/web/staff/src/OrdersWorkspace.tsx
apps/web/staff/src/styles.css
migrations/meta/_journal.json
packages/modules/src/index.ts
packages/modules/src/kitchen/contracts/kitchen-store.ts
packages/modules/src/kitchen/domain/models.ts
packages/modules/src/kitchen/http/router.ts
packages/modules/src/kitchen/index.ts
packages/modules/src/kitchen/infrastructure/postgres-kitchen-store.ts
packages/modules/src/ordering/contracts/ordering-store.ts
packages/modules/src/ordering/domain/models.ts
packages/modules/src/ordering/http/router.ts
packages/modules/src/ordering/http/schemas.ts
packages/modules/src/ordering/index.ts
packages/modules/src/ordering/infrastructure/postgres-ordering-store.ts
packages/modules/src/payments/index.ts
packages/modules/src/shared/application-error.ts
packages/modules/src/tables/contracts/tables-store.ts
packages/modules/src/tables/domain/models.ts
packages/modules/src/tables/index.ts
packages/modules/src/tables/infrastructure/postgres-tables-store.ts
packages/service-workflow/src/index.ts
```

New implementation files:

```text
apps/web/staff/src/OrderOperations.tsx
apps/web/staff/src/PaymentsWorkspace.tsx
docs/delivery/slice-007-payment-completion-and-correction.md
migrations/0006_payment_completion_and_correction.sql
packages/modules/src/payments/contracts/payments-store.ts
packages/modules/src/payments/domain/models.ts
packages/modules/src/payments/http/router.ts
packages/modules/src/payments/http/schemas.ts
packages/modules/src/payments/infrastructure/postgres-payments-store.ts
packages/service-workflow/src/payment-completion-service.ts
```

This checkpoint also changes only:

```text
docs/index.md
docs/delivery/implementation-progress.md
docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md
```

The following two pre-existing untracked files remain intentional and
protected:

```text
.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md
.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md
```

Never stage, remove, or rewrite `.cc-history` or `.tmp` broadly. Preserve all
uncommitted Slice 007 work. No Slice 007 commit or remote branch publication
has occurred.

## Resume procedure

1. Read this handoff and the implementation-progress document in full.
2. Inspect `git status`, `git diff`, local/remote refs, and the recent log.
3. Confirm the active branch and base exactly match this checkpoint and that
   no unexplained files exist. Stop and report any discrepancy.
4. Activate Node.js `24.18.0` before running repository commands:

   ```powershell
   fnm env --shell powershell | Out-String | Invoke-Expression
   fnm use 24.18.0 | Out-Null
   ```

5. Review the existing implementation rather than recreating it. Start with
   the migration, `PaymentCompletionService`, module stores/routes, and their
   ownership/transaction boundaries.
6. Rerun strict TypeScript because the interrupted run has no usable result.
7. Complete tests, contracts, traceability, documentation, and proportional
   visual/accessibility review.
8. Run the full required verification from an empty isolated PostgreSQL 18.1
   database before claiming completion.
9. Do not commit, push, integrate, or open a pull request without checking the
   resulting scope and receiving any authorization required by the next
   publication step.

## Standalone continuation prompt

```text
Resume the in-progress, unverified SLICE-007 implementation in
C:\Users\HP\Desktop\mvp.

Read in full and in order:
1. AGENTS.md
2. docs/index.md
3. docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md
4. docs/delivery/slice-007-payment-completion-and-correction.md
5. docs/delivery/implementation-progress.md

Expected repository state:
- branch: slice-007-payment-completion-and-correction
- branch base and HEAD:
  c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f
- main and origin/main:
  c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f
- Slice 006 implementation commit:
  e80e9608f375344903943bbafe5ed384651a65db
- origin/slice-006-kitchen-and-serving:
  0670c04d1441ef2729ee6263c4736d4571251b2c
- Slice 006 is complete, integrated, published, and CI-verified
- GitHub Actions run 30442851671 succeeded for the Slice 006 integration SHA
  0670c04d1441ef2729ee6263c4736d4571251b2c
- GitHub Actions run 30443206834 succeeded for the main documentation SHA
  c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f
- both verify and dependency-audit succeeded in both runs
- Slice 007 has substantial uncommitted and unverified implementation work
  exactly documented in the handoff
- no Slice 007 commit, feature-branch push, pull request, or integration exists
- exactly two protected .cc-history files are present
- never stage or remove .cc-history or .tmp broadly

Inspect the worktree, diff, recent history, and local/remote refs before making
any change. Use read-only checks to confirm the active branch, HEAD, main,
origin/main, recent commits, every modified or untracked path, and the two
protected files. Compare the result with the "Exact worktree at the stop
boundary" section of this handoff. If the actual state conflicts with this
checkpoint, stop and report the discrepancy instead of repairing, discarding,
staging, cleaning, or rewriting it.

The complete AGENTS.md normative reading order was already performed for
US-F04, US-H04, US-H05, and US-K01 through US-K04, and no approved-source
conflict was found. The implementation declaration is already present. Review
the authoritative sources again when needed to decide or change behavior; do
not invent a decision, silently override an approved artifact, recreate the
declaration, redo Slice 006, begin Slice 008, or expand Slice 007.

Preserve this exact Slice 007 boundary:
- whole-table-session moves only; never combine sessions
- corrections are append-only full item revisions and are allowed only while
  the order is active, unpaid, and not started in Kitchen
- superseded queued work is cancelled and replacement work is marked changed
- payment is one manual cash/card record for the order's exact outstanding
  balance and currency
- payments and refunds remain append-only, and cumulative refunds cannot
  exceed the original payment
- normal completion requires Served and Paid
- unpaid completion requires orders.complete_unpaid, recent authentication,
  explicit confirmation, and a reason
- cancellation is reasoned, preserves prepared history, cancels only unstarted
  work, resolves open requests, and records any required refund
- at most one bill request is open per order; the durable inbox stays Slice 008
- a table session closes only when all orders are terminal and no bill or
  fulfilment work remains unresolved
- no partial/split/combined/table-level payment, gateway, fiscal receipt, tip,
  discount, service charge, table combining, partial serving, or hard deletion

The uncommitted first pass already contains:
- migration 0006 and its journal entry
- Payments domain, store contract, PostgreSQL adapter, HTTP schemas/router,
  and exports
- expanded Ordering, Tables, and Kitchen domain/store/router behavior
- PaymentCompletionService orchestration
- API composition-root wiring
- customer bill-request UI/API/copy
- staff PaymentsWorkspace and OrderOperations
- Kitchen changed-work presentation
- only small fixture adjustments in existing API tests

Do not recreate those changes. Review them carefully, beginning with:
1. migration ownership, constraints, append-only protection, indexes, triggers,
   foreign keys, and clean-database applicability
2. PaymentCompletionService transaction boundaries, module contracts,
   authorization, feature checks, tenant/branch scope, recent-auth checks,
   idempotency replay/conflict behavior, audit, outbox, rollback, and
   concurrency
3. Ordering, Payments, Tables, and Kitchen PostgreSQL stores for write
   ownership, locking, stale versions, immutable history, and cross-module
   consistency
4. HTTP runtime validation, problem responses, composition, and route tests
5. customer/staff UI accuracy, permission gates, confirmation, retry,
   authoritative refresh, stale-state behavior, keyboard use, responsiveness,
   and WCAG

Activate the pinned toolchain before running repository commands:

fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null

Confirm node --version is v24.18.0 and use corepack/pnpm commands exactly as
documented in AGENTS.md. The strict TypeScript command started immediately
before the previous context compaction has no retained result. Treat it as
unknown and rerun it; no intermediate check verifies the current worktree.

Known unfinished work:
- review and correct the migration and implementation
- add comprehensive service integration and API route coverage for happy,
  validation, authorization, tenant isolation, stale-version, idempotency,
  concurrency, retry, over/underpayment, over-refund, cancellation,
  completion, session-close, and rollback cases
- add and visually inspect responsive browser/WCAG coverage
- update OpenAPI, event contracts where required, architecture/consistency,
  conceptual data documentation, traceability, progress, declaration, index,
  and final handoff atomically
- apply all seven migrations from an empty isolated PostgreSQL 18.1 database
- run frozen install, formatting, lint, strict TypeScript, PostgreSQL-enabled
  tests, architecture checks, OpenAPI/all event-contract validation, every
  production build, the complete browser/WCAG suite, and the production audit
- stop the isolated database, remove only its exact temporary artifacts, and
  confirm its assigned port is free

Do not claim Slice 007 complete until every required check passes and the
evidence is recorded. Inspect the final diff and status before any publication
step. Do not stage protected files. Do not commit, push, integrate into main,
or open a pull request without the appropriate next authorization.

Context-compaction instruction:
If working context compacts again at any point before Slice 007 is fully
completed, verified, and safely checkpointed, stop immediately. Do not continue
implementation, testing, staging, committing, pushing, cleanup, or publication
from summarized memory. Perform only the minimum read-only inspection needed
to capture the exact branch, HEAD, refs, worktree, commands in flight, and
known/unknown verification results. Then refresh this handoff and
docs/delivery/implementation-progress.md, create a new dated standalone
continuation prompt containing the complete current state and this same
context-compaction instruction, and return control to the user. Never infer
that an interrupted command passed.
```

## Context-compaction checkpoint 2

Working context compacted again on 2026-07-29 before Slice 007 was complete.
All implementation, testing, cleanup, and publication work stopped
immediately. The only actions taken after compaction were the minimum
read-only state inspection and these required checkpoint-document updates.

The continuation prompt for this stop boundary is
`docs/delivery/continuation-prompt-2026-07-29-slice-007-compaction-2.md`.

### Exact repository and process state

- pinned runtime confirmed: Node.js `v24.18.0`
- active branch: `slice-007-payment-completion-and-correction`
- `HEAD`, `main`, and `origin/main`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`
- `origin/slice-006-kitchen-and-serving`:
  `0670c04d1441ef2729ee6263c4736d4571251b2c`
- `origin/slice-007-payment-completion-and-correction`: absent
- no Slice 007 commit, stage, push, pull request, or integration exists
- no command was in flight when context compacted
- 38 tracked modifications and 15 non-PostgreSQL untracked paths existed
  before the new continuation prompt was created
- exactly two protected `.cc-history` files remain present and unmodified

The isolated native PostgreSQL 18.1 cluster remains running because the
compaction rule forbids cleanup:

- data: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007`
- log: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007.log`
- database/user: `rms_slice007` / `rms`
- address: `127.0.0.1:55437`
- server PID at this checkpoint: `16772`
- the port was confirmed listening
- the data tree contained 1,479 generated files and the log was 2,138 bytes

Do not stage the PostgreSQL tree. When Slice 007 is otherwise complete, stop
the cluster and remove only those exact temporary artifacts, then confirm port
`55437` is free.

### Work completed since checkpoint 1

The uncommitted implementation was reviewed and corrected in these areas:

- migration constraints, indexes, cross-record foreign keys, unpaid-reason
  enforcement, nonnegative correction totals, whole-session movement
  uniqueness, and administrator permission-template/backfill reachability
- whole-session table moves now update Ordering guest/order references and
  Kitchen live-work snapshots atomically, with destination locking corrected
  for concurrent occupancy
- replay now addresses exact bill, payment, and refund records
- guest bill requests lock and verify the owned branch-scoped order
- refund lock ordering was aligned with cancellation, terminal-order
  overrestriction was removed, and cancellation emits refund audit evidence
- bill resolution events and final authoritative order refreshes were added
  to completion and cancellation
- automatic table-session closure now records the current actor and audit
- stale correction versions now produce concurrency conflicts before state
  guards
- HTTP money, confirmation, and unpaid-reason validation was tightened
- staff retry keys survive failed retries; payment/refund/correction/table
  refresh behavior and actionable errors were improved
- the React 19 event-lifetime quantity defect was fixed
- customer cart opacity animation was removed after a transient contrast
  failure
- service integration, API route, and focused browser/WCAG coverage was added

### Known verification evidence

These are historical intermediate results, not final-worktree verification:

- all seven migrations applied successfully from an empty isolated PostgreSQL
  18.1 database after the duplicate-trigger defect was removed
- the payment-completion integration suite passed `10/10`, but stale-version
  and append-only assertions were added afterward, so the current suite result
  is unknown
- targeted Ordering and Payments API route tests passed `13/13`
- focused staff payment/refund, correction retry, permission-gate, and unpaid
  confirmation browser tests passed `4/4`
- the focused customer main-order flow passed after the contrast fix
- strict TypeScript passed at earlier intermediate points, but later edits
  were made; the current worktree type-check result is unknown

No final frozen install, formatting, lint, current strict TypeScript,
PostgreSQL-enabled full tests, architecture tests, contract validation,
production builds, complete browser/WCAG suite, or production audit has been
run for the current worktree.

### Precise unfinished boundary

`docs/contracts/openapi.yaml` is currently in an incomplete intermediate edit.
New Slice 007 paths were expanded, but required component parameter and schema
definitions have not yet been added. Contract validation is expected to fail
until that edit is completed. In particular, resume with `PaymentId`, the
bill/payment/refund mutation and ledger schemas, correction/cancellation/table
move request schemas, and the expanded Order/Kitchen representations.

The event contract likely still needs `ordering.order_corrected.v1`, and the
module publish lists, consistency documentation, conceptual data model,
traceability, Slice 007 declaration, progress, index, and final handoff still
need atomic completion. The implementation/service tests need a current rerun
and any missing authorization, isolation, concurrency, rollback, and route
cases must be completed. The full responsive visual/WCAG inspection and the
entire Definition of Done verification remain pending.

Do not infer that any interrupted, earlier, or focused command proves the
current worktree.

## Slice 007 completion evidence

The checkpoint was resumed with Node.js `v24.18.0` after the branch, SHAs,
local/remote refs, complete worktree, protected paths, and isolated PostgreSQL
root/port matched the recorded boundary exactly.

The unfinished contract and documentation work is complete:

- OpenAPI defines every Slice 007 operation, parameter, request, mutation,
  ledger, Order, and Kitchen representation used by the implementation.
- `ordering.order_corrected.v1` is the 42nd validated integration event, and
  event ownership/publish/subscription lists are aligned.
- module contracts, transaction consistency, conceptual data ownership,
  permissions, traceability, the implementation declaration, progress, and
  documentation index are aligned.
- `.gitignore` now narrowly exempts `docs/data/model.md` from the runtime
  `data/` rule so the existing authoritative conceptual model and this
  required update are visible to publication without exposing runtime data.
- final implementation review fixed the six optional-chain lint findings
  without changing the validated behavior.

Final verification used a newly created empty `rms_slice007_final` database in
the isolated native PostgreSQL 18.1 cluster:

- `corepack pnpm install --frozen-lockfile`: passed with pnpm `11.17.0`;
- all seven migrations: applied successfully from empty;
- `corepack pnpm format:check`: passed;
- `corepack pnpm lint`: passed;
- `corepack pnpm typecheck`: passed;
- `corepack pnpm test` with `TEST_DATABASE_URL`: 24 files and `189/189`
  tests passed;
- `corepack pnpm test:architecture`: 136 modules and 247 dependencies with no
  violations, plus `3/3` tests passed;
- `corepack pnpm contracts:lint`: OpenAPI and all 42 event contracts passed;
- `corepack pnpm build`: all 10 workspace build targets passed;
- `corepack pnpm test:browser`: all `23/23` Chromium responsive/WCAG tests
  passed;
- traced narrow-screen customer bill-request, payment/refund,
  correction-retry, and whole-session movement states were visually inspected
  with no clipping, page overflow, contrast, hierarchy, or control-visibility
  defect found;
- `corepack pnpm audit --prod --audit-level high`: no known vulnerabilities.

At this completion checkpoint, Slice 007 remained intentionally uncommitted
and unpublished. The later feature-branch publication is recorded below.

The isolated verification cluster was then stopped cleanly. Only
`C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007` and
`C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007.log` were removed. Both paths
are absent, no matching PostgreSQL process remains, and port `55437` has zero
listeners.

Pre-publication final repository inspection found 43 tracked modifications
and 17 untracked paths. Fifteen untracked paths belong to Slice 007; the other
two are the protected `.cc-history` files, whose byte sizes and UTC
modification times remain identical to the resume boundary. Nothing was
staged. At that inspection, the active branch, `HEAD`, `main`, and
`origin/main` were at `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`, and no
remote Slice 007 branch existed.

## Feature-branch publication

- Implementation commit:
  `6c167913edaaeff7b5e47e0999b950efd7ffbae7`.
- Published branch:
  `origin/slice-007-payment-completion-and-correction`.
- The first post-push `git ls-remote` result matched the implementation
  commit exactly.
- This documentation-only follow-up records the feature-branch publication.
- No pull request was opened and `main` remains unchanged at
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`.
- The protected `.cc-history` files were neither staged nor modified.

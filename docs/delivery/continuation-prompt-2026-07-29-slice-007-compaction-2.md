---
id: CONTINUATION-2026-07-29-SLICE-007-COMPACTION-2
status: superseded-historical-record
superseded_by: HANDOFF-2026-07-29-SLICE-007-CHECKPOINT
last_reviewed: 2026-07-29
---

# Historical Slice 007 continuation prompt — compaction checkpoint 2

> [!IMPORTANT]
> Do not execute this continuation prompt. It preserves the exact state of an
> interrupted, pre-verification checkpoint and is retained only as a historical
> record. Slice 007 was subsequently completed, verified, committed, and
> published to `origin/slice-007-payment-completion-and-correction`.
>
> The verified implementation commit is
> `6c167913edaaeff7b5e47e0999b950efd7ffbae7`; the publication-documentation
> commit and current published branch head is
> `7e2a829be77ca02a16d46ea2f8382d926a703be9`. Use
> `docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md` for the current
> status.

## Original checkpoint prompt

Work in `C:\Users\HP\Desktop\mvp`.

Read in full and in order:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md`
4. `docs/delivery/slice-007-payment-completion-and-correction.md`
5. `docs/delivery/implementation-progress.md`

This prompt records a mandatory context-compaction stop on 2026-07-29. Do not
continue from summarized memory. Before changing anything, activate the pinned
toolchain and perform read-only checks:

```powershell
fnm env --shell powershell | Out-String | Invoke-Expression
fnm use 24.18.0 | Out-Null
```

Confirm `node --version` is `v24.18.0`. Inspect the branch, HEAD, `main`,
`origin/main`, recent history, local/remote refs, complete worktree, exact
protected paths, and isolated PostgreSQL process/port before any change. If
the actual state conflicts with this checkpoint, stop and report it; do not
repair, discard, stage, clean, or rewrite anything.

## Expected repository state

- branch: `slice-007-payment-completion-and-correction`
- branch base and `HEAD`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`
- `main` and `origin/main`:
  `c04c4bd5df6ad9f70ac42fa13b0148b1b3410e2f`
- Slice 006 implementation:
  `e80e9608f375344903943bbafe5ed384651a65db`
- `origin/slice-006-kitchen-and-serving`:
  `0670c04d1441ef2729ee6263c4736d4571251b2c`
- `origin/slice-007-payment-completion-and-correction`: absent
- no Slice 007 commit, stage, push, pull request, or integration exists
- exactly two protected history files exist:
  - `.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md`
  - `.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md`
- never stage, remove, or broadly clean `.cc-history` or `.tmp`

The non-PostgreSQL worktree at the stop boundary contained these 38 tracked
modifications:

```text
apps/api/src/composition-root.ts
apps/api/src/kitchen-routes.test.ts
apps/api/src/ordering-routes.test.ts
apps/web/customer/src/App.tsx
apps/web/customer/src/api.ts
apps/web/customer/src/copy.ts
apps/web/customer/src/styles.css
apps/web/staff/e2e/customer-menu.spec.ts
apps/web/staff/e2e/shell.spec.ts
apps/web/staff/src/App.tsx
apps/web/staff/src/KitchenWorkspace.tsx
apps/web/staff/src/OrdersWorkspace.tsx
apps/web/staff/src/styles.css
docs/contracts/openapi.yaml
docs/delivery/implementation-progress.md
docs/index.md
docs/security/permissions.yaml
migrations/meta/_journal.json
packages/modules/src/identity-access/domain/permission-catalog.ts
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

It contained these 15 non-PostgreSQL untracked paths before this continuation
prompt itself was created:

```text
.cc-history/2026-07-27_202838_ide_selectionThe-user-selected-the-lin_df29609f.md
.cc-history/2026-07-27_221727_ide_selectionThe-user-selected-the-lin_14ae81bf.md
apps/api/src/payments-routes.test.ts
apps/web/staff/src/OrderOperations.tsx
apps/web/staff/src/PaymentsWorkspace.tsx
docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md
docs/delivery/slice-007-payment-completion-and-correction.md
migrations/0006_payment_completion_and_correction.sql
packages/modules/src/payments/contracts/payments-store.ts
packages/modules/src/payments/domain/models.ts
packages/modules/src/payments/http/router.ts
packages/modules/src/payments/http/schemas.ts
packages/modules/src/payments/infrastructure/postgres-payments-store.ts
packages/service-workflow/src/payment-completion-service.integration.test.ts
packages/service-workflow/src/payment-completion-service.ts
```

This continuation-prompt file is now one additional expected untracked path.

## Isolated PostgreSQL state

A native PostgreSQL 18.1 cluster is intentionally still running:

- executable root: `C:\Program Files\PostgreSQL\18\bin`
- data: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007`
- log: `C:\Users\HP\Desktop\mvp\.tmp\postgres-slice007.log`
- database: `rms_slice007`
- user: `rms`
- address: `127.0.0.1:55437`
- checkpoint server PID: `16772`
- `DATABASE_URL=postgresql://rms@127.0.0.1:55437/rms_slice007`
- `TEST_DATABASE_URL=postgresql://rms@127.0.0.1:55437/rms_slice007`

At the stop boundary, port `55437` was listening, the data tree contained
1,479 generated files, and the log was 2,138 bytes. PID/file counts may change
normally while the server runs; verify the data root and port rather than
assuming the PID is stable. Do not stage the tree. Do not stop or delete it
until the resumed Slice 007 work reaches its exact cleanup step. Then stop the
cluster, remove only these exact temporary artifacts, and confirm port `55437`
is free.

## Scope and source-of-truth boundary

The complete normative reading order was performed for `US-F04`, `US-H04`,
`US-H05`, and `US-K01` through `US-K04`; no approved-source conflict was found.
The implementation declaration already exists. Re-read authoritative sources
when a behavioral decision is needed. Do not invent a decision, recreate the
declaration, redo Slice 006, begin Slice 008, or expand Slice 007.

Preserve:

- whole-table-session moves only; never combine sessions
- corrections are append-only full item revisions, only while the order is
  active, unpaid, and not started in Kitchen
- superseded queued work is cancelled and replacement work is marked changed
- one manual cash/card payment for the exact outstanding order balance and
  currency
- append-only payments/refunds; cumulative refunds cannot exceed the payment
- normal completion requires Served and Paid
- unpaid completion requires `orders.complete_unpaid`, recent authentication,
  explicit confirmation, and a reason
- cancellation is reasoned, preserves prepared history, cancels only
  unstarted work, resolves open requests, and records required refund
- at most one open bill request per order; the durable inbox stays Slice 008
- close a table session only when all orders are terminal and no bill or
  fulfilment work remains unresolved
- no partial/split/combined/table-level payment, gateway, fiscal receipt, tip,
  discount, service charge, table combining, partial serving, or hard deletion

## Uncommitted implementation and review corrections

The first pass already contained migration 0006, Payments domain/store/HTTP
implementation, Ordering/Tables/Kitchen expansion, orchestration, composition,
customer bill-request UI, staff payment/order operations, changed Kitchen work,
and fixture adjustments. Do not recreate it.

Review work then corrected:

1. Migration: unpaid reasons, nonnegative correction totals, session/version
   movement uniqueness, payment/refund composite integrity, administrator
   template reachability/backfill, and duplicate-trigger behavior.
2. Whole-session moves: Ordering guest/order references and Kitchen live-work
   snapshots now move in the same orchestration transaction; destination
   occupancy is freshly checked after locking.
3. Replay and scope: bill/payment/refund replay addresses exact record IDs;
   guest bill requests lock the order and verify ownership/branch.
4. Refund and cancellation: lock order was aligned, an undocumented
   terminal-order restriction was removed, and automatic refunds emit audit.
5. Bill and session outcomes: completion/cancellation emit bill-resolution
   events and refresh the final order; automatic table closure records actor
   and audit.
6. Concurrency and validation: stale correction versions return concurrency
   conflict first; money, confirmation, and unpaid-reason schemas tightened.
7. UI: retry idempotency keys persist after failures; authoritative refresh,
   refund controls, and actionable errors improved; a React 19 event-lifetime
   defect and transient cart contrast animation were fixed.
8. Tests: service integration, route, and focused browser/WCAG coverage added.

## Known and unknown verification

Known intermediate evidence:

- all seven migrations applied successfully from empty PostgreSQL 18.1 after
  fixing the duplicate-trigger defect
- the service integration suite passed `10/10` before later stale-version and
  append-only assertions were added
- targeted Ordering/Payments route tests passed `13/13`
- focused staff payment/refund, correction retry, permission gate, and unpaid
  confirmation browser tests passed `4/4`
- the customer main-order flow passed after the contrast fix
- strict TypeScript passed at earlier intermediate points

Current-worktree results that must be treated as unknown:

- service integration after the latest assertions
- strict TypeScript after the latest UI/test/OpenAPI edits
- all full-suite and final Definition of Done checks

No command was in flight at compaction. Never infer that an earlier,
interrupted, targeted, or focused run passed the current worktree.

## Resume point

Begin by completing—not reverting or recreating—the incomplete
`docs/contracts/openapi.yaml` edit. The paths were expanded, but the required
`PaymentId` component parameter, bill/payment/refund ledger and mutation
schemas, correction/cancellation/table-move requests, and expanded
Order/Kitchen representations remain missing. Contract lint is expected to
fail until this is finished.

Then:

1. add `ordering.order_corrected.v1` if confirmed missing and align event/module
   publish ownership
2. complete architecture consistency, conceptual data model, traceability,
   declaration, progress, index, and final handoff atomically
3. review and rerun coverage for happy, validation, authorization, tenant
   isolation, stale version, idempotency, concurrency, retry,
   over/underpayment, over-refund, cancellation, completion, session close,
   and rollback
4. run and visually inspect the full responsive browser/WCAG suite
5. run the exact AGENTS.md verification commands with Node.js `24.18.0`:
   frozen install, format/check, lint, strict TypeScript, PostgreSQL-enabled
   tests, architecture tests, contract lint, all builds, complete browser
   tests, and production audit
6. record exact evidence, inspect final diff/status, stop the isolated database,
   remove only its exact artifacts, and confirm port `55437` is free

Do not claim Slice 007 complete until every required check passes and evidence
is recorded. Do not stage protected files. Do not commit, push, integrate into
main, or open a pull request without explicit next authorization.

## Mandatory context-compaction instruction

If working context compacts again at any point before Slice 007 is fully
completed, verified, and safely checkpointed, stop immediately. Do not
continue implementation, testing, staging, committing, pushing, cleanup, or
publication from summarized memory. Perform only the minimum read-only
inspection needed to capture the exact branch, HEAD, refs, worktree, commands
in flight, and known/unknown verification results. Then refresh
`docs/delivery/handoff-2026-07-29-slice-007-checkpoint.md` and
`docs/delivery/implementation-progress.md`, create a new dated standalone
continuation prompt containing the complete current state and this same
context-compaction instruction, and return control to the user. Never infer
that an interrupted command passed.

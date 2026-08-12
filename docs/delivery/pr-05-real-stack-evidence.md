---
id: PR-05-REAL-STACK-EVIDENCE
status: verified
version: 1.0
owner: engineering
last_reviewed: 2026-08-11
---

# PR-05 real-stack verification evidence

This record contains redacted, repeatable evidence for the PR-05 publication.
It intentionally excludes database URLs, credentials, session values, recovery
tokens, tenant identifiers, and Playwright artifacts.

## Target-bound run records

Each publication records its final built run in a committed, redacted
`docs/delivery/pr-05-real-stack-run-<source-sha>.md` file. A record identifies
the exact executable source revision, Node and pnpm versions, command, suite
summary, and teardown result. It contains no database URL, credential, session,
or recovery-token value. Successful Playwright output is intentionally removed;
the committed run record and the CI job log are the durable success evidence.
The current record is
[`pr-05-real-stack-run-73d32b0.md`](pr-05-real-stack-run-73d32b0.md).

The 11 cases cover owner setup and invitation-created staff access; malformed,
active, and revoked QR entry; idempotent customer ordering; UI-driven kitchen,
service, payment, completion, and refund operations; append-only correction and
cancellation with a stale-version conflict; active work across dependency-safe
feature disablement; tenant and session isolation; stopped-worker backlog and
restart drain; a real EventSource reconnect after offline/online recovery; a
loopback-delivered recovery token opened through the recovery inbox and
completed through the staff UI; and session revocation.

## Supporting verification

- `corepack pnpm exec tsx scripts/real-e2e-guard.ts`: passed.
- `corepack pnpm test:browser:mocked`: separate UI/contract component coverage.
- `corepack pnpm typecheck`, formatting, lint, build, contract, architecture,
  and audit checks are required before publication.
- Recovery delivery is loopback-only, synthetic, in-memory, run-scoped, and
  closed during both success and failure cleanup. No external email is used.
- Chromium is the primary full-stack browser. Firefox/WebKit release coverage
  and PR-06 visual/performance work remain out of scope.

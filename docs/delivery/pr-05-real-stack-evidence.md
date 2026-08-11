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

## Independent built runs

Both runs used the default build path:

```text
REAL_E2E_BASE_DATABASE_URL=<redacted loopback PostgreSQL URL> corepack pnpm test:browser:real
```

| Run | Database | Processes | Result | Teardown |
| --- | --- | --- | --- | --- |
| 1 | Fresh marked `rms_e2e_*` database | API, worker, Customer, Staff, Administration, in-memory recovery delivery | 11 passed | Owned processes stopped and marked database removed |
| 2 | Fresh distinct marked `rms_e2e_*` database | API, worker, Customer, Staff, Administration, in-memory recovery delivery | 11 passed | Owned processes stopped and marked database removed |

Each run used dynamic loopback ports, applied migrations, provisioned two
synthetic tenants, and ran one ordered Chromium worker. The real-suite source
guard passed before the browser run. Successful Playwright output was removed;
failure output remains configured for diagnosis and CI upload.

The 11 cases cover owner setup and invitation-created staff access; malformed,
active, and revoked QR entry; idempotent customer ordering; UI-driven kitchen,
service, payment, completion, and refund operations; append-only correction and
cancellation with a stale-version conflict; active work across dependency-safe
feature disablement; tenant and session isolation; stopped-worker backlog and
restart drain; offline/online notification recovery; generic recovery delivery;
and session revocation.

## Supporting verification

- `corepack pnpm exec tsx scripts/real-e2e-guard.ts`: passed.
- `corepack pnpm test:browser:mocked`: passed in the prior PR-05 verification
  pass; this remains separate UI/contract component coverage.
- `corepack pnpm typecheck`, formatting, lint, build, contract, architecture,
  and audit checks were run on the isolated worktree.
- Recovery delivery is loopback-only, synthetic, in-memory, run-scoped, and
  closed during both success and failure cleanup. No external email is used.
- Chromium is the primary full-stack browser. Firefox/WebKit release coverage
  and PR-06 visual/performance work remain out of scope.

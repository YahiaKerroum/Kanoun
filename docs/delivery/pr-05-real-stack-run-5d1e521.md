---
id: PR-05-REAL-STACK-RUN-5D1E521
status: verified
owner: engineering
source_revision: 5d1e521d9b5bd311b448674860f74cedd9257291
recorded_at: 2026-08-12
---

# PR-05 real-stack run record — 5d1e521

This is a redacted, target-bound record for the final executable PR-05 source
revision. It contains no database URL, credential, session value, or recovery
token.

| Field | Value |
| --- | --- |
| Node.js | `v24.18.0` |
| pnpm | `11.17.0` |
| Command | `REAL_E2E_BASE_DATABASE_URL=<redacted loopback PostgreSQL URL> corepack pnpm test:browser:real` |
| Runner | Built API, worker, Customer, Staff, Administration, and loopback recovery delivery |
| Browser | Chromium, one ordered real-stack worker |
| Result | `11 passed (43.2s)`; process exit `0` |
| Recovery artifact safety | Trace, screenshots, and video are off; recovery-link checks return booleans rather than token-bearing matcher values |
| Teardown | Runner exit `0`; post-run inspection found no `output/playwright/real` directory and no `rms_e2e_*` database |

The passing set includes owner setup; menu/table/QR; idempotent order retry;
kitchen/service/cashier/refund close; append-only correction/cancellation;
feature disablement; tenant isolation; worker recovery; a fresh EventSource
reconnect after offline/online recovery; loopback-delivered password recovery
through the staff UI; and revoked-session handling.

The repository's `browser-real` CI job reruns this same command on every push to
`main` and never uploads raw Playwright output.

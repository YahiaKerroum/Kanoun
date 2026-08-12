---
id: PR-05-REAL-STACK-RUN-ACE3D305
status: verified
owner: engineering
source_revision: ace3d305e4703641d14c84b14cb29de400eb5a5c
recorded_at: 2026-08-12
---

# PR-05 real-stack run record — ace3d305

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
| Result | `11 passed (44.0s)`; process exit `0` |
| Teardown | Runner exit `0`; post-run inspection found no `output/playwright/real` directory and no `rms_e2e_*` database |

The passing set includes owner setup; menu/table/QR; idempotent order retry;
kitchen/service/cashier/refund close; append-only correction/cancellation;
feature disablement; tenant isolation; worker recovery; a fresh EventSource
reconnect after offline/online recovery; loopback-delivered password recovery
through the staff UI; and revoked-session handling.

The repository's `browser-real` CI job reruns this same command on every push to
`main` and retains diagnostic artifacts only when the job fails.

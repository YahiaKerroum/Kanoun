---
id: OPS-REAL-E2E
status: approved
version: 1.0
owner: engineering
last_reviewed: 2026-08-11
---

# Real-stack browser verification

Run the product gate with Node.js `24.18.0`, pnpm `11.17.0`, and a loopback
PostgreSQL server:

```powershell
$env:REAL_E2E_BASE_DATABASE_URL = "postgresql://rms:rms_local_only@127.0.0.1:5432/rms"
corepack pnpm test:browser:real
```

The runner creates a unique `rms_e2e_*` database, applies migrations, starts
API, worker, Customer, Staff, and Administration previews on dynamic loopback
ports, and provisions synthetic tenants. It removes only the marked run
database and processes it owns. It refuses production mode, non-loopback
PostgreSQL, and database names outside the `rms_e2e_*` namespace.

`REAL_E2E_BASE_DATABASE_URL` may be omitted when `TEST_DATABASE_URL` or
`DATABASE_URL` already points to a safe loopback server. Set
`REAL_E2E_SKIP_BUILD=true` only for local iteration after a verified build; CI
always uses the default build path.

For UI/contract component coverage with first-party request fixtures, run:

```powershell
corepack pnpm test:browser:mocked
```

The mocked suite and the real-stack suite are intentionally separate. Real-run
failure artifacts remain under `output/playwright/real` until inspected; a
successful run removes that directory. CI never uploads this raw directory.
Do not commit generated artifacts.

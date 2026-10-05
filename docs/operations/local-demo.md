---
id: OPS-LOCAL-DEMO
status: approved
version: 1.0
owner: engineering
last_reviewed: 2026-08-08
source_of_truth_for:
  - local-demo-operation
---

# Local professional demo

The professional demo is a local-only operating mode for showing the current
MVP through real API, worker, PostgreSQL, customer, staff, and administration
processes. It uses synthetic Dar Nedjma / Hydra data and never creates a public
signup path.

## Start

Copy `.env.example` to `.env`, keep the explicit `DEMO_DATABASE_*` values, and
run:

```text
corepack pnpm install --frozen-lockfile
corepack pnpm dev:demo
```

The command builds the workspace, verifies PostgreSQL, resets only the marked
loopback `rms_demo` database, applies every migration, seeds the deterministic
restaurant scenario, starts API/worker/customer/staff/administration, waits for
readiness, and then prints the loopback launcher address. A password is either
read from the local-only `DEMO_SEED_PASSWORD` value or generated for the run;
it is kept out of process logs.

When Docker is unavailable, an existing loopback PostgreSQL service is reused
when the configured role can create the marked database. If that role is
restricted, the supervisor starts a temporary owned PostgreSQL 18 loopback
cluster instead, removes its temporary data directory on shutdown, and keeps
the Docker-backed path unchanged when Docker is available.

Open the launcher address in a browser. It provides owner/administration,
general staff, kitchen, cashier, and customer table-menu entry points. Role
links perform the existing server-side login contract before redirecting to
the appropriate application. The customer link is issued by the existing
Tables service contract and is retained only in the local run and launcher.

For the owner walkthrough, open Administration and choose Setup. Confirm the
server-derived checklist, select the provisioned restaurant and branch, review
the branch time zone/currency and Sunday-first hours editor, then follow the
Workforce, Menu, and Tables & QR links. Refresh after each server-side change;
the Staff workspace link appears only after the core identity, branch, hours,
service-status, feature, and workforce prerequisites are ready. The existing
branch-closure authority remains server-side; no closure-editing URL is
invented by the demo guide.

The launcher also links to a loopback-only recovery inbox on port `4171`. It is
an in-memory delivery substitute for this synthetic run: the API still returns
the same generic recovery response, no email or production delivery is claimed,
and the inbox disappears when `corepack pnpm dev:demo` stops. Use it only to
exercise the recovery completion form locally; do not capture the one-time URL
in screenshots or retain it outside the run.

## Browser isolation

Use a separate browser context or profile for every role. The repository
provides a Playwright helper that fetches only the launcher manifest and opens
one context per role plus the customer URL:

```text
```

The helper keeps the browser open until `Ctrl+C`. For manual browser work,
use separate temporary profiles or Playwright `browser.newContext()` calls;
never reuse an administrator session while checking staff authorization.

## Reset and stop

The demo is deliberately repeatable. Stop the supervisor with `Ctrl+C`; it
terminates only processes started by that invocation and leaves the isolated
demo database in place. Run `corepack pnpm dev:demo` again to reset it and
recover any forgotten run password. A PostgreSQL service already running on
loopback is reused. If Docker is available and PostgreSQL is unavailable, the
supervisor starts the repository `postgres` service and stops only that service
when the demo exits.

The supervisor refuses to proceed when the demo URL is missing its explicit
safety marker, uses a non-loopback host, targets a database other than
`rms_demo`, or runs in production mode. It also refuses to modify an existing
database whose marker is absent or does not match
`MISE_LOCAL_SYNTHETIC_DEMO_V1`.

## Normal verification path

The normal demonstration path is the launcher. It is not necessary to inspect
SQL, call API endpoints manually, or read generated tokens. The supervisor's
real-stack smoke checks already cover API/worker readiness, all four staff
logins, the customer URL, and table QR session exchange before the launcher is
shown.

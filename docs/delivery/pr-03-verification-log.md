# PR-03 verification log

This tracked transcript records the final PR-03 verification commands and
their observable results. It contains no credentials, session tokens, raw QR
tokens, or personal data. PR-04 and PR-05 were not started.

Captured on 2026-08-09 in `C:\Users\HP\Desktop\mvp` with the repository
toolchain selected explicitly:

```text
Node.js v24.18.0
pnpm 11.17.0 via Corepack
PostgreSQL integration enabled through TEST_DATABASE_URL loaded from .env
```

## Automated verification

Command:

```text
corepack pnpm check
```

Result:

```text
All matched files use Prettier code style!
35 test files passed
237 tests passed
no dependency violations found (179 modules, 358 dependencies cruised)
Validated 43 integration event contracts.
apps/web/admin, apps/web/customer, apps/web/staff, API, worker, and package builds passed.
```

Command:

```text
corepack pnpm audit --prod --audit-level high
```

Result:

```text
No known vulnerabilities found
```

Focused commands also passed:

```text
corepack pnpm exec vitest run apps/web/admin/src/setup-readiness-api.test.ts apps/web/admin/src/setup-readiness-model.test.ts
2 files passed, 9 tests passed

corepack pnpm exec vitest run apps/web/admin/src/use-setup-readiness-data.test.ts
1 file passed, 1 test passed

corepack pnpm exec vitest run apps/web/admin/src/setup-readiness-model.test.ts packages/modules/src/restaurant-configuration/domain/branch-acceptance.test.ts packages/service-workflow/src/tenant-owner-service.test.ts
3 files passed, 18 tests passed

corepack pnpm exec playwright test --workers=1 apps/web/staff/e2e/pr-03-guided-setup.spec.ts
1 test passed

DEMO_LAUNCHER_URL=http://127.0.0.1:4170 corepack pnpm test:browser:pr03:real-stack
1 test passed
```

The focused mocked browser journey covers open → closed with a reason → open,
the two-restaurant context switch, accessible controls, and the 375px layout.
The real-stack journey creates a restaurant and branch through the live demo
stack, opens service with a reason, and reaches core setup readiness.

## Manual and structural checks

- TypeScript LSP diagnostics for `apps/web/admin/src`: 14 files scanned, 0
  errors.
- `git diff --check`: passed.
- Playwright visual inspection covered `/setup` at desktop and 375px widths;
  the mobile result was `viewport=375`, `documentWidth=375`,
  `bodyWidth=375`, `overflow=false`.
- Temporary demo processes were stopped after the real-stack run. The only
  browser console noise observed during the manual pass was the existing
  missing `/favicon.ico` response.

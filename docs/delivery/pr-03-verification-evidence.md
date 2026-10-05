# PR-03 verification evidence

This record is the inspectable verification index for PR-03. PR-04 and PR-05
remain out of scope.

## Toolchain and scope

- Node.js `24.18.0`, pnpm `11.17.0`, PostgreSQL `18.1`.
- The verification commands use the repository's pinned Corepack and pnpm
  commands. No dependency or database workaround is part of the feature.
- Existing unrelated worktree edits and the untracked user-owned
  `apps/web/staff/e2e/admin-routes.spec.ts` test are excluded from the PR-03
  change set and verification counts.

## Automated evidence

| Surface | Command or artifact | Result |
| --- | --- | --- |
| Tracked verification transcript | [`docs/delivery/pr-03-verification-log.md`](./pr-03-verification-log.md) | Captured command results, runtime, focused browser journeys, LSP diagnostics, audit, and visual checks |
| Formatting, lint, typecheck, unit, PostgreSQL integration, architecture, contracts, build | `corepack pnpm check` with `TEST_DATABASE_URL` set | 35 test files, 237 tests passed |
| Readiness model, API cancellation, reload guard, and service guards | `corepack pnpm exec vitest run apps/web/admin/src/setup-readiness-api.test.ts apps/web/admin/src/setup-readiness-model.test.ts apps/web/admin/src/use-setup-readiness-data.test.ts packages/modules/src/restaurant-configuration/domain/branch-acceptance.test.ts packages/service-workflow/src/tenant-owner-service.test.ts` | 20 tests passed |
| Branch workflow integration | `corepack pnpm exec vitest run packages/service-workflow/src/tenant-owner-service.integration.test.ts` | 21 tests passed, including permission-before-reason validation |
| Committed PR-03 browser/accessibility set | `corepack pnpm test:browser` over the five committed PR-03 specs | 31 tests passed |
| Focused PR-03 real-stack setup journey | `DEMO_LAUNCHER_URL=http://127.0.0.1:4170 corepack pnpm test:browser:pr03:real-stack` with `corepack pnpm dev:demo` already running | 1 test passed; the owner created a restaurant and branch through Administration, opened service with a reason, and reached core setup complete |
| Dependency audit | `corepack pnpm audit --prod --audit-level high` | No known high-severity production vulnerabilities |

The readiness model, API, and reload-guard tests cover core-ready/optional QR, missing categories,
missing dishes, invisible dishes, missing tables, missing table QR,
permission-scoped workforce loading, closed service, missing feature
configuration, selected-restaurant context, caller cancellation, and stale
reload/unmount cleanup. The
integration regression proves a caller without
`branches.manage` receives authorization failure before service-status reason
validation.

## Manual QA gate

The pinned isolated demo stack was exercised through the real Administration,
Staff, and Customer surfaces:

1. Owner opens Administration `/setup` and sees server-derived readiness.
2. Owner changes an open branch to closed with an eight-character operational
   reason. The live summary changes to `0 blocked · 1 need setup · 1 optional`,
   and the Staff handoff is absent.
3. Owner restores the branch to open with a reason. The live summary returns to
   core setup complete and exposes the Staff handoff.
4. Staff opens the live workspace and sees that the branch is ready for service.
5. Customer opens the live table QR and sees the table menu entry.

Desktop `1280x900` and mobile `375x844` captures were reviewed by two
independent visual oracles. The page stayed within the mobile viewport; only
the intentionally scrollable section navigation exceeded the viewport width.
Temporary screenshots and demo diagnostics remain in ignored local evidence;
the behavioral assertions and this verification index are tracked here.

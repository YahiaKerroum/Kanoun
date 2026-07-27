---
id: SLICE-003-IMPLEMENTATION
status: verified
owner: engineering
last_reviewed: 2026-07-27
---

# Slice 003 — Employees, Permissions, and Configuration

## Change declaration

- `implements`: `US-B01`, `US-B02`, `US-B03`, `US-B04`, `US-C01`,
  `US-C02`, `US-C03`, `US-C04`, `US-C06`, `US-C07`, `US-C08`, `US-R05`;
  relevant `NFR-01`, `NFR-02`, `NFR-03`, `NFR-07`, `NFR-08`, `NFR-09`,
  `NFR-10`, `NFR-12`, `NFR-16`, `NFR-18`.
- `obeys`: `PD-001`, `PD-002`, `PD-004`, `PD-005`, `PD-013`, `PD-026`,
  `PD-027`, `PD-028`, `PD-030`; `ADR-0001`–`ADR-0006`; `CFG-001`–`CFG-019`;
  `PERM-001`–`PERM-035`; `BR-001`–`BR-007`, `BR-021`, `BR-024`, `BR-025`.
- `changes`: employee profile and branch-employment commands; versioned
  grants-only permission sets; predefined copy-on-apply templates; immediate
  affected-session invalidation; append-only restaurant/branch feature
  configuration; permission-aware portal capabilities; audited, scoped,
  four-hour-maximum platform support access; REST/event contracts; MISE
  administration UI.
- `tests`: profile creation without login, tenant and branch substitution,
  delegation escalation, per-branch grants, copy-on-apply customization,
  session revocation, dependency validation, stale versions, rollback,
  last-administrator protection, duplicate-email normalization/conflict
  mapping, hashed/revocable support access, configuration/support HTTP runtime
  validation, capability-aware staff navigation, responsive browser behavior,
  and automated WCAG A/AA scanning.
- `docs`: workflows, modules, data model, HTTP/event contracts, traceability,
  progress, and dated handoff.

`US-B02` follows the explicit MVP restriction in `mvp-scope.yaml`: automatic
order acceptance is visible but fixed, while individual cook assignment and
other post-MVP strategies remain unavailable. The UI does not claim those
controls are implemented.

## Truthful delivery boundaries

- `AC-US-B01-03` is not claimed for downstream automatic actions or
  notifications that do not exist yet. Slice 003 persists immutable feature
  versions, validates dependencies, emits an outbox event, and filters staff
  navigation. Each later module must enforce effective configuration before it
  creates new work.
- `AC-US-B04-03` is represented by immutable configuration versions and the
  `PD-026` completion contract. Active-order enforcement is verified in the
  ordering slice because Slice 003 contains no orders.
- Loginless employee creation and later account attachment preserve the
  employee identifier. Assignment/report consumers and `AC-US-C07-02` task
  proxying are not implemented or claimed by this slice.
- The staff shell discloses only the intersection of effective permissions and
  enabled features. Destinations whose operational screens belong to later
  slices remain explicit deferred states rather than fabricated task data.
- Normal platform authorization has no tenant read path. The private MVP
  support adapter trusts a platform control plane to verify operator and
  approver identities, then enforces recent operator authentication, a
  distinct approver, an approval reference, read-only restaurant/branch scope,
  and a four-hour maximum. It exposes no emergency-policy bypass and no
  employee, audit-query, or write support path.
- Support access uses the opaque grant token directly; no derived support
  session or real-time subscription is created. Expiry and revocation therefore
  terminate the implemented access by invalidating that token immediately.
  Every successful inspection appends tenant-scoped audit evidence.

## Verification evidence

- Clean PostgreSQL 18 migration application completed against
  `postgresql://rms@127.0.0.1:55432/rms_test`.
- Formatting, ESLint, and strict TypeScript checks passed.
- PostgreSQL-enabled Vitest completed 45 tests across 9 files with no skips.
- Dependency-cruiser found no violations across 87 modules and 121
  dependencies; all 3 architecture tests passed.
- OpenAPI validated without warnings and all 40 integration-event contracts
  validated.
- Every package/application production build passed.
- Playwright completed 6 Chromium tests, including staff and administration
  WCAG A/AA scans.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities.

The local default Node.js 22.20.0 emitted the expected engine warning. The
supported and CI runtime remains Node.js 24.18.0.

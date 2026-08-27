---
id: FRONTEND-QUALITY
status: approved
version: 1.0
owner: frontend-and-ux
last_reviewed: 2026-07-27
source_of_truth_for:
  - frontend-quality-baseline
---

# Frontend Quality Baseline

## Surfaces

- Customer web: mobile-first QR menu, cart, order tracking, and cancellation request.
- Staff web: tablet/desktop order board, kitchen queue, serving, and payments.
- Administration web: desktop/tablet guided setup, configuration, employees, menu, reports, and audit.

## Responsive baseline

- Customer flow supports widths from 320 CSS pixels upward.
- Staff critical flows support 768 CSS pixels upward and remain usable in landscape tablet mode.
- Administration supports 1024 CSS pixels upward; read-only views may adapt below this.
- Touch targets are at least 44 by 44 CSS pixels where practical.
- Kitchen state, item name, quantity, note, elapsed time, and order reference remain readable at a one-metre viewing distance on the selected kitchen display.

## Accessibility

MVP release targets WCAG 2.2 AA:

- Complete keyboard access for staff and administration.
- Visible focus and logical focus order.
- Programmatic names, descriptions, and error associations.
- No status communicated by color alone.
- Live updates announced without stealing focus.
- Text usable at 200% zoom without loss of core functionality.
- Reduced-motion preference honored.

## Network and state feedback

Every state-changing action shows one of: pending, succeeded, failed, or conflicted. The UI:

- Does not optimistically claim financial success.
- Displays stale/last-updated state after real-time disconnection.
- Reloads a snapshot after reconnect.
- Never blindly replays state-sensitive commands.
- Gives a specific recovery action for version or menu conflicts.

The guided Administration setup route uses the existing `.setup-content` shell
scroll owner, preserves `/setup` deep links and browser history, and derives
readiness from server state after refresh. Restaurant and branch editors expose
pending, success, validation, unauthorized, unavailable, and stale-version
states; service-status changes require an actionable explanation when closing or
temporarily disabling a branch. Workforce readiness tolerates a missing optional
employee-view grant, while the Staff handoff requires a grant scoped to the
active restaurant/branch. Dated branch-closure overrides remain server-enforced
through the existing acceptance authority.

## Localization

- User-facing strings are externalized.
- Layout does not assume English string length.
- Dates, times, numbers, and currency use locale-aware formatting.
- Stored domain values and API enums are not translated.
- RTL support is not a release claim until separately tested.

Client types may be generated from the OpenAPI contract, but generated transport types must not become domain models or bypass runtime response validation at trust boundaries.

## Development diagnostics and browser policy

- React Scan and React Grab load only in Vite development when
  `VITE_DISABLE_REACT_DIAGNOSTICS` is not `true`; automated browser evidence
  disables those overlays.
- Run `corepack pnpm react:doctor` for static React health, run
  `corepack pnpm react:scan:staff` to start the Staff development surface with
  its built-in React Scan instrumentation, and run
  `corepack pnpm react:grab` for source-context capture.
- `corepack pnpm test:frontend:diagnostics` inspects production assets and fails
  when React Scan, React Doctor, or React Grab is present. It runs in
  `corepack pnpm check`.
- Playwright Firefox and WebKit are installed for PR-06 compatibility work, but
  this branch makes no NFR-17 release claim until critical routes pass in both
  engines and a pilot validates current stable Edge and Safari devices.

### PR-06 React Doctor classification (2026-08-12)

`corepack pnpm react:doctor` scanned 65 files and reported **0 errors** and 87
warnings. A zero-context comparison with `e264e53b881d269072fc5de56f7085d15794278b`
shows no warning location is in the PR-06 EventSource cleanup hunk. These are
recorded as **non-applicable to this PR's cleanup behavior**, not as a clean
Doctor result or as waived product defects. They remain backlog candidates for
the modules that own them.

| Rule group | Count | Classification |
| --- | ---: | --- |
| `use-lazy-motion` | 10 | Non-applicable: pre-existing animation architecture. |
| `only-export-components` | 2 | Non-applicable: pre-existing colocated exports. |
| `no-giant-component` | 11 | Non-applicable: pre-existing module-boundary debt. |
| `no-many-boolean-props` | 5 | Non-applicable: pre-existing component API debt. |
| `no-derived-useState` | 4 | Non-applicable: pre-existing state-model debt. |
| `js-hoist-intl` | 6 | Non-applicable: pre-existing formatter allocation advice. |
| `no-fetch-in-effect` | 9 | Non-applicable: pre-existing client data-loading architecture. |
| `js-tosorted-immutable` | 7 | Non-applicable: pre-existing immutable-sort style advice. |
| `prefer-module-scope-static-value` | 1 | Non-applicable: pre-existing static-value placement. |
| `prefer-useReducer` | 2 | Non-applicable: pre-existing related-state organization. |
| `prefer-use-sync-external-store` | 1 | Non-applicable: pre-existing subscription architecture. |
| `server-sequential-independent-await` | 1 | Non-applicable: pre-existing async ordering advisory. |
| `no-set-state-after-await-in-effect` | 2 | Non-applicable: pre-existing async-effect guard pattern. |
| `prefer-module-scope-pure-function` | 2 | Non-applicable: pre-existing function placement. |
| `js-combine-iterations` | 10 | Non-applicable: pre-existing iteration optimization advice. |
| `rerender-lazy-ref-init` | 1 | Non-applicable: pre-existing ref initialization advice. |
| `js-set-map-lookups` | 10 | Non-applicable: pre-existing lookup optimization advice. |
| `motion-animate-presence-must-outlive-child` | 1 | Non-applicable: pre-existing route-transition structure. |
| `rerender-lazy-state-init` | 1 | Non-applicable: pre-existing state initialization advice. |
| `no-unguarded-numeric-input-parse` | 1 | Non-applicable: pre-existing numeric-input validation advice. |

The counts total 87. The only confirmed diagnostic tool limitation in this
slice is separate: React Scan's development overlay is itself detected by axe;
mocked accessibility suites use `VITE_DISABLE_REACT_DIAGNOSTICS=true` and the
production-asset exclusion test protects shipped clients.

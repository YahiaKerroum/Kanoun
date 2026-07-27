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
- Administration web: desktop/tablet configuration, employees, menu, reports, and audit.

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

## Localization

- User-facing strings are externalized.
- Layout does not assume English string length.
- Dates, times, numbers, and currency use locale-aware formatting.
- Stored domain values and API enums are not translated.
- RTL support is not a release claim until separately tested.

Client types may be generated from the OpenAPI contract, but generated transport types must not become domain models or bypass runtime response validation at trust boundaries.

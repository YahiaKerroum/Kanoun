---
id: OPERATIONS-BROWSER-POLICY
status: retired
version: 1.0
owner: operations
last_reviewed: 2026-08-25
source_of_truth_for:
  - supported-browser-policy
---

# Supported Browser Policy

> [!IMPORTANT]
> Retired on 2026-10-06 together with the Playwright suites. Interface changes are reviewed against `DESIGN.md`. Kept for history.

Published to satisfy `AC-NFR-17-01`. The support commitment itself restates
the already-approved `AC-NFR-17-02`; this document does not add or change a
requirement.

## Supported browsers

Critical flows (owner setup, staff sign-in, kitchen display, cashier
payment/refund, customer QR menu and order) are supported on:

- The latest two stable major versions of Google Chrome.
- The latest two stable major versions of Microsoft Edge.
- The latest two stable major versions of Mozilla Firefox.
- The current stable major version of Safari.

Mobile Safari (iOS) and mobile Chrome (Android) are covered by the same
Safari/Chrome policy above at the customer-facing responsive breakpoints
defined in `DESIGN.md` (320 CSS pixels upward for Customer).

## What "supported" means

- Critical flows function correctly and meet the WCAG 2.2 AA, keyboard, and
  zoom requirements in `docs/quality/frontend-quality.md`.
- Visual presentation may use browser-appropriate fallbacks (for example,
  native form controls) rather than being pixel-identical across browsers.
- A browser outside this policy is not blocked; the product does not perform
  user-agent gating. Unsupported browsers may encounter degraded but not
  silently broken behavior.

## Verification

- `docs/quality/frontend-quality.md` and the mocked/real-stack Playwright
  suites currently execute against Chromium. Cross-browser execution against
  the full matrix above (Firefox, WebKit/Safari, Edge) is tracked as part of
  the PR-06 professional UX/performance gate and is not claimed as complete
  by this package.
- QR destinations are plain HTTPS URLs opened by the device's default
  browser, satisfying `AC-NFR-17-03` without a proprietary scanning app.

## Change control

Any change to the supported matrix (for example, dropping a browser two
majors old, or adding a new one) updates this document and the traceability
entry for `AC-NFR-17-02` in the same change.

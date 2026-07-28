---
id: PRODUCT-DECISIONS
status: approved
version: 1.0
owner: product
last_reviewed: 2026-07-27
source_of_truth_for:
  - product-decisions
---

# Product Decision Register

These decisions convert the original discovery questions into an implementable MVP baseline. Alternatives remain candidates for later releases.

| ID | Decision | Rationale and consequence |
|---|---|---|
| PD-001 | `BusinessAccount` is the security tenant. It may own multiple restaurants, and each restaurant may own multiple branches. | Restaurants and branches are authorization scopes inside one tenant. Cross-tenant access is never permitted. |
| PD-002 | Restaurant settings are defaults. Only settings explicitly marked `branch_override` in `docs/config/features.yaml` may differ by branch. | Prevents an unbounded inheritance model. |
| PD-003 | Menus belong to a restaurant. Branches may override dish price, visibility, and availability only. | Supports shared menus without duplicating the catalog. |
| PD-004 | Authorization is grants-only. Grants may be branch-scoped. Explicit deny is not supported in the MVP. | Keeps effective-permission resolution deterministic. |
| PD-005 | Permission templates are copy-on-apply. Editing a template never changes existing users. | Avoids silent privilege changes. |
| PD-006 | A customer name is optional for a table QR order. No permanent customer account is required. | Minimizes personal-data collection. |
| PD-007 | Customer ordering requires a table-specific QR code in the MVP. Branch QR codes are browse-only. | Avoids manual table claiming and table spoofing. |
| PD-008 | Multiple guest sessions may participate at one table. Each guest session can read and manage only the orders it created; staff can see all table orders. | Supports groups without exposing one guest's order token to another. |
| PD-009 | A submitted order is immutable to the customer. The customer may request cancellation; authorized staff perform any accepted correction. | Prevents kitchen/customer race conditions. |
| PD-010 | A guest session expires after 4 hours of inactivity and after an absolute maximum of 12 hours. Order tracking becomes read-only after table-session closure and is unavailable after session expiry. | Provides a bounded guest authorization window. |
| PD-011 | A table becomes occupied when the first order is successfully submitted. Scanning alone does not occupy it. | Prevents abandoned scans from blocking tables. |
| PD-012 | Staff may move an entire active table session to another available table. Table combining is post-MVP. | Covers operational correction without introducing combined-table billing. |
| PD-013 | The MVP uses automatic order acceptance, no stations, no individual cook assignment, and all-items-ready before serving. | Reduces workflow permutations while preserving future extension points. |
| PD-014 | Customer orders cannot be placed before seating. Partial serving and delivery assignment are post-MVP. | Keeps the first fulfilment flow deterministic. |
| PD-015 | Payments apply to one order. Table-level combined billing, partial payments, and split payments are post-MVP. | Avoids ambiguous allocation across several orders. |
| PD-016 | An order may complete only after it is served and its balance is zero. A specific override permission and reason are required for an unpaid closure. | Protects financial integrity while supporting exceptional recovery. |
| PD-017 | MVP payment methods are manually recorded `cash` and `card`. The system does not process funds or integrate with a gateway. | Separates operational recording from online payment processing. |
| PD-018 | MVP prices are tax-inclusive. Each branch uses one ISO currency. Fiscal receipts, service charges, tips, discounts, and tax-authority integration are out of scope. | Provides a precise non-fiscal total model. |
| PD-019 | Reports never sum unlike currencies. Cross-branch totals are grouped by currency and use each branch's local business date. | Avoids inventing an exchange-rate policy. |
| PD-020 | MVP inventory is manual dish availability only. Ingredient quantities, recipes, deductions, restocking, and stock warnings are post-MVP. | Keeps inventory accounting out of the first release. |
| PD-021 | Customer reviews and restaurant responses are post-MVP. | Removes moderation and identity questions from the first release. |
| PD-022 | Continuous internet access is required. Clients are online-first and do not queue financial or state-sensitive commands offline. | Avoids unsafe offline reconciliation. |
| PD-023 | The MVP uses a kitchen display only. Printed kitchen tickets are post-MVP. | Avoids printer integration in the initial deployment. |
| PD-024 | Initial user-facing language is English. Text must be translation-ready; Arabic/RTL is a later release. | Avoids claiming unverified localization coverage. |
| PD-025 | The initial load-test profile per active branch is 50 staff sessions, 200 guest sessions, 500 dishes, 100 tables, and 20 order submissions per minute. | Makes NFR validation reproducible; it is a test target, not a commercial limit. |
| PD-026 | Disabling a capability blocks new work. Existing records finish using their stored configuration version. A capability cannot be disabled if no supported completion path exists. | Prevents in-flight work from being stranded. |
| PD-027 | An employee profile may exist without login credentials. Identity owns credentials; Restaurant Configuration owns the employee profile and branch employment. | Separates people from authentication. |
| PD-028 | Platform support access is deny-by-default and uses time-limited, reasoned, audited break-glass authorization. | Protects tenant operational data. |
| PD-029 | Approval, fulfilment, financial, closure, table-session, and kitchen-work states are separate state machines. | Avoids an overloaded and contradictory `OrderStatus`. |
| PD-030 | Critical cross-module work may participate in one local database transaction through explicit module contracts. Post-commit notifications, reporting, and audit projections use the outbox. | Preserves atomic restaurant operations without permitting foreign-table writes. |
| PD-031 | The stack is Node.js active LTS, Express 5, strict TypeScript, PostgreSQL, and React as accepted by ADR-0001. | Uses one primary language across web clients, contracts, and server code while preserving the modular-monolith boundaries. |
| PD-032 | Recorded payments, refunds, corrections, audit events, and future stock movements are append-only. | Preserves financial and operational history. |
| PD-033 | Menu prices and totals are always recalculated by the server at submission. A changed menu returns a conflict with current values. | Prevents stale or manipulated client totals. |
| PD-034 | A table session closes only when all its orders are terminal and no unresolved bill, assistance, or fulfilment work remains. Cleaning is triggered by table-session closure, not order completion. | Supports multiple orders per table safely. |
| PD-035 | Branch operating hours use an IANA time zone and support overnight periods and dated closure overrides. Accepted orders may finish after closing; new submissions are blocked. | Makes service availability deterministic. |
| PD-036 | The MVP active-order view filters by lifecycle state, table, creating employee, and submitted time, and shows elapsed time. Kitchen-station filtering and urgency/delay classification are post-MVP until those concepts and thresholds are approved. | Keeps `US-H03` implementable without contradicting the no-stations strategy in `PD-013` or inventing an urgency policy. |

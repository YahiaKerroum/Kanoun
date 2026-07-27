---
id: BUSINESS-RULES
status: approved
version: 1.0
owner: product-and-domain
last_reviewed: 2026-07-27
source_of_truth_for:
  - cross-cutting-business-invariants
---

# Business Rules

| ID | Rule |
|---|---|
| BR-001 | Every tenant-owned record has an unambiguous path to one `BusinessAccount`. |
| BR-002 | Restaurant and branch identifiers supplied by a client are never sufficient authorization. |
| BR-003 | An action requires an active account, enabled capability, valid tenant/branch scope, required permission, and valid resource state. |
| BR-004 | A user cannot grant a permission or branch scope beyond the user's own delegable authority. |
| BR-005 | Permission templates copy grants when applied and never update existing users automatically. |
| BR-006 | A disabled capability blocks new work but preserves history and supported completion of grandfathered records. |
| BR-007 | Active orders and table sessions retain the configuration version under which they began. |
| BR-008 | A table has at most one open table session. |
| BR-009 | Scanning a QR code does not occupy a table; the first successful order submission does. |
| BR-010 | A guest session can access only orders created by that session. |
| BR-011 | Submitted order items preserve their display, pricing, currency, tax treatment, options, quantity, and note snapshot. |
| BR-012 | The server recalculates prices and totals from current authorized menu data at submission. |
| BR-013 | One order contains one currency and all monetary arithmetic uses fixed-precision decimal values. |
| BR-014 | MVP menu prices are tax-inclusive; service charge, tips, discounts, and fiscal calculations are absent. |
| BR-015 | A payment applies to one order and must equal the outstanding balance in the MVP. |
| BR-016 | Original payment records are immutable; corrections are append-only reversals or refunds. |
| BR-017 | An order completes only when served and paid, except for a specifically authorized and reasoned unpaid override. |
| BR-018 | Refund state is financial state, not fulfilment or closure state. |
| BR-019 | Table-session closure, not individual order completion, releases the table. |
| BR-020 | Cross-branch financial reports group totals by currency and never perform implicit conversion. |
| BR-021 | All timestamps are stored in UTC; operating hours and business dates use the branch's IANA time zone. |
| BR-022 | Reusing an idempotency key with a different request payload is a conflict. |
| BR-023 | Real-time messages are hints; clients recover authoritative state through normal queries. |
| BR-024 | Diagnostic logs do not contain credentials, tokens, payment secrets, or unnecessary personal data. |
| BR-025 | Platform support access is time-limited, reasoned, least-privilege, and audited. |


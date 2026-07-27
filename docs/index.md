---
id: DOC-INDEX
status: approved
version: 1.0
owner: product-and-architecture
last_reviewed: 2026-07-27
source_of_truth_for:
  - documentation-governance
---

# Documentation Index

## Status meanings

- `approved`: authoritative for its declared topic.
- `proposed`: usable for discussion but not an implementation decision.
- `blocked`: cannot be implemented until its linked decision is resolved.
- `superseded`: retained only for history.

## Normative document map

| Topic | Authoritative artifact | Status |
|---|---|---|
| Product behavior and acceptance | `restaurant-management-system-requirements.md` | Approved MVP baseline |
| Release scope and readiness | `docs/product/mvp-scope.yaml` | Approved |
| Product decisions | `docs/product/decision-register.md` | Approved unless an entry says otherwise |
| Domain terminology and ownership | `docs/domain/model.md` | Approved |
| State machines and transitions | `docs/domain/workflows.yaml` | Approved |
| Cross-cutting business rules | `docs/domain/business-rules.md` | Approved |
| Feature taxonomy and defaults | `docs/config/features.yaml` | Approved |
| Permission identifiers | `docs/security/permissions.yaml` | Approved |
| Module boundaries | `docs/architecture/modules.yaml` | Approved |
| Consistency and transactions | `docs/architecture/consistency.md` | Approved |
| Technical choices and ADR status | `docs/architecture/adr/README.md` and `ADR-*.md` | Per ADR status |
| Express/TypeScript implementation rules | `docs/architecture/express-implementation-guide.md` | Approved |
| Non-normative implementation patterns | `docs/architecture/engineering-patterns.md` | Proposed guidance |
| HTTP API | `docs/contracts/openapi.yaml` | Proposed operation-by-operation; validated in Slice 001 |
| Events and delivery | `docs/contracts/events.yaml` | Approved semantic baseline |
| Conceptual/physical data design | `docs/data/model.md` | Approved conceptual baseline |
| Threats and security controls | `docs/security/threat-model.md` | Approved baseline |
| Verification strategy | `docs/quality/test-strategy.md` | Approved |
| Requirement-to-test mapping | `docs/quality/traceability.yaml` | Approved baseline |
| MVP implementation order | `docs/delivery/mvp-slices.yaml` | Approved |
| Implementation progress | `docs/delivery/implementation-progress.md` | Active |
| Slice 001 implementation declaration | `docs/delivery/slice-001-application-bootstrap.md` | Verified |
| Current engineering handoff | `docs/delivery/handoff-2026-07-27.md` | Ready for continuation |
| Frontend quality | `docs/quality/frontend-quality.md` | Approved |
| Deployment and recovery | `docs/operations/deployment-and-recovery.md` | Proposed until hosting ADR |
| Observability and operations | `docs/operations/observability-and-runbook.md` | Approved baseline |
| Agent operating rules | `AGENTS.md` | Approved |
| Repository onboarding | `README.md` | Approved |

## Change rules

1. Change the authoritative source, then update references and traceability.
2. Do not duplicate states, permission keys, feature defaults, or API schemas in narrative documents.
3. Approved IDs are immutable. Supersede an ID rather than reusing it for a different meaning.
4. Every normative `TBD` must link to a decision ID and mark affected scope as blocked.
5. Product decisions require product approval; ADRs require technical approval.
6. Migrations become the authority for the physical schema after application bootstrap.

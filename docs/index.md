---
id: DOC-INDEX
status: approved
version: 1.0
owner: product-and-architecture
last_reviewed: 2026-08-09
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
| Professional readiness audit and Luna Max execution plan | `docs/delivery/professional-readiness-plan.md` | Proposed implementation guidance; does not override approved product or architecture sources |
| Slice 001 implementation declaration | `docs/delivery/slice-001-application-bootstrap.md` | Verified |
| Slice 002 implementation declaration | `docs/delivery/slice-002-tenant-branch-owner-bootstrap.md` | Verified |
| Slice 003 implementation declaration | `docs/delivery/slice-003-employees-permissions-configuration.md` | Verified |
| Slice 004 implementation declaration | `docs/delivery/slice-004-menu-tables-and-qr.md` | Verified |
| Slice 005 implementation declaration | `docs/delivery/slice-005-order-submission.md` | Verified and integrated |
| Slice 006 implementation declaration | `docs/delivery/slice-006-kitchen-and-serving.md` | Verified, integrated, and published |
| Slice 007 implementation declaration | `docs/delivery/slice-007-payment-completion-and-correction.md` | Verified, feature branch published, and integrated |
| Current engineering handoff | `docs/delivery/professional-readiness-plan.md` | PR-01 through PR-05 and PR-07 are verified and published to `main`; PR-06 remains open |
| Slice 008 implementation declaration | `docs/delivery/slice-008-notifications-reporting-and-audit.md` | Verified, feature branch published, and integrated into `main` via `b38375b` |
| Slice 008 historical checkpoint | `docs/delivery/handoff-2026-07-29-slice-008-checkpoint.md` | Historical pre-integration handoff |
| PR-01 implementation declaration | `docs/delivery/pr-01-one-command-professional-demo.md` | Verified and published |
| PR-02 implementation declaration | `docs/delivery/pr-02-access-and-account-lifecycle.md` | Verified and published at `e729438a11100d347c2bf8c77a0ad85ecbb84540` |
| PR-03 implementation declaration | `docs/delivery/pr-03-guided-owner-setup-and-workforce-readiness.md` | Verified; PR-04 follows this boundary |
| PR-04 implementation declaration | `docs/delivery/pr-04-operational-workspaces.md` | Verified and published to `main` at `14d1ce881` |
| PR-05 implementation declaration | `docs/delivery/pr-05-real-stack-e2e.md` | Verified and published to `main` at `14d1ce881`; PR-06 remains out of scope |
| PR-05 verification evidence | `docs/delivery/pr-05-real-stack-evidence.md` | Redacted, source-bound built real-stack run record |
| Slice 006 publication handoff | `docs/delivery/handoff-2026-07-28-slice-006-checkpoint.md` | Slice 006 published; historical Slice 007 starting point |
| Slice 005 publication handoff | `docs/delivery/handoff-2026-07-28-slice-005-checkpoint.md` | Slice 005 feature branch published; main integration pending |
| Slice 004 publication handoff | `docs/delivery/handoff-2026-07-28-slice-004-checkpoint.md` | Slice 004 published — historical baseline |
| Prior Slice 004 checkpoint | `docs/delivery/handoff-2026-07-27-slice-004-checkpoint.md` | Superseded — historical only |
| Prior engineering handoff (Slice 003 publication evidence) | `docs/delivery/handoff-2026-07-27.md` | Superseded — historical only |
| Frontend quality | `docs/quality/frontend-quality.md` | Approved |
| Product interface design system | `DESIGN.md` | Active implementation guide |
| Deployment and recovery | `docs/operations/deployment-and-recovery.md` | Proposed until hosting ADR |
| Observability and operations | `docs/operations/observability-and-runbook.md` | Approved baseline; PR-07 appendix maps implemented metrics/alerts |
| Operational dashboard definitions | `docs/operations/dashboards/README.md` | Approved panel specification; no production dashboard platform deployed |
| Local professional demo operation | `docs/operations/local-demo.md` | Approved |
| Real-stack browser verification | `docs/operations/real-e2e.md` | Approved |
| Supported browser policy | `docs/operations/browser-policy.md` | Approved; restates `AC-NFR-17-02` |
| Retention and privacy policy | `docs/operations/retention-and-privacy.md` | Proposed draft; blocks `AC-NFR-09-05`/`AC-NFR-10-04` closure |
| Pilot operations guides | `docs/operations/pilot/` | Proposed guidance |
| PR-07 implementation declaration | `docs/delivery/pr-07-pilot-operations-and-production-gates.md` | Verified and published to `main` at `14d1ce881`; production-scale hosting remains a deferred future decision |
| PR-07 readiness and boundary record | `docs/delivery/pr-07-readiness.md` | Confirmed boundary; PR-06 gate remains independently open |
| Agent operating rules | `AGENTS.md` | Approved |
| Repository onboarding | `README.md` | Approved |

## Change rules

1. Change the authoritative source, then update references and traceability.
2. Do not duplicate states, permission keys, feature defaults, or API schemas in narrative documents.
3. Approved IDs are immutable. Supersede an ID rather than reusing it for a different meaning.
4. Every normative `TBD` must link to a decision ID and mark affected scope as blocked.
5. Product decisions require product approval; ADRs require technical approval.
6. Migrations become the authority for the physical schema after application bootstrap.

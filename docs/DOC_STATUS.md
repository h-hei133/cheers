# Documentation Status Map

Route: `docs/agent-routes/route166-docs-active-context.md`

Statuses:

- `active`: current default entrypoint or source of truth.
- `implementation-context`: AI wiring context for future implementation routes.
- `foundation-evidence`: current risk, consistency, or audit evidence.
- `module-reference`: useful when touching a specific module.
- `historical`: route closeout, migration, audit, or decision history.
- `superseded`: replaced by a newer document.
- `archived`: retained for history and not default context.

This map prioritizes documents that future route prompts are likely to mention.
It does not claim every historical note is perfectly classified.

## Default Entrypoints

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/ACTIVE_CONTEXT.md` | active | First doc for future routes. |  | Documentation / Capability Contract Architecture |
| `docs/DOC_STATUS.md` | active | Select route-relevant docs and avoid broad history loading. |  | Documentation / Capability Contract Architecture |
| `docs/agent-routes/module-route-template.md` | active | Drafting or executing module routes. |  | Capability Contract Architecture |
| `docs/architecture/module-backlog.md` | active | Choosing the next module route or checking completed route families. |  | Capability Contract Architecture |
| `docs/archive/README.md` | archived | Understanding archive policy or adding archive pointers. |  | Documentation |

## Active Architecture

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/architecture/control-plane-atlas.md` | active | Route touches control-plane module ownership or central-file boundaries. |  | Control Plane |
| `docs/architecture/capability-contract.md` | active | Route needs lifecycle vocabulary or capability stage boundaries. |  | Capability Contract Architecture |
| `docs/architecture/module-roadmap-reset.md` | active | Rechecking module-first roadmap selection after Route 149. |  | Capability Contract Architecture |
| `docs/architecture/module-atlas.md` | superseded | Historical Route 131 atlas details only. | `docs/architecture/control-plane-atlas.md` | Control Plane |
| `docs/architecture/reference-module-matrix.md` | module-reference | Targeted reference comparison for module boundaries. |  | Capability Contract Architecture |
| `docs/architecture/reference-architecture-maps.md` | historical | Recovering reference-repo analysis behind the atlas. |  | Capability Contract Architecture |
| `docs/product-architecture-reset/script-command-index.md` | active | Checking grouped package-script aliases and Route G command compatibility. |  | Product Architecture Reset |
| `docs/product-architecture-reset/final-compatibility-audit.md` | active | Checking final reset compatibility, remaining route clutter, and validation ledger. |  | Product Architecture Reset |
| `docs/product-architecture-reset/phase2-readiness-note.md` | active | Checking Phase 2 Goal 0 readiness, corrected current-state assumptions, and Goal 1 start boundary. |  | Product Architecture Reset |
| `docs/product-architecture-reset/harness-eval-artifact-index.md` | active | Checking Phase 2 Goal 3 harness/eval artifact ownership and compatibility before moving harness files. |  | Product Architecture Reset |
| `docs/product-architecture-reset/phase2-final-physical-audit.md` | active | Checking Phase 2 final physical audit, runMvp baseline drift classification, and remaining reset debt. |  | Product Architecture Reset |
| `docs/dev-history/routes/README.md` | historical | Finding route document quarantine status and route-history script namespace. |  | Product Architecture Reset |
| `docs/evidence/history/route-reports/README.md` | historical | Finding historical route report provenance and compatibility status. |  | Product Architecture Reset |

## Implementation Context

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/implementation-context/README.md` | implementation-context | Start of any capability wiring or rewiring route. |  | Capability Flow Context |
| `docs/implementation-context/capability-flow-manifest.json` | implementation-context | Selecting owner modules, facades, contracts, recipes, and validation gates. |  | Capability Flow Context |
| `docs/implementation-context/capability-flow-graph.md` | implementation-context | Human-readable capability flow overview. |  | Capability Flow Context |
| `docs/implementation-context/capability-recipes.md` | implementation-context | Choosing route patterns and focused validation. |  | Capability Flow Context |
| `docs/implementation-context/route222-repair-to-success-report.json` | implementation-context | Route222 machine-checkable repair-to-success evidence report. |  | Capability Flow Context |
| `docs/implementation-context/route225-real-cli-product-loop-report.json` | implementation-context | Route225 machine-checkable real CLI product loop evidence report. |  | Capability Flow Context |
| `docs/implementation-context/route226-live-provider-product-path-capstone-report.json` | implementation-context | Route226 machine-checkable opt-in live-provider product-path capstone report. |  | Capability Flow Context |

## Foundation Evidence

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/foundation/README.md` | foundation-evidence | Start of foundation consistency, contradiction, or risk routes. |  | Foundation |
| `docs/foundation/foundation-consistency-audit.md` | foundation-evidence | Auditing result truthfulness, receipts, session terminal detail, readiness, or report consistency. |  | Foundation |
| `docs/foundation/foundation-consistency-matrix.json` | foundation-evidence | Machine-readable fact matrix for foundation routes. |  | Foundation |
| `docs/foundation/foundation-risk-register.md` | foundation-evidence | Checking open/resolved risks and next actions. |  | Foundation |

## Module References

| Path or group | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/architecture/agent-loop-*.md`, `docs/architecture/runmvp-*.md` | module-reference | Agent Loop routes or `runMvpIntegratedFlow` boundary work. |  | Agent Loop |
| `docs/architecture/cli-*.md` | module-reference | CLI / UX entrypoint, flags, startup, or facade work. |  | CLI / UX |
| `docs/architecture/session*.md`, `docs/architecture/continuation-lineage-cleanup.md` | module-reference | Session / Continue, terminal state, persistence, compact, or replay routes. |  | Session / Continue |
| `docs/architecture/resultmapper-module-extraction.md`, `docs/architecture/cross-capability-result-flow.md`, `docs/architecture/policy-result-boundary.md` | module-reference | Result Surface truthfulness, blocker, classification, or terminal mapping routes. |  | Result Surface |
| `docs/architecture/tool-policy-result-contract.md`, `docs/architecture/runtime-receipt-contract.md`, `docs/architecture/tool-runtime-execution-flow.md` | module-reference | Tool / Runtime receipt, execution evidence, sandbox, command, or verification receipt routes. |  | Tool / Runtime |
| `docs/architecture/workspace-file-context-contract.md`, `docs/architecture/edit-*.md`, `docs/architecture/future-edit-expansion-contract.md` | module-reference | Workspace / File Context or Edit / Patch routes. |  | Workspace / Edit |
| `docs/architecture/verifier-module-extraction.md` | module-reference | Harness / Eval verifier facade or report routes. |  | Harness / Eval |
| `docs/architecture/read-inspect-intent-cleanup.md`, `docs/architecture/verification-planner-cleanup.md` | module-reference | Read/inspect intent or verification planner routes. |  | Agent Loop / Verification |

## Historical And Non-Default Groups

| Path or group | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/agent-routes/route*.md` | historical | Active route, direct predecessor route, or regression archaeology only. | Current route plan and current code | Route family |
| `docs/agent-routes/COMMON_BOUNDARIES.md` | module-reference | Route prompt needs shared boundary language. |  | Route Discipline |
| `docs/agent-routes/REFERENCE_SCAN_POLICY.md` | module-reference | Route performs targeted reference-repo comparison. |  | Route Discipline |
| `docs/agent-routes/ROUTE_DISCIPLINE.md` | module-reference | Route process or stop-condition clarification. |  | Route Discipline |
| `docs/agent-routes/VALIDATION_POLICY.md` | module-reference | Route validation classification or gate selection. |  | Route Discipline |
| `docs/agent-routes/ROUTE_TEMPLATE.md` | superseded | Legacy route drafting only. | `docs/agent-routes/module-route-template.md` | Route Discipline |
| `docs/design/*.md` | historical | Design archaeology, regression analysis, or touching the related capability. | Current code plus active/module docs | Route design history |
| `docs/audits/*.md` | historical | Closeout audit history or regression checks. | Current code plus foundation docs | Audit history |
| `docs/manual-checks/*.md` | historical | Manual dogfood or live TTY checklist recovery. | Current validation policy and route-specific gates | Manual validation |
| `docs/archive/**` | archived | Retained history and superseded pointers only. | Active docs listed above | Documentation |

## Update Rule

When a route creates a long-lived doc, classify it here before closeout. Prefer
adding one row or group over expanding the default read set.

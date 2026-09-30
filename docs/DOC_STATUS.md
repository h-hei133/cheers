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
| `GOAL.md` | active | Strategic Evolution Roadmap: SOTA benchmark alignment, Phase 4-7 deliverables, and NormProof governance. |  | Architecture / Project Leadership |
| `.wiki/_index.md` | active | Master project knowledge base, architecture concepts, RFCs, and references. |  | Documentation / Wiki Manager |
| `.normproof/EXPERIENCE.md` | active | Retrospective on formal structural proof vs runtime semantic review. |  | Architecture / NormProof |
| `.normproof/dispositions.md` | active | Formal register of reviewed module ceiling obligations and modular decomposition decisions. |  | Architecture / NormProof |
| `.wiki/refactor/plan.md` | active | Module-boundary refactor plan: current file counts, reachability, the rules a change must follow, and the per-step record. Read this before any structural change. |  | Architecture |
| `.wiki/refactor/architecture-exploration-2026-09-18.md` | active | Where modules are still mis-placed, and whether tests need their own tree. |  | Architecture |
| `.wiki/refactor/drift-exploration-2026-09-18.md` | active | Documentation and rule drift: what is stale, and what actually blocks deleting it. |  | Architecture |
| `scripts/verify-docs-and-rules-drift.mjs` | active | Gate that reports documents whose path references no longer resolve. |  | Architecture |
| `docs/DOC_STATUS.md` | active | Select route-relevant docs and avoid broad history loading. |  | Documentation / Capability Contract Architecture |
| `docs/ACTIVE_CONTEXT.md` | historical | Legacy route context superseded by GOAL.md and .wiki/. | `GOAL.md` | Documentation |
| `docs/agent-routes/module-route-template.md` | historical | Historical module route draft template. |  | Capability Contract Architecture |
| `docs/archive/README.md` | archived | Understanding archive policy or adding archive pointers. |  | Documentation |
## Active Architecture

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/architecture/control-plane-atlas.md` | superseded | Route touches control-plane module ownership or central-file boundaries.|  | Control Plane |
| `docs/architecture/capability-contract.md` | historical | Route needs lifecycle vocabulary or capability stage boundaries.|  | Capability Contract Architecture |
| `docs/architecture/module-roadmap-reset.md` | historical | Rechecking module-first roadmap selection after Route 149.|  | Capability Contract Architecture |
| `docs/architecture/module-atlas.md` | superseded | Historical Route 131 atlas details only. | `docs/architecture/control-plane-atlas.md` | Control Plane |
| `docs/architecture/reference-module-matrix.md` | module-reference | Targeted reference comparison for module boundaries. |  | Capability Contract Architecture |
| `docs/architecture/reference-architecture-maps.md` | historical | Recovering reference-repo analysis behind the atlas. |  | Capability Contract Architecture |
| `docs/product-architecture-reset/script-command-index.md` | historical | Checking grouped package-script aliases and Route G command compatibility.|  | Product Architecture Reset |
| `docs/product-architecture-reset/final-compatibility-audit.md` | historical | Checking final reset compatibility, remaining route clutter, and validation ledger.|  | Product Architecture Reset |
| `docs/product-architecture-reset/executionBoundary/README.md` | active | Checking current TypeScript-first runtime, explicit execution boundary, Rust-ready optional executor path, contracts boundary, and Python offline-eval isolation. |  | Product Architecture Reset |
| `docs/product-architecture-reset/documentation-refresh/route230-important-docs-refresh.md` | historical | Checking which durable docs were refreshed after the architecture reset and which docs remain intentionally historical.|  | Product Architecture Reset |
| `docs/product-architecture-reset/phase2-readiness-note.md` | historical | Checking Phase 2 Goal 0 readiness, corrected current-state assumptions, and Goal 1 start boundary.|  | Product Architecture Reset |
| `docs/product-architecture-reset/harness-eval-artifact-index.md` | active | Current ownership and import boundaries for test support, browser evaluation, and the opt-in smoke command. |  | Test and evaluation ownership |
| `docs/product-architecture-reset/phase2-final-physical-audit.md` | historical | Checking Phase 2 final physical audit, runMvp baseline drift classification, and remaining reset debt.|  | Product Architecture Reset |
| `docs/product-architecture-reset/runmvp-baseline-drift-register.md` | historical | Checking Phase 2.5 Phase A runMvp baseline drift classification and trusted focused baseline.|  | Product Architecture Reset |
| `docs/build-infrastructure/bi006-deep-audit-summary.md` | historical | Reading BI006 final audit conclusion, created document list, Pi docs status, and recommended next build-infrastructure route. |  | Build Infrastructure |
| `docs/build-infrastructure/build-infrastructure-route-index.md` | historical | Reading completed BI001-BI005 summaries and BI007+ grouping after the Pi deep audit. |  | Build Infrastructure |
| `docs/build-infrastructure/product-loop-real-cli-agent-loop-audit.md` | historical | Reading PL001 audit of the current real CLI product path, BI016 spine fit, chosen coordinator seam, rejected seams, and truthfulness risks. |  | Build Infrastructure / Real CLI Product Loop |
| `docs/build-infrastructure/product-loop-real-cli-agent-loop-implementation-plan.md` | historical | Reading PL001 recommended next route for real CLI agent loop observation integration, owner domains, likely files, phases, and validation plan. |  | Build Infrastructure / Real CLI Product Loop |
| `docs/build-infrastructure/product-loop-agent-loop-remaining-phases-audit.md` | historical | Reading PL003 audit of the post-PL002 target Agent Loop phase model, remaining gaps, owner map, and truthfulness guardrails.|  | Build Infrastructure / Agent Loop Productization |
| `docs/build-infrastructure/product-loop-agent-loop-phase-roadmap.md` | historical | Reading PL003 PL004+ route sequence, immediate PL004 implementation summary, combination rules, and close-to-target criteria.|  | Build Infrastructure / Agent Loop Productization |
| `docs/build-infrastructure/product-loop-agent-loop-block-closeout.md` | historical | Reading PL009 Agent Loop block closeout, product loop adapter boundary, remaining not-proven claims, and next capability block.|  | Build Infrastructure / Agent Loop Productization |
| `docs/build-infrastructure/context-planning-quality-audit.md` | historical | Reading CP001 audit of current context discovery, repo intelligence, target ranking, planning handoff, PL009 adapter connection, and truthfulness risks.|  | Build Infrastructure / Context And Planning Quality |
| `docs/build-infrastructure/context-planning-quality-roadmap.md` | historical | Reading CP001 CP002+ route sequence, immediate repo intelligence/context discovery/target ranking route, grouping rules, and validation expectations.|  | Build Infrastructure / Context And Planning Quality |
| `docs/build-infrastructure/provider-streaming-model-boundary-audit.md` | historical | Reading PS001 audit of current provider path, CP dependency, Agent Loop model-boundary fit, streaming/tool-call/failure requirements, chosen seam, and rejected seams.|  | Build Infrastructure / Provider Streaming And Model Boundary |
| `docs/build-infrastructure/provider-streaming-model-boundary-roadmap.md` | historical | Reading PS001 PS002+ route sequence, owner domains, likely files, deferred surfaces, validation plan, and next provider streaming implementation route.|  | Build Infrastructure / Provider Streaming And Model Boundary |
| `docs/build-infrastructure/provider-streaming/ps004-live-provider-smoke-recovery.md` | active | Reading current live provider smoke policy, fallback eligibility/execution rules, manual retest status, redaction requirements, and truthfulness guardrails. |  | Build Infrastructure / Provider Streaming And Model Boundary |
| `docs/build-infrastructure/model-tool-batch-handoff-audit.md` | historical | Reading model-to-tool audit of current tool-call path, Agent Loop tool phase fit, prior model-boundary dependency, safe handoff requirements, chosen seam, rejected seams, and truthfulness guardrails.|  | Build Infrastructure / Model Tool Batch Handoff |
| `docs/build-infrastructure/model-tool-batch-handoff-roadmap.md` | historical | Reading model-tool handoff implementation sequence, owner domains, likely files, deferred surfaces, validation plan, completion criteria, and next handoff task.|  | Build Infrastructure / Model Tool Batch Handoff |
| `docs/build-infrastructure/verification-repair-behavior-audit.md` | historical | Reading VR001 audit of current verification path, current repair path, Agent Loop fit, safe boundaries, chosen seam, rejected seams, and false-success guardrails.|  | Build Infrastructure / Verification And Repair Behavior |
| `docs/build-infrastructure/verification-repair-behavior-roadmap.md` | historical | Reading VR001 VR002+ implementation sequence, owner domains, likely files, deferred surfaces, validation plan, completion criteria, and next verification boundary task.|  | Build Infrastructure / Verification And Repair Behavior |
| `docs/build-infrastructure/structure-tree-pressure-report.md` | historical | Reading current visible tree pressure measurements, compatibility export classification, relocated test map, and remaining structure debt after SR005.|  | Build Infrastructure / Structure Pressure |
| `docs/build-infrastructure/pi-deep-audit-uncovered-patterns.md` | historical | Reading BI006 pattern-by-pattern Pi audit evidence and local uncovered-pattern status. |  | Build Infrastructure |
| `docs/build-infrastructure/pi-next-direction-map.md` | historical | Reading BI006 prioritized next-direction map with owner domains, risks, and validation approach. |  | Build Infrastructure |
| `docs/build-infrastructure/pi-pattern-rejection-and-delay-log.md` | historical | Reading BI006 delayed and rejected Pi patterns plus blind-copy risks. |  | Build Infrastructure |
| `docs/build-infrastructure/product-naming-origin-audit.md` | historical | Reading BI012 product naming cleanup results, compatibility exceptions, and remaining route-era naming risks. |  | Build Infrastructure |
| `docs/dev-history/routes/README.md` | historical | Finding route document quarantine status and route-history script namespace. |  | Product Architecture Reset |
| `docs/dev-history/routes/route222*.md` through `docs/dev-history/routes/route226*.md` | historical | Reading quarantined Route222-226 route documents; old `docs/agent-routes/` paths are compatibility pointers. |  | Product Architecture Reset |
| `docs/evidence/history/route-reports/README.md` | historical | Finding historical route report provenance and compatibility status. |  | Product Architecture Reset |

## Sprint Knowledge Base

| Path | Status | When to read | Superseded by | Owner |
|---|---|---|---|---|
| `docs/sprint/sprint-working-index.md` | active | Starting sprint capability planning or checking which sprint docs are current. |  | Sprint Knowledge Base |
| `docs/sprint/current-capability-summary.md` | historical | Checking code-backed current capability status and missing areas before planning new capability batches.|  | Sprint Knowledge Base |
| `docs/sprint/component-adoption-log.md` | active | Checking controlled component or behavior adoption decisions, boundaries, validation evidence, and rollback plans for sprint capability work. |  | Sprint Knowledge Base |
| `docs/sprint/mature-agent-capability-map.md` | active | Checking the full mature capability target extracted from the local implementation and public docs named in the blueprint. |  | Sprint Knowledge Base |
| `docs/sprint/task-capability-map.md` | active | Checking the target model for reliable task completion across coding, artifacts, collaboration, verification, recovery, host automation, and live execution. |  | Sprint Knowledge Base |
| `docs/sprint/task-capability-gap-plan.md` | active | Selecting task-completion gaps, aggressive batches, adoption modes, completion gates, failure signals, and anti-goals. |  | Sprint Knowledge Base |
| `docs/sprint/project-gap-and-priority-plan.md` | active | Selecting task-completion-driven priority batches while retaining completed trusted-runtime foundation context. |  | Sprint Knowledge Base |
| `docs/sprint/development-capability-catalog.json` | active | Running the externalized live development challenge through the shared task runtime. |  | Sprint Knowledge Base / Runtime Evaluation |
| `docs/sprint/autonomous-development-gap-map.md` | active | Checking SP034 owner-domain gap diagnosis, playbook and mature-source inputs, selected transplant targets, introduction decisions, and before/after diagnostic evidence. |  | Sprint Knowledge Base / Core Capability |
| `docs/sprint/hard-mission-gauntlet.md` | historical | Checking the SP044 hard normal-runtime mission set, initial weaknesses, and same-mission rerun outcomes.|  | Sprint Knowledge Base / Core Capability |
| `docs/sprint/real-development-mission-pack.md` | active | Checking the SP045 real development mission set, baseline weaknesses, same-mission reruns, and introduction decisions. |  | Sprint Knowledge Base / Core Capability |
| `docs/sprint/final-architecture-audit-record.md` | historical | Checking SP050 final owner-boundary audit findings, product fixes, no-fix closures, reference inputs, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/parity-development-trial.md` | historical | Checking SP051 unseen parity trial tasks, initial weak phases, owner upgrades, reference inputs, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/execution-loop-trial.md` | historical | Checking SP052 unseen execution-loop tasks, initial weak phases, owner upgrades, reference inputs, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/controlled-unseen-development-gauntlet.md` | historical | Checking SP053 controlled unseen development tasks, execution-seam authority diagnostics, introduction decision, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/autonomous-capability-audit.md` | historical | Checking SP054 code-grounded autonomous development capability comparison, strongest and weakest areas, top gaps, architecture debts, and evidence list.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/three-sprint-capability-push-plan.md` | active | Selecting the next three aggressive autonomous capability sprints, owner domains, non-substitutable gates, and anti-shortcut rules after SP054. |  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/real-unseen-development-gauntlet.md` | historical | Checking SP057 unseen disposable development tasks, initial runtime failures, product fixes, rerun outcomes, and requirement coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/real-workspace-development-execution.md` | historical | Checking SP058 disposable workspace task execution, real ExecutionService file writes and command output, artifact/continuation evidence, and requirement coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/debug-repair-verification-autonomy.md` | historical | Checking SP059 disposable failing workspace tasks, command-output-driven repair, distinct second repair strategy, targeted rerun, artifact/source receipt, and requirement coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/long-horizon-real-development-trial.md` | historical | Checking SP060 long-horizon disposable workspace tasks, replay/compact task-state carry-forward, real repair/rerun, artifact/source receipt, and requirement coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/harness-spine-adoption.md` | historical | Checking SP061 normal-runtime harness spine adoption, turn snapshots, save points, ordered ledger, pending queues, continuation restore, disposable workspace tasks, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/durable-session-harness-recovery.md` | historical | Checking SP062 durable session harness recovery, session/compact/replay harness state restore, imperfect action correction, diagnostics, and requirement coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/provider-shaped-harness-trial.md` | historical | Checking SP063 provider-shaped imperfect action recovery through QueryEngine, execution seam, durable harness queues, repair strategy, targeted verification, artifact proof, and result verdict.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/multi-hypothesis-debug-loop.md` | historical | Checking SP066 disposable workspace debug tasks, hypothesis chains, source facts, repair plans, targeted reruns, replay restore, and stopped_not_proven coverage.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/debug-loop-truth-audit.md` | historical | Checking SP067 audit verdict, claim-by-claim evidence, fixes, remaining risk, and next-gauntlet readiness for the debug loop.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/provider-shaped-end-to-end-gauntlet.md` | historical | Checking SP068 primary disposable workspace trajectories, source-backed repair hypotheses, artifact proof completion, stopped_not_proven honesty, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/transcript-driven-provider-recovery.md` | active | Checking SP069 primary disposable workspace transcript trajectories, text-claim mistake reduction, artifact proof restore completion, stopped_not_proven honesty, and validation ledger. |  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/live-like-transcript-acceptance-decision.md` | historical | Checking SP070 primary live-like transcript trials, compact artifact proof completion, honest stopped_not_proven, no-change decision, and validation ledger.|  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/real-repository-development-pilot.md` | historical | Checking SP071 repository-shaped disposable workspace tasks, failed repair second hypothesis, source receipt proof, compact restore, honest stopped_not_proven, and validation ledger. |  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/real-repository-capability-jump.md` | active | Checking SP072 independent repository-subdirectory tasks, structured durable reduction, second-hypothesis repair, source receipt proof, stopped_not_proven honesty, and validation ledger. |  | Sprint Knowledge Base / Runtime Capability |
| `docs/sprint/real-typescript-worktree-execution.md` | active | Checking SP073 primary TypeScript worktree diagnostics, real copied `packages/ts-shell/src` files, failed repair second/third hypothesis, source receipt proof, compact restore, honest stopped_not_proven, and validation ledger. |  | Sprint Knowledge Base / Runtime Capability |

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
| `docs/design/browser-eval-gate.md` | archived | Understanding the removed Route 129/130 browser transaction gate. | `eval/browser/*` | Documentation |
| `docs/design/edit-capability-closeout-seal.md` | historical | Route 72 closeout history; its gate was removed 2026-09-17. |  | Documentation |
| `docs/design/edit-capability-roadmap.md` | historical | Edit capability roadmap history; references a removed gate. |  | Documentation |
| `docs/design/edit-closeout-readiness-and-fenced-broad-diff.md` | historical | Route 72 closeout history; references a removed gate. |  | Documentation |
| `docs/architecture/control-plane-baseline.md` | historical | Baseline history; lists a removed gate. | `docs/architecture/control-plane-atlas.md` | Control Plane |
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
| `docs/build-infrastructure/README.md` | historical | Landing page and status banner for build-infrastructure history. |  | Build infrastructure history |
| `docs/product-architecture-reset/README.md` | historical | Landing page and status banner for the architecture reset history. |  | Architecture history |
| `docs/sprint/README.md` | historical | Landing page explaining the active/ historical split within `docs/sprint/`. |  | Sprint Knowledge Base |
| `docs/dev-history/README.md` | historical | Landing page for route closeout and migration history. |  | Route history |
| `docs/superpowers/README.md` | historical | Landing page for the superseded planning archive. |  | Route history |
| `docs/dev-history/**` | historical | Route closeout and migration history; the route documents moved here keep pointer stubs at their old paths. | Current code and active route docs | Route history |
| `docs/superpowers/**` | historical | Plan archive for superseded planning cycles. | Current plan and active route docs | Route history |
| `docs/specs/*.md` | module-reference | Touching the ring-buffer or sliding-window buffer design. | Current code | Module reference |
| `docs/product_architecture_reset_routes/**` | historical | Route pack for the completed product architecture reset program; not current architecture authority. | `docs/architecture/**` and current code | Architecture history |
| `docs/build-infrastructure/*-planning-summary.md` | historical | Bi-planning closeout history. | Current code and `docs/architecture/**` | Build infrastructure history |
| `docs/build-infrastructure/*-audit-summary.md` | historical | Bi-audit closeout history. | Current code and `docs/architecture/**` | Build infrastructure history |
| `docs/build-infrastructure/browser-*.md` | historical | Browser integration route history. | `packages/ts-shell/src/browser/` and current code | Build infrastructure history |
| `docs/build-infrastructure/**` | historical | Build-infrastructure delivery and audit history (BI/MTB batch closeouts). | Current code and `docs/architecture/**` | Build infrastructure history |
| `docs/sprint/**` | historical | Sprint capability history. Active sprint documents are listed explicitly under Sprint Knowledge Base above, and a concrete row wins over this group row. | Current plan, current code, and the active rows above | Sprint Knowledge Base |
| `docs/product-architecture-reset/**` | historical | Product architecture reset program history. `executionBoundary/README.md` and `harness-eval-artifact-index.md` are active and listed individually above. | Current code | Architecture history |
| `docs/product_architecture_reset_routes/**` | historical | Route pack for the completed product architecture reset program; not current architecture authority. | `docs/architecture/**` and current code | Architecture history |
| `docs/implementation-context/**` | implementation-context | AI wiring context before rewiring a capability path; the manifest is machine-readable. | Current code | Implementation Context |
| `docs/project-map/**` | module-reference | Reading the read-only project map freeze; describes current target state only and recommends no routes. | Current code | Project Map |
| `docs/architecture/**` | module-reference | Touching the named subsystem. The active subset is listed under Active Architecture above; a concrete row wins over this group row. | Current code | Architecture |
| `docs/dev-history/**` | historical | Route closeout and migration history; moved route documents keep pointer stubs at their old paths. | Current code and active route docs | Route history |
| `docs/superpowers/**` | historical | Plan archive for superseded planning cycles. | Current plan and active route docs | Route history |
| `docs/specs/*.md` | module-reference | Touching the ring-buffer or sliding-window buffer design. | Current code | Module reference |
| `docs/PROJECT_MAP.md` | module-reference | Human entrypoint and high-level current-state summary. | Current code | Project Map |

**Grouping rule.** Rows above use globs deliberately: this map classifies *groups*
so a whole tree inherits one status instead of requiring a row per file. A concrete
path row always wins over a glob row for the same file. When a route creates a
long-lived document, classify it here before closeout.

## Update Rule

When a route creates a long-lived doc, classify it here before closeout. Prefer
adding one row or group over expanding the default read set.

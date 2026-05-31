# Context Planning Quality Audit

Status: CP001 audit and planning output.

This audit maps the current context and planning capability block after PL009.
It is based on targeted Serena inspection, focused source reads, focused tests,
and narrow reference comparison. It does not implement product code.

## Inspection Summary

Target source inspected:

- `packages/ts-shell/src/orchestration/repoIntelligence.ts`
- `packages/ts-shell/src/orchestration/contextEngine.ts`
- `packages/ts-shell/src/orchestration/contextGraphPlanning.ts`
- `packages/ts-shell/src/orchestration/contextGraphDiscovery.ts`
- `packages/ts-shell/src/orchestration/contextGraphScore.ts`
- `packages/ts-shell/src/orchestration/contextMemory.ts`
- `packages/ts-shell/src/orchestration/planningRuntime.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductExecution.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductProposal.ts`
- `packages/ts-shell/src/orchestration/planningMutationProposalBridge.ts`
- `packages/ts-shell/src/orchestration/workflowTaskPlanner.ts`
- `packages/ts-shell/src/context/readDeliveryProjection.ts`
- `packages/ts-shell/src/context/readWindowContinuation.ts`
- `packages/ts-shell/src/context/sessionContextRebuildProjection.ts`
- `packages/ts-shell/src/context/rebuildInput.ts`
- `packages/ts-shell/src/planning/planningRuntimeStage.ts`
- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/runtime/loop/productLoopAdapter.ts`
- `packages/ts-shell/src/runtime/loop/featureContract.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/evidence/verdictFacade.ts`
- `packages/ts-shell/src/presentation/productSurface.ts`

Focused tests inspected by name include planning runtime, planning product
proposal, planning mutation proposal bridge, context engine, repo intelligence,
context graph score/readiness, read delivery, read window continuation, session
context rebuild projection, PL008 rebuild input, PL009 product loop adapter,
product surface, and result mapper tests.

Reference comparison was limited to:

- GitNexus `ARCHITECTURE.md` and README MCP/resource descriptions for indexed
  repository graph, staleness, context, impact, and ranking patterns.
- mini-swe-agent default prompt/runtime loop for a minimal task -> plan -> edit
  workflow contrast.

## Current Context Path

| Step | Owner domain | Current file | Current integration | Agent Loop connection | Truthfulness risk |
|---|---|---|---|---|---|
| Prompt/task classification | `planning`, `orchestration` | `planning/workflowTaskPlan.ts`, `orchestration/workflowTaskPlanner.ts` | Product-integrated through coordinator planning. | Indirect: coordinator builds the product path loop trajectory and adapter. | Regex/cue classification can look decisive without enough repo facts. |
| Repo scan and candidate discovery | `orchestration` repo intelligence | `orchestration/repoIntelligence.ts` | Product-integrated for planning runtime, bounded to default 240 files and 8 candidates. | Not directly represented in PL009 adapter except as downstream planning/runtime evidence. | Candidate found is not correct target; bounded scan can miss deeper files. |
| Target ranking | `orchestration` repo intelligence | `orchestration/repoIntelligence.ts` | Partial. Heuristic token/path/symbol/role scoring. | Needs a future feature contract entry and loop-safe evidence ids. | File ranked high is not target correctness. |
| Staged reads/context packet | `orchestration` context graph | `contextGraphPlanning.ts`, `contextGraphDiscovery.ts`, `contextGraphScore.ts` | Product-integrated in planning runtime, but scoped to selected candidate. | Needs explicit loop phase handoff facts for context acquisition. | Targeted packet can under-read call sites or tests and still produce plan artifacts. |
| Context graph/code graph | `orchestration` context graph | `contextGraphPlanning.ts` | Partial. Builds packet, graph, score, test impact, staleness, code graph trace/result. | Not yet in PL009 adapter safe references. | Graph quality and staleness are evidence, not enough-context success. |
| Context memory | `orchestration` context memory | `contextMemory.ts`, `contextEngine.ts` | Partial. Product-turn memory reuse exists; session-continuation persistence is not wired in the planning product output. | Needs memory reuse/staleness feature contract before loop success claims. | Reused memory is not fresh context. |
| Context rebuild | `context` | `sessionContextRebuildProjection.ts`, `rebuildInput.ts` | PL008/PL009 integrated as report-safe active path and rebuild input. | Connected to PL009 adapter through `contextRebuildInputIds` and `contextRebuildProjectionIds`. | Available active path is not context completeness. |
| Read delivery projection | `context` | `readDeliveryProjection.ts` | Product-integrated for read tasks. | Separate from PL009 adapter today except via context/rebuild evidence. | Delivered snippet is not task success or full-file understanding. |
| Read window continuation | `context` | `readWindowContinuation.ts` | Partial continuation support for fragments and line windows. | Connected through PL008 continuation context and PL009 continuation boundary. | Continuation-ready is not continuation success. |
| Product surface output | `presentation` | `presentation/productSurface.ts` | Product-integrated rendering of context/session/loop facts. | Renders PL009 adapter section as observed/not-proven. | Product surface rendered is not success. |

Evidence:

- `runContextEngine` calls repo intelligence, evaluates context memory reuse,
  picks the first ranked candidate, builds a context graph planning bundle, and
  returns missing facts and next read suggestions
  (`packages/ts-shell/src/orchestration/contextEngine.ts:56`).
- `buildRepoIntelligence` creates a bounded snapshot, module/package maps,
  candidates, missing facts, and raw-content-excluded evidence
  (`packages/ts-shell/src/orchestration/repoIntelligence.ts:67`).
- `rankRepoCandidates` is heuristic: task token overlap, role boost, package
  script boost, path-name match, primary source name boost, freshness boost
  (`packages/ts-shell/src/orchestration/repoIntelligence.ts:135`).
- `buildContextGraphPlanningBundle` builds packet, graph, graph score, test
  impact, staleness, code graph facts/trace/impact/result, task context needs,
  acquisition, sufficiency, lifecycle, execution plan, plan quality, harness
  trace, and scorecard (`packages/ts-shell/src/orchestration/contextGraphPlanning.ts:78`).
- `projectSessionContextRebuild` marks raw transcript, tool details, resources,
  raw provider output, raw edit content, and unredacted command output as
  excluded unsafe facts (`packages/ts-shell/src/context/sessionContextRebuildProjection.ts:83`).
- `buildLoopContextRebuildInput` carries active path, next turn, save point,
  tool result, verification, repair, provider/resource/package ids, missing
  facts, redaction, and not-proven claims
  (`packages/ts-shell/src/context/rebuildInput.ts:45`).

## Current Planning Path

| Step | Owner domain | Current file | Current integration | Agent Loop connection | Not-proven claim |
|---|---|---|---|---|---|
| Task analysis | `orchestration` planning runtime | `planningRuntime.ts` | Product-integrated for selected planning route. | Indirect through coordinator and product outcome projection. | Analysis confidence is not correctness. |
| Plan generation | `orchestration` planning/context graph | `contextGraphPlanning.ts`, `planningRuntime.ts` | Partial/product-integrated for bounded context. | Needs explicit future feature contract. | Plan generated is not edit authority. |
| Target selection | `orchestration` repo intelligence + planning | `repoIntelligence.ts`, `planningRuntime.ts` | Partial. First ranked candidate drives context graph; edit targets come from memory rationale and blocking facts. | Not currently a PL009 safe reference category. | Ranked target is not correct target. |
| Edit target readiness | `orchestration` planning handoff | `planningRuntime.ts`, `planningMutationHandoffProjection.ts` | Product-integrated review-only handoff. | Should be future loop output handoff fact. | Ready-for-review is not apply authority. |
| Verification intent | `verification`, `orchestration` | `planningRuntime.ts`, verification command planner | Partial. Produces intent and evidence; command dispatch remains not-run unless explicit product path options are supplied. | Should be future loop output handoff fact to verification phase. | Verification intent is not verification passed. |
| Proposal handoff | `orchestration` | `planningMutationProposalBridge.ts` | Partial. Consumes handoff, may prepare proposal or anchor exact proposal, stops at confirmation-required. | Should connect as feature output facts and runtime events. | Proposal prepared/exact-ready is not write success. |
| Product projection | `orchestration`, `result` | `planningRuntimeProductProjection.ts` | Product-integrated. Review-only path projects failed/unverified files and insufficient evidence. | Separate product path projection; not yet part of PL009 adapter feature contract. | Review-only projection is not success. |
| Next action | `orchestration`, `presentation` | `planningRuntimeProductProjection.ts`, `productSurface.ts` | Product-integrated output text/surface. | Should be rendered under context/planning section once integrated. | Next action text is not proof. |

Evidence:

- `runPlanningRuntime` calls `runContextEngine`, builds verification intent,
  blocking facts, planning warnings, edit targets, grounded planning,
  mutation handoff, continuation memory, and explicit not-run evidence for
  mutation authority, provider call, and command dispatch
  (`packages/ts-shell/src/orchestration/planningRuntime.ts:65`).
- `projectPlanningRuntimeProductOutcome` consumes planning runtime output,
  prepares proposals, builds proof inputs, runs the proof route, optionally runs
  verification command and repair continuation, but falls back to a review-only
  `insufficient-evidence` coding outcome when proof runtime outcome is not
  justified (`packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts:30`).
- `buildPlanningMutationProposalBridge` refuses non-ready handoffs, keeps missing
  exact mapping as review-required, and requires confirmation before exact
  anchored proposals can invoke existing apply lanes
  (`packages/ts-shell/src/orchestration/planningMutationProposalBridge.ts:107`).
- `executeWorkflowTaskPlan` runs `runPlanningRuntimeStage` before later proposal
  and edit stages (`packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts:971`).
- `ShellSessionRuntime` is a host seam: it builds continuity, streams query
  events, appends events to session manager, renders terminal surfaces, and
  saves completed/error/interrupted state without owning planning truth
  (`packages/ts-shell/src/core/shell/sessionRuntime.ts:82`).

## Weakness Classification

| Capability | Classification | Basis |
|---|---|---|
| Broad repo discovery | partial | Bounded file scan and package/module maps exist, but no persistent graph index, no full dependency graph, and cache is `enabled-not-used`. |
| Code graph quality | partial | Context graph planning builds code graph trace/impact/staleness, but quality depends on selected candidate and current packet graph. |
| Symbol understanding | partial | Repo intelligence extracts symbol hints; no general symbol map comparable to indexed graph resources. |
| Cross-file reasoning | partial | Context graph/test impact/code graph impact exist; breadth remains constrained by candidate and budgets. |
| Target ranking | partial | Heuristic ranker has tests and scoring reasons; ranking is not target correctness. |
| Missing facts handling | product-proven for projection, partial for capability | Missing facts are carried into context/planning outputs and product projection, but future routes must harden coverage semantics. |
| Stale context detection | partial | Context graph staleness and memory freshness exist; persistent repo index invalidation is not implemented by default. |
| Memory reuse | partial | `canReuseContextMemory` gates reuse, but planning product output still records product-turn scope and no session-continuation persistence. |
| Continuation context | partial | Read windows and PL008 rebuild inputs exist; continuation success and storage-backed branch/compaction remain not proven. |
| Plan ownership | partial | Planning runtime owns the current plan projection, but planning surfaces are split across `planning/`, `orchestration/`, `context/`, and product projection files. |
| Plan-to-edit handoff | partial | Mutation handoff and proposal bridge exist but stop before apply authority by design. |
| Plan-to-verification handoff | partial | Verification intent exists; command dispatch is not-run by default. |
| Product surface clarity | partial | PL009 adapter renders observed/not-proven loop sections; context/planning-specific adapter section does not exist yet. |
| False confidence in context completeness | unsafe to claim | Current code carries missing facts and not-proven claims, but future implementation must prevent any "enough context" shortcut from becoming success. |

## Agent Loop Connection Requirements

Every future context/planning capability must enter the PL009 feature integration
contract shape defined by `FutureFeatureIntegrationDeclaration`:
owner domain, loop phase, input facts, output handoff facts, runtime events,
evidence facts, product surface section, result truthfulness boundary,
not-proven claims, forbidden shortcuts, validation gates, and
`terminalSuccessClaim=false`.

| Capability | Loop phase | Input facts | Output handoff facts | Runtime events | Evidence facts | Product surface section | Not-proven claims | Forbidden success shortcut | Validation gate |
|---|---|---|---|---|---|---|---|---|---|
| Repo intelligence and context discovery | `context-discovery` | user task, workspace label, package map, bounded file scan profile | repo snapshot id, candidate ids, missing discovery facts, next read suggestions | context discovery observed | scan budget, candidate reasons, raw-content-excluded | Context discovery | context-found-is-not-enough-context | candidate found implies correct target | repo intelligence and context discovery tests |
| Target ranking | `target-selection` | repo snapshot, task tokens, symbol hints, role hints | ranked target ids, ranking reasons, ambiguity/missing facts | target ranking observed | score components, omitted candidates | Target ranking | high-rank-is-not-correct-target | top candidate is edit authority | target ranking ambiguity tests |
| Staged reads and context graph | `context-acquisition` | selected candidate, read budget, packet ids | context packet id, graph id, graph score, omitted context, missing facts | context packet/graph observed | read receipts, graph score, test impact, staleness | Context graph | context-graph-is-not-complete-context | graph score implies task success | staged read/context graph/missing facts tests |
| Context memory reuse | `context-memory` | previous memory id, current snapshot id, file labels | reuse decision, stale files, invalidation reason | context memory reuse observed | freshness evidence, safety rejection evidence | Context memory | memory-reused-is-not-fresh-context | reusable memory implies current facts | stale context and memory reuse tests |
| Planning owner | `planning` | context sufficiency, analysis calibration, task lifecycle | plan id, execution plan id, plan quality id, blocked facts | planning observed | plan quality evidence, lifecycle stage evidence | Planning | plan-generated-is-not-edit-authority | plan generated implies implementation approval | planning owner and plan quality tests |
| Plan-to-edit handoff | `edit-handoff` | edit targets, read evidence, proposal review envelope | mutation handoff id, proposal bridge id, confirmation state | mutation handoff observed | anchor quality, confirmation requirement | Edit handoff | edit-target-ready-is-not-apply-authority | exact-ready implies write success | plan-to-edit handoff tests |
| Plan-to-verification handoff | `verification-handoff` | plan quality, code graph impact, test impact | verification intent id, command selection state | verification intent observed | selection source/scope, command-dispatch state | Verification intent | verification-intent-is-not-verification-passed | command selected implies passed | plan-to-verification tests |
| Product surface clarity | `product-surface` | context/planning facts, adapter contract, result truth | context/planning surface sections | surface rendered observed | source ids and not-proven claims | Context and planning loop | product-surface-rendered-is-not-success | rendered surface implies success | product surface and result-contract tests if terminal output changes |

## PL009 Fit

PL009 currently provides the spine, not the fact owner:

- `projectProductLoopAdapter` owns the `runtime/loop` adapter projection, host
  consumer list, safe references, phase status, unsupported phases, continuation
  boundary, result truthfulness boundary, not-proven claims, and
  `terminalSuccessClaim=false`.
- `validateFutureFeatureIntegration` enforces the declaration fields future
  context/planning work must provide.
- `productSurface` renders the adapter and feature contract as observed/not
  proven, preserving terminal truth.

Future context/planning work should add feature contracts and owner-domain facts
to the adapter. It must not move repo intelligence, planning, context memory,
verification, edit authority, or result truth into `runtime/loop`.

## Truthfulness Guardrails

- Context found is not enough-context success.
- A high-ranked file is not a correct target.
- A context graph score is not repository understanding success.
- A plan generated from bounded context is not edit authority.
- Edit target ready/review-ready is not apply authority.
- Proposal prepared, exact-ready, or confirmation-required is not write success.
- Memory reused is not fresh context.
- Hidden stale context is false success.
- Optional missing facts must remain visible.
- Verification intent or selected command is not verification passed.
- Read delivered is not task success.
- Continuation-ready is not continuation success.
- Product surface rendered is not task success.
- PL009 adapter observed or feature contract valid is not task success.

## Reference Comparison

GitNexus shows a stronger repository-intelligence direction for future routes:
an explicit index -> graph -> tools/resources flow, persistent staleness checks,
hybrid search, context and impact tools, process traces, clusters, and generated
repo-specific skills. CP002 should borrow the shape of "index facts are
queryable and stale-aware" without importing GitNexus code or introducing MCP,
SDK, dynamic plugin, or persistent service behavior.

mini-swe-agent shows the opposite extreme: a simple prompt-level workflow that
asks the model to inspect, plan, edit, and verify. The local product should not
fall back to prompt-only planning; CP002+ should keep context and planning
machine-readable with explicit evidence and handoff facts.

## Validation Strategy For Next Implementation Route

The next implementation route should validate:

- focused context discovery tests
- repo scan budget and candidate omission tests
- target ranking ambiguity and tie-break tests
- missing required and optional facts tests
- stale context and memory invalidation tests
- memory reuse acceptance/rejection tests
- context graph/read packet coverage tests
- planning owner and plan quality tests
- plan-to-edit handoff tests
- plan-to-verification handoff tests
- Agent Loop feature contract tests
- product surface tests
- result-contract if terminal/session output changes

No route may treat provider-called, selected-not-run, exact-ready, review-only,
fake/default evidence, context-found, plan-generated, or product-surface-rendered
as success.

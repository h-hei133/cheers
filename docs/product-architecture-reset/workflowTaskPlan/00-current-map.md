# Current Map

## File Size

| File | Lines | Role |
|---|---:|---|
| `packages/ts-shell/src/planning/workflowTaskPlan.ts` | 3596 | Planning facade plus embedded domain planning rules. |
| `packages/ts-shell/src/planning/workflowTaskPlan.test.ts` | 31 | Focused coverage for command blocker and read-only read request. |
| `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts` | 1358 | Runtime consumer of plan facade. |
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts` | 8289 | Broad behavior suite covering many plan outcomes indirectly. |

## Imports

The import block shows planning is currently coordinating many product domains:

| Imported owner | Imported responsibilities | Ownership signal |
|---|---|---|
| `node:fs`, `node:path` | Candidate existence checks, path rebasing, directory pruning, path scoring. | Planning currently performs filesystem-backed target eligibility; should be isolated to target/continuation planning. |
| `core/paths/legacyRootRebase` | Workspace rebind for continuation targets. | Concrete path owner; acceptable as dependency, but not as broad path logic inside plan facade. |
| `context/readWindowContinuation` | Read window directives, read fragment fingerprints, read fragment recovery. | Context/read planning facts are valid inputs, but fragment parsing belongs in context owner. |
| `evidence/continuationTransformEvidence` | Parses transform evidence strings. | Evidence parsing imported into planning; should be an evidence or repair adapter, not broad plan logic. |
| `planning/promptTargetProjection` | Prompt path detection and path token stripping. | Valid planning-owned target projection. |
| `policy/commandIntentPolicy` | Verify command detection and opt-out. | Valid policy import; command policy itself must stay outside planning. |
| `edit/mutationInstructionPlanner`, `edit/mutationTargetSelection` | Fenced content, inline write content, replace directive, low-risk rename, mutation target selection. | Planning may emit mutation facts, but edit parsing and target selection should remain edit-owned. |
| `repair/groundedAnswerRepair` | Grounded deliverable mode and answer repair instruction planning. | Repair/read-answer planning should be repair-owned with a planning adapter. |
| `orchestration/browserModule` | Browser plan detection. | Browser intent can be a plan fact; browser-specific plan detection should move to browser owner when available. |
| `orchestration/capabilityBoundaryProjection` | Command detection, command blockers, allowlist. | Command authority/policy must not be owned by planning. |
| `orchestration/continuationModule` | Workflow continuation lineage, repair/verify continuation objects, local evidence checks. | This is core continuation planning, but the owner should be split by session/repair/verification. |
| `orchestration/continuationPlanning` | Reflective state response builder. | Imported only because `reflectiveStateQueryKind` is planned; response output itself is not owned here. |
| `orchestration/doNextProjection` | Blocked reason formatting. | Planning may produce blocked reasons; execution failure formatting should not become terminal truth. |
| `orchestration/providerModule` | Provider diagnostic handoff facts. | Provider diagnostic facts are input to planning; provider runtime remains outside planning. |
| `orchestration/readInspectModule` | Read intent and missing/out-of-workspace target stops. | Context/read planning adapter; delivery output must stay outside planning. |
| `orchestration/verificationModule` | Strip verify tail for target resolution. | Verification intent adapter; verification execution remains outside planning. |
| `orchestration/editExpectationContract` | Write/edit expectation contract. | Edit contract import is acceptable as an adapter, but edit semantics should stay edit-owned. |
| `orchestration/runtimeHandoffProjection` | Continuity state, lineage, grounded mode types. | Runtime/session continuity facts feed planning; persistence and terminal truth stay outside. |
| `orchestration/targetResolution` | Target resolution and blockers. | Target planning fact owner should become product planning/target module. |
| `orchestration/workflowTaskPlanner` | `WorkflowTaskPlan` contract and trace builder. | Current stable compatibility contract. |
| `orchestration/workflowIntentProjection` | Reflective workflow intent projection. | Intent classification input; should move under planning or remain a stable projection dependency. |

## Exports And Consumers

| Export | Consumer evidence | Current role |
|---|---|---|
| `buildWorkflowTaskPlan` | Imported by `runtime/workflowExecutionCoordinator.ts`; tested by `planning/workflowTaskPlan.test.ts`. | Main product planning facade. |
| `extractInlineContinuityContext` | Imported by `runtime/workflowExecutionCoordinator.ts`. | Temporary adapter that parses inline continuity block before planning. |
| `rebindContinuationTargetToWorkspace` | Only referenced inside `workflowTaskPlan.ts` in current search. | Exported but effectively local; possible compatibility residue. |

The stable `WorkflowTaskPlan` type is still exported from `orchestration/workflowTaskPlanner.ts`, not this file. Current downstream runtime stages consume that contract through the older orchestration path.

## Major Public Types

| Type | Location | Role |
|---|---|---|
| `WorkflowTaskIntentSignals` | Local interface, lines 102-142. | Dense internal signal bundle used by `buildWorkflowTaskPlan`. |
| `WorkflowTaskPlan` | Imported from `orchestration/workflowTaskPlanner.ts`. | Stable plan contract returned to runtime. |
| `ContinuationTransform`, `SingleFileEditFailureReason`, `SingleFileEditRepairPayloadKind`, grounded repair types | Imported from `orchestration/workflowTaskPlanner.ts`. | Compatibility types used by planning, edit, repair, and continuation branches. |

## Major Functions And Regions

| Lines | Symbol/region | Responsibility | Current owner signal |
|---:|---|---|---|
| 1-100 | Imports | Pulls context, policy, edit, repair, browser, command, continuation, result-adjacent projection, target, and evidence parsing dependencies. | Broad planning facade plus monolith signal. |
| 102-142 | `WorkflowTaskIntentSignals` | Aggregates prompt and continuity-derived intent booleans and command/replace facts. | Valid planning shape, too broad as one interface. |
| 145-2013 | `buildWorkflowTaskPlan` | Builds the complete `WorkflowTaskPlan`; includes intent classification, target resolution, browser branch, continuation recovery, read/repair/verify/command/write plan selection, blocked reasons, cross-file repair planning, and fallback chat. | Valid facade, but internally a monolith. |
| 198-247 | Initial target/browser/blocker branch | Resolves targets, strips verify tails, detects browser plan, blocks ambiguous mutation target. | Mixed planning, browser, policy, target. |
| 248-617 | Continuity, diagnostic, seed, repair-context, weak continuation, target selection setup | Merges continuation facts, action-result seed facts, provider diagnostic handoff, edit failure recovery, read continuity, target selection. | Session/context/repair/policy logic inside planning. |
| 618-760 | Grounded mode, read window, mutation scope, failed transforms, cross-file candidate setup | Builds read and edit planning facts from context and repair evidence. | Context and repair extraction candidate. |
| 760-903 | Structured repair/verify continuation setup and cross-file gates | Builds repair and verify objects; decides weak cross-file continuation behavior. | Repair/verification/session logic inside plan facade. |
| 904-1213 | Early blocked and reflective branches | Returns repair blocked plans, lineage blocked plans, verify continuation plans, degraded reopen blockers, context seed/boundary reset blockers, reflective chat. | Valid blocked planning, but split by repair/verification/session. |
| 1225-1618 | Read-like and grounded answer branches | Plans answer repair, pathless read recovery, local mutation scope blockers, read/summarize/explain/repo diagnosis behavior. | Context/read and grounded repair planning embedded. |
| 1624-1754 | Continuation edit/write and diagnosis branches | Plans cross-file repair, restored edit/write, noop repair, repo-explain. | Edit/repair/context selection embedded. |
| 1756-1888 | Discovery edit, command, write/edit target and transform branches | Plans unsupported discovery edit, command execution intent, write/edit missing target/out-of-workspace/transform blockers, concrete write/edit plan. | Planning facade should call edit/policy adapters. |
| 1891-2013 | Read/inspect/summarize fallback and chat fallback | Plans read-file, path-only read, summarize/explain, inspect-files, final chat. | Mostly valid task-kind selection with context adapters. |
| 2016-2020 | `shouldBuildContextPlanningSurface` | Detects context packet/planning surface cues. | Context planning extraction candidate. |
| 2022-2032 | `removeNegatedMutationInstructions` | Removes negated mutation sentences before intent classification. | Valid intent classification detail. |
| 2034-2173 | `extractWorkflowTaskIntentSignals` | Computes prompt intent, reflective state, read/edit/write/verify/command signals. | Valid planning, should split into intent module plus policy adapters. |
| 2175-2695 | `extractInlineContinuityContext` | Parses inline continuity context block into `ContinuityStateLike`, including read, repair, verification, approval, permission, request-scope, and continuation facts. | Session adapter in wrong owner; temporary compatibility glue. |
| 2697-2843 | Single-file edit failure repair context helpers | Extracts failed edit reason, target candidates, abandonment, payload kind. | Repair/edit continuation planning extraction candidate. |
| 2845-2870 | `rebindContinuationTargetToWorkspace`, `isUsableContinuationTargetPath` | Rebinds candidate paths and prunes placeholders. | Concrete path/continuation target planning. |
| 2872-3099 | Cross-file evidence and state extraction | Reads continuation evidence strings for remaining, processed, failed, degraded state. | Evidence parser plus repair planning extraction candidate. |
| 3103-3290 | `resolveContinuationReopenTarget` and degraded reopen predicates | Selects degraded/reopen target candidates using evidence, workspace checks, lexical cues, pruning. | Repair/session target planning; filesystem-backed logic should be isolated. |
| 3293-3485 | Prompt follow-up predicates and key terms | Regex cue classifiers for correction, repair, verify, weak continuation, cross-file repair, answer repair, local explain. | Intent/repair/verification/context planning modules; `extractKeyTerms` appears deprecated residue. |
| 3488-3504 | `uniqueStable`, `hashStableId` | Stable dedupe/hash for local planning facts. | Local implementation detail unless reused by context. |
| 3506-3562 | Transform continuity helpers | Infers/collects replace transforms from continuation evidence. | Evidence parser plus repair continuation planning. |
| 3565-3588 | Mutation instruction failure guard and target-resolution blocker policy | Type guard and ambiguous target mutation blocker. | Edit adapter plus target policy. |
| 3591-3596 | `normalizePathLike` | Local slash/relative path normalization. | Concrete path projection; avoid generic helper bucket. |

## Current Tests

`workflowTaskPlan.test.ts` has two focused cases:

- Non-allowlisted command intent remains a blocked `run-command` plan.
- Explicit read request remains `read-file` and read-only.

Most behavior is covered indirectly through `runMvpIntegratedFlow.test.ts` and adjacent domain tests. The focused planning test is insufficient for safe extraction without adding characterization coverage per route.

## Consumer Surface

Direct references found:

- `runtime/workflowExecutionCoordinator.ts` imports `buildWorkflowTaskPlan` and `extractInlineContinuityContext`.
- `planning/workflowTaskPlan.test.ts` imports `buildWorkflowTaskPlan`.
- `rebindContinuationTargetToWorkspace` has no current external references from the inspected reference result; it is only used internally.

The current compatibility surface should remain stable while internal modules are extracted.

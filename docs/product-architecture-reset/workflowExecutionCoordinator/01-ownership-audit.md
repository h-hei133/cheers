# Ownership Audit

Classification vocabulary:

- Valid runtime coordination: sequencing, environment setup, stream parity, orchestrator handoff, thin domain-stage calls.
- Domain logic in wrong owner: policy, planning, edit, verification, repair, evidence, result, browser, or context semantics implemented inside runtime.
- Compatibility glue: legacy name/path/type surface required for current consumers.
- Temporary adapter: acceptable short-term bridge until a product owner facade exists.
- Extraction candidate: should move in a future implementation route.
- Deprecated/legacy residue: no longer an appropriate runtime concern and likely removable after reference checks.

## Symbol And Region Classification

| Symbol/region | Current responsibility | Classification | Final owner | Action |
| --- | --- | --- | --- | --- |
| Import block | Aggregates many owner domains. | Extraction candidate signal. | Split by owner as regions move. | Do not edit in audit; future routes reduce imports. |
| `ApplyPatchRuntimeRouteOptions` re-export | Keeps legacy type available from runtime path. | Compatibility glue. | `edit/applyPatchRuntimeBridge.ts` owns type; runtime may re-export temporarily. | Keep until callers use product turn facade or edit owner directly. |
| `MvpIntegratedFlowOptions` | Legacy input surface. | Compatibility glue. | Runtime/product turn facade. | Keep, but future product-named input should be added before renaming. |
| `runMvpIntegratedFlow` | Apply-patch bridge, env setup, runner creation, orchestrator run, metrics, cleanup. | Valid runtime coordination plus compatibility glue. | `runtime/` entrypoint, with legacy export preserved. | Stay; later rename only through compatibility facade route. |
| `streamMvpIntegratedFlow` | Stream equivalent with apply-patch terminal result parity. | Valid runtime coordination plus compatibility glue. | `runtime/` entrypoint. | Stay; preserve stream/non-stream parity. |
| `createIntegratedRunner` planner branch | Emits plan-accepted content and runtime notes. | Valid runtime coordination with minor terminal text residue. | `runtime/` role runner. | Stay unless product turn facade replaces legacy role runner. |
| `createIntegratedRunner` coder plan/chat branch | Extracts inline continuity, builds workflow plan, freshness, decision trace, handles chat/provider draft/reflective output. | Temporary adapter; partly planning/provider/context logic. | Runtime calls `planning/`, `evidence/`, `provider/`, `context/`. | Split only after `executeWorkflowTaskPlan` shrinks. |
| `createIntegratedRunner` reviewer branch | Provider draft for reviewer content. | Valid coordination if provider stage owns drafting. | `runtime/` plus `provider/`. | Stay. |
| `WorkflowExecutionResult` | Local execution adapter shape. | Valid runtime coordination. | Runtime execution stage. | Stay or move with extracted executor facade. |
| `executeWorkflowTaskPlan` accumulator setup | Initializes notes/events/changed/failed/patch/evidence/provenance/git state. | Temporary adapter and extraction candidate. | `runtime/` execution context plus `evidence/` result receipt builders. | Split into explicit execution context object when extracting stages. |
| Planning runtime stage call | Delegates to `runPlanningRuntimeStage`. | Valid runtime coordination. | `planning/`. | Stay as thin call. |
| Anchored proposal stage call | Delegates proposal. | Valid runtime coordination. | `proposal/`. | Stay as thin call. |
| Discovery edit runtime request and plan | Builds/executes discovery edit flow. | Domain logic in wrong owner. | `edit/discoveryEditRuntime.ts` and `edit/editPatchModule.ts`. | Move into edit-owned stage facade. |
| Discovery target-set permission loop | Creates workspace authority and checks each target. | Domain logic in wrong owner. | `edit/targetSetEditRoute.ts` with `policy/` or patchResult authority. | Move; runtime should pass enforcer/workspaceRoot only. |
| Fenced edit activation branch | Selects activation, permission, workspace authority, route result. | Domain logic in wrong owner. | `edit/fencedEditRuntimeStage.ts` or `edit/editPatchModule.ts`. | Move with discovery edit branch. |
| Cross-file state variable declarations | Holds remaining/degraded/failed/skipped state. | Repair/result domain state in runtime. | `repair/` state and `result/` projection inputs. | Move when cross-file repair stage is extracted. |
| Blocked reason branch | Projects blocked/context planning outcome. | Mixed coordination and result/context logic. | `result/` and `context/`. | Split: runtime routes, owners project. |
| Browser branch | Delegates `executeBrowserModulePlan`. | Valid runtime coordination. | `browser/` when directory exists, currently `orchestration/browserModule.ts`. | Keep as thin call; future move only in browser route. |
| Reopen evidence and verify hint markers | Pushes continuity and verify evidence. | Evidence truth rules in wrong owner. | `evidence/` with planning/verification receipt inputs. | Move into evidence facade or stage receipts. |
| Inspect-first read | Tool read, failed read result, protected snapshots, read delivery. | Context/read and edit preflight logic in wrong owner. | `context/readRuntimeStage.ts` and `edit/editPreflightStage.ts`. | Split. |
| Read-file result projection | Calls read delivery and projects read-only result. | Domain logic in wrong owner. | `context/readRuntimeStage.ts` plus `result/`. | Move as a read stage returning receipts. |
| Context planning on read/blocker | Builds context graph packet and agent plan result. | Context/planning domain logic in wrong owner. | `context/` and `planning/`. | Move after read stage exists. |
| Write protected snapshots | Captures unchanged assertions. | Verification/edit safety logic in wrong owner. | `verification/lowRiskVerificationStage.ts` or `edit/editVerificationPreflight.ts`. | Move with low-risk verification extraction. |
| Inspect-files branch | Glob `.ts`, delivery projection, failure projection. | Context domain logic in wrong owner. | `context/inspectFilesStage.ts`. | Move. |
| Repo-explain branch | Candidate collection, target selection, read, diagnosis metadata. | Context/repo explain domain logic in wrong owner. | `context/repoExplainStage.ts`. | Move. |
| Primary edit/write planning | Extracts fenced/replace/rename, repair alternatives, stale transform checks. | Edit and repair logic in wrong owner. | `edit/mutationInstructionPlanner.ts`, `repair/continuationRepairStage.ts`. | Move. |
| Mutation instruction failure projection | Maps instruction failure to patches, failed files, context planning output. | Edit/result logic in wrong owner. | `edit/mutationRuntimeStage.ts` and `result/`. | Move with primary mutation stage. |
| Primary mutation dispatch | Uses permission scope evidence, stale-read guard, dispatch. | Runtime dispatch plus write authority policy. | `edit/mutationRuntimeStage.ts`, `policy/approvalAuthorityProjection.ts`, `patchResult/workspaceAuthority.ts`. | Move authority assembly; runtime can invoke stage. |
| Low-risk rename refactor loop | Reads and mutates related paths. | Edit/refactor logic in wrong owner. | `edit/lowRiskRenameStage.ts` or mutation planner owner. | Move. |
| Secondary writes loop | Extracts and writes secondary files. | Edit/write expansion logic in wrong owner. | `edit/secondaryWriteStage.ts`. | Move or retire if unsupported by current contract. |
| Cross-file repair loop | Reads linked files, generates patch, mutates, computes degradation. | Repair strategy in wrong owner. | `repair/crossFileRepairStage.ts`. | Move as a complete stage. |
| Mutation summary reconciliation | Reconciles mutation result aggregate. | Result/evidence aggregation in wrong owner. | `result/` or `edit/mutationResultAggregation.ts`. | Move with mutation stage or result facade. |
| Direct command stage | Delegates to `runDirectCommandStage`. | Valid runtime coordination. | `verification/commandStage.ts`. | Stay as thin call. |
| Verification planning call | Delegates `planWorkflowVerification`. | Valid coordination. | `verification/`. | Stay. |
| Low-risk verification block | Implements consistency/content/unchanged readback statuses and reasons. | Verification semantics in wrong owner. | `verification/lowRiskVerificationStage.ts`. | High-priority extraction. |
| Command verification retry loop | Dispatches verify command, classifies failure, projects retry/evidence. | Verification semantics partly delegated, loop in runtime. | `verification/commandVerificationStage.ts`. | Move after low-risk extraction. |
| Skipped/not-requested verification projection | Marks changed files unverified and projects status. | Result/verification semantics in wrong owner. | `verification/` plus `result/`. | Move with verification stage. |
| Repair note fallback | Adds generic repair note when failed files exist. | Result/repair projection residue. | `result/` or `repair/`. | Move with final result handoff. |
| Final result contract assembly | Builds capability plan, receipts, mutation/command handoff, provenance. | Evidence/result truth assembly in runtime. | `result/workflowRuntimeProjection.ts` and `evidence/`. | Move behind result/evidence facade. |
| Prompt follow-up predicates | Regex-based correction/repair/verify/chat continuation checks. | Deprecated/legacy residue in runtime. | `planning/workflowTaskPlan.ts` or remove if unused. | Verify references; delete or move only under planning route. |
| `extractKeyTerms` | Token term extraction. | Deprecated/legacy residue in runtime. | `planning/` or remove if unused. | Verify references before deletion. |
| `inferReplaceDirectiveFromContinuity` | Reads transform evidence and produces directive. | Repair/planning logic in wrong owner. | `repair/continuationRepairStage.ts` or `planning/workflowTaskPlan.ts`. | Move if referenced; otherwise delete later. |
| `parseTransformEvidence` | Parses evidence strings into executable transforms. | Evidence and repair logic in wrong owner. | `evidence/` parser plus `repair/` consumer. | Move; preserve non-consumption of stale blocker evidence. |
| `collectContinuationTransforms` | Converts continuity evidence into transforms. | Planning/repair logic in wrong owner. | `planning/` or `repair/`. | Move or delete after reference audit. |
| `isMutationInstructionFailure` | Type guard for mutation planner output. | Edit adapter. | `edit/mutationInstructionPlanner.ts` could export guard. | Move with edit stage. |
| `shouldBlockMutationForTargetResolution` | Target-resolution blocker policy. | Planning/target policy in wrong owner. | `planning/workflowTaskPlan.ts` or `orchestration/targetResolution.ts`. | Move; runtime must not decide target policy. |
| `normalizePathLike` | Local path normalization. | Shared path handling. | `core/paths/` if still needed. | Avoid generic helper bucket; move only with concrete owner. |

## File-Level Verdict

The file is not an unacceptable monolith because several major domains are already delegated and the public runtime entrypoints are small. It is not yet a clean runtime coordinator because the 500-2941 execution region still owns domain decisions and truth-preserving projections. The correct classification is partial new monolith with a valid runtime shell.


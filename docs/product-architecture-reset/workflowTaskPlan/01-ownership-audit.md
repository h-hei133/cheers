# Ownership Audit

Classification vocabulary:

- Valid planning ownership: produces plan facts, task kind, target facts, continuation facts, branch inputs, or blocked planning reasons without executing work or projecting terminal truth.
- Domain logic in wrong owner: policy, context, edit, verification, repair, browser, session, evidence, result, or path behavior implemented directly in `workflowTaskPlan.ts`.
- Compatibility glue: current import/export or adapter shape required to keep existing runtime consumers working.
- Temporary adapter: acceptable short-term bridge while the final owner module does not yet expose a narrow planning surface.
- Extraction candidate: should move in a future implementation route.
- Deprecated/legacy residue: appears unused, over-exported, or not clearly part of current planning behavior; requires reference/build proof before deletion.

## File-Level Verdict

`workflowTaskPlan.ts` is a valid planning owner at the public facade level, but it is also the new planning monolith. It is not an unacceptable runtime monolith because it does not execute commands, writes, repairs, verification, browser actions, session persistence, or terminal result projection. It is not clean architecture because its 3596 lines host logic that belongs to session, context, edit, repair, verification, browser, policy, evidence, and path owners.

## Symbol And Region Classification

| Symbol/region | Current responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| Import block | Aggregates many owner domains into one planning file. | Extraction candidate signal. | Split by destination owner. | Reduce through grouped extraction; no runtime import of docs/scripts/history. |
| `WorkflowTaskIntentSignals` | One large signal bundle for read/edit/write/verify/command/repair/diagnosis/reflective state. | Valid planning ownership plus extraction candidate. | `planning/workflowIntentSignals.ts`. | Move as internal planning contract; split owner-specific inputs later. |
| `buildWorkflowTaskPlan` public facade | Returns stable `WorkflowTaskPlan` for runtime. | Valid planning ownership and compatibility facade. | `planning/workflowTaskPlan.ts`. | Keep facade and output shape stable. |
| Initial `continuityStateAsObject`, continuation intent, replay lineage | Normalizes continuity input and starts lineage facts. | Valid planning with session dependency. | `session/turnContinuationFacts.ts` plus planning facade. | Planning consumes session facts, not persistence. |
| `extractWorkflowTaskIntentSignals` call | Computes high-level prompt signals. | Valid planning ownership. | `planning/workflowIntentSignals.ts`. | Extract before changing branch logic. |
| `resolveTaskTargets`, verify-tail fallback, `derivePromptPathTarget`, explicit target selection | Resolves candidate plan targets. | Valid planning ownership with target module extraction. | `planning/workflowTargetPlanning.ts` and existing `planning/promptTargetProjection.ts`. | Keep `targetPath` and blocker wording compatible. |
| `detectWorkflowBrowserPlan` branch | Detects browser task and returns browser plan fact. | Domain logic in wrong owner; temporary adapter. | `browser/browserIntentPlanning.ts` or `browser/browserPlanProjection.ts`. | Planning may call browser planner; browser owner builds `BrowserAgentPlan`. |
| `shouldBlockMutationForTargetResolution` branch | Blocks ambiguous mutation target only for mutation-like cues. | Valid blocked planning, but target policy extraction candidate. | `planning/workflowTargetPlanning.ts`. | Preserve blocker wording and `targetMissing=true`. |
| Raw continuity target, prompt target, explicit path reference, path-only read setup | Builds branch-selection inputs. | Valid planning ownership. | `planning/workflowTargetPlanning.ts`. | Stay as target facts, split out of facade body. |
| Action-result seed and diagnostic handoff setup | Uses prior action/provider diagnostic facts to influence target and verify continuation. | Temporary adapter; session/provider facts in planning body. | `session/turnContinuationFacts.ts`, `provider/providerDiagnosticPlanning.ts`. | Planning consumes normalized facts only. |
| Last-task read/mutation/verify signal derivation | Determines continuation branch eligibility. | Valid planning facts with session extraction. | `session/turnContinuationFacts.ts`. | Keep stopped/blocked/failed/skipped distinct; no success upgrade. |
| Edit failure repair context setup | Recovers previous edit failure target and payload kind. | Domain logic in wrong owner; extraction candidate. | `repair/singleFileRepairPlanning.ts`. | Planning calls adapter returning repair plan facts. |
| Weak/temporal/atypical continuation cue setup | Classifies short follow-up prompts. | Valid planning but too broad. | `planning/workflowContinuationIntent.ts`. | Extract with characterization coverage. |
| `resolveContinuationReopenTarget` call | Selects degraded/cross-file reopen target from continuity evidence. | Repair/session target logic in wrong owner. | `repair/degradedReopenPlanning.ts`. | Preserve ambiguity blockers and pruned-candidate evidence. |
| Read continuity recovery | Recovers pathless read targets and relocation notes. | Context domain adapter. | `context/readContinuationPlanning.ts` or existing `context/readWindowContinuation.ts`. | Planning consumes read target facts. |
| `selectMutationTargetFromPrompt` call | Selects mutation target from prompt and target resolution. | Edit domain adapter. | `edit/mutationTargetSelection.ts`. | Keep call, but move orchestration wrapper out of facade body. |
| `classifyEditExpectationContract` call | Determines unsupported discovery edit and missing transform expectations. | Edit policy adapter. | `edit/editExpectationContract.ts` or current owner until renamed. | Planning may consume contract result; do not own edit contract. |
| Grounded deliverable mode and answer repair instruction | Decides read/summary/explain/repair instructions. | Repair/context domain logic in wrong owner. | `repair/groundedAnswerRepair.ts` plus `context/readIntentPlanning.ts`. | Keep current `repairInstruction` shape. |
| Read window and read fragment directive setup | Carries read windows/fragments into read or local mutation facts. | Context domain logic in wrong owner. | `context/readWindowContinuation.ts`, `context/readIntentPlanning.ts`. | Preserve fingerprint/range fields. |
| Mutation scope fields from read fragment | Turns last read fragment into mutation scope facts. | Edit/context boundary adapter. | `edit/mutationScopePlanning.ts`. | Do not make scope evidence imply write authority. |
| Failed transform collection and continuity replace directive | Parses evidence into future mutation transform facts. | Evidence/repair logic in wrong owner. | `evidence/continuationTransformEvidence.ts`, `repair/repairContinuationPlanning.ts`. | Preserve stale-transform retirement. |
| Cross-file candidate setup | Scores recent/failed/changed targets and plans additional repair targets. | Repair planning logic in wrong owner. | `repair/crossFileRepairPlanning.ts`. | Existing file exists; migrate candidate logic there. |
| Lineage activation and post-exhaustion blockers | Blocks ambiguous weak continuation and stale transform reuse. | Valid blocked planning, but owner-specific. | `planning/workflowContinuationIntent.ts`, `repair/degradedReopenPlanning.ts`. | Preserve blocked/not-run semantics. |
| Structured repair continuation object | Builds executable repair continuation from blocker/failure lineage. | Repair planning logic in wrong owner. | `repair/repairContinuationPlanning.ts`. | Adapter returns plan-compatible facts; no execution. |
| Structured verify continuation object | Builds command continuation from blocked/failed verify lineage. | Verification planning logic in wrong owner. | `verification/verifyContinuationPlanning.ts`. | Preserve command cwd mismatch blocker. |
| Early `repairObject` returns | Returns edit-file plan or blocked repair plan. | Valid planning return with repair-owned facts. | Planning facade plus `repair/repairContinuationPlanning.ts`. | Split object construction and keep return assembly in facade. |
| Lineage blocked and post-exhaustion blocked returns | Produces stopped-safe blocked edit plans. | Valid planning ownership. | `planning/workflowContinuationIntent.ts`. | Keep anti-false-success: blocked remains blocked plan, not success. |
| Verify continuation returns | Produces run-command plan for verify continuation or blocked verify plan. | Valid planning facade with verification owner. | `verification/verifyContinuationPlanning.ts`. | No command execution or success claim. |
| Degraded reopen ambiguity returns | Produces blocked edit plans with candidate evidence. | Repair/session planning. | `repair/degradedReopenPlanning.ts`. | Preserve candidate/pruned/source fields. |
| Missing active work/context seed/boundary reset returns | Produces blocked read/edit plans for ambiguous continuation. | Valid planning ownership. | `planning/workflowContinuationIntent.ts`. | Keep blocked reasons explicit. |
| Reflective chat returns | Produces chat plan with reflective query kind. | Valid planning ownership. | `planning/reflectiveStatePlanning.ts`. | Response rendering stays outside this file. |
| Answer-repair read returns | Replans read-like answer repair with grounded mode and fragments. | Context/repair planning in wrong owner. | `repair/groundedAnswerRepair.ts`, `context/readIntentPlanning.ts`. | Preserve read-only `verifyAfterEdit=false`. |
| Pathless read recovery blocked return | Blocks unrecoverable read continuation. | Context planning. | `context/readContinuationPlanning.ts`. | Preserve relocation lineage and targetMissing. |
| Local mutation scope blocker | Blocks local explain mutation without fragment evidence. | Edit/context planning. | `edit/mutationScopePlanning.ts`. | Must not infer write permission from local prompt. |
| Execution correction return | Reuses last mutation target and transform. | Repair/edit planning. | `repair/singleFileRepairPlanning.ts`. | Preserve `continuationRepairReplan`. |
| Read follow-up and ambiguous grounded continuation returns | Produces read-file plan facts. | Valid planning with context owner. | `context/readIntentPlanning.ts`. | Keep read-only behavior. |
| Grounded missing/out-of-workspace target returns | Uses read target stop projection. | Context target planning. | `context/readTargetPlanning.ts`. | Preserve blocked text and out-of-workspace stop. |
| Repo diagnosis returns | Plans repo-explain. | Context planning. | `context/repoExplainPlanning.ts`. | Runtime execution remains context stage. |
| Explicit read/summarize/explain returns | Plans read-file with grounded mode, windows, fragments, context-planning flag. | Valid branch planning with context extraction. | `context/readIntentPlanning.ts`. | Preserve context packet flag semantics. |
| Continuation edit/write return | Plans edit/write, cross-file repair flags, replace directives, repair context metadata. | Planning facade with edit/repair facts; too broad. | `edit/mutationIntentPlanning.ts`, `repair/crossFileRepairPlanning.ts`. | No write authority or execution. |
| Cross-file converged noop return | Emits edit-file plan with cross-file noop facts. | Repair planning. | `repair/crossFileRepairPlanning.ts`. | Must not become success; runtime must still project truth. |
| Unsupported discovery edit return | Blocks unsupported edit contract. | Edit contract adapter. | `edit/editExpectationContract.ts`. | Preserve unsupported status and do-next text. |
| Execution intent / unsupported command returns | Plans run-command and blockers. | Policy adapter inside planning. | `policy/commandIntentPolicy.ts`, `verification/commandIntentPlanning.ts`. | Command authority remains outside planning. |
| Write/edit target missing, out-of-workspace, transform unclear returns | Produces blocked edit/write plans and context planning request. | Valid blocked planning with edit owner. | `edit/mutationIntentPlanning.ts`. | Preserve no-write and targetMissing semantics. |
| Final read/inspect/chat fallback | Selects read-file, inspect-files, or chat. | Valid planning ownership. | Planning facade plus context intent module. | Keep fallback conservative. |
| `shouldBuildContextPlanningSurface` | Detects context-packet request. | Context planning extraction candidate. | `context/contextPlanningIntent.ts`. | Preserve explicit-context-packet reason. |
| `removeNegatedMutationInstructions` | Prevents negated mutation text from creating edit intent. | Valid planning ownership. | `planning/workflowIntentSignals.ts`. | Characterize before extraction. |
| `extractWorkflowTaskIntentSignals` | Computes read, summarize, explain, reflective, edit, verify, repair, diagnosis, command signals. | Valid planning ownership, extraction candidate. | `planning/workflowIntentSignals.ts`. | Keep command/verify policy calls as adapters. |
| `extractInlineContinuityContext` | Parses inline context block into session-like continuity state. | Temporary adapter and domain logic in wrong owner. | `session/inlineContinuityContext.ts`. | Keep export path from planning until runtime migrates. |
| Read fields inside `extractInlineContinuityContext` | Parses read windows, fragments, ranges, filters, fingerprints. | Context/session parsing in wrong owner. | `session/inlineContinuityContext.ts` plus context field codec if needed. | Preserve field names and numeric guards. |
| Verification fields inside `extractInlineContinuityContext` | Parses command, reason, blocker, next action, resume eligibility. | Verification/session parsing in wrong owner. | `session/inlineContinuityContext.ts`, `verification/verifyContinuationPlanning.ts`. | Do not convert skipped/blocked to success. |
| Approval/permission/request-scope fields inside `extractInlineContinuityContext` | Parses permission memory facts. | Session/policy parsing in wrong owner. | `session/inlineContinuityContext.ts`, `session/permissionRequestMemoryCodec.ts`. | Do not imply authorization. |
| `resolveSingleFileEditFailureRepairContext` | Recovers target for previous single-file edit failure. | Repair planning extraction candidate. | `repair/singleFileRepairPlanning.ts`. | Preserve multiple-target abandonment behavior. |
| `resolveSingleFileEditFailureRepairContextAbandonment` | Records multiple failed target abandonment. | Repair planning extraction candidate. | `repair/singleFileRepairPlanning.ts`. | Preserve `repairContextAbandoned*` fields. |
| `extractSingleFileEditFailureReason` | Parses failure reason from continuity evidence and unresolved items. | Evidence/repair adapter. | `repair/singleFileRepairPlanning.ts` consuming evidence parser. | Keep reason code set stable. |
| `resolveSingleFileEditRepairPayloadKind` | Classifies follow-up payload. | Repair/edit planning. | `repair/singleFileRepairPlanning.ts`. | Preserve payload enum values. |
| `rebindContinuationTargetToWorkspace` | Workspace rebind wrapper for continuation target. | Concrete path/continuation target planning. | `core/paths/legacyRootRebase.ts` plus `session/continuationTargetRebase.ts`. | Keep compatibility export until reference proof says delete. |
| `isUsableContinuationTargetPath` | Rejects placeholders. | Valid target planning detail. | `session/continuationTargetRebase.ts`. | Preserve placeholder list. |
| `hasCrossFileEvidenceSignalInContinuity` | Detects cross-file repair evidence. | Repair/evidence logic in wrong owner. | `repair/crossFileRepairPlanning.ts`. | Use evidence parser; keep signal conservative. |
| `deriveCrossFileRepairCandidates` | Scores related files for repair. | Repair planning extraction candidate. | Existing `repair/crossFileRepairPlanning.ts`. | Preserve candidate cap and scoring behavior. |
| `hasCrossFileContinuationContextInContinuity` | Detects cross-file repair context markers. | Repair/evidence logic. | `repair/crossFileRepairPlanning.ts`. | Preserve marker names. |
| `extractProcessedCrossFilePathsFromContinuity` | Parses processed paths. | Evidence parsing for repair. | `repair/crossFileRepairPlanning.ts` or evidence parser consumed by repair. | Preserve `repair-cross-file applied on` compatibility. |
| `extractCrossFileStateListFromContinuityEvidence` | Parses comma lists from evidence strings. | Evidence parser. | `evidence/continuationTransformEvidence.ts` or `repair/crossFileRepairPlanning.ts`. | Avoid generic parser bucket. |
| `extractCrossFileFailureEntriesFromContinuity` | Parses failed repair entries and reason codes. | Evidence/repair parser. | `repair/crossFileRepairPlanning.ts`. | Keep reason code validation. |
| `hasDegradedContinuationEvidenceInState` | Detects degraded terminal repair evidence. | Repair/session evidence logic. | `repair/degradedReopenPlanning.ts`. | Preserve degraded-not-success boundary. |
| `hasContinuationStateSignalsInState` | Detects whether continuity state contains usable signal. | Deprecated/legacy residue candidate. | Delete if build/reference proof confirms unused. | Not referenced in current `rg` output except declaration. |
| `isAtypicalReopenFollowUpPrompt` | Detects atypical repair reopen follow-up. | Planning/repair intent extraction. | `planning/workflowContinuationIntent.ts`. | Preserve Chinese/English cue behavior. |
| `isDegradedReopenFollowUpPrompt` | Detects degraded reopen follow-up. | Repair intent extraction. | `repair/degradedReopenPlanning.ts`. | Preserve degraded-only distinction. |
| `resolveContinuationReopenTarget` | Builds recoverable candidates, prunes outside workspace/processed/directory/duplicates, chooses lexical/single candidate. | Repair target planning in wrong owner. | `repair/degradedReopenPlanning.ts`. | Stop if extraction would change fs existence or candidate ordering. |
| Correction/answer/execution/verify/weak/temporal/cross-file prompt predicates | Regex cue classifiers. | Valid planning details, but should be split by responsibility. | `planning/workflowContinuationIntent.ts`, `repair/repairIntentPlanning.ts`, `verification/verifyContinuationPlanning.ts`, `context/readIntentPlanning.ts`. | Keep module-local tests; avoid dumping all predicates in one helper file. |
| `extractKeyTerms` | Token frequency extraction. | Deprecated/legacy residue candidate. | Delete if unused after reference/build proof. | No current reference in inspected output. |
| `isReflectiveExplainContinuationPrompt` | Reflective explain cue. | Context/planning. | `planning/reflectiveStatePlanning.ts`. | Preserve cue. |
| `isRepairContinuationFollowUpPrompt` | Repair continuation cue. | Repair planning. | `repair/repairContinuationPlanning.ts`. | Preserve blocked repair semantics. |
| `uniqueStable` | Stable dedupe normalized by path. | Local implementation detail. | Move with caller or delete if unused. | No separate shared helper unless reused. |
| `hashStableId` | Fragment fingerprint short hash. | Local/context detail. | Move with caller or delete if unused. | Avoid shared bucket. |
| `inferReplaceDirectiveFromContinuity` | Reads latest transform evidence and returns replace directive. | Evidence/repair logic in wrong owner. | `repair/repairContinuationPlanning.ts` consuming `evidence/continuationTransformEvidence.ts`. | Preserve preferred-target filtering. |
| `collectContinuationTransforms` | Collects transform evidence for plan failed transforms. | Evidence/repair logic. | `repair/repairContinuationPlanning.ts`. | Preserve path rebasing. |
| `isMutationInstructionFailure` | Type guard for edit planner output. | Deprecated/legacy residue candidate in this file. | `edit/mutationInstructionPlanner.ts` if still needed; delete if unused. | No current local reference found in region map. |
| `shouldBlockMutationForTargetResolution` | Ambiguous target blocker policy for mutation-like requests. | Valid target planning extraction. | `planning/workflowTargetPlanning.ts`. | Preserve exact trigger set. |
| `normalizePathLike` | Local path normalization. | Concrete path detail. | Move with target/continuation owner. | Do not create `utils`. |

## Ownership Boundaries Confirmed

Planning currently does not perform production writes, command execution, verification execution, repair execution, browser execution, session persistence, or final terminal verdict projection. It does, however, parse and interpret evidence/session strings in ways that can affect whether runtime attempts an edit, command, or read branch. Future routes must preserve these as planning facts only.

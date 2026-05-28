# Extraction Targets

The targets below are grouped implementation routes. They intentionally avoid `helper`, `utils`, `misc`, `common`, `support`, `mvp`, and `turn/stages` dumping buckets. Each destination is named by product responsibility.

## Route 1: Intent And Target Planning Split

Purpose: shrink `buildWorkflowTaskPlan` into a facade by moving pure prompt intent and target planning facts first.

Source symbols/regions:

- `WorkflowTaskIntentSignals`
- `extractWorkflowTaskIntentSignals`
- `removeNegatedMutationInstructions`
- `shouldBlockMutationForTargetResolution`
- Initial target resolution, verify-tail fallback, explicit path reference setup.
- Prompt predicates that are generic planning intent rather than repair/verify/context-specific.

Destination files:

- `packages/ts-shell/src/planning/workflowIntentSignals.ts`
- `packages/ts-shell/src/planning/workflowTargetPlanning.ts`
- Existing `packages/ts-shell/src/planning/promptTargetProjection.ts` for path-token and prompt target projection.

Compatibility strategy:

- Keep `buildWorkflowTaskPlan` signature and return shape unchanged.
- Keep local TypeScript imports ending in `.js`.
- Keep `WorkflowTaskPlan` type import from `orchestration/workflowTaskPlanner.ts` until a separate contract migration route exists.
- Do not alter branch order in the first extraction; move computation only.

Tests:

- `npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts src/planning/promptTargetProjection.test.ts`
- Add characterization tests for negated mutation, ambiguous target blocker, verify-tail target fallback, and conservative chat fallback before changing logic.
- Run targeted `runMvpIntegratedFlow.test.ts` cases for read/edit/command intent if touched.

Stop conditions:

- Stop if extraction changes any `taskKind`, `blockedReason`, `targetMissing`, `verifyAfterEdit`, or `usedRestoredState` output.
- Stop before moving session/repair/verification logic.
- Stop before changing command allowlist or target resolution contract.

## Route 2: Inline Continuity And Session Fact Adapter

Purpose: move raw inline continuity block parsing and session-like fact normalization out of planning.

Source symbols/regions:

- `extractInlineContinuityContext`
- Read window/fragment inline fields inside that function.
- Verification inline fields inside that function.
- Approval, permission request, request scope, repair status, and continuation status inline fields.
- Action-result seed and last-task signal derivation in `buildWorkflowTaskPlan`.
- `rebindContinuationTargetToWorkspace`, `isUsableContinuationTargetPath` if kept as session target rebase.

Destination files:

- `packages/ts-shell/src/session/inlineContinuityContext.ts`
- `packages/ts-shell/src/session/turnContinuationFacts.ts`
- `packages/ts-shell/src/session/continuationTargetRebase.ts`

Compatibility strategy:

- Keep `extractInlineContinuityContext` re-exported from `planning/workflowTaskPlan.ts` until `workflowExecutionCoordinator.ts` imports the session owner directly.
- The parser must return the same `cleanPrompt` and `ContinuityStateLike` fields.
- Parsed approval/permission fields remain facts only; they must not authorize writes or command execution.

Tests:

- New `session/inlineContinuityContext.test.ts` covering read fragment fields, verification fields, approval fields, permission request fields, and clean prompt stripping.
- Existing `session/stoppedSessionContinuity.test.ts`, `session/sessionResumeContextBuilder.test.ts`, and `session/continuationEvidenceParity.test.ts` as touched.
- `planning/workflowTaskPlan.test.ts` for compatibility export.

Stop conditions:

- Stop if parsed field names, number guards, boolean guards, or clean prompt trimming change.
- Stop if permission/approval facts affect authority decisions.
- Stop before editing `SessionManager.ts` or session persistence.

## Route 3: Context And Grounded Read Planning

Purpose: move read, summarize, explain, context-packet, read-window, and read-fragment planning into context owners.

Source symbols/regions:

- `shouldBuildContextPlanningSurface`
- Read continuity recovery use.
- Read window and fragment directive mapping in `buildWorkflowTaskPlan`.
- Pathless read blocked branch.
- Grounded missing/out-of-workspace read target branches.
- Explicit read, path-only read, summarize/explain, local explain fragment branches.
- Grounded answer repair read branches when they produce read-only context output.

Destination files:

- `packages/ts-shell/src/context/readIntentPlanning.ts`
- `packages/ts-shell/src/context/readContinuationPlanning.ts`
- `packages/ts-shell/src/context/readTargetPlanning.ts`
- `packages/ts-shell/src/context/contextPlanningIntent.ts`

Compatibility strategy:

- Context modules return plan facts consumed by `buildWorkflowTaskPlan`; they do not deliver file content.
- Preserve current `readLineCount`, `readLineOffset`, fragment indexes/ranges/source windows/fingerprint/filter fields.
- Preserve `contextPlanningRequested` and `contextPlanningReason` values.

Tests:

- New focused context planning tests for explicit read, pathless carryover, context packet cue, summarize/explain, and local explain fragment carryover.
- Existing `context/readWindowContinuation.test.ts`, `context/readRuntimeStage.test.ts`, `context/readDeliveryProjection.test.ts`.
- Targeted read/inspect/repo-explain slices of `runMvpIntegratedFlow.test.ts` if branch outputs change.

Stop conditions:

- Stop before changing read delivery output or repo diagnosis execution.
- Stop if a read-only branch starts implying edit/write/verify success.
- Stop if read target blocker wording changes without explicit rebaseline.

## Route 4: Edit Intent, Mutation Scope, And Single-File Repair Planning

Purpose: move mutation-specific plan facts out of the general planning facade while preserving no-write semantics.

Source symbols/regions:

- Mutation target selection in `buildWorkflowTaskPlan`.
- `classifyEditExpectationContract` branch handling.
- Missing edit target, out-of-workspace target, transform unclear, unsupported discovery edit branches.
- Mutation scope fields derived from read fragment evidence.
- `resolveSingleFileEditFailureRepairContext`
- `resolveSingleFileEditFailureRepairContextAbandonment`
- `extractSingleFileEditFailureReason`
- `resolveSingleFileEditRepairPayloadKind`

Destination files:

- `packages/ts-shell/src/edit/mutationIntentPlanning.ts`
- `packages/ts-shell/src/edit/mutationScopePlanning.ts`
- `packages/ts-shell/src/repair/singleFileRepairPlanning.ts`

Compatibility strategy:

- New modules emit plan facts only: target, replacement fields, mutation scope fields, blocked reason text, and repair context metadata.
- No module in this route may construct workspace authority or execute mutation.
- Keep `repairContextUsed`, `repairedFailureReason`, `repairedTargetFile`, `repairPayloadKind`, and abandonment fields stable.

Tests:

- New edit/repair planning tests for missing target, out-of-workspace target, transform unclear context request, local mutation scope required, repair context reuse, and abandonment.
- Existing `edit/mutationInstructionPlanner.test.ts`, `edit/mutationTargetSelection.test.ts`, `repair/groundedAnswerRepair.test.ts` as touched.
- `workflowTaskPlan.test.ts` and targeted runMvp edit cases.

Stop conditions:

- Stop if prompt text implies write authority.
- Stop if missing transform becomes executable edit.
- Stop if repair proposal/apply without post-repair verification is treated as success.

## Route 5: Repair, Cross-File, And Degraded Reopen Planning

Purpose: move cross-file repair candidate selection, degraded reopen, and repair continuation object construction into repair-owned planning modules.

Source symbols/regions:

- `hasCrossFileEvidenceSignalInContinuity`
- `deriveCrossFileRepairCandidates`
- `hasCrossFileContinuationContextInContinuity`
- `extractProcessedCrossFilePathsFromContinuity`
- `extractCrossFileStateListFromContinuityEvidence`
- `extractCrossFileFailureEntriesFromContinuity`
- `hasDegradedContinuationEvidenceInState`
- `isAtypicalReopenFollowUpPrompt`
- `isDegradedReopenFollowUpPrompt`
- `resolveContinuationReopenTarget`
- `isWeakRepairFollowUpPrompt`
- `isCrossFileRepairFollowUpPrompt`
- `isRepairContinuationFollowUpPrompt`
- `inferReplaceDirectiveFromContinuity`
- `collectContinuationTransforms`

Destination files:

- Existing `packages/ts-shell/src/repair/crossFileRepairPlanning.ts`
- `packages/ts-shell/src/repair/degradedReopenPlanning.ts`
- `packages/ts-shell/src/repair/repairContinuationPlanning.ts`
- Existing `packages/ts-shell/src/evidence/continuationTransformEvidence.ts` for transform parsing, if a parser expansion is required.

Compatibility strategy:

- Repair modules return plan facts and blockers only; runtime repair execution remains in `repair/crossFileRepairStage.ts`.
- Preserve candidate ordering, candidate cap, pruned reason strings, degraded reason strings, and ambiguity blockers.
- Keep `crossFileRepair`, `additionalTargetPaths`, `crossFileConvergedNoop`, `previousRemainingTargets`, `previousFailedEntries`, and degraded reopen fields stable.

Tests:

- Existing `repair/crossFileRepairPlanning.test.ts`.
- New degraded reopen planning tests for no candidate, single candidate, lexical candidate, multiple candidates, outside-workspace prune, processed prune, directory prune, duplicate prune.
- Existing `evidence/continuationTransformEvidence.test.ts`.
- Targeted continuation/cross-file slices of `runMvpIntegratedFlow.test.ts`.

Stop conditions:

- Stop if degraded/partial/noop repair can be interpreted as terminal success.
- Stop if stale-transform retirement is weakened.
- Stop if filesystem checks move outside a controlled planning target function.

## Route 6: Verification And Command Planning

Purpose: separate command intent and verify continuation planning from the generic plan facade without moving execution.

Source symbols/regions:

- `detectVerifyCommand`/`hasExternalVerifyOptOut` use.
- `prefersTestOverBuildInFollowUp`
- `isVerifyContinuationFollowUpPrompt`
- `isPostEditReadOnlyVerifyFollowUp`
- `buildWorkflowVerifyContinuation` branch and command cwd mismatch blocker.
- Command execution intent branch, `detectCommand`, `detectUnsupportedCommandIntent`, `isAllowlistedRunCommand`, `blockedCommandReason`.

Destination files:

- `packages/ts-shell/src/verification/verifyContinuationPlanning.ts`
- `packages/ts-shell/src/verification/commandIntentPlanning.ts`
- Existing `packages/ts-shell/src/policy/commandIntentPolicy.ts` remains command policy owner.

Compatibility strategy:

- Plan modules emit `directCommand`, `verifyCommand`, `blockedReason`, and `targetMissing` facts only.
- Command execution remains in `verification/commandStage.ts`.
- Preserve blocked verify continuation and unsupported command distinctions.

Tests:

- Existing `policy/commandIntentPolicy.test.ts`, `verification/commandStage.test.ts`, `verification/commandVerificationStage.test.ts`, `verification/verificationCommandPlan.test.ts`.
- New planning tests for verify continuation missing fields, command cwd mismatch, unsupported command, allowlisted command, and test-over-build preference.
- `verify:route221-anti-false-success-gate` for any later route that touches result/evidence semantics.

Stop conditions:

- Stop if command blocked/not-run/skipped becomes success-like.
- Stop before changing command allowlist.
- Stop before moving verification execution or result projection.

## Route 7: Browser Intent Planning And Residue Cleanup

Purpose: move browser-specific plan detection and delete or rehome proven dead residue after the main owner modules exist.

Source symbols/regions:

- Browser branch using `detectWorkflowBrowserPlan`.
- `hasContinuationStateSignalsInState`
- `extractKeyTerms`
- `isMutationInstructionFailure`
- `uniqueStable`
- `hashStableId`
- `normalizePathLike`
- Over-exported `rebindContinuationTargetToWorkspace` if no external references remain.

Destination files:

- `packages/ts-shell/src/browser/browserIntentPlanning.ts`
- Caller-owned modules for still-live local helpers.
- Delete dead functions only after reference and build proof.

Compatibility strategy:

- Browser planning emits the same `browserPlan`, `taskKind`, `reason`, and `usedRestoredState`.
- Do not create generic helper files.
- Delete only when `rg`, TypeScript build, and focused tests prove no live behavior depends on the symbol.

Tests:

- Browser planning focused tests if browser owner is created.
- `workflowTaskPlan.test.ts`.
- `npm run build -w packages/ts-shell` for deletion/extraction proof.

Stop conditions:

- Stop before changing browser runtime execution.
- Stop if deletion proof is weaker than direct references plus build.
- Stop if a candidate destination would be a vague helper bucket.

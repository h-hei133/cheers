# Next Implementation Routes

The file is a partial planning monolith. It is safe to start implementation, but only with a narrow extraction route that preserves `buildWorkflowTaskPlan` as a compatibility facade. Do not skip directly to repair/cross-file or verification/result truth work unless the route budgets for broader regression validation.

## Route 1: Intent And Target Planning Split

Move pure prompt intent and target planning facts out of the facade.

Likely touched files:

- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- `packages/ts-shell/src/planning/workflowIntentSignals.ts`
- `packages/ts-shell/src/planning/workflowTargetPlanning.ts`
- `packages/ts-shell/src/planning/promptTargetProjection.ts`
- Focused planning tests.

Why first:

- It is the least behaviorally dangerous split.
- It reduces the main facade without touching session parsing, repair, verification, or execution.
- It creates a clear boundary for later owner-specific adapters.

Stop before:

- Moving inline continuity parsing.
- Changing command allowlist or write/edit contract.
- Reclassifying any branch output.

## Route 2: Inline Continuity And Session Fact Adapter

Move inline continuity block parsing and session fact normalization into session-owned modules.

Likely touched files:

- `packages/ts-shell/src/session/inlineContinuityContext.ts`
- `packages/ts-shell/src/session/turnContinuationFacts.ts`
- `packages/ts-shell/src/session/continuationTargetRebase.ts`
- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- Session and planning focused tests.

Why second:

- It removes the largest non-planning parser from the file.
- It makes permission/approval/request-scope facts explicit session facts rather than planning authority.

Stop before:

- Editing `SessionManager.ts`.
- Changing persistence format.
- Treating parsed approval facts as authorization.

## Route 3: Context And Grounded Read Planning

Move read/summarize/explain/context packet/read window/read fragment plan facts into context owners.

Likely touched files:

- `packages/ts-shell/src/context/readIntentPlanning.ts`
- `packages/ts-shell/src/context/readContinuationPlanning.ts`
- `packages/ts-shell/src/context/readTargetPlanning.ts`
- `packages/ts-shell/src/context/contextPlanningIntent.ts`
- Existing context tests and planning tests.

Why third:

- Read-only plan paths are lower write-risk.
- It separates context delivery planning from mutation and repair planning.

Stop before:

- Changing read delivery output.
- Moving repo-explain execution.
- Making read-only verify/check look like verification success.

## Route 4: Edit Intent And Single-File Repair Planning

Move mutation-intent plan facts, mutation scope, and single-file edit failure repair recovery.

Likely touched files:

- `packages/ts-shell/src/edit/mutationIntentPlanning.ts`
- `packages/ts-shell/src/edit/mutationScopePlanning.ts`
- `packages/ts-shell/src/repair/singleFileRepairPlanning.ts`
- Existing edit/repair tests and planning tests.

Why fourth:

- It removes write-adjacent planning from the generic facade while keeping execution and authority outside planning.
- It clarifies that edit plans are not write permission.

Stop before:

- Workspace authority changes.
- Mutation execution changes.
- Expanding edit capability beyond current contract.

## Route 5: Repair, Cross-File, And Degraded Reopen Planning

Move cross-file candidate scoring, degraded reopen target selection, repair continuation, and transform evidence consumption.

Likely touched files:

- `packages/ts-shell/src/repair/crossFileRepairPlanning.ts`
- `packages/ts-shell/src/repair/degradedReopenPlanning.ts`
- `packages/ts-shell/src/repair/repairContinuationPlanning.ts`
- `packages/ts-shell/src/evidence/continuationTransformEvidence.ts`
- Repair/evidence/planning focused tests.

Why fifth:

- It is high truthfulness risk and should happen after simpler planning splits.
- It protects partial/degraded repair semantics by giving them an owner.

Stop before:

- Repair execution changes.
- Treating cross-file noop/degraded/partial as success.
- Deleting evidence marker compatibility.

## Route 6: Verification And Command Planning

Move verify continuation and command intent planning to verification/policy owners.

Likely touched files:

- `packages/ts-shell/src/verification/verifyContinuationPlanning.ts`
- `packages/ts-shell/src/verification/commandIntentPlanning.ts`
- `packages/ts-shell/src/policy/commandIntentPolicy.ts`
- Verification/policy/planning focused tests.

Why sixth:

- Command and verification plan facts are truth-sensitive.
- By this point target/session facts should be cleaner.

Stop before:

- Command execution changes.
- Command allowlist changes.
- Result or terminal verdict changes.

## Route 7: Browser Intent Planning And Residue Cleanup

Move browser plan detection to browser owner and delete or rehome proven-dead residue.

Likely touched files:

- `packages/ts-shell/src/browser/browserIntentPlanning.ts`
- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- Caller-owned modules for live helper residues.

Why last:

- Browser runtime ownership is separate from planning.
- Dead predicate deletion is safest after live owners are smaller and references are clear.

Stop before:

- Browser execution changes.
- Generic helper buckets.
- Deleting any symbol without reference and build proof.

## Recommendation

Safe to start implementation: yes, with Route 1 only.

Do not move to SessionManager before this file is split at least through the intent/target and inline-continuity routes. `workflowTaskPlan.ts` is now a more immediate concentration point than SessionManager for planning ownership drift. If implementation is not starting now, the next audit file can be chosen only after recording that `workflowTaskPlan.ts` remains a partial planning monolith with the routes above as the cleanup queue.

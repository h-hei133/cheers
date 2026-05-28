# Stay Vs Move

Preferred final role for `workflowTaskPlan.ts`: compatibility planning facade plus small composition surface. It should keep the stable `buildWorkflowTaskPlan` export and return the existing `WorkflowTaskPlan` contract while delegating owner-specific planning to named modules.

| Symbol/region | Stay? | Move? | Split? | Delete/deprecate later? | Final destination | Reason |
|---|---:|---:|---:|---:|---|---|
| `buildWorkflowTaskPlan` export and return contract | Yes | No | Yes internally | No | `planning/workflowTaskPlan.ts` | Current runtime imports this facade; stable plan contract must remain. |
| Import block as broad domain aggregation | Temporarily | Yes | Yes | No | Owner modules below | Import count should fall as internal regions move. |
| `WorkflowTaskIntentSignals` | No | Yes | Yes | No | `planning/workflowIntentSignals.ts` | Valid planning concept but too broad for facade file. |
| Prompt intent regexes for read/edit/write/diagnosis/reflective state | No | Yes | Yes | No | `planning/workflowIntentSignals.ts`, `planning/reflectiveStatePlanning.ts` | Core planning ownership; separate from facade. |
| Negated mutation instruction stripping | No | Yes | No | No | `planning/workflowIntentSignals.ts` | Prevents false edit intent; should move with intent classifier. |
| Target resolution integration and verify-tail fallback | No | Yes | Yes | No | `planning/workflowTargetPlanning.ts` | Target facts are planning, but should be named by responsibility. |
| `shouldBlockMutationForTargetResolution` | No | Yes | No | No | `planning/workflowTargetPlanning.ts` | Ambiguous-target policy belongs with target planning facts. |
| Browser plan detection branch | No | Yes | No | No | `browser/browserIntentPlanning.ts` | Planning may call browser owner; browser plan shape should not live in generic planning facade. |
| Provider diagnostic handoff influence | No | Yes | Yes | No | `provider/providerDiagnosticPlanning.ts` or `session/turnContinuationFacts.ts` | Provider facts should be normalized before planning consumes them. |
| Action-result seed and last-task signal derivation | No | Yes | Yes | No | `session/turnContinuationFacts.ts` | Session facts are inputs, not persistence; planning should not parse raw session shape everywhere. |
| Read continuity recovery | No | Yes | No | No | `context/readContinuationPlanning.ts` | Context owner should plan read target carryover. |
| Read window and fragment fields | No | Yes | Yes | No | `context/readIntentPlanning.ts`, existing `context/readWindowContinuation.ts` | Context owns read windows/fragments; planning emits plan fields via adapter. |
| Context planning surface cue | No | Yes | No | No | `context/contextPlanningIntent.ts` | Context packet request belongs with context planning. |
| Grounded deliverable mode and answer repair instruction | No | Yes | Yes | No | `repair/groundedAnswerRepair.ts`, `context/readIntentPlanning.ts` | Read-answer repair straddles repair and context, not facade. |
| Single-file edit failure repair context | No | Yes | No | No | `repair/singleFileRepairPlanning.ts` | Repair owner should recover prior edit failure facts. |
| Mutation scope from read fragment | No | Yes | No | No | `edit/mutationScopePlanning.ts` | Edit owner should translate context evidence into mutation-scope requirement. |
| Mutation target selection adapter | No | Yes | No | No | `edit/mutationIntentPlanning.ts` using `edit/mutationTargetSelection.ts` | Planning can consume selected target, but edit owns mutation-specific target selection. |
| Edit expectation contract handling | No | Yes | No | No | `edit/mutationIntentPlanning.ts` or existing edit expectation owner | Missing transform and unsupported discovery edit are edit contract facts. |
| Command intent/allowlist branch | No | Yes | Yes | No | `verification/commandIntentPlanning.ts` plus `policy/commandIntentPolicy.ts` | Planning emits command facts; policy owns allowlist/blocker. |
| Verify continuation object branch | No | Yes | No | No | `verification/verifyContinuationPlanning.ts` | Verification continuation planning should own command/cwd/resume facts. |
| Verify-tail target stripping | No | Yes | No | No | `verification/verifyContinuationPlanning.ts` or target planning adapter | Keep target fallback behavior but split owner. |
| Repair continuation object branch | No | Yes | No | No | `repair/repairContinuationPlanning.ts` | Repair owner should produce structured repair plan facts. |
| Cross-file repair candidate scoring | No | Yes | No | No | Existing `repair/crossFileRepairPlanning.ts` | Candidate scoring is repair planning, not general planning. |
| Degraded reopen target selection | No | Yes | No | No | `repair/degradedReopenPlanning.ts` | Degraded repair state must remain not-success and explicit. |
| Continuation evidence list parsers | No | Yes | Yes | No | `repair/crossFileRepairPlanning.ts` and `evidence/continuationTransformEvidence.ts` | Evidence string parsing should be centralized near evidence/repair owner. |
| Transform evidence to replace directive | No | Yes | No | No | `repair/repairContinuationPlanning.ts` consuming `evidence/continuationTransformEvidence.ts` | Repair owner can convert parsed transform to repair facts. |
| Inline continuity context parser export | Temporarily | Yes | Yes | No | `session/inlineContinuityContext.ts` with compatibility re-export from planning | Runtime currently imports this path; migrate with shim. |
| Approval/permission/request-scope inline fields | No | Yes | Yes | No | `session/inlineContinuityContext.ts`, `session/permissionRequestMemoryCodec.ts` | Planning must not imply authority from parsed permission facts. |
| `rebindContinuationTargetToWorkspace` export | Temporarily | Maybe | No | Yes if no external refs | `session/continuationTargetRebase.ts` or keep local | Current search shows internal-only use, but export deletion needs build proof. |
| Placeholder path rejection | No | Yes | No | No | `session/continuationTargetRebase.ts` | Continuation target hygiene belongs with rebase. |
| `hasContinuationStateSignalsInState` | No | No if unused | No | Yes | Delete after reference/build proof | Current inspection did not find live caller. |
| `extractKeyTerms` | No | No if unused | No | Yes | Delete after reference/build proof | Current inspection did not find live caller. |
| `isMutationInstructionFailure` | No | Maybe | No | Yes if unused | `edit/mutationInstructionPlanner.ts` or delete | Type guard belongs to edit owner if live. |
| `uniqueStable`, `hashStableId` | No | Move with callers | No | Yes if unused | Caller-owned module | Do not introduce shared helper bucket. |
| `normalizePathLike` | No | Move with target/continuation owners | No | No | `planning/promptTargetProjection.ts` or `session/continuationTargetRebase.ts` | Concrete path normalization; not generic utility. |

## What Should Stay

- The `buildWorkflowTaskPlan(prompt, workspaceRoot, continuityState)` facade.
- Assembly of the final `WorkflowTaskPlan` object from owner-produced plan facts.
- Conservative fallback to `chat`.
- Branch ordering only while compatibility requires it.
- Blocked planning reasons as plan facts, not terminal verdicts.
- `inspectFirst`, `verifyAfterEdit`, `targetMissing`, `usedRestoredState`, `continuationLineage`, and compatibility fields in the returned plan shape.

## What Should Move

- Raw inline continuity parsing and permission/approval/request-scope field parsing.
- Browser-specific plan detection.
- Command allowlist/blocker policy adaptation.
- Verification continuation object construction.
- Repair continuation, single-file repair recovery, cross-file candidate scoring, degraded reopen target selection.
- Context/read window and fragment carryover.
- Edit expectation and mutation-scope planning.
- Evidence-string parsing for transform and cross-file repair markers.

## What Must Not Move Into Planning

- Command authority or command execution.
- Write authority, workspace permission, or mutation execution.
- Verification execution or success classification.
- Repair execution, partial/degraded terminal classification, or final success projection.
- Browser execution.
- Context delivery output.
- Session persistence.
- Evidence truth or terminal verdict projection.

# workflowTaskPlan Audit

Status: COMPLETE for the audit route. Runtime code, source files, tests, package scripts, and provider behavior were not changed.

This audit covers `packages/ts-shell/src/planning/workflowTaskPlan.ts` after `buildWorkflowTaskPlan` moved out of `runMvpIntegratedFlow.ts`. The core question is whether the file is a legitimate planning owner or the new planning monolith.

Current conclusion: `workflowTaskPlan.ts` is a valid product planning facade plus a planning monolith that must be split. It legitimately owns the public planning handoff, intent-to-task selection, target planning facts, continuation planning facts, blocked planning reasons, and branch selection inputs. It also embeds too much owner-specific logic for session continuation parsing, repair continuation, cross-file repair candidate scoring, context/read fragment carryover, command policy adaptation, verification continuation, browser plan detection, filesystem-backed degraded reopen checks, and evidence-string parsing.

The file does not execute commands, writes, verification, repair, browser actions, or terminal result projection. That keeps current runtime behavior compatible. The risk is ownership drift: planning is becoming the new place where unrelated product domains deposit pre-execution rules.

Artifacts:

- `00-current-map.md`: file size, imports, exports, major regions, local predicates, tests, and consumers.
- `01-ownership-audit.md`: classification for every major symbol and high-density region.
- `02-stay-vs-move.md`: stay/move/split/delete matrix with final destinations.
- `03-extraction-targets.md`: grouped extraction targets with compatibility strategy, tests, and stop conditions.
- `04-risk-register.md`: truthfulness, authority, continuation, import-cycle, and deletion risks.
- `05-validation-plan.md`: validation gates for future implementation routes.
- `06-next-implementation-routes.md`: recommended grouped implementation routes.

Audit evidence:

- File size: 3596 lines, 126359 bytes.
- Main public exports in this file: `buildWorkflowTaskPlan`, `extractInlineContinuityContext`, `rebindContinuationTargetToWorkspace`.
- Main imported contract: `WorkflowTaskPlan` from `orchestration/workflowTaskPlanner.ts`.
- External runtime consumers found: `workflowExecutionCoordinator.ts` imports `buildWorkflowTaskPlan` and `extractInlineContinuityContext`; `workflowTaskPlan.test.ts` covers two focused planning cases.
- Serena was used for symbol overview and references. Onboarding requested memory setup; it was skipped per route instruction.
- Current code was treated as truth; runMvp and workflowExecutionCoordinator audit docs were context only.

# SP060 Long Horizon Real Development Trial

## Scope

Executable evidence lives in
`packages/ts-shell/src/core/query/runtime/workspaceTaskState.test.ts`.

The diagnostic creates four disposable workspaces under
`/tmp/workspace-task-state-*` and drives normal `QueryEngine` runtime behavior
through the runtime execution batch seam backed by `ExecutionService`. It is not
catalog work, liveRun work, evaluation-only work, docs-only work, proof-only
work, or receipt-only work.

The before-fix run exposed a diagnostic seed mismatch in
`rollup-source-receipt`: the restored proof gap said source proof failed instead
of verification failed, so the policy blocked pending repair under its
anti-false-success guard and stopped not-proven. No product owner change was
needed. The same task set passed after correcting the diagnostic seed to carry
the failed verification wording and artifact/report task intent.

## Reference Alignment

Read `pi-docs-playbook` README, AGENTS, task matrix, agent harness, durable
harness, session format, compaction, and hooks docs. After local owner
inspection, mature source lookup was limited to:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`

Four-level introduction decision:

| Level | Decision |
|---|---|
| Dependency use | Rejected. This repo owns its TypeScript runtime, execution seam, task state, evidence, and result contracts. |
| Structured port | Rejected. The route needed local runtime proof, not a new harness structure. |
| Isolated source adoption | Rejected. The mature source contracts differ from local `QueryEngine` and `ExecutionService` contracts. |
| Behavior-only alignment | Used. Durable session facts must drive future runtime action, command and write effects stay behind the execution seam, compact/replay facts are not terminal truth, and completion remains evidence/result-owned. |

## Long Task Ledger

Manual correction count: `0`.

| Task | Workspace path pattern | Phases | Changed files | Real failure output source | Durable task-state fields | Repair attempts | Command reruns | Artifact or continuation proof | Verdict | Missing proof if incomplete |
|---|---|---|---|---|---|---|---|---|---|---|
| `invoice-threshold-replay` | `/tmp/workspace-task-state-*` | initial failing verification, replay task-state restore, runtime source read, first repair, failed targeted rerun, distinct second repair, passed targeted rerun, result verdict | `src/invoice/total.mjs`, `src/invoice/rules.mjs` | `node test/invoiceTotal.mjs` failed before runtime seed | `pendingAction`, `proofGap`, `changedFiles`, `failureCategories`, `repairAttempts`, `nextVerificationPlan` | first threshold-only repair failed; second distinct multi-file repair changed threshold and rate | same `node test/invoiceTotal.mjs` reran twice | replay preserved changed files, failed target, repair attempt, and next verification plan | `completed` | n/a |
| `locale-label-compact` | `/tmp/workspace-task-state-*` | initial failing verification, compact task-state restore, source read, repair write, targeted rerun, result verdict | `src/locale/messages.mjs`, `src/locale/render.mjs` | `node test/localeRender.mjs` failed before runtime seed | `pendingAction`, `proofGap`, `changedFiles`, `failureCategories`, `nextVerificationPlan` | compact-carried source context before repair; multi-file repair write | same `node test/localeRender.mjs` reran through runtime verification | compact carried changed files, failed target, proof gap, and next verification plan | `completed` | n/a |
| `rollup-source-receipt` | `/tmp/workspace-task-state-*` | initial failing verification, replay artifact proof gap restore, repair write, targeted rerun, artifact/source receipt, result verdict | `reports/sales-rollup.md` | `node test/salesRollup.mjs` failed before runtime seed | `pendingAction`, `proofGap`, `changedFiles`, `failureCategories`, `nextVerificationPlan`, `artifactPendingState` | report repair write followed by source-receipt artifact action | same `node test/salesRollup.mjs` reran before source receipt | source receipt bound `data/sales.json` to verification evidence | `completed` | n/a |
| `generic-green-incomplete` | `/tmp/workspace-task-state-*` | initial failing verification, compact task-state restore, runtime action, result verdict | `src/status.mjs` | `node test/status.mjs` failed before runtime seed | `pendingAction`, `proofGap`, `changedFiles`, `failureCategories`, `nextVerificationPlan` | no accepted repair proof | no targeted rerun accepted; generic command proof did not close target gap | compact carried failed target but did not become success | `stopped_not_proven` | `proof gap remains` |

## Requirement Coverage

| Hard gate | Long task evidence | Durable state source | Real failing command output | Product files | Normal runtime path | Repair and verification proof | Why not proof-only | Why not evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|
| Long-trial document exists | this file | n/a | n/a | n/a | n/a | n/a | Document is backed by executable diagnostic below | No catalog/liveRun evidence used | None known |
| 3 to 4 new long tasks are defined | four task IDs above, none reused from SP044-SP059 | test task-state fixtures | n/a | test-only diagnostic | `QueryEngine.submitMessage` per task | assertions check task IDs and verdicts | Task definitions alone are not terminal proof | No evaluation profile used | Synthetic agent summaries still provide model-facing coding result fields |
| At least 3 tasks execute | all four tasks execute | replay or compact seed per task | all four run initial commands | `workspaceTaskState.test.ts` | normal runtime with execution batch adapter | result statuses asserted | Execution alone does not claim success | Vitest invokes runtime, not liveRun | Provider not involved |
| At least 2 span continuation, replay, or compact carry-forward | invoice replay, locale compact, rollup replay, generic compact | `QueryRuntimeTaskState` seed merged into observation state | failing command summary is part of proof gap | `taskState.ts`, `state.ts`, `policy.ts` consumed by test | restored state drives next runtime action | completion still requires later proof | Replay/compact facts are non-terminal | No replay-only evaluation result | Seed fixture is deterministic |
| At least 2 perform multi-file actual writes | invoice and locale | restored changed files and unverified files | invoice and locale initial failed commands | `ExecutionService` consumed by test | repair action writes through batch executor | targeted reruns pass after writes | Changed-file count is not success | No owner count substituted | Writes are local disposable files |
| At least 2 start with real failing verification output | all four tasks | proof gap stores safe summary | `node test/*.mjs` via `ExecutionService.runCommand` | execution service consumed by test | command results enter observation as diagnostic summary | failed output drives repair or not-proven | Command output alone is marked not task success | No provider output used | Raw stdout/stderr not retained |
| At least 2 complete repair and targeted rerun | invoice, locale, rollup | next verification plan restored | same failed target commands rerun | `policy.ts`, `strategy.ts`, `observation.ts` consumed by test | repair -> verify actions in normal runtime | target commands rerun through execution seam | Repair receipt alone does not close proof | No live fallback used | Agent fixture supplies action summaries |
| At least 1 proves first repair failure and second distinct strategy success | invoice | replay seed includes prior failed repair; runtime observes failed first rerun | `node test/invoiceTotal.mjs` failed, then reran failed, then passed | `strategy.ts` consumed by test | source read and distinct second repair occur | actions include repair, verify, repair, verify | First repair failure remains not success | No evaluation scorer used | Distinctness is represented by changed file set and repair attempt signature |
| At least 1 completes artifact or source receipt proof | rollup | artifact pending state restored | `node test/salesRollup.mjs` failed then reran | `artifacts/workflow/model.ts`, `policy.ts` consumed by test | artifact action follows repair and verify | source receipt observed after targeted rerun | Artifact existence alone is insufficient | No catalog artifact used | Receipt claim is compact but source-bound |
| At least 2 complete with evidence/result verdict | invoice, locale, rollup | restored state plus observed evidence | task-specific commands | result/evidence owners consumed by runtime | terminal status from `QueryEngine` | proof input labels asserted | Evidence/result owns completion | No live acceptance substituted | Focused diagnostic only |
| Incomplete tasks remain stopped_not_proven with exact missing proof | generic green incomplete | compact seed preserves failed target | `node test/status.mjs` failed | runtime loop/result consumed by test | runtime stops with not-proven status | generic command does not close target proof | Generic green proof rejected | No evaluator override | Missing proof text is concise |
| Manual correction count is zero | all records set `manualCorrection=false` and no manual writes | test automation only | n/a | execution service consumed by test | all writes/commands automated | assertions check all false | No human proof substituted | No manual live acceptance used | Count is test-recorded |
| Product failures fixed in rightful owners and same tasks rerun | no product-runtime failure after diagnostic seed correction | n/a | before run classified fixture mismatch | no product files changed | same diagnostic reran and passed | same task set passed | Fixture correction did not add success path | No evaluation behavior changed | Product gaps may remain outside these tasks |
| Requirement coverage table is complete | this table | listed per row | listed per row | listed per row | listed per row | listed per row | row explains non-substitution | row explains non-evaluation | None known |
| SP044-SP059 regressions still pass | regression command listed in validation ledger | existing diagnostics | existing task commands | existing owner tests | normal runtime suites | assertions in previous route tests | Regression suite does not replace SP060 proof | No catalog/liveRun | To be rerun before commit |
| Build passes | build command listed in validation ledger | n/a | n/a | TypeScript package | compile boundary | type safety | Build is not task proof | n/a | To be rerun before commit |
| Result truthfulness gate passes | gate command listed in validation ledger | n/a | synthetic hard gate | evidence/result scripts | terminal contract gate | false success rejected | Gate does not replace tasks | n/a | To be rerun before commit |
| Anti-false-success gate passes | gate command listed in validation ledger | n/a | static harness | evidence/result scripts | anti-false-success gate | false success rejected | Gate rejects proof-only success | n/a | To be rerun before commit |
| Diff check passes | diff command listed in validation ledger | n/a | n/a | all changed files | whitespace gate | n/a | Diff check is not task proof | n/a | To be rerun before commit |
| External live catalog if run | not run | n/a | n/a | n/a | n/a | n/a | Live cannot substitute non-live proof | n/a | Optional |

## Product Owners

No product runtime files changed for SP060 after the diagnostic fixture was
corrected. The executable trial exercises these existing owners:

- `core/query/runtime`: task-state observation, runtime action policy, execution
  feedback, loop terminal status.
- `tools/policy`: adaptive next action, pending action safety, distinct repair
  after failed repair and source context.
- `runtime/execution`: command and file side effects through `ExecutionService`.
- `artifacts/workflow`: source-receipt proof boundary.
- `evidence` and `result`: terminal proof and verdict ownership through normal
  runtime result reduction.

## Validation Ledger

Before-fix diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/workspaceTaskState.test.ts
```

Observed failure: `rollup-source-receipt` stopped not-proven because the
diagnostic seed did not express the restored failure as a verification failure.

After diagnostic correction:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/workspaceTaskState.test.ts
```

Observed result: passed, 1 file, 1 test.

Additional closeout gates are recorded in the final report when run.

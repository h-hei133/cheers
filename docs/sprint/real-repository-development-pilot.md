# SP071 Real Repository Development Pilot

## Decision

Status: hard-gate validation passed; live provider was not run because it is
optional for this route and non-live primary evidence covers the required
product behavior.

Primary behavior evidence was the focused test `harnessSpine.test.ts`, which
executed repository package tasks with repair, receipt proof, restore, and an
honest not-proven result.

> **2026-09-19 更正**：该测试文件**已不存在**——它随 turn 迁移 `a7418fcb`
> （2026-09-12，双循环收敛为内核驱动 turn）删除。本文其余内容
> （SP071 路线的裁决、任务表、验证台账）**保留为历史记录**；
> 但"primary behavior evidence"这一项**当前无对应文件**，不要按它去复核。

These are primary disposable workspace tasks. They do not reuse SP044-SP070
primary tasks, do not depend on transcript fixtures, and do not use catalog,
liveRun, evaluation, proof-only, or receipt-only substitution.

## Primary Coverage

| Task | Repository shaped workspace evidence | Changed files | Source discovery | Command output | Repair / hypothesis chain | Targeted verification | Artifact or not-proven evidence | Product files changed | Why not toy fixture | Why not old diagnostic | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| billing rules package | Disposable package has `package.json`, `src/billing/amounts.mjs`, `src/billing/discounts.mjs`, `src/billing/index.mjs`, and `test/billing-rules.mjs`. | Actual writes through `ExecutionService.writeTextFile` to `src/billing/discounts.mjs` and `test/billing-rules.mjs`. | Real `ExecutionService.readTextFile` reads `src/billing/discounts.mjs` and records `source:billing-discount` plus test fact. | Initial `node test/billing-rules.mjs` fails; first repair rerun fails; second repair rerun passes; final targeted verification passes. | First repair writes wrong discount; failed rerun records command failure; source facts carry into next repair plan; second hypothesis writes correct discount. | Final `node test/billing-rules.mjs` verifies changed source plus updated targeted test. | Completed only after source facts, second repair, and targeted verification. | `harness.ts`, `policy.ts`, `harnessSpine.test.ts`. | Multi-file package module with source, barrel, test, and package script. | New task id and paths; not any SP044-SP070 primary task. | Normal `QueryEngine` plus execution seam run reads, writes, repair, command reruns, and verdict. | Local deterministic provider shape; not live provider. |
| report receipt package | Disposable package has `package.json`, `src/report/model.mjs`, `src/report/template.mjs`, `src/report/index.mjs`, `test/report-receipt.mjs`, and generated `artifact/report-summary.json`. | Actual writes through execution seam to `src/report/model.mjs` and `artifact/report-summary.json`. | Real source read of `src/report/model.mjs`; compact restore carries pending source receipt repair. | Initial `node test/report-receipt.mjs` fails; final targeted rerun passes. | Compact restore decodes pending repair; source read settles context; repair writes source and receipt artifact; verification follows. | Final `node test/report-receipt.mjs` covers source, artifact, and test. | Source receipt proof is completed by source file plus targeted verification evidence, not artifact existence alone. | `harness.ts`, `policy.ts`, `harnessSpine.test.ts`. | Multi-file report module with generated artifact and package script. | New task id and paths; not any prior artifact task. | Artifact/source receipt proof is consumed by runtime proof/result behavior after real command execution. | Artifact content is simple JSON; semantic artifact scoring remains limited. |
| router guard package | Disposable package has `package.json`, `src/router/routes.mjs`, `src/router/guards.mjs`, `src/router/index.mjs`, and `test/router-guard.mjs`. | Actual multi-file writes through execution seam to `src/router/routes.mjs` and `src/router/guards.mjs`. | Real source read of `src/router/guards.mjs` records `source:router-guard`. | Initial `node test/router-guard.mjs` fails; repair and follow-up command output remain insufficient for task proof. | Repair attempt does not produce required proof; runtime leaves exact missing proof visible. | Targeted command is task-relevant but not accepted as terminal proof in this chain. | Honest `stopped_not_proven`; manual correction count remains 0. | `harnessSpine.test.ts` primary task only. | Multi-file router module with source, barrel, test, and package script. | New task id and paths; not SP044-SP070 stopped case. | Result remains not-proven through normal runtime verdict, not a receipt/test-only assertion. | The chain intentionally proves non-completion honesty, not successful repair. |

## Product Fixes

- `packages/ts-shell/src/core/query/runtime/harness.ts`: when a pending repair
  context need is satisfied by a real source read, the matching source fact ids
  are retained on the pending repair before the context need is cleared.
- `packages/ts-shell/src/core/query/runtime/policy.ts`: repair planning falls
  back from an empty hypothesis source-fact list to the pending repair source
  fact ids, so a restored or updated repair queue does not falsely block a
  distinct next repair hypothesis.

## Requirement Coverage

| Requirement | Evidence |
|---|---|
| At least 2 primary tasks execute | Billing, report, and router tasks execute through `QueryEngine.streamMessage`. |
| At least 2 multi-file actual writes | Billing writes source plus test; report writes source plus artifact; router writes two source files. |
| At least 2 real failing command outputs | Billing, report, and router all start with failing `node test/*.mjs` command output. |
| At least 1 targeted test created or updated | Billing updates `test/billing-rules.mjs` through `ExecutionService.writeTextFile`. |
| Completion after failed repair and second hypothesis | Billing fails the first repair rerun, carries source facts, executes a second repair hypothesis, then completes after targeted verification. |
| Artifact or source receipt proof | Report completes source receipt proof after compact restore, source read, artifact write, and targeted verification. |
| Replay or compact restore | Report uses `decodeCompactSessionHarnessState` from compact continuity before continuing. |
| Honest `stopped_not_proven` | Router remains `stopped_not_proven` with missing proof rather than success. |
| Manual correction count 0 | All writes are via `ExecutionService`; no manual workspace mutation. |

## Validation Ledger

Passed:

- `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "executes repository package tasks"`
- `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/trajectory.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/debugLoop.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/trajectory.test.ts`
- SP044-SP070 regression band: 30 files / 297 tests.
- `rtk npm run build -w packages/ts-shell`
- `rtk npm run verify:result-contract`
- `rtk npm run build`
- `rtk npm run verify:route221-anti-false-success-gate`
- `rtk git diff --check`

Not run:

- Live provider: optional for SP071; no live-provider claim is made.

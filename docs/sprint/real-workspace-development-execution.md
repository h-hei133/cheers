# SP058 Real Workspace Development Execution

## Scope

This record is for normal `QueryEngine` runtime work in disposable workspaces
through the runtime execution batch seam backed by `ExecutionService`. It is not
catalog work, liveRun work, evaluation-only work, proof-only work, or a
receipt-only report.

Reference input is behavior-only:

- `pi-docs-playbook` README, AGENTS, task matrix, agent harness, durable
  harness, session format, compaction, and hooks docs.
- `/home/wang/projects/pi` lookup after local owner inspection was limited to
  `packages/agent/src/agent-loop.ts`, `packages/agent/src/harness/*`,
  `packages/coding-agent/src/core/tools/{bash,write}.ts`, and compaction file
  operation tracking.

Introduction decision: dependency use, structured port, and isolated source
adoption are not appropriate because this repository owns the TypeScript
runtime, execution seam, evidence, result, session, and artifact owners. SP058
uses behavior-only alignment: command and write effects must pass through the
local execution seam, durable continuation facts must not become terminal truth,
and task completion must be owned by evidence/result verdicts.

## Disposable Workspace Tasks

| Task | Required coverage | Workspace path pattern | Initial outcome | Product fix | Rerun outcome |
|---|---|---|---|---|---|
| Access rule owner discovery | missing-context discovery, multi-file write, targeted verification | `/tmp/workspace-task-execution-*` | `stopped_not_proven`, `staged action proof missing` after typed action fixture | `orchestration/types.ts` action-kind contract widened to preserve runtime action evidence | `completed` |
| Notification digest repair | failed verification, repair, targeted rerun, multi-file write | `/tmp/workspace-task-execution-*` | diagnostic wording first selected repair before edit; after wording correction, typed action fixture stopped with `staged-action-consistency` | `orchestration/types.ts` action-kind contract widened to preserve repair action evidence | `completed` |
| Metrics export artifact | artifact/source-receipt proof, real verification command | `/tmp/workspace-task-execution-*` | diagnostic helper first omitted artifact command classification; after helper correction, typed action fixture stopped with `staged action proof missing` | `orchestration/types.ts` action-kind contract widened to preserve artifact action evidence | `completed` |
| Cache policy continuation | replay/continuation state, targeted verification | `/tmp/workspace-task-execution-*` | `stopped_not_proven`, `staged action proof missing` after typed action fixture | `orchestration/types.ts` action-kind contract widened to preserve verify action evidence | `completed` |
| Preference write without proof | actual write, incomplete stopped_not_proven with exact missing proof | `/tmp/workspace-task-execution-*` | `stopped_not_proven` | none expected | `stopped_not_proven` |

## Task Evidence Ledger

Manual correction count: `0`.

| Task | Changed files | Command run | Command output classification | Repair action | Artifact or continuation state | Proof input | Final verdict | Exact missing proof if incomplete |
|---|---|---|---|---|---|---|---|---|
| Access rule owner discovery | `src/access/rules.ts`, `src/access/rules.test.ts` | `node --check src/access/rules.ts` | `success` | n/a | n/a | `post-write access verification` | `completed` | n/a |
| Notification digest repair | `src/notify/digest.ts`, `src/notify/digest.test.ts` | `node --check src/notify/digest.ts` | `success` | targeted repair then verification rerun | n/a | `notification verification after repair` | `completed` | n/a |
| Metrics export artifact | `reports/metrics-export.md` | `node --version` | `success` | n/a | artifact source receipt plus verification receipt | `data/metrics.json`, `verification receipt for metrics export` | `completed` | n/a |
| Cache policy continuation | `src/cache/policy.ts`, `src/cache/policy.test.ts` | `node --check src/cache/policy.ts` | `success` | n/a | replay continuation carried pending verification | `cache continuation verification` | `completed` | n/a |
| Preference write without proof | `src/preferences/defaults.ts`, `src/preferences/defaults.test.ts` | none | none | n/a | n/a | none | `stopped_not_proven` | `proof gap remains` |

## Requirement Coverage

| Hard gate | Workspace task evidence | Product files changed | Real command output source | Normal runtime path | Execution seam evidence | Verification or repair proof | Why not proof-only | Why not evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|
| Workspace execution document exists | this file | n/a | n/a | n/a | n/a | n/a | This document is backed by executed tasks below | No catalog/liveRun evidence used | None known |
| 4 to 6 new disposable tasks are defined | five tasks above | n/a | n/a | n/a | n/a | n/a | Task definitions are not success evidence | No evaluation task counter used | None known |
| At least 4 tasks executed | five tasks in `workspaceTaskExecution.test.ts` | `orchestration/types.ts` | access, notification, metrics, cache commands | `QueryEngine.submitMessage` | execution batch executor backed by `ExecutionService` | result statuses asserted | Runtime had to write/run commands before proof | Vitest invokes product runtime, no catalog/liveRun | Provider not exercised |
| At least 3 actual file-write tasks | access, notification, metrics, preference | `orchestration/types.ts` | command classifications listed above | normal loop actions `edit`, `repair`, `artifact` | `writeTextFile` against temp workspace | changed files from result summary | File writes alone did not claim success | No evaluation profile used | Test runner controls safe content |
| At least 2 multi-file tasks | access, notification, cache, preference | `orchestration/types.ts` | access, notification, cache commands | normal runtime changed-file accounting | temp workspace writes/readbacks via execution seam | verified files for completed tasks | Multi-file count is not terminal proof | No mission counter used | Synthetic agent summaries still supply coding result fields |
| At least 2 real verification command outputs | access, notification, metrics, cache | `orchestration/types.ts` | safe command output reduced to `success` | `verify` or artifact batch action | `ExecutionService.runCommand` | command coverage plus evidence/result proof | Command output alone is marked not task success | No catalog gate used | Raw stdout not retained in doc |
| Failed verification then repair then targeted rerun | notification digest repair | `orchestration/types.ts` | `node --check src/notify/digest.ts` | edit -> repair -> verify actions | repair write followed by command run | `notification verification after repair` | Repair attempt alone did not complete | No fallback/provider proof | Failure is represented by structured summary, not raw output |
| Artifact or source-receipt proof | metrics export artifact | `orchestration/types.ts` | `node --version` | artifact action | artifact write plus command run | source receipt and verification receipt | Artifact file existence alone did not claim success | No liveRun/catalog artifact | Artifact content checked through claim evidence only |
| Continuation or replay task completes safely | cache policy continuation | `orchestration/types.ts` | `node --check src/cache/policy.ts` | runtime seed with pending verify | command run in restored task state | `cache continuation verification` | Replay fact did not become success without verify | No replay-only evaluation result | Seed is deterministic test fixture |
| At least 3 tasks complete with evidence/result verdict | four completed tasks | `orchestration/types.ts` | completed task commands above | terminal mapper via normal runtime | execution batch feedback observed | evidence/result verdict statuses asserted | Completion requires task proof | Not evaluation-only | Provider not involved |
| Incomplete tasks stopped_not_proven with exact missing proof | preference write without proof | `orchestration/types.ts` | none | edit action reaches proof gap | write batch without command | stop reason `proof gap remains` | Write receipt did not claim success | No evaluator override | Exact missing proof is concise |
| Manual correction count is zero | all five tasks automated | `orchestration/types.ts` | n/a | normal runtime only | automated executor | assertions record `manualCorrection=false` | No human correction proof substituted | No manual live acceptance | Manual correction is test-recorded |
| Product failures fixed in rightful owners and same tasks rerun | typed action contract failure fixed, same five tasks rerun | `orchestration/types.ts` | focused diagnostic rerun | same five tasks rerun | same execution seam | passing focused diagnostic | Type fix preserves runtime action proof instead of inventing proof | No eval-only behavior changed | Remaining risk is synthetic agent output |
| Requirement coverage table is complete | this table | `orchestration/types.ts` | listed per row | listed per row | listed per row | listed per row | row explains non-substitution | row explains non-evaluation | None known |
| SP044-SP057 regressions pass | `npm run test -w packages/ts-shell -- ... workspaceTaskExecution.test.ts ...` passed 22 files, 237 tests | `orchestration/types.ts` | SP058 command tasks included | normal runtime regression files included | runtime execution tests included | evidence/result tests included | Regression suite does not replace task proof | No live/catalog evidence used | Full repo test not run |
| Build passes | `npm run build -w packages/ts-shell` passed | `orchestration/types.ts` | n/a | TypeScript compile boundary | n/a | type contract compiled | Build alone is not task success | No evaluation behavior used | Workspace package build only |
| Result truthfulness gate passes | `npm run verify:evidence:result-contract` passed | `orchestration/types.ts` | synthetic hard gate | result/evidence terminal contract | synthetic safe home | gate output pass | Gate rejects false terminal claims | No live/provider success used | Gate produced audit residue, removed |
| Anti-false-success gate passes | `npm run verify:evidence:route221-anti-false-success-gate` passed | `orchestration/types.ts` | static harness | evidence/result static rules | n/a | false-success fixtures rejected | Gate exists to reject proof-only success | Not an eval completion substitute | Static harness only |
| Diff check passes | `git diff --check` passed | all changed files | n/a | n/a | n/a | whitespace clean | Diff check alone is not success | n/a | Rerun after final staging |
| External live catalog if run | not run | n/a | n/a | n/a | n/a | n/a | Live is optional and cannot substitute | Not used | Optional |

# SP062 Durable Session Harness Recovery

## Scope

SP062 makes the SP061 runtime harness state durable through session snapshot,
compact carry-forward, and replay seed owners. Restored harness facts now feed
normal `QueryEngine` action selection for pending verification, repair, and
artifact proof gaps, while evidence/result remains the terminal truth owner.

## Product Owners Changed

| Owner | Files |
|---|---|
| Core runtime harness | `packages/ts-shell/src/core/query/runtime/harness.ts` |
| Tool action policy | `packages/ts-shell/src/tools/policy/strategy.ts` |
| Session harness state | `packages/ts-shell/src/session/harness/state.ts` |
| Session snapshot and recovery | `packages/ts-shell/src/session/schema/sessionStateSnapshot.ts`, `packages/ts-shell/src/session/recovery/sessionRecoverySnapshot.ts` |
| Replay seed | `packages/ts-shell/src/session/replay/builder.ts` |
| Compact carry-forward | `packages/ts-shell/src/session/continuation/compactSummary.ts`, `packages/ts-shell/src/session/sessionCompactProjection.ts` |
| Repair owner | `packages/ts-shell/src/repair/flow/strategy.ts` |
| Evidence/result consumers | Existing `evidence/task/proof.ts` and `result/task/verdict.ts` remain terminal truth consumers; no success ownership moved into session, compact, replay, or harness state. |

## Four-Level Introduction

| Capability | Decision | Reason |
|---|---|---|
| Session harness state | structured port | Local session snapshot owns durable serializable state; runtime dependencies remain outside persistence. |
| Compact harness carry-forward | structured port | Compact continuity stores safe harness state as a context input, not proof. |
| Replay harness restore | structured port | Replay seed accepts harness state only when continuation safety accepts replay facts. |
| Repair failure strategy | structured port | Repair owner decides context-discovery strategy after failed repair. |
| Result verdict | behavior-only consumer | Evidence/result remains terminal truth and rejects ledger-only completion. |

Dependency use and isolated source adoption were rejected. The reference pattern
was session-owned serializable state and conservative recovery, not copied code.

## Disposable Workspace Tasks

Diagnostics exercise disposable workspace behavior through `QueryEngine` and
`ExecutionService` in:

- `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts`
- `packages/ts-shell/src/core/query/runtime/workspaceRepairVerification.test.ts`

| Task | Executes | Restore / replay / compact | Wrong or incomplete action | Actual writes | Real failing command output | Bad repair strategy change | Source or artifact proof after restore | Verdict | Manual correction |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| `session-label-repair-restore` | yes | yes | repair restored from pending failure | yes | yes | yes | no | completed | 0 |
| `compact-targeted-rerun` | yes | yes | generic verification cannot clear targeted queue | no | yes | no | no | completed | 0 |
| `artifact-source-proof-restore` | yes | yes | incomplete artifact/source proof stays pending until verified | yes | yes | no | yes | completed | 0 |
| `ledger-only-restored-block` | yes | yes | ledger-only proof is incomplete | no | no | no | no | stopped_not_proven | 0 |

## Diagnostic Coverage

| Requirement | Diagnostic |
|---|---|
| Durable session restore of harness snapshot | `restores durable session harness queues and drives normal targeted verification` |
| Compact restore of safe harness queues | `restores compact harness queues and rejects stale compact state` |
| Stale compact harness state rejected | `rejects contradictory compact harness state before it can affect runtime` |
| Replay restore drives normal next action | `restores durable harness queues from replay and lets normal runtime choose targeted verification` |
| Stale replay harness state rejected | `drops stale replay harness queues before normal runtime can act on them` |
| Wrong edit redirected to discovery | `redirects a wrong edit to discovery when restored repair needs context` |
| Generic verification rejected | `keeps targeted verification pending after a generic verification result` |
| Bad repair changes strategy | `changes from bad repair to discovery when repair failure needs missing context` |
| Incomplete artifact proof remains pending | `restores pending proof facts from persisted replay outputs into runtime observations` |
| Ledger-only state cannot complete task | `does not complete a continuation restored only from harness ledger success` and `result verdict consumer treats harness ledger as not sufficient for task completion` |

## Requirement Coverage Table

| Mandatory requirement | Product files changed | Durable state source | Harness component | Normal runtime path | Workspace evidence | Diagnostic | Why not runtime-seed-only | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|
| Durable harness representation exists | `session/harness/state.ts`, `session/schema/sessionStateSnapshot.ts` | `SessionStateSnapshot.harness` | save points, ledger, queues | `QueryEngine` seed restore | focused session restore task | session harness state tests | State is encoded in session owner, not only test seed | No result verdict is produced by encoded state | Schema version is intentionally minimal |
| Save point and queues serialize and restore | `session/harness/state.ts`, `core/query/runtime/harness.ts` | session harness codec | save point, pending write, verification, repair | `createQueryRuntimeStateFromSeed` | restored verification task | `serializes and restores save points, ledger, and pending queues` | Decode rebuilds runtime harness from durable state | Codec does not claim success | Future schema versions need migration |
| Compact accepts safe state and rejects stale state | `session/continuation/compactSummary.ts`, `session/sessionCompactProjection.ts`, `session/harness/state.ts` | compact continuity `harnessState` | pending verification, ledger safety | compact decode then `QueryEngine` | compact targeted rerun task | compact restore and stale rejection diagnostics | Compact memory must pass session codec | Summary text is not proof | Compact still carries only safe serializable fields |
| Replay restore drives normal action | `session/replay/builder.ts`, `session/recovery/sessionRecoverySnapshot.ts` | recovery snapshot harness | pending verification and repair queues | `decideQueryRuntimeAction` | replay restore task | replay builder harness diagnostics | Replay seed comes from recovery snapshot | Replay state cannot complete result | Unsafe replay drops harness facts |
| Provider-shaped wrong actions corrected | `core/query/runtime/harness.ts`, `tools/policy/strategy.ts`, `repair/flow/strategy.ts` | restored pending queues plus ledger failures | pending repair and verification | policy next action selection | wrong edit, generic verify, bad repair tasks | three imperfect-turn diagnostics | Actions are produced by runtime policy | Tool/provider output alone is non-terminal | Heuristics stay conservative |
| Evidence/result owns terminal truth | `core/query/runtime/loop.ts` unchanged terminal boundary plus existing evidence/result consumers | proof projection and result verdict | ledger is observation only | terminal proof blocker and result mapping | ledger-only restored block | ledger-only diagnostics | Runtime seed can only influence action | Verdict rejects ledger-only proof | Existing truth gates remain required |

## Validation Ledger

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts src/session/harness/state.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/continuation/compactSummary.test.ts src/session/replay/builder.test.ts src/repair/flow/strategy.test.ts
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/verification/selection/model.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/session/continuation/sessionSeedInfluence.test.ts src/session/harness/state.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/continuation/compactSummary.test.ts src/repair/flow/strategy.test.ts
rtk npm run build -w packages/ts-shell
rtk npm run verify:evidence:result-contract
rtk npm run verify:evidence:route221-anti-false-success-gate
rtk git diff --check
```

All listed commands passed during implementation. Live catalog was not run.

# SP061 Harness Spine Adoption

## Scope

SP061 adds a normal-runtime harness spine in `packages/ts-shell/src/core/query/runtime/`.
The spine records turn snapshots, save points, ordered execution ledger entries,
pending write, verification, and repair queues, continuation carry-forward, and
feeds those facts into the existing evidence/result verdict path.

## Four-Level Introduction

| Capability | Decision | Reason |
|---|---|---|
| Turn snapshot and save points | structured port | Local runtime needs the behavior, but dependencies and names stay local. |
| Ordered tool-result ledger | structured port | Execution results are local `QueryRuntimeExecutionBatchResult` values. |
| Pending queues | structured port | Queues are product runtime state, not session sidecars or reference imports. |
| Continuation carry-forward | structured port | Replay seed carries local harness state and reduces into local observations. |
| Result reduction | behavior-only consumer | Evidence/result remains terminal truth owner and only consumes runtime facts. |

Dependency use was rejected because the reference harness is not a runtime
dependency of this product. Isolated source adoption was rejected because the
needed reducers are small and tied to existing local types.

## Disposable Workspace Tasks

Implemented in
`packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts`.

| Task | Executes | Multi-file write | Real failing command output | Restore or continuation | Repair queue and targeted rerun | False-complete block | Verdict | Manual correction |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `tax-rate-harness-queue` | yes | yes | yes | no | yes | no | completed | 0 |
| `status-label-harness-repair` | yes | yes | yes | no | yes | no | completed | 0 |
| `restore-verification-harness` | yes | no | no | yes | no | no | completed | 0 |
| `false-complete-harness-block` | yes | no | no | no | no | yes | stopped_not_proven | 0 |

The incomplete false-complete task remains `stopped_not_proven` because a write
without changed-file verification remains missing task proof.

## Diagnostic Coverage

| Requirement | Diagnostic |
|---|---|
| Turn snapshot survives batch execution and affects next action | `records a turn snapshot before batch execution and uses settled context for the next action` |
| Ordered ledger preserves partial failure before later success | `preserves ordered ledger entries when a batch has a partial failure before success` |
| Pending write queue blocks terminal success | `keeps changed writes non-terminal until changed files and a verification queue exist` |
| Pending verification survives continuation and triggers rerun | `restores pending verification through continuation and drives a targeted rerun` |
| Pending repair changes strategy after missing context | `restores pending repair with missing context and changes strategy before repeating repair` |
| Save point restore resumes safe next action | `restores a save point after interruption and resumes from the pending verification queue` |
| Continuation restore without success claim | `does not complete a continuation restored only from harness ledger success` |
| Evaluation/result consumer cannot complete from ledger alone | `result verdict consumer treats harness ledger as not sufficient for task completion` |

## Validation Ledger

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts
rtk npm run build -w packages/ts-shell
```

Both commands passed during implementation. Broader regression, truthfulness,
anti-false-success, diff checks, commit, and push remain required before final
closeout.

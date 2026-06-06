# SP059 Debug Repair Verification Autonomy Evidence

## Scope

Executable evidence lives in
`packages/ts-shell/src/core/query/runtime/workspaceRepairVerification.test.ts`.

The diagnostic creates five disposable workspaces under `/tmp/workspace-repair-verification-*`
and runs real local `node` verification commands through `ExecutionService`.
Failure output is summarized with workspace paths redacted before entering
runtime observation.

## Task Matrix

| Task | Initial failing command output source | Weak phase | Source context read | Repair path | Targeted rerun | Proof input | Verdict |
|---|---|---|---|---|---|---|---|
| `order-total-repair` | `node test/orderTotal.mjs` failed on expected total mismatch | first repair changed the wrong rate | `src/orderTotal.mjs`, `src/tax.mjs` | first repair failed, second multi-file repair changed source and tax owner | same `node test/orderTotal.mjs` reran twice | initial failure output, order source context, targeted rerun | completed |
| `release-manifest-repair` | `node test/releaseManifest.mjs` failed with missing-context channel evidence | missing context before repair, then first repair left version failure | `src/release/manifest.mjs`, `src/release/policy.mjs` | discovery/read first, then failed first repair, then distinct multi-file repair | same `node test/releaseManifest.mjs` reran twice | release failure output, policy source context, targeted rerun | completed |
| `replay-preserved-repair` | `node test/sessionLabel.mjs` failed before replay seed | replay carried the failure and pending proof gap | `src/session/label.mjs` | repair write after preserved failure | same `node test/sessionLabel.mjs` reran after repair | replay failure output, targeted rerun | completed |
| `artifact-receipt-repair` | `node test/sourceSummary.mjs` failed on source/report mismatch | repair verification passed but source receipt still pending | `data/source.json`, `reports/source-summary.md` | report repair write, targeted rerun, artifact/source receipt | same `node test/sourceSummary.mjs` reran before artifact receipt | source-bound receipt evidence | completed |
| `generic-green-blocked` | `node test/genericStatus.mjs` failed before runtime seed | generic green command did not cover the failed target | `src/generic/status.mjs` | no repair proof accepted | generic `node --version` did not close proof | missing targeted rerun proof | stopped_not_proven |

## Requirement Coverage

| Hard gate | Workspace evidence | Product behavior evidence |
|---|---|---|
| 4 to 6 disposable failing tasks | Five tasks above | focused runtime diagnostic creates isolated workspaces |
| At least 4 real failing verification commands | All five run failing `node test/*.mjs` commands before runtime repair | command results come from `ExecutionService.runCommand` |
| At least 3 red-to-green completions | First four tasks complete | `QueryEngine` normal runtime returns completed verdicts |
| At least 3 actual repair writes | First four tasks write files through `ExecutionService.writeTextFile` | runtime batch repair action applies workspace writes |
| At least 2 multi-file repairs | order total and release manifest | changed-file accounting includes paired owner files |
| At least 2 first-repair-fails then second-strategy succeeds | order total and release manifest | strategy allows source-read-backed distinct repair after failed repair |
| Missing-context discovery before repair | release manifest | policy advances missing-context search to read before repair |
| Replay or continuation preserves failure before repair | replay-preserved repair | task state seed carries failed command summary and proof gap |
| Artifact or source receipt after repair | artifact receipt repair | artifact action validates source-bound claim evidence |
| Targeted rerun after repair write | completed repair tasks rerun same task command | observation no longer replaces passed repair verification with pending verify |
| Generic green cannot hide failed target | generic-green-blocked | missing targeted proof remains stopped_not_proven |
| Manual correction count zero | all task records set `manualCorrection=false` | no manual workspace edits outside ExecutionService |

## Product Owners Changed

- `core/query/runtime`: execution feedback, observation, task-kind policy.
- `tools/policy`: action strategy for failed repair, source read, and distinct second repair.
- `runtime/execution`: consumed only through `ExecutionService`; no new side-effect path.

## Four-Level Introduction Decision

Dependency use, structured port, and isolated source adoption were rejected for
this route because the gap was inside the local runtime policy and observation
state. Behavior-only alignment was used after reading the local playbook and
keeping the implementation in existing owners.

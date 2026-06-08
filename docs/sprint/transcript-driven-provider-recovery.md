# Transcript Driven Provider Recovery

Route: `docs/sprint/route/sp069-transcript-driven-provider-recovery.md`

Status: complete.

## Reference Input

The introduction mode is structured port. The useful reference pattern is not a
name, field, or terminal rule transplant: session/tool output is reduced as
append-only state, durable restore resumes only from a stable boundary, and
tool/result facts remain separate from assistant text claims.

Local reference files read:

- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/extensions.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/hooks.md`

## Primary Transcript Trajectories

These are new disposable workspace trajectories for SP069. They are not reused
from SP044-SP068.

| Trajectory | Transcript mistakes | Phases | Source facts and hypothesis chain | Writes and reruns | Durable restore | Artifact or not-proven evidence | Verification proof | Product files changed | Why not old diagnostic | Why not proof-only/evaluation-only | Remaining risk |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| totals text recovery | False completion claim after wrong edit; generic verification claim from broader command; bad repair claim before targeted pass. | >=6 | Real `ExecutionService.readTextFile` source fact `source:totals-format`; first source-backed hypothesis is rejected by failed rerun; next hypothesis is distinct. | Two real writes to `src/totals/format.mjs`; first `node test/totals.mjs` rerun fails, second targeted rerun passes. | None. | N/A. | Real initial `node test/totals.mjs` failure, generic `node --version` rejection, and final targeted pass. | `core/query/runtime/harness.ts`, `loop.ts`, `trajectory.ts`, `harnessSpine.test.ts`, `trajectory.test.ts` | New `src/totals/*` disposable workspace and text-claim trajectory. | Normal `QueryEngine` and execution seam drive reads, writes, command output, claim reduction, repair, and verdict. | Natural-language claim detection remains intentionally conservative. |
| report artifact restore | False completion and artifact proof claim while proof is incomplete; artifact write claim before targeted verification. | >=6 | Restore carries pending artifact; source context is observed and later proof consumes source and verification paths. | Real write to `artifact/report.json`; targeted `node test/report.mjs` verifies the artifact after the incomplete proof. | Compact continuity is decoded through `decodeCompactSessionHarnessState`. | Artifact proof starts incomplete, then completes after artifact write and verification evidence. | Real initial `node test/report.mjs` failure and final targeted pass. | `core/query/runtime/harness.ts`, `loop.ts`, `trajectory.ts`, `harnessSpine.test.ts`, `trajectory.test.ts` | New `src/report/*` and `artifact/report.json` disposable workspace. | Artifact workflow and proof projection consume runtime facts; no catalog/liveRun/evaluation substitution. | Artifact claim matching is path/evidence based, not semantic content scoring. |
| claim text not-proven | False completion and generic green claim after source read; repeated bad repair claims do not close proof. | >=6 | Real `ExecutionService.readTextFile` source fact `source:claim-value`; repair stays incomplete after failed reruns. | At least one real write to `src/claim/value.mjs`; `node test/claim.mjs` continues to fail. | None. | Ends `stopped_not_proven` with exact missing proof and manual correction count 0. | Real initial and post-repair `node test/claim.mjs` failures. | `core/query/runtime/harness.ts`, `loop.ts`, `trajectory.ts`, `harnessSpine.test.ts`, `trajectory.test.ts` | New `src/claim/*` disposable workspace and text-claim trajectory. | Result verdict remains the terminal owner; text claims only add non-terminal mistake evidence. | This row intentionally proves honest stop, not successful recovery. |

## Product Gaps Found And Fixed

- Mismatched outputs were constrained before harness settlement, which dropped the
  original assistant text and made false completion or generic verification
  claims invisible to trajectory recovery.
- Runtime harness now reduces assistant text claims into non-terminal
  `output:*` trajectory phases while still settling state from constrained
  structured output.
- Trajectory diagnostics now count text-claim mistakes and expose rejected false
  completion, generic verification, and incomplete artifact claims.

## Validation Ledger

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "text claims|text-claimed|artifact proof from text"
```

Result: passed, 3 primary transcript diagnostics.

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/trajectory.test.ts src/core/query/runtime/harnessSpine.test.ts
```

Result: passed, 2 files, 28 tests.

```bash
rtk npm run test -w packages/ts-shell -- src/context/acquisition/code/source.test.ts src/core/query/runtime/trajectory.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/debugLoop.test.ts src/core/query/runtime/engine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/repair/flow/hypothesis.test.ts src/repair/flow/strategy.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/session/harness/state.test.ts src/session/continuation/compactSummary.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts
```

Result: passed, 19 files, 204 tests.

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/debugLoop.test.ts src/repair/flow/hypothesis.test.ts src/context/acquisition/code/source.test.ts src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/verification/selection/model.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/session/continuation/sessionSeedInfluence.test.ts src/session/harness/state.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/continuation/compactSummary.test.ts src/repair/flow/strategy.test.ts
```

Result: passed, 30 files, 293 tests.

```bash
rtk npm run build -w packages/ts-shell
```

Result: passed.

```bash
rtk npm run build
```

Result: passed.

```bash
rtk npm run verify:result-contract
```

Result: passed.

```bash
rtk npm run verify:route221-anti-false-success-gate
```

Result: passed.

## Closeout Notes

- Primary transcript diagnostics are the three new disposable workspace
  trajectories in `harnessSpine.test.ts`.
- Manual correction count is 0 for all primary trajectories.
- Live catalog was not run; SP069 treats it as optional after non-live hard
  gates pass.
- `verify:result-contract` generated audit residue under
  `packages/ts-shell/.sisyphus/audit/permissions.jsonl`; those generated lines
  were removed before closeout.

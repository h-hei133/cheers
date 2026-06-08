# Provider Shaped End To End Gauntlet

Route: `docs/sprint/route/sp068-provider-shaped-end-to-end-gauntlet.md`

Status: complete.

## Primary Trajectories

These are new disposable workspace trajectories added for SP068. They are not
recycled from SP044-SP067 closeout documents.

| Trajectory | Phases | Wrong or incomplete actions | Product files | Source facts and hypothesis chain | Repair writes and reruns | Durable restore evidence | Artifact or not-proven evidence | Verification proof | Why not old diagnostic | Why not proof-only/evaluation-only | Remaining risk |
|---|---:|---:|---|---|---|---|---|---|---|---|---|
| quota primary workspace | >=6 | >=2 | `core/query/runtime/harness.ts`, `policy.ts`, `actionAuthority.ts`, `context/acquisition/code/source.ts`, `core/query/runtime/trajectory.ts` | `ExecutionService.readTextFile` records `source:quota-policy`; first source-backed hypothesis is rejected after failed rerun; next hypothesis is distinct. | Two real writes to `src/quota/policy.mjs`; first rerun fails, second targeted rerun passes. | None. | N/A. | Real `node test/quota.mjs` failure and later targeted pass; generic `node --version` is rejected as wrong target. | New `src/quota/*` disposable workspace task and test name. | Normal `QueryEngine` plus execution seam drives reads, writes, command output, trajectory, and verdict. | Remaining risk is richer provider natural-language variation; current row proves provider-shaped action recovery without manual correction. |
| ledger artifact primary | >=6 | >=2 | `core/query/runtime/proof.ts`, `core/query/runtime/trajectory.ts`, artifact workflow consumer path | `ExecutionService.readTextFile` records `source:ledger-source`; source fact path is consumed by artifact proof workspace context. | Real artifact write to `artifact/ledger.json`; targeted command verifies it against `src/ledger/source.mjs`. | Compact harness state is encoded and restored via `decodeCompactSessionHarnessState`. | Artifact proof starts pending, then completes after source and verification receipt paths are present. | Real `node test/ledger.mjs` fails before artifact exists and passes after artifact write. | New `src/ledger/*` and `artifact/ledger.json` disposable workspace task. | Product proof projection and artifact workflow consume runtime facts; no catalog/liveRun/eval substitution. | Artifact evidence remains path-bound; future artifact content semantics may need richer claim evidence. |
| threshold incomplete primary | >=6 | >=2 | `core/query/runtime/harness.ts`, `policy.ts`, `context/acquisition/code/source.ts`, `core/query/runtime/trajectory.ts` | Real source read records `source:threshold-value`; bad repair cannot close proof. | One real bad write to `src/threshold/value.mjs`; targeted rerun still fails. | None. | Ends `stopped_not_proven` with exact missing proof; manual correction count 0. | Real `node test/threshold.mjs` fails before and after bad repair. | New `src/threshold/*` disposable workspace task. | Normal runtime and result verdict produce the stop; no proof-only completion. | Intentionally incomplete chain proves honest stop; it is not counted as a successful repair trajectory. |

## Product Gaps Found And Fixed

- Source facts are no longer synthesized from generic read diagnostics; source facts must be explicit.
- Pending repair can create a source-backed repair plan after real source discovery.
- Failed repair reruns preserve rejected hypothesis state and supersede overlapping pending repair entries.
- Recovered repair queues targeted verification while preserving source-backed hypothesis context until verification settles.
- Write-action mismatches from provider-shaped output are blocked and settled against the blocked targets.
- Artifact proof projection consumes harness source fact paths as source receipt context.

## Validation Ledger

```bash
rtk npm run test -w packages/ts-shell -- src/context/acquisition/code/source.test.ts src/core/query/runtime/trajectory.test.ts src/core/query/runtime/harnessSpine.test.ts
```

Result: passed, 3 files, 28 tests.

```bash
rtk npm run test -w packages/ts-shell -- src/context/acquisition/code/source.test.ts src/core/query/runtime/trajectory.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/debugLoop.test.ts src/core/query/runtime/engine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/repair/flow/hypothesis.test.ts src/repair/flow/strategy.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/session/harness/state.test.ts src/session/continuation/compactSummary.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts
```

Result: passed, 19 files, 201 tests.

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/debugLoop.test.ts src/repair/flow/hypothesis.test.ts src/context/acquisition/code/source.test.ts src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/verification/selection/model.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/session/continuation/sessionSeedInfluence.test.ts src/session/harness/state.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/continuation/compactSummary.test.ts src/repair/flow/strategy.test.ts
```

Result: passed, 30 files, 290 tests.

```bash
rtk npm run build -w packages/ts-shell
```

Result: passed.

```bash
rtk npm run build
```

Initial sandbox run failed because Node `spawnSync` returned `EPERM` in
`result.error` for `python` and `cargo` even though both commands produced
version output with status 0. Escalated rerun passed: Python compileall,
Rust release build, and TypeScript build all exited 0.

```bash
rtk npm run verify:result-contract
```

Result: passed.

```bash
rtk npm run verify:route221-anti-false-success-gate
```

Result: passed.

## Closeout Notes

- Primary trajectory diagnostics are encoded in the new runtime trajectory
  reducer and the three new disposable workspace `harnessSpine` trajectories.
- Manual correction count is 0 for the primary trajectories.
- Live catalog was not run; SP068 treats it as optional after non-live hard
  gates pass.
- `verify:result-contract` generated audit residue under
  `packages/ts-shell/.sisyphus/audit/permissions.jsonl`; those generated lines
  were removed before closeout.

# Live Like Transcript Acceptance Decision

Route: `docs/sprint/route/sp070-live-like-transcript-acceptance-decision.md`

Status: complete.

## Reference Input

The introduction mode was structured port review. No product code was adopted
from the reference project. The useful reference pattern is semantic only:
append-only session/tool facts are durable trace, compaction restores from a
stable boundary, hooks/tool events may shape lifecycle, and application truth
must still be reduced by the local runtime and result owners.

Local reference files read:

- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/extensions.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/hooks.md`
- `/home/wang/projects/pi/packages/coding-agent/src/core/session-manager.ts` was identified for targeted source orientation; no code was copied.
- `/home/wang/projects/pi/packages/agent/src/types.ts` was identified for targeted source orientation; no code was copied.

## Primary Trials

These are new SP070 disposable workspace trials in
`packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts`. They do not
reuse SP044-SP069 primary tasks.

| Trial | Transcript mistakes | Phases | Source facts and hypothesis chain | Writes and reruns | Durable restore evidence | Artifact or not-proven evidence | Verification proof | Product files changed | Decision result | Why not old diagnostic | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|
| invoice noisy transcript recovery | Over-eager edit claim while discovery is required; false completion claim after read; first repair says green while failing; generic quick-check green before targeted proof. | >=8 | Real `ExecutionService.readTextFile` source fact `source:invoice-label`; first source-backed hypothesis is rejected by failed rerun; second hypothesis is distinct. | Two real writes to `src/invoice/label.mjs`; first `node test/invoice.mjs` repair rerun fails; final targeted `node test/invoice.mjs` passes. | None. | N/A. | Real initial failure, failed repair rerun, generic wrong-target check rejection, final targeted pass. | No product code changed; primary evidence added in `harnessSpine.test.ts`. | CONTINUE CURRENT PROJECT. | New `src/invoice/*` workspace and `sess_invoice_acceptance` trajectory. | Normal `QueryEngine`, runtime harness, ExecutionService, repair, verification, evidence, and result owners drive behavior. | Text claim detection remains conservative; very indirect natural-language claims may require future reducer coverage. |
| manifest artifact proof after compact restore | Incomplete artifact proof claim; false completion claim; source step says green before verification; artifact write claims done before targeted proof. | >=8 | Compact restore carries pending artifact; real source read records `source:manifest`; proof later binds source path and verification path to artifact claims. | Real write to `artifact/manifest.json`; targeted `node test/manifest.mjs` verifies source-backed artifact. | `buildCompactContinuitySummary` plus `decodeCompactSessionHarnessState` restore pending artifact state. | Incomplete artifact claim becomes completed proof only after source evidence, artifact write, and verification evidence. | Real initial `node test/manifest.mjs` failure and final targeted pass. | No product code changed; primary evidence added in `harnessSpine.test.ts`. | CONTINUE CURRENT PROJECT. | New `src/manifest/*` and `artifact/manifest.json` workspace and `sess_manifest_acceptance` trajectory. | Artifact workflow/proof/result owners consume runtime facts; no catalog, liveRun, receipt-only, or evaluation substitution. | Artifact claim evidence is path-bound; provider text that omits bindable evidence remains not-proven. |
| score honest not-proven | Over-eager edit claim; false completion after source read; repair says green before targeted rerun; generic green after targeted rerun fails. | >=8 | Real `ExecutionService.readTextFile` source fact `source:score-value`; repair plan applies a wrong value and targeted rerun exposes missing proof. | Real write to `src/score/value.mjs`; targeted `node test/score.mjs` fails after repair. | None. | Ends `stopped_not_proven` with `repair-post-validation`; manual correction count 0. | Real initial `node test/score.mjs` failure and post-repair targeted failure. | No product code changed; primary evidence added in `harnessSpine.test.ts`. | CONTINUE CURRENT PROJECT. | New `src/score/*` workspace and `sess_score_acceptance` trajectory. | Result verdict stays terminal owner; transcript and command output alone do not settle success. | This row intentionally proves honest stop, not successful recovery. |

## Combined Coverage

| Requirement | Primary evidence |
|---|---|
| Three primary live-like transcript trials execute | `accepts noisy invoice...`, `accepts noisy manifest...`, `accepts noisy score...` focused test run. |
| Each trial has at least 8 phases | Each trial records initial command, runtime decisions, execution batches, and completion phase; assertions require `phases.length >= 8`. |
| Each trial has at least 3 provider-like mistakes | Each trial includes false completion or generic green text plus wrong or incomplete action claims. |
| Real failing command output in all trials | Invoice, manifest, and score all run failing `node test/*.mjs` commands in disposable workspaces. |
| Real writes in all trials | Invoice writes `src/invoice/label.mjs`; manifest writes `artifact/manifest.json`; score writes `src/score/value.mjs`. |
| At least two complete after second or third hypothesis | Invoice completes after a rejected first repair and second repair hypothesis; manifest completes after restored incomplete proof, source evidence, artifact write, and targeted verification. |
| Replay or compact restore | Manifest decodes compact harness state before continuing artifact proof. |
| Artifact proof completes after incomplete claim | Manifest starts with pending artifact claims and completes only after source and verification evidence. |
| Honest not-proven chain | Score ends `stopped_not_proven` with `repair-post-validation`. |
| Manual correction count 0 | Trials use only `QueryEngine`, harness state, `ExecutionService`, and deterministic workspace commands/writes. |
| Old diagnostics are regression only | SP044-SP069 tests are not used as primary evidence; they are only required regression gates. |

## Product Gap Finding

Primary trials did not expose a product gap requiring runtime owner changes.
Current behavior rejected false completion and generic verification claims,
redirected over-eager write output back to discovery, carried compact artifact
state, required path-bound artifact evidence, ran real targeted commands, and
kept missing proof as `stopped_not_proven`.

Strict no-change finding: no product runtime files were changed for SP070.

## Decision

Decision: CONTINUE CURRENT PROJECT.

Live provider was not run because non-live primary trials are the acceptance
evidence for this route.

## Validation Ledger

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "accepts noisy"
```

Result: passed, 3 primary SP070 trials.

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/trajectory.test.ts src/core/query/runtime/harnessSpine.test.ts
```

Result: passed, 2 files, 31 tests.

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/debugLoop.test.ts src/repair/flow/hypothesis.test.ts src/context/acquisition/code/source.test.ts src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/verification/selection/model.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts src/session/replay/builder.test.ts src/session/replay/state.test.ts src/core/query/runtime/workspaceTaskExecution.test.ts src/core/query/runtime/workspaceTaskState.test.ts src/core/query/runtime/workspaceRepairVerification.test.ts src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/normalTaskRuntime.test.ts src/session/continuation/sessionSeedInfluence.test.ts src/session/harness/state.test.ts src/session/schema/sessionStateSnapshot.test.ts src/session/continuation/compactSummary.test.ts src/repair/flow/strategy.test.ts
```

Result: passed, 30 files, 296 tests.

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

```bash
rtk git diff --check
```

Result: passed.

## Hygiene

`verify:result-contract` appended two generated permission audit lines under
`packages/ts-shell/.sisyphus/audit/permissions.jsonl`; those generated lines
were removed after the gate passed.

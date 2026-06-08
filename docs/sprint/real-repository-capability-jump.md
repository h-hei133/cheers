# SP072 Real Repository Capability Jump

## Decision

Decision: CONTINUE AFTER ONE FIX.

The primary diagnostics execute four independent repository-subdirectory tasks
through normal `QueryEngine.streamMessage` and the `ExecutionService` read,
write, and command seam. The one product gap found was in runtime proof
projection: failed repair rerun tool feedback did not count as preserved
original-failure evidence for debug-repair proof. That was fixed in
`packages/ts-shell/src/core/query/runtime/proof.ts`.

Live provider was not run. It is optional for this route and is not used as
primary evidence.

## Primary Coverage

| Task | Independent diagnostic name | Repository subdirectory source | Changed files | Source discovery | Command output | Repair / hypothesis chain | Targeted test evidence | Targeted verification proof | Artifact or not-proven evidence | Product files changed | Introduction level used | Why not small package | Why not old diagnostic | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| verification execution coverage | `executes verification subdirectory capability task through failed repair and second hypothesis` | `packages/ts-shell/src/verification/execution` copied as disposable `src/verification/execution/*` files. | Changes `command.mjs`, `coverage.mjs`, `index.mjs`, and `test/verification-execution.mjs`. | Real `ExecutionService.readTextFile` reads `src/verification/execution/coverage.mjs` and records `source:verification-coverage`. | Initial `node test/verification-execution.mjs` fails; first repair rerun fails; second repair rerun and final targeted verification pass. | First hypothesis preserves incomplete coverage; second hypothesis includes the targeted test file in coverage. | Updates `test/verification-execution.mjs` to assert source plus targeted-test coverage. | Targeted command covers changed source and test paths; completion depends on proof/result verdict. | Not applicable; this is a completed verification task. | `harnessSpine.test.ts`, `proof.ts`. | Behavior alignment plus product proof fix. | Uses a repository verification owner subdirectory with four files, not a tiny package. | New task id, paths, command, and source facts; SP071 and older tasks are regression only. | Normal runtime executes read, write, failed repair, second repair, verify, proof, and result reduction. | Disposable JS mirrors the subdirectory behavior instead of compiling the TypeScript sources directly. |
| session harness durable queue | `executes session harness subdirectory task across compact restore with structured durable reduction` | `packages/ts-shell/src/session/harness` copied as disposable `src/session/harness/*` files. | Changes `codec.mjs`, `reducer.mjs`, and `index.mjs`. | Real source read of `src/session/harness/codec.mjs` records `source:session-harness-codec`. | Initial `node test/session-harness.mjs` fails; first repair rerun fails; second repair rerun and final targeted verification pass. | Compact-restored pending repair reads source, fails one repair, then completes on the second durable-queue hypothesis. | Existing targeted test verifies restored pending queue reduction. | Targeted command proves all changed session harness source files after compact restore. | Compact restore is accepted before the task continues; no manual correction. | `harnessSpine.test.ts`, `proof.ts`. | Structured port from pi durable session/harness reduction. | Uses a session harness owner subdirectory and compact-restored queue state, not a small package pilot. | New task id, paths, and compact seed; not SP071 report receipt or older restore diagnostics. | Restore is only a starting state; completion still requires command-backed proof and result verdict. | The diagnostic ports durable reduction behavior, not pi naming, fields, or terminal truth rules. |
| workflow source receipt | `executes artifact workflow subdirectory task with receipt proof and third-file verification` | `packages/ts-shell/src/artifacts/workflow` copied as disposable `src/artifacts/workflow/*` files. | Changes `claims.mjs`, `receipt.mjs`, `index.mjs`, `artifact/workflow-receipt.json`, and `test/artifact-workflow.mjs`. | Real source read of `src/artifacts/workflow/claims.mjs` records `source:artifact-workflow-claims`. | Initial `node test/artifact-workflow.mjs` fails because the receipt file is missing; repair writes source, artifact, and test; final targeted verification passes. | One source-backed repair writes a complete source receipt and validates it. | Updates `test/artifact-workflow.mjs` to read and verify `artifact/workflow-receipt.json`. | Targeted command verifies changed source plus receipt artifact through the test. | Source receipt proof is recorded by the task record after real artifact write and targeted verification. | `harnessSpine.test.ts`. | Behavior alignment. | Uses an artifact workflow owner subdirectory and receipt file, not a toy package. | New task id and paths; does not reuse SP071 report receipt. | Artifact existence alone is not accepted; the targeted command must pass. | The artifact content is deterministic JSON and does not score rich artifact semantics. |
| repair flow missing proof | `keeps repair flow subdirectory task stopped_not_proven with exact missing proof` | `packages/ts-shell/src/repair/flow` copied as disposable `src/repair/flow/*` files. | Changes `hypothesis.mjs`, `strategy.mjs`, and `index.mjs`. | Real source read of `src/repair/flow/strategy.mjs` records `source:repair-flow-strategy`. | Initial `node test/repair-flow.mjs` fails; incomplete repair rerun remains insufficient. | One incomplete repair hypothesis runs and fails to produce required targeted proof. | Existing targeted test continues to require proof-bearing strategy. | Targeted verification does not pass and cannot terminally prove completion. | Honest `stopped_not_proven` with exact missing proof; false success count remains 0. | `harnessSpine.test.ts`. | Behavior alignment. | Uses a repair flow owner subdirectory with multiple source files, not a small package. | New task id and proof chain; not SP071 router guard or older stopped cases. | The result remains not-proven through runtime verdict, not a receipt-only assertion. | This row intentionally proves honesty, not completion capability. |

## Requirement Coverage

| Requirement | Evidence |
|---|---|
| 4 independent primary tasks execute | Four separate `it(...)` diagnostics in `harnessSpine.test.ts`, each calling one task runner. |
| At least 2 tasks use current project subdirectories | All four use copied owner subdirectories: verification, session harness, artifact workflow, and repair flow. |
| At least 1 structured port or isolated adoption | Session harness task uses structured port from pi durable session/harness reduction: durable state from session log, runtime dependencies recreated, compact-restored queue resumes from a durable boundary. |
| At least 3 tasks change 3 or more files | All four change at least three files through `ExecutionService.writeTextFile`. |
| At least 2 tasks create or update targeted tests | Verification execution and artifact workflow update targeted tests. |
| At least 3 tasks start with real failing command output | All four start with real failing `node test/*.mjs` command output. |
| At least 2 tasks complete after failed repair and second or third hypothesis | Verification execution and session harness both fail the first repair rerun and complete after the second hypothesis. |
| At least 1 task crosses replay or compact restore | Session harness decodes compact harness continuity before continuing. |
| At least 1 task produces artifact or source receipt proof | Artifact workflow writes `artifact/workflow-receipt.json` and verifies it with the targeted test. |
| At least 1 task remains `stopped_not_proven` | Repair flow remains `stopped_not_proven` with exact missing proof. |
| Manual correction count 0 | Every workspace mutation is through `ExecutionService.writeTextFile`; no manual workspace mutation is used. |
| False success count 0 | The stopped task remains not-proven, and completed tasks require targeted command proof plus result verdict. |

## Validation Ledger

Passed so far:

- `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "subdirectory"`
- `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/engine.test.ts src/core/query/runtime/debugLoop.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts`
- SP044-SP071 regression band: 30 files / 301 tests.
- `rtk npm run build -w packages/ts-shell`
- `rtk npm run build`
- `rtk npm run verify:result-contract`
- `rtk npm run verify:route221-anti-false-success-gate`
- `rtk git diff --check`

Not run:

- Live provider: optional for SP072; no live-provider claim is made.

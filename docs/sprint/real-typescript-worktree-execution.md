# SP073 Real TypeScript Worktree Execution

## Decision

Decision: CONTINUE CURRENT PROJECT.

The primary diagnostics execute three independent TypeScript worktree tasks
through normal `QueryEngine.streamMessage` and the `ExecutionService` read,
write, command, repair, verification, compact-restore, proof, and result
verdict path. They copy current `packages/ts-shell/src` TypeScript files into
disposable worktrees, add or modify `.test.ts` files under those copied project
paths, run focused TypeScript commands with `tsx`, and preserve incomplete proof
as `stopped_not_proven`.

No product runtime gap was found. The only changes are primary diagnostics and
this report/index update. Live provider was not run and is not used as primary
evidence.

## Primary Coverage

| Task | Independent diagnostic name | TypeScript worktree source | Changed files | Source discovery | Command output | Repair / hypothesis chain | Targeted test evidence | Targeted verification proof | Artifact or not-proven evidence | Product files changed | Introduction level used | Why not JS mirror | Why not old diagnostic | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| verification execution coverage | `executes verification execution TypeScript worktree task through failed repair and second hypothesis` | Copies current `packages/ts-shell/src/verification/execution/model.ts` into a disposable `packages/ts-shell/src/verification/execution/` tree. | Changes copied `model.ts`, adds `worktreeCoverage.test.ts`, and adds `coverageNote.ts`. | Real `ExecutionService.readTextFile` reads copied `packages/ts-shell/src/verification/execution/model.ts` and records `source:verification-execution-typescript-model`. | Initial `tsx packages/ts-shell/src/verification/execution/worktreeCoverage.test.ts` fails because focused-test coverage is not accepted; first repair rerun still fails; second repair rerun and final targeted verification pass. | First hypothesis adds an incomplete coverage note and leaves source-only coverage failing; second hypothesis modifies copied TypeScript source and test so the focused test is command-covered. | Adds copied `worktreeCoverage.test.ts` under `packages/ts-shell/src/verification/execution/`. | Final targeted command exits 0 and covers copied source plus test paths through runtime verification. | Completed only after proof/result verdict; false success count 0. | None. | Structured port: current harness durable queue plus TypeScript command execution, informed by pi durable session boundary concepts. | Uses `.ts` source and `.test.ts` under copied `packages/ts-shell/src`; command runs `tsx`, not `node *.mjs`. | New task id, source path, command, and test body; SP044-SP072 diagnostics are regression only. | Runtime completion depends on targeted command, proof projection, and result verdict, not command output or file existence alone. | The disposable test is focused and synthetic, though it uses current TypeScript owner source as the starting file. |
| artifact workflow source receipt | `executes artifact workflow TypeScript worktree task with source receipt proof and third hypothesis` | Copies current `packages/ts-shell/src/artifacts/workflow/model.ts` into a disposable `packages/ts-shell/src/artifacts/workflow/` tree. | Changes/adds copied `worktreeReceipt.test.ts`, `receiptEvidence.ts`, and `artifact/worktree-source-receipt.json`. | Real `ExecutionService.readTextFile` reads copied `packages/ts-shell/src/artifacts/workflow/model.ts` and records `source:artifact-workflow-typescript-model`. | Initial TypeScript test fails because the receipt file is missing; first repair rerun fails with invalid receipt content; second repair rerun fails from missing claim evidence; third repair rerun and final targeted verification pass. | Third hypothesis supplies complete receipt JSON, focused TypeScript receipt evidence, and required targeted verification proof. | Adds copied `worktreeReceipt.test.ts` under `packages/ts-shell/src/artifacts/workflow/`. | Final `tsx` command exits 0; runtime proof includes artifact receipt and targeted verification evidence before result completion. | Produces `artifact/worktree-source-receipt.json`; artifact existence alone is insufficient and only completed after claim evidence and verdict settle. | None. | Structured port: durable artifact proof remains owner-consumed by evidence/result, not terminal by existence. | Uses copied `.ts` owner source plus `.test.ts`; no `.mjs` mirror task. | New task id, paths, receipt, and three-hypothesis chain; not SP071/SP072 receipt diagnostics. | Artifact proof is consumed by runtime proof/result; no catalog, liveRun, or evaluation surface substitutes behavior. | Receipt content is deterministic JSON and does not exercise rich artifact formats. |
| repair flow honest stop | `keeps repair flow TypeScript worktree task stopped_not_proven after compact restore with exact missing proof` | Copies current `packages/ts-shell/src/repair/flow/hypothesis.ts` and `packages/ts-shell/src/repair/flow/strategy.ts` into a disposable `packages/ts-shell/src/repair/flow/` tree. | Changes copied `strategy.ts` and `worktreeProof.test.ts`; the copied `hypothesis.ts` remains part of the disposable TypeScript project source. | Real `ExecutionService.readTextFile` reads copied `packages/ts-shell/src/repair/flow/strategy.ts` and records `source:repair-flow-typescript-strategy`. | Initial `tsx packages/ts-shell/src/repair/flow/worktreeProof.test.ts` fails; incomplete repair rerun still lacks targeted proof. | Compact-restored pending repair reads source, applies one incomplete proof hypothesis, and stops because required proof remains missing. | Adds copied `worktreeProof.test.ts` under `packages/ts-shell/src/repair/flow/`. | Targeted verification does not pass and cannot terminally prove completion. | Honest `stopped_not_proven` with exact missing proof; manual correction count 0 and false success count 0. | None. | Structured port: compact-restored durable queue resumes from a session boundary, aligned with pi durable harness recovery concepts. | Uses copied `.ts` owner files and `.test.ts` with `tsx`; no JS mirror or toy package. | New task id, compact seed, paths, and proof chain; old stopped diagnostics are regression only. | Result remains not-proven through normal runtime verdict, not a receipt/test-only assertion. | This row proves honesty, not successful repair capability. |

## Requirement Coverage

| Requirement | Evidence |
|---|---|
| 3 independent primary tasks execute | Three separate `it(...)` diagnostics in `harnessSpine.test.ts`, each calling a separate task runner. |
| At least 2 tasks modify files under copied `packages/ts-shell/src` | All three use copied `packages/ts-shell/src` paths; verification and artifact tasks modify at least three copied project files. |
| At least 2 tasks modify or add TypeScript tests | All three add copied `.test.ts` files under `packages/ts-shell/src`. |
| At least 2 tasks change 3 or more files | Verification execution changes 3 files; artifact workflow changes 3+ files including receipt artifact. |
| At least 2 tasks start with real failing focused test or build output | All three start with real failing `tsx .../*.test.ts` output. |
| At least 2 tasks complete after failed repair and second or third hypothesis | Verification completes after the second hypothesis; artifact completes after the third hypothesis. |
| At least 1 task crosses replay or compact restore | Repair flow decodes compact harness continuity before continuing. |
| At least 1 task produces artifact or source receipt proof | Artifact workflow writes and verifies `artifact/worktree-source-receipt.json`. |
| At least 1 task remains `stopped_not_proven` | Repair flow remains `stopped_not_proven` with exact missing proof. |
| Manual correction count 0 | Every disposable workspace mutation is through `ExecutionService.writeTextFile`; no manual workspace mutation is used. |
| False success count 0 | Completed tasks require targeted command proof plus result verdict; incomplete task remains stopped. |

## Reference Inputs

- pi-docs-playbook: `source/packages/coding-agent/docs/session-format.md`, `source/packages/coding-agent/docs/sessions.md`, `source/packages/coding-agent/docs/compaction.md`, `source/packages/agent/docs/durable-harness.md`, `source/packages/agent/docs/agent-harness.md`, and `source/packages/agent/docs/hooks.md`.
- pi targeted source inspection: append-only session entries, pending session writes flushed at save points, queued message draining, and compaction preparation from durable boundaries.
- Introduction level: structured port. The compatible behavior is durable session/harness reduction and recovery from serialized queue boundaries. No pi names, fields, paths, terminal truth rules, or architecture identity were copied.

## Validation Ledger

Passed so far:

- RED before helper implementation: `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "TypeScript worktree"` failed with the three missing helper symbols.
- Primary after diagnostic implementation: `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "TypeScript worktree"` passed, 3 tests.
- Artifact diagnostic after claim-evidence correction: `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts -t "artifact workflow TypeScript worktree"` passed, 1 test.
- Focused changed-owner suite: `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/harnessSpine.test.ts src/core/query/runtime/engine.test.ts src/core/query/runtime/debugLoop.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts` passed, 5 files / 131 tests.
- SP044-SP072 regression band: 30 files / 304 tests passed.
- `rtk npm run build -w packages/ts-shell` passed.
- `rtk npm run verify:result-contract` passed.
- `rtk npm run verify:route221-anti-false-success-gate` passed.
- `rtk npm run build` passed.
- `rtk git diff --check` passed.

Not run:

- Live provider: optional for SP073; no live-provider claim is made.

# Append Only Tool Session Trajectory

## Primary trajectories

These are SP065 primary diagnostics. Older SP044-SP064 diagnostics remain regression coverage only.

| trajectory or diagnostic | lifecycle entries | local source areas inspected | introduction level used | product files changed | normal runtime path | durable state source | command output | repair or verification proof | why not old diagnostic | why not proof-only or evaluation-only | remaining risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rebate lifecycle workspace trajectory | tool planned/started/completed/failed; write intended/applied/verification queued/settled; verification targeted/started/wrong-target ignored/settled/passed; repair attempt/rerun/next hypothesis/context needed/settled | `core/query/runtime`, `session/harness`, `verification/execution`, `repair/flow`, pi durable harness/session docs and targeted pi harness source | Structured port of durable append-only state and restore-boundary reduction; isolated helper adoption only for local lifecycle classifiers | `packages/ts-shell/src/core/query/runtime/harness.ts`, `packages/ts-shell/src/core/query/runtime/loop.ts`, `packages/ts-shell/src/session/harness/state.ts`, `packages/ts-shell/src/verification/execution/model.ts`, `packages/ts-shell/src/repair/flow/strategy.ts` | `QueryEngine.streamMessage` -> runtime decision -> `executeRuntimeBatch` disposable workspace read/repair/verify | `QueryRuntimeHarnessState.trajectory`, save points, session harness codec | `node test/rebate.mjs` fails before and after bad repair; `node --version` passes wrong target; targeted `node test/rebate.mjs` passes | Failed repair records next hypothesis and context need; wrong-target green stays open; targeted rerun settles verification and write verification | New rebate files/task are not SP044-SP064 reused tasks | Completion depends on evidence/result verdict after command-backed targeted verification, not trajectory entries alone | Local deterministic provider-shaped harness, not live provider behavior |
| receipt artifact compact trajectory | artifact requested/written/verification missing/pending/completed; tool planned/started/completed; write intended/applied/verification queued/settled; verification targeted/started/settled/passed | `core/query/runtime`, `artifacts/workflow`, `session/harness`, compact carry-forward | Structured port of compact restore reducing durable harness state; owner helper projects artifact lifecycle | `packages/ts-shell/src/core/query/runtime/harness.ts`, `packages/ts-shell/src/session/harness/state.ts`, `packages/ts-shell/src/artifacts/workflow/model.ts` | `QueryEngine.streamMessage` with compact-restored harness -> artifact/read/artifact/verify through execution seam | `decodeCompactSessionHarnessState` from compact continuity `harnessState` | `node test/receipt.mjs` fails before source completion and passes after targeted verification | Marker-only artifact remains pending, source read drives artifact rewrite, changed source queues targeted verification, final command completes proof | New receipt files/task are not SP044-SP064 artifact-source helper reuse | Artifact existence and marker proof remain non-terminal until source and verification evidence exist | Claim IDs are local deterministic evidence ids |
| allowance repair regression trajectory | tool planned/started/completed/failed; write applied/verification queued/settled; verification wrong-target ignored/settled; repair next hypothesis/context needed/settled | `core/query/runtime`, `repair/flow`, `verification/execution` | Structured port retained from SP064 as regression only | same runtime owners as above | Normal `QueryEngine` path plus disposable workspace execution seam | Harness pending repair and trajectory state | `node test/allowance.mjs`, `node --version`, targeted rerun | Confirms SP065 loop fallback does not regress SP064 primary behavior | Regression only; not counted as primary SP065 evidence | Verifies anti-false-success boundary still rejects wrong target | Still deterministic |

## Required diagnostics

| diagnostic | required behavior proven | evidence |
| --- | --- | --- |
| `records append-only verification trajectory when a failed tool result is followed by success` | failed tool result remains ordered before later success; verification failed/settled entries append | `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts` |
| `preserves ordered ledger entries when a batch has a partial failure before success` | ledger order survives partial failure before success | `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts` |
| `restored append-only trajectory drives targeted verification without completing alone` | restored trajectory drives normal verify action; trajectory alone is not terminal proof | `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts` |
| `serializes and restores append-only verification trajectory entries` | session codec preserves trajectory order and rejects invalid target/order | `packages/ts-shell/src/session/harness/state.test.ts` |
| `executes rebate lifecycle workspace path through bad repair, ignored generic green, and targeted pass` | primary workspace lifecycle coverage including bad repair, next hypothesis, wrong-target ignored, targeted pass | `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts` |
| `executes receipt artifact workspace path through compact restore, incomplete proof, source completion, and targeted verification` | artifact pending/completed lifecycle and compact restore | `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts` |
| `classifies wrong-target command coverage without settling targeted verification` | verification owner rejects generic green for target settlement | `packages/ts-shell/src/verification/execution/model.test.ts` |
| `projects failed repair strategy into lifecycle facts` | repair owner exposes hypothesis/context lifecycle facts | `packages/ts-shell/src/repair/flow/strategy.test.ts` |
| `projects artifact lifecycle as pending until source and verification proof exist` | artifact owner keeps incomplete artifact pending until source and verification proof | `packages/ts-shell/src/artifacts/workflow/model.test.ts` |

## Combined coverage

- Primary workspace trajectories executed by current focused diagnostics: rebate and receipt.
- Each primary trajectory has at least six lifecycle phases.
- Real failing command output: rebate and receipt run failing `node` commands in disposable workspaces.
- Actual writes: rebate repairs source twice; receipt writes the source during artifact completion.
- Bad repair, failed rerun, next hypothesis, targeted pass: rebate.
- Wrong-target generic verification ignored before targeted rerun: rebate.
- Replay or compact restore: receipt compact restore; restored trajectory verification diagnostic covers trajectory-only restore.
- Incomplete trajectories remain `stopped_not_proven` in the restored-trajectory-alone and ledger-only diagnostics.
- Manual correction count: zero; all writes use the execution seam in disposable workspaces.

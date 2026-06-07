# Multi Hypothesis Debug Loop

Route: `docs/sprint/route/sp066-multi-hypothesis-debug-loop.md`

This document records the primary disposable workspace diagnostics for the
normal runtime debug loop. These are primary SP066 diagnostics, not reused
SP044-SP065 cases.

## Disposable Workspace Tasks

| Task | Initial failing command | Source discovery | Repair writes | Hypothesis outcome | Verification | Status |
|---|---|---|---|---|---|---|
| rate source value | `node test/rate.mjs` fails with `rate mismatch expected 4 received 2` | `src/rate.mjs` source fact recorded | 2 writes to `src/rate.mjs` | first repair rejected after rerun, second hypothesis succeeds | targeted `node test/rate.mjs` covers `src/rate.mjs` | completed |
| message formatter multi-file | `node test/message.mjs` fails with `message mismatch expected hello-v2 received HELLO` | `src/message.mjs` and `src/format.mjs` facts recorded | 2 repair rounds; second writes both files | first repair rejected, second hypothesis succeeds | targeted `node test/message.mjs` covers both changed files | completed |
| restored replay value | restored pending hypothesis repairs `src/replay.mjs` | source fact restored through session harness codec | 1 write to `src/replay.mjs` | restored hypothesis continues after replay boundary | targeted `node test/replay.mjs` covers `src/replay.mjs` | completed |
| insufficient source facts | `node test/missing.mjs` fails with `missing-source expected 9 received 1` | read executes but records no source fact | 0 repair writes | source need remains unsatisfied | no generic green accepted | stopped_not_proven |

Coverage summary:

- Executed tasks: 4.
- Tasks starting with real failing command output: 3 primary failure-start tasks plus 1 restored pending task.
- Tasks with actual repair writes: 3.
- Tasks succeeding after second hypothesis: 2.
- Tasks requiring source discovery: 2.
- Multi-file repair tasks: 1.
- Replay or compact restore tasks: 1.
- Insufficient-source stopped_not_proven tasks: 1.
- Manual correction count: 0.

## Diagnostic Coverage

| Diagnostic | Evidence |
|---|---|
| Failure output creates first hypothesis | `debugLoop.test.ts` rate and message tasks start from real `node test/*.mjs` command output and create `pendingRepair.hypothesisState`. |
| Missing source facts trigger discovery before repair | Rate/message action sequences include `verify -> read -> repair`; insufficient-source stops after `verify -> read`. |
| Source facts change repair plan | Repair batch item carries `repairPlan.hypothesis` and `repairPlan.sourceFacts`; rate/message assertions require recorded fact ids. |
| Failed rerun rejects hypothesis and creates distinct next hypothesis | Rate/message diagnostics require two repair writes and distinct repair-plan hypothesis summaries after failed rerun. |
| Repeated same repair is blocked unless new facts justify it | Insufficient-source diagnostic records no facts, performs no repair write, and returns `stopped_not_proven`. |
| Targeted rerun settles changed target after repair | Rate/message/replay tasks use targeted command coverage for changed files; generic success is not used. |
| Replay or compact restores active hypothesis and next action | Restored replay task encodes/decodes session harness state, then continues with repair and targeted verify. |
| Incomplete debug chain remains stopped_not_proven | Insufficient-source task returns `stopped_not_proven` after real failure output and source discovery without facts. |

## Coverage Table

| Task or diagnostic | Failure output | Hypothesis chain | Source facts | Repair plan | Product files changed | Normal runtime path | Command output | Targeted verification proof | Why not old diagnostic | Why not proof-only or evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| rate source value | real `node test/rate.mjs` output | first value hypothesis rejected, second distinct hypothesis | `source:rate` | repair batch references hypothesis and `source:rate` | runtime, repair, context, session, tools policy | `QueryEngine` with `executeRuntimeBatch` | real command stdout/stderr summary | covered `src/rate.mjs` | new file and task | actual workspace writes and reruns | deterministic fixture only |
| message formatter multi-file | real `node test/message.mjs` output | first single-file repair rejected, second multi-file hypothesis | `source:message`, `source:format` | repair batch references both source facts | runtime, repair, context, tools policy | `QueryEngine` with `ExecutionService` writes | real command stdout/stderr summary | covered `src/message.mjs`, `src/format.mjs` | new task | actual multi-file writes and reruns | deterministic fixture only |
| restored replay value | restored pending command failure state | restored hypothesis continues | restored `source:replay` | repair batch references restored hypothesis and fact | session, runtime, repair, context | `QueryEngine` from decoded harness seed | targeted command after repair | covered `src/replay.mjs` | new restore task | actual write and rerun after codec | codec restore, not full CLI compact |
| insufficient source facts | real `node test/missing.mjs` output | first hypothesis requires source, no next repair | none | no repair plan emitted | runtime, context, tools policy | `QueryEngine` with `executeRuntimeBatch` | real command stdout/stderr summary | none; stopped_not_proven | new task | no proof success claimed | stop reason is policy-derived |


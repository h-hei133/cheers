# Debug Loop Truth Audit

Route: `docs/sprint/route/sp067-debug-loop-truth-audit-and-hardening.md`

Verdict: COMPLETE

The SP066 multi-hypothesis debug loop is product behavior after the fixes below.
The primary proof is current TypeScript runtime code plus normal `QueryEngine`
diagnostics that use the execution seam, disposable workspace files, real
command output, actual workspace reads, real file writes, targeted reruns, and
session harness restore.

## Claim Evidence

| Claim | Verdict | Product evidence | Diagnostic evidence |
|---|---|---|---|
| Real command output creates hypothesis | COMPLETE | `core/query/runtime/harness.ts` converts failed verify results and their `diagnosticSummary` into pending repair via `classifyRepairHypothesis`. | `core/query/runtime/debugLoop.test.ts` rate/message/missing tasks run real `node test/*.mjs` commands and assert failure text drives the chain. |
| Hypothesis records confidence, target files, context need, and rejected cause | COMPLETE | `repair/flow/hypothesis.ts` defines `RepairHypothesisState` with confidence, targets, context need, source fact ids, and rejected cause. | `repair/flow/hypothesis.test.ts` covers classification and rejection; `debugLoop.test.ts` exercises the state through runtime. |
| Source facts are collected from actual source reads | COMPLETE | `context/acquisition/code/source.ts` normalizes read/search result source facts; `harness.ts` records them into runtime state and trajectory. | `debugLoop.test.ts` now reads disposable workspace files through `ExecutionService.readTextFile` before emitting facts. |
| Source facts change repair plan | COMPLETE | `core/query/runtime/policy.ts` rebuilds the repair hypothesis with matching `sourceFacts` when facts arrive after the first hypothesis. | Rate/message diagnostics assert repair plans contain recorded fact ids and fact-backed hypothesis summaries. |
| Repair plan references hypothesis and facts before writing | COMPLETE | `core/query/runtime/batch.ts` attaches `repairPlan` to repair batch items before execution. | Rate/message/replay diagnostics inspect `item.repairPlan` before writing files. |
| Failed rerun rejects current hypothesis | COMPLETE | `harness.ts` calls `rejectRepairHypothesis` when a verify rerun fails against active repair targets. | Rate diagnostic asserts `repair:hypothesis-rejected` appears after the failed rerun. |
| Failed rerun creates a distinct next hypothesis | COMPLETE | `repair/flow/hypothesis.ts` derives a distinct summary when rejected summaries would repeat. | Rate/message diagnostics require two repair writes and distinct repair-plan hypothesis summaries. |
| Repeated same repair is blocked unless new source facts justify it | COMPLETE | `policy.ts` changes repair to `stop-not-proven` when a repair plan references source fact ids that are missing from restored source facts. | `debugLoop.test.ts` restored-repeat diagnostic asserts no repair batch runs and proof gap includes missing source facts. |
| Replay or compact restores active hypothesis and next action | COMPLETE | `session/harness/state.ts` encodes/decodes pending repair hypothesis state and source facts. | `debugLoop.test.ts` restored replay diagnostic decodes a harness state and continues into repair then targeted verify. |
| Insufficient source facts remain `stopped_not_proven` | COMPLETE | `harness.ts` returns pending action `stop-not-proven` after read/search attempts leave context need without source facts; `tools/policy/strategy.ts` honors that pending action. | `debugLoop.test.ts` insufficient-source diagnostic runs verify, then read with `sourceFacts: []`, performs no repair writes, and returns `stopped_not_proven`. |
| Evidence/result remains terminal truth | COMPLETE | `policy.ts` and `batch.ts` keep `terminalSuccessClaim: false`; `harness.ts` queues verification after repair instead of settling from repair status alone; result/evidence owners still reduce final proof. | Result contract and anti-false-success gates cover terminal truth; debug diagnostics require targeted verification for completed tasks and not-proven status for incomplete chains. |

## Product Files Inspected

- `packages/ts-shell/src/repair/flow/hypothesis.ts`
- `packages/ts-shell/src/context/acquisition/code/source.ts`
- `packages/ts-shell/src/core/query/runtime/harness.ts`
- `packages/ts-shell/src/core/query/runtime/policy.ts`
- `packages/ts-shell/src/core/query/runtime/batch.ts`
- `packages/ts-shell/src/session/harness/state.ts`
- `packages/ts-shell/src/tools/policy/strategy.ts`
- `packages/ts-shell/src/evidence/task/proof.ts`
- `packages/ts-shell/src/result/task/verdict.ts`

## Diagnostics Inspected

- `packages/ts-shell/src/core/query/runtime/debugLoop.test.ts`
- `packages/ts-shell/src/repair/flow/hypothesis.test.ts`
- `packages/ts-shell/src/context/acquisition/code/source.test.ts`
- `packages/ts-shell/src/session/harness/state.test.ts`
- `packages/ts-shell/src/core/query/runtime/engine.test.ts`
- `packages/ts-shell/src/core/query/runtime/harnessSpine.test.ts`
- `packages/ts-shell/src/core/query/runtime/workspaceRepairVerification.test.ts`
- `packages/ts-shell/src/result/task/verdict.test.ts`
- `packages/ts-shell/src/evidence/task/proof.test.ts`

## Missing Or Weak Claims

Two weak points were found during the audit:

- The SP066 primary diagnostics accepted source facts in read results, but did
  not prove those facts came from actual workspace reads.
- `repairPlan.blockedRepeat` was computed but not enforced, so a restored repair
  could still write when the referenced source facts were absent.

Both weaknesses were fixed.

## Fixes Made

- Updated `debugLoop.test.ts` so source-fact diagnostics read disposable
  workspace files through `ExecutionService.readTextFile` before returning
  source facts.
- Updated `policy.ts` so a repair plan with missing referenced source facts
  resolves to `stop-not-proven` and records `repair source facts missing`.
- Added a restored-repeat diagnostic that verifies no repair write occurs when
  the active hypothesis references missing source facts.

## Remaining Risk

- The diagnostics are deterministic disposable workspace tasks, not live-provider
  tasks. Live provider execution remains optional for this route.
- Compact restore is covered through the session harness codec and existing
  regression band; the primary SP067 hardening did not add a new full CLI compact
  scenario.

## Next Gauntlet

The project may proceed to the next gauntlet after the SP067 hard gates pass:
focused changed-owner tests, SP044-SP066 regression band, build, result-contract
gate, anti-false-success gate, and diff checks.

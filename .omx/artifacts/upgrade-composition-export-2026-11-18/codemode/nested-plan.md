# Nested tool execution and publication proposal

Date: 2026-11-17. Ownership: only `packages/ts-shell/src/turn/nestedTools.test.ts` and this note. No production, shared documentation, handoff, build, test, npm, gate, provider or NormProof operation was executed by this agent.

## Current contracts inspected

- `turn/nestedTools.ts` awaits preparation and the before hook without rechecking its captured signal, then directly executes the host. It takes three call arguments and drops `AgentToolResult.images`, post metadata and termination. A post `isError:false` overwrites actual execution failure; a rejected post hook escapes instead of retaining completed-effect facts.
- `turn/tools.ts` adapts tools for the actual permission/preparation/hook pipeline. The nested host already delegates execution to the same `executeTool`; nested after hooks do call ordinary `resultAdmission`, but their returned approval metadata is discarded by `nestedTools.ts`.
- `turn/session.ts` owns the forced sequential set (`bash`, `write`, `edit`, `apply_patch`, `task`, `team`, `browser`) and adds execution mode after adaptation. Nested calls never consume this set.
- `core/agent/tools.ts` defines the existing `AgentToolResult` media/metadata/termination shape and `applyAfterToolCall` rules: failure is monotone, metadata is shallow-merged, append preserves media and extends the original notice, replacement removes media and old notice, and hook exceptions keep completed facts plus a failure warning.
- `tools/types.ts` supplies `ToolExecutionContext.executeNestedTool` with three parameters and `ToolExecutionResult` without termination.

## Proposed narrow port and owner changes

1. Add optional child `AbortSignal` as the fourth `executeNestedTool` parameter. Combine it with the parent only for the admitted nested call; child cancellation must not abort the parent or a successor. Check cancellation before preparation, after preparation, after the before hook, and immediately before dispatch. Dispose listeners on every exit. The worker lifetime owner remains responsible for cancelling and joining its own admitted nested calls on script settlement.
2. Make `GatedToolExecutorHost.execute` return the existing `AgentToolResult`, including `images`, `metadata` and `terminate`; do not create another result family. Use the ordinary post-result merge semantics, retain completed-effect evidence if a post hook throws or final `resultAdmission` refuses publication, and keep actual execution failure monotone. Add optional `terminate` to the existing `ToolExecutionResult` only if needed to carry the same control through the nested runner.
3. Extract the existing forced sequential decision into one owner consumed by both outer `adaptTools` and nested dispatch; remove the old duplicate decision in `session.ts`. Calls requiring preparation retain sequential treatment. Serialize admitted sequential effects under the owning run, while unrelated read-only calls remain concurrent. Do not add a second codemode name list or parallel permission engine.
4. Do not add nested intermediate tool messages to session history. The codemode result continues to publish only selected final output with truthful bounded nested metadata/media; actual final-history, worker cancellation, early media bounds and callback settlement are Root-owned tests outside this file.

## New tests and expected baseline results

Root-owned first command from the package: `vitest run src/turn/nestedTools.test.ts --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=<isolated-receipt>`. Follow repository RTK, heap, Git isolation and serial mutual exclusion rules. This agent did not execute it.

The test file declares 17 cases:

| Cases | Current-source prediction | Observable contract |
| --- | --- | --- |
| Parent cancellation during preparation / before hook, and pre-cancelled parent (3) | Assertion failures: host execution/preparation still runs. | No effect dispatch after cancellation; before hooks are skipped when preparation loses authority. |
| Child cancellation during preparation / before hook (2) | Assertion failures: proposed fourth signal is ignored and effect dispatch still runs. | Captured child signal is aborted, parent remains live, no effect executes. |
| Adapted outer execution modes (1) | Assertion failure: forced tool modes are absent before the session-only map. | The same decision reaches outer and nested consumers. |
| Two concurrent nested bash calls (1) | Assertion failure: both actual adapted host effects enter before the first releases. | Exactly one active sequential effect. |
| Two concurrent nested reads (1) | Expected passing control. | Both read calls enter before release; concurrency is preserved. |
| Actual permission/post-hook pipeline accepted / revoked (2) | Assertion failures: returned ordinary approval metadata is dropped. | Exact PermissionRequest/PreToolUse/PostToolUse events; approval and execution receipt retained; post feedback and resultAdmission refusal visible. |
| Actual execution failure plus post isError:false (1) | Assertion failure: result is upgraded to success. | Failure stays failure even with safe replacement text. |
| Appended hook feedback with media and metadata (1) | Assertion failure: post context excludes images and final result drops them/metadata. | Images reach the post owner and final result; metadata and outputNotice follow core merge semantics. |
| Replaced output (1) | Assertion failure: old metadata notice remains and hook metadata is dropped. | Replacement removes old images and notices while preserving unrelated receipt metadata. |
| Execution/post termination (2) | Assertion failures: nested output omits terminate. | Existing stop control survives the nested port. |
| Final resultAdmission revocation after deferred post hook (1) | Assertion failure: direct nested host accepts a retired result. | Completed evidence remains visible and publication is unsuccessful. |
| Rejected post hook after completed observation (1) | Assertion failure: rejection discards the result instead of returning retained facts. | Observed output/metadata/media survive with failed verification. |

The three-argument function remains assignable to the test's local optional-fourth-argument call type, so the initial failure is behavioral rather than a missing import or forced new API. Controlled fake tool definitions go through actual `adaptTools` where the ordinary gate matters. The direct executor cases are narrow owner contracts, not evidence of completed native/worker/history acceptance.

Predictions are not validation claims. Root must classify actual failures, preserve the red receipts, and only then modify production. If a fixture fails before its asserted stage, correct the fixture separately instead of treating it as a demonstrated product failure.

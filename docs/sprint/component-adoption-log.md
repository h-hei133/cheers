# Component Adoption Log

This log records controlled component or behavior adoption decisions for sprint
capability work. Product behavior still has to be proven by current code and
focused validation.

## Read-Only Tool Scheduling Result Collection

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/tools/` with policy facts under
  `tools/policy/` and scheduling facts under `tools/scheduling/`.
- Reason for use: read-only parallel tool execution needs a mature async
  result-collection behavior that waits for all independent work and preserves
  caller-facing order even when completion order differs.
- Behavior aligned: the runtime uses `Promise.allSettled`-style collection for
  eligible read-only parallel groups, then projects result details and tool
  result messages in the original tool-call order.
- Public reference:
  `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled`
  documents `Promise.allSettled` as returning settlement objects in input order
  regardless of completion order.
- Rejected alternatives:
  - Dependency use: rejected because scheduling policy, tool effects, redaction,
    replay, and truth boundaries are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed and
    external naming/provenance should not enter product code.
  - Direct broad scheduler port: rejected because mutation concurrency,
    external tool servers, dynamic loading, and browser automation are out of
    scope.
- Expected callers: tool batch dispatch, runtime loop, host evaluation, runtime
  events, replay, product surface, and CLI/session status.
- Side-effect boundary: tool execution still enters only through the sanctioned
  tool dispatch seam and the existing execution service boundary below tool
  owners. This adoption does not add command allowlist entries, arbitrary
  writers, external tool servers, live provider behavior, or browser automation.
- Truthfulness boundary: scheduling, policy allow, dispatch, group completion,
  tool result messages, next-turn preparation, events, replay, product surface,
  CLI/session status, and host evaluation remain `terminalSuccessClaim: false`.
  Evidence/result remains the only complete-proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- toolBatchDispatch.test.ts`
  - `rtk npm run test -w packages/ts-shell -- providerBoundary.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/api/host/runtime.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/loop/truthMatrix.test.ts runtime/loop/finalization.test.ts runtime/loop/completionPacket.test.ts runtime/events/stream.test.ts evidence/projection/repair/verdict.test.ts result/projection/repair/verdict.test.ts`
- Rollback plan: disable `parallel` scheduling back to metadata-only or
  sequential dispatch in `tools/toolBatchDispatch.ts` while preserving the
  report-safe scheduling facts for diagnosis.

## Multi-Target Mutation Settlement Ordering

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/edit/multifile/` with proof and verdict
  facts under `evidence/projection/mutation/` and
  `result/projection/mutation/`.
- Reason for use: controlled multi-target mutation needs deterministic ordered
  settlement that preserves every target outcome, including partial failure and
  rollback facts, while keeping caller-facing evidence stable.
- Behavior aligned: the runtime records an ordered target queue, executes
  mutation targets sequentially, preserves applied and failed target facts,
  records rollback observations after partial failure, and projects the
  evidence/result verdict from the settled facts instead of treating apply or
  rollback as success.
- Rejected alternatives:
  - Dependency use: rejected because mutation authority, stale-read, restore
    planning, verification, redaction, and truth boundaries are local product
    semantics.
  - Isolated source adoption: rejected because no external source copy is needed
    and product code must stay domain-named.
  - Broad parallel mutation: rejected because SP011 does not prove concurrent
    mutation safety for conflict, authority, snapshot, ordering, and rollback.
- Expected callers: runtime loop, runtime events, host evaluation, replay,
  product surface, CLI/session status, and host evidence/result projection.
- Side-effect boundary: file reads and writes enter only through sanctioned
  `ExecutionService` file methods. This adoption does not add live provider
  behavior, command allowlist entries, browser automation, external tool
  servers, dynamic loading, arbitrary writers, or uncontrolled parallel
  mutation.
- Truthfulness boundary: plan creation, classification, conflict pass,
  authority, stale-read, snapshot, queue readiness, target apply, rollback,
  verification observations, repair eligibility, events, host evaluation,
  replay, product surface, and CLI/session status remain
  `terminalSuccessClaim: false`. Evidence/result remains the only complete
  proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/api/host/runtime.test.ts`
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run build -w packages/ts-shell`
- Rollback plan: remove the optional `mutationRuntimeBoundary` connection and
  keep the existing single-target mutation recovery lane while preserving
  report-safe blocked/not-proven facts for multi-target attempts.

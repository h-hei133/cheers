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

## Bounded Mutation Group Settlement

- Selected mode: behavior-only alignment.
- Owner domain: `packages/ts-shell/src/edit/multifile/` with proof facts under
  `evidence/projection/mutation/`, result verdicts under
  `result/projection/mutation/`, and consumer projections under runtime,
  replay, and presentation owners.
- Reason for use: bounded multi-target mutation needs async group collection
  for independent targets while preserving deterministic target-order
  settlement, explicit blockers, rollback facts, and evidence/result-owned
  terminal truth.
- Behavior aligned: eligible independent targets enter capped groups, group
  attempts settle after all member attempts finish, settlement facts are emitted
  in original target order, later groups skip after a prior group failure, and
  rollback observations preserve the original failure instead of becoming task
  success.
- Rejected alternatives:
  - Dependency use: rejected because mutation authority, stale-read,
    snapshot/restore, rollback, redaction, and proof semantics are local product
    responsibilities.
  - Isolated source adoption: rejected because no source copy is needed and
    product code must stay domain-named.
  - Uncontrolled broad parallel mutation: rejected because only independently
    eligible targets with authority, stale-read, snapshot, rollback, conflict,
    and bounded-group proof may run together.
- Expected callers: runtime loop, runtime events, host evaluation, replay,
  product surface, CLI/session status, evidence proof, and result verdict.
- Side-effect boundary: file reads and writes still enter only through
  sanctioned `ExecutionService` file methods. This adoption does not add live
  provider behavior, command allowlist entries, browser automation, external
  tool servers, dynamic loading, arbitrary writers, or execution-boundary
  bypasses.
- Truthfulness boundary: mutation graph, parallel eligibility, group creation,
  target apply, group apply, settlement, rollback, verification observations,
  repair eligibility, events, host evaluation, replay, product surface, and
  CLI/session status remain `terminalSuccessClaim: false`. Evidence/result
  remains the only complete proof owner.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts runtime/api/host/runtime.test.ts runtime/events/projection.test.ts session/replay/state.test.ts presentation/surface/model.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:route221-anti-false-success-gate`
  - `rtk npm run verify:result-contract`
- Rollback plan: disable the explicit bounded parallel input and fall back to
  one-target sequential groups while preserving graph, eligibility, settlement,
  blocked, and not-proven facts for diagnosis.

## Host JSON Framing And Package Readiness

- Selected mode: structured port.
- Owner domain: `packages/ts-shell/src/runtime/api/host/` for host JSON and
  exit classification, `packages/ts-shell/src/cli/host/` for CLI delegation,
  `packages/ts-shell/src/runtime/distribution/` for package readiness, and
  `scripts/` for repository smoke.
- Reason for use: the existing in-process host contract and deterministic
  evaluation runtime needed a package-facing non-interactive surface with
  stable JSON framing, event envelopes, exit classification, package readiness,
  default-off provider checks, redaction, and truth boundaries.
- Behavior ported: command JSON parsing delegates to host validation, host
  runtime dispatch remains the execution owner, runtime events are projected
  into host event envelopes with ordering/category/severity, exit classification
  is derived from host blockers/status/evidence/result truth, and package
  readiness checks built importability, CLI artifact availability, host command
  availability, JSON shape, default-off provider blocking, evaluation, and
  redaction without live providers.
- Rejected alternatives:
  - Dependency use: rejected because the framing, blocker taxonomy, redaction,
    replay, and evidence/result truth boundaries are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed and no
    license/notice obligations should enter product code for this surface.
  - Broad SDK/RPC server: rejected because SP013 proves a package/CLI host API
    surface, not server behavior, dynamic loading, external tool servers, or
    default live-provider execution.
- Expected callers: package consumers, repository smoke scripts, future narrow
  host adapters, runtime evaluation, session replay/status, and evidence/result
  truth tests.
- Side-effect boundary: host execution remains inside `createHostRuntime` and
  existing provider/tool/edit/session owners. The smoke script imports the built
  package and does not spawn live providers, load dynamic packages, launch
  browser automation, expand command allowlists, or bypass `ExecutionService`.
- Truthfulness boundary: command accepted, JSON emitted, CLI exit zero, event
  envelope, status snapshot, final response, package smoke, distribution
  readiness, provider facts, tool facts, mutation facts, evaluation cases,
  replay facts, and terminal rendering remain `terminalSuccessClaim: false`.
  Evidence/result remains the only complete-proof owner, and missing proof stays
  not-proven.
- Validation evidence:
  - `rtk npm run test -w packages/ts-shell -- result/host/verdict.test.ts runtime/api/host/runtime.test.ts runtime/api/host/io.test.ts cli/host/runner.test.ts runtime/distribution/model.test.ts smoke.test.ts entrypoints/cliArgs.test.ts`
  - `rtk npm run test -w packages/ts-shell -- runtime/events/projection.test.ts runtime/events/stream.test.ts session/replay/state.test.ts session/presentation/envelope.test.ts core/shell/cliSessionProductSurface.test.ts provider/response/synthetic.test.ts runtime/loop/providerBoundary.test.ts tools/toolBatchDispatch.test.ts edit/multifile/model.test.ts runtime/loop/mutationRuntime.test.ts evidence/projection/repair/verdict.test.ts result/projection/repair/verdict.test.ts`
  - `rtk npm run build -w packages/ts-shell`
  - `rtk npm run verify:host-surface`
  - `rtk npm run verify:route221-anti-false-success-gate`
  - `rtk npm run verify:result-contract`
- Rollback plan: remove the `--host-command` CLI option and package readiness
  script while keeping the in-process host runtime and deterministic evaluation
  contract intact; package consumers would fall back to direct owner tests until
  a corrected host surface is restored.

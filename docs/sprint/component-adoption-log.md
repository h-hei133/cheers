# Component Adoption Log

This log records controlled component or behavior adoption decisions for sprint
capability work. Product behavior still has to be proven by current code and
focused validation.

## Task Bench And Host Automation Workflow

- Selected mode: structured port.
- Owner domain: future implementation should stay under `runtime/evaluation`,
  `runtime/api/host`, `evidence`, `result`, `verification`, `provider`, and
  artifact owners when created.
- Reason for use: the project needs evaluation cases that measure real task
  completion, not only trusted runtime fact projection.
- Behavior to port: structured task scenarios, host-driven execution, event and
  status inspection without terminal scraping, task-specific rubrics, redaction
  checks, and explicit complete/partial/blocked/failed/skipped/not-proven
  classifications.
- Rejected alternatives:
  - Dependency use: rejected because task success, redaction, provider gating,
    and evidence/result verdicts are local product semantics.
  - Isolated source adoption: rejected because no source copy is needed for the
    planning shape and external naming should not enter product code.
  - Live-provider-first bench: rejected because live behavior must remain
    explicit opt-in and default-off.
- Expected callers: host runtime, task evaluation, provider triage, artifact
  workflow checks, session replay/status, product surface, and future automation
  adapters.
- Side-effect boundary: task-bench execution must use existing host/runtime
  owners and sanctioned execution boundaries. It must not add live-provider
  defaults, browser automation, external tool servers, command allowlist
  expansion, dynamic loading, arbitrary writers, or terminal scraping.
- Truthfulness boundary: scenario accepted, provider called, tool executed,
  artifact created, event emitted, JSON emitted, and CLI exit zero are not task
  success. Evidence/result verdicts with task-relevant verification remain the
  only complete-proof owners.
- Validation evidence: future routes must add deterministic task fixtures first
  and may add live-provider triage only through explicit opt-in gates with clean
  homes, redaction, and failure attribution.
- Rollback plan: disable new task-bench scenarios while keeping existing host
  runtime and deterministic evaluation lanes intact.

## Task Collaboration And Planning Policy

- Selected mode: behavior-only alignment.
- Owner domain: future implementation should stay under `planning`,
  `tools/policy`, `turn`, `session/continuation`, `presentation`, and
  `runtime/events`.
- Reason for use: reliable task completion needs goal facts, ambiguity handling,
  user-question states, assumption tracking, plan revision, and tool policy to
  operate together.
- Behavior to align: mature interactive agents separate accepted input,
  steering/follow-up queues, active tools, command context, progress events, and
  session state from the low-level model loop.
- Rejected alternatives:
  - Dependency use: rejected because collaboration policy and authority states
    are local product semantics.
  - Isolated source adoption: rejected because queue and interaction behavior
    should be domain-modeled locally and source copying would risk importing
    unsuitable names and UX assumptions.
  - Terminal-prose policy: rejected because terminal rendering cannot own
    task-state or success semantics.
- Expected callers: planning runtime, CLI, host status, session continuation,
  tool policy, provider request preparation, and product presentation.
- Side-effect boundary: collaboration decisions must not imply write authority,
  provider invocation, tool execution, or verification execution. Side effects
  still require the sanctioned owners and `ExecutionService`.
- Truthfulness boundary: a plan, assumption, question, user reply, tool choice,
  or handoff is not task success. Missing or risky ambiguity must stay blocked
  or pending until resolved.
- Validation evidence: future routes should test ambiguous targets, unclear
  success criteria, denied authority, changed instructions, risky assumptions,
  and plan revision after failure.
- Rollback plan: remove collaboration policy consumers and fall back to existing
  planning facts and status blockers without changing runtime truth owners.

## Artifact Workflow Receipts

- Selected mode: structured port.
- Owner domain: future implementation should create a real artifact owner
  instead of placing document/report/data behavior in generic runtime,
  product, helper, or orchestration files.
- Reason for use: non-code task completion needs durable deliverables with
  source receipts, format checks, and task-specific validation.
- Behavior to port: artifact intent, source receipt policy, output path facts,
  format/render or parse validation, session/host summaries, and evidence/result
  verdict inputs for documents, reports, data outputs, slides, and exports.
- Rejected alternatives:
  - Dependency use: rejected because source policy, redaction, artifact paths,
    and success verdicts are local product semantics.
  - Isolated source adoption: rejected until a self-contained artifact component
    and license/notice path are identified.
  - Reusing edit/mutation as the artifact owner: rejected because artifact
    tasks need source and format semantics beyond code edits.
- Expected callers: planning, context acquisition, verification, session store,
  host runtime, product presentation, and future artifact-specific commands.
- Side-effect boundary: artifact writes must use sanctioned execution or an
  explicitly scoped artifact owner. This adoption does not add arbitrary
  writers, browser automation, external tool servers, or dynamic package
  loading.
- Truthfulness boundary: artifact path created, file exists, export emitted, or
  source read is not completion. Task-relevant artifact validation must feed
  evidence/result before success.
- Validation evidence: future routes should cover markdown report, structured
  data output, slide/report artifact, invalid format, source omission, unsafe
  output path, and parsed or rendered validation.
- Rollback plan: keep artifact requests blocked/not-proven and preserve existing
  code-focused mutation/verification lanes.

## Provider Prompt And Response Contract

- Selected mode: structured port.
- Owner domain: `provider/request`, `provider/response`, `planning`,
  `context/acquisition`, `tools`, `verification`, `evidence`, and `result`.
- Reason for use: provider output must be shaped toward task completion and
  classified when insufficient, without making provider completion success.
- Behavior to port: task-shaped request packets, response contracts, structured
  proposal parsing, insufficient-output classification, fallback facts, and
  report-safe redaction.
- Rejected alternatives:
  - Dependency use: rejected because request shaping, provider gating, redaction,
    and truth boundaries are local product semantics.
  - Isolated source adoption: rejected because provider prompt behavior is not a
    self-contained source component and must avoid external naming.
  - Broad provider hooks: rejected until secret/auth boundaries and concrete
    consumers are explicitly scoped.
- Expected callers: provider request boundary, provider response adapter,
  planning runtime, tool handoff, verification intent, task bench, and host
  evaluation.
- Side-effect boundary: real providers remain default-off and explicit opt-in.
  No manual provider secret reads, no default live execution, no broad auth
  refresh, and no raw provider output in replay/status.
- Truthfulness boundary: provider request prepared, provider stream projected,
  fallback completed, response parsed, or proposal generated is not task
  success. Only evidence/result can prove completion after task-relevant
  checks.
- Validation evidence: future routes should test missing context, malformed
  response, insufficient output, tool-call response, fallback, provider failure,
  redaction, and opt-in live triage.
- Rollback plan: keep existing provider boundary and response adapter behavior;
  block task-shaped provider requests as unsupported if the contract regresses.

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

# Project Gap And Priority Plan

This plan now prioritizes trusted task completion over further trusted-runtime
surface expansion. The runtime must stay conservative on secrets, execution,
provider behavior, mutation, and truthfulness, but the next useful product
milestone is completing real tasks with evidence, not merely reporting safe
facts. A batch is complete only when task-relevant behavior is proven by owner
tests, focused integration evidence, task-bench results, or explicitly gated
live evidence. Adding one field, one surface section, one helper, or one more
deterministic runtime case is not enough.

## Major Gaps

- The main gap is no longer a single missing runtime projection. It is that
  trusted runtime capability is ahead of task completion capability. The product
  can preserve many distinctions, but cannot yet prove broad real task delivery
  across coding, debugging, documents, reports, data analysis, slides, and other
  artifact workflows.
- Real task bench coverage is missing. Current deterministic host evaluation
  proves bounded runtime lanes and truth boundaries; it does not prove that an
  agent can take underspecified user goals through discovery, planning,
  execution, debugging, verification, artifact delivery, and final proof.
- Workspace intelligence and planning are partially proven through owner tests
  for bounded discovery, staged acquisition, graph/test-impact facts,
  continuation memory, analysis, plan facts, edit target selection, and
  verification intent. They remain insufficient as broad proof of target
  correctness, context completeness, or task success.
- User collaboration and ambiguity handling are narrow. The product needs
  explicit goal facts, question/assumption/block decisions, plan revision after
  user input, and continuation of the task state, not just prompt or session
  continuity.
- Artifact workflows are missing as first-class owners. Non-code task delivery
  needs artifact intent, source receipts, durable outputs, format/render checks,
  and evidence/result verdicts.
- Provider prompting and live task recovery are weak. The provider boundary is
  default-off and truth-preserving, but task-shaped prompting, response
  insufficiency handling, live debug repair, and live-provider task triage are
  not broadly proven.
- Product loop truth, the CLI/session status envelope, a bounded synthetic
  provider-to-tool-to-next-turn runtime lane, a controlled provider/model
  runtime boundary, a controlled mutation recovery lane, and a storage-backed
  branch/compaction runtime lane are consolidated. The in-process host command
  contract, deterministic evaluation runtime, non-interactive host/package JSON
  surface, package readiness checks, and controlled provider
  compatibility/evaluation hardening, controlled read-only parallel tool
  runtime, and bounded parallel multi-target mutation runtime are now proven for
  local synthetic and injected lanes, while live provider defaults, broad auth
  refresh, SDK/RPC servers, uncontrolled broad parallel mutation, broad
  interactive branch navigation UX, and dynamic execution areas remain
  unproven.
- CLI/session UX now has a structured status envelope for product-loop truth and
  branch/compaction runtime facts, but full queue ergonomics, broad interactive
  branch navigation, compact/resume controls, and broader session management
  remain narrower than the runtime fact model.
- JSON event projection, a stable in-process host command contract, a
  non-interactive host JSON output surface, exit classification, and package
  readiness smoke exist, but no broad SDK/RPC host server exists.
- Session branch and compaction support is storage-backed for controlled
  runtime facts that drive context rebuild, continuation readiness, provider
  request preparation, events, replay, product surface, and CLI/session status.
  Broad interactive navigation commands and SDK/RPC host contracts remain
  unproven.
- Provider/model compatibility matrix facts, config/auth readiness, invocation
  gating, response normalization, failure taxonomy, fallback
  decision/attempt/failure facts, replay, surface, CLI/session status, and host
  evaluation outcomes are proven for controlled synthetic and injected lanes.
  Live execution remains explicit opt-in and default-off.
- Extension/package support is governance-only; dynamic execution is absent by
  design.
- Tool execution has policy/receipt/outcome boundaries. Controlled read-only
  parallel execution now connects effect and dependency classification, policy,
  scheduling, sanctioned dispatch, deterministic result ordering, partial
  failure/cancel/timeout/skipped facts, result messages, next-turn preparation,
  events, host evaluation, replay, product surface, and CLI/session status.
  Bounded mutation recovery connects policy, authority, stale-read,
  snapshot/restore planning, apply observation, verification, rollback or
  repair, post-repair verification, and result verdict. Bounded parallel
  multi-target mutation connects plan, classification, conflict detection,
  mutation graph, authority, stale-read, snapshot/restore, parallel eligibility,
  capped groups, sanctioned target apply, deterministic settlement, partial
  group failure, skipped follow-on targets, rollback, per-target/per-group/
  whole-task verification, repair eligibility, evidence/result verdict, events,
  host evaluation, replay, product surface, and CLI/session status.
  Uncontrolled broad parallel mutation remains unproven and unsupported.
- Verification/repair can prove repair-to-success through the product path for
  controlled mutation recovery; broader task-relevant verification planning
  across arbitrary tools and live-provider cases remains unproven.

## Immediate Task-Completion Batches

The detailed batch definitions are in
`docs/sprint/task-capability-gap-plan.md`. These are the next priority groups:

1. Real task bench and live-provider capability triage.
2. Workspace intelligence and context strategy.
3. Planning, tool policy, and user collaboration.
4. Live debug and repair loop.
5. Artifact workflow capability for non-code tasks.
6. Provider prompting and response shaping.
7. Product workflow and automation hardening.
8. Product-layer versus engine-boundary decision.

These batches intentionally merge capabilities that must work together for a
useful task. Do not split them into tiny routes for one field, one projection,
one status section, or one helper unless a route is explicitly scoped as a
sub-step toward one of these batch gates.

## Immediate Sprint Batches

### Completed Batch: Product Loop Truth Consolidation

- Proven result: the current loop trajectory, completion packet, runtime events,
  JSON stream, replay-safe facts, product surface, and evidence/result verdicts
  line up against one audited product-path matrix.
- User-facing value: stopped, blocked, waiting, repaired, and complete states are
  distinct in the tested product truth path.
- Owner domains: `runtime/loop`, `runtime/events`, `session/replay`,
  `presentation`, `evidence`, `result`.
- Evidence: `packages/ts-shell/src/runtime/loop/truthMatrix.test.ts` feeds
  owner tests for loop packet/finalization, events/stream, replay, surface, and
  evidence/result verdicts.
- Boundary: terminal truth still belongs to `evidence`/`result`; loop, events,
  replay, presentation, request readiness, tool outcome, proposal, authority,
  and apply-only states remain non-success consumers.

### Completed Batch: CLI Status Envelope

- Proven result: terminal/session-facing status now uses a structured envelope
  derived from product surface owner facts, not terminal prose.
- User-facing value: users can see terminal verdict, loop control, next action,
  blockers, request readiness, replay carry-forward, tool outcome, verification
  and repair state, missing proof, and not-proven claims in one coherent
  status surface.
- Owner domains: `cli`, `core/shell`, `session/presentation`, `presentation`,
  `runtime/events`.
- Evidence: `packages/ts-shell/src/session/presentation/envelope.test.ts` and
  `packages/ts-shell/src/core/shell/cliSessionProductSurface.test.ts` reuse the
  product truth matrix across complete proof, blocked request, failed tool
  outcome, missing proof, proposal-only, apply-only, post-repair failed
  verification, partial/stopped, and waiting-for-user states.
- Boundary: terminal truth still belongs to `evidence`/`result`; the CLI,
  shell, session envelope, events, replay, request readiness, tool outcome,
  proposal, authority, and apply-only states remain non-success consumers.

### Completed Batch: Synthetic Provider Tool Runtime

- Proven result: a deterministic synthetic provider response can enter the
  provider response stream, project a model boundary phase, accumulate assistant
  output, extract tool calls, dispatch allowed tools through the sanctioned seam,
  prepare tool result messages, prepare the next model request, continue to a
  next turn when explicitly enabled, and feed runtime events, replay-safe
  carry-forward, product surface, and CLI/session status from the same facts.
- User-facing value: controlled provider/tool loops can now be tested without
  live credentials while blocked request, text-only stop, tool-call continue,
  allowed tool result, malformed tool call, provider failure, tool execution
  failure, next-turn request preparation, missing proof, and complete proof
  remain distinct.
- Owner domains: `provider/response`, `provider/request`, `runtime/loop`,
  `runtime/events`, `tools`, `tools/policy`, `turn`, `session/replay`,
  `session/presentation`, `presentation`, `evidence`, `result`.
- Evidence: `packages/ts-shell/src/provider/response/synthetic.test.ts` and
  `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts`, alongside the
  focused provider, runtime, tool, turn, replay, surface, status, and truth
  owner tests.
- Boundary: live providers remain default-off and explicit opt-in only; broad
  provider compatibility, fallback execution, mutation rollback, dynamic
  execution, and terminal success from provider/tool/request facts remain
  unproven.

### Completed Batch: Controlled Mutation Recovery Runtime

- Proven result: a deterministic synthetic provider tool call can flow through
  tool policy, explicit mutation authority, final stale-read, snapshot or
  restore planning, sanctioned `ExecutionService` apply observation,
  task-relevant verification, rollback or repair decision, repair authority,
  repair apply, post-repair verification, result-owned verdict, events,
  replay-safe carry-forward, product surface, and CLI/session status.
- User-facing value: mutation denied, permission pending, stale-read blocked,
  snapshot unavailable, apply failed, apply-only missing proof, verification
  failed after apply, rollback required, rollback succeeded but not complete,
  repair proposed only, repair applied without post-repair verification,
  post-repair verification failed, and post-repair verified completion remain
  distinct.
- Owner domains: `edit/recovery`, `runtime/loop`, `runtime/events`,
  `tools/policy`, `tools`, `verification`, `repair`, `evidence`, `result`,
  `session/replay`, `session/presentation`, `presentation`, and `core/shell`.
- Evidence: `packages/ts-shell/src/edit/recovery/model.test.ts` and
  `packages/ts-shell/src/runtime/loop/mutationRecovery.test.ts`, alongside the
  focused edit, provider, tool policy/dispatch, runtime event, replay, surface,
  status, evidence, and result owner tests.
- Boundary: the proven lane is controlled and deterministic. Live providers,
  broad provider compatibility, uncontrolled broad parallel mutation, dynamic
  execution, external tool servers, and host SDK/RPC behavior remain unproven.
  Apply, rollback, repair, events, replay, surface, and CLI/session status are
  still not terminal success.

### Completed Batch: Controlled Multi-Target Mutation Runtime

- Proven result: a deterministic synthetic edit intent can flow through a
  multi-target plan, target classification, conflict detection, batch and
  target authority, per-target stale-read, per-target snapshot/restore plan,
  deterministic sequential apply queue, sanctioned `ExecutionService` apply,
  partial failure classification, rollback, per-target and whole-task
  verification, repair eligibility, evidence proof input, result-owned verdict,
  runtime events, host evaluation, replay, product surface, and CLI/session
  status.
- User-facing value: multi-file happy, same-file/overlap/path/dependency
  conflict blockers, partial failure rollback, failed verification, repair
  eligibility, post-repair proof, redaction, and non-success mutation facts are
  distinct in the tested product path.
- Owner domains: `edit/multifile`, `runtime/loop`, `runtime/events`,
  `runtime/api`, `runtime/evaluation`, `verification`, `evidence`, `result`,
  `session/replay`, `session/presentation`, `presentation`, `core/shell`, and
  host evidence/result.
- Evidence: `packages/ts-shell/src/edit/multifile/model.test.ts`,
  `packages/ts-shell/src/runtime/loop/mutationRuntime.test.ts`, and
  `packages/ts-shell/src/runtime/api/host/runtime.test.ts`, alongside focused
  event, replay, surface, status, and build validation.
- Boundary: this completed batch proves the prior deterministic sequential
  queue. Bounded parallel mutation is proven by the later batch below;
  uncontrolled broad parallel mutation remains unsupported. Plan, queue, apply,
  rollback, verification, repair eligibility, events, host evaluation, replay,
  product surface, and CLI/session status remain non-success unless
  evidence/result produce complete proof. Live providers, browser automation,
  external tool servers, dynamic loading, command allowlist expansion, and
  arbitrary writer behavior remain out of scope.

### Completed Batch: Bounded Parallel Multi-Target Mutation Runtime

- Proven result: a deterministic synthetic edit intent can flow through a
  mutation graph, target eligibility, explicit capped parallel groups,
  deterministic settlement ordering, sanctioned `ExecutionService` target
  apply, partial group failure, skipped follow-on targets, rollback with
  original failure preservation, per-target/per-group/whole-task verification,
  repair eligibility, evidence proof input, result-owned verdict, runtime
  events, host evaluation, replay, product surface, and CLI/session status.
- User-facing value: independent targets can apply in bounded parallel groups
  while same-file/overlap/path/dependency/stale/snapshot/rollback/authority/
  unsupported/unknown blockers remain explicit and non-success. Fast and slow
  target completion settles deterministically in target order.
- Owner domains: `edit/multifile`, `runtime/loop`, `runtime/events`,
  `runtime/api`, `runtime/evaluation`, `verification`, `evidence`, `result`,
  `session/replay`, `session/presentation`, `presentation`, and `core/shell`.
- Evidence: `packages/ts-shell/src/edit/multifile/model.test.ts`,
  `packages/ts-shell/src/runtime/loop/mutationRuntime.test.ts`,
  `packages/ts-shell/src/runtime/api/host/runtime.test.ts`,
  `packages/ts-shell/src/runtime/events/projection.test.ts`,
  `packages/ts-shell/src/session/replay/state.test.ts`,
  `packages/ts-shell/src/presentation/surface/model.test.ts`,
  `packages/ts-shell/src/session/presentation/envelope.test.ts`, and
  `packages/ts-shell/src/core/shell/cliSessionProductSurface.test.ts`.
- Boundary: uncontrolled or broad parallel mutation remains unsupported.
  Eligibility, group creation, target apply, group apply, settlement, rollback,
  verification, repair eligibility, host evaluation, events, replay, product
  surface, and CLI/session status remain non-success unless evidence/result
  produce complete proof. Live providers, browser automation, external tool
  servers, dynamic loading, command allowlist expansion, arbitrary writers, and
  execution-boundary bypass remain out of scope.

### Completed Batch: Provider/Model Runtime Boundary

- Proven result: provider/model selection, registry resolution, compatibility
  and auth readiness, safe request preparation, explicit invocation gating,
  controlled synthetic or injected invocation, normalized response facts,
  assistant accumulation, text and tool-call handling, failure classification,
  fallback eligibility, fallback blocking, fallback selection, attempted
  fallback response normalization, next runtime action, events, replay-safe
  carry-forward, product surface, CLI/session status, and evidence/result truth
  boundaries now share one tested lane.
- User-facing value: missing provider, missing model, unsupported mode, missing
  auth, missing opt-in, malformed stream/tool deltas, provider failures,
  cancellation, fallback eligible-not-attempted, fallback selected, fallback
  blocked, fallback completed, text-only responses, tool-call responses, and
  not-proven provider facts remain distinct.
- Owner domains: `provider/registry`, `provider/request`, `provider/response`,
  `runtime/loop`, `runtime/events`, `turn`, `tools`, `session/replay`,
  `session/presentation`, `presentation`, `core/shell`, `evidence`, and
  `result`.
- Evidence: `packages/ts-shell/src/provider/request/fallback.test.ts`,
  `packages/ts-shell/src/provider/request/attempt.test.ts`,
  `packages/ts-shell/src/provider/request/boundary.test.ts`, and
  `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts`, alongside the
  focused registry, response, runtime event, replay, surface, status, and truth
  owner tests.
- Boundary: live providers remain default-off and explicit opt-in only. The
  completed lane uses deterministic synthetic responses and injected controlled
  executors for proof. Broad real-provider compatibility, auth refresh,
  default live provider behavior, dynamic execution, external tool servers,
  and host SDK/RPC behavior remain unproven. Provider selection, request
  readiness, invocation, stream, fallback, replay, surface, and CLI/session
  status are still not terminal success.

### Completed Batch: Branch/Compaction Context Readiness

- Proven result: session state now carries durable thread facts for parent/child
  turns, active leaf, branch creation and switching, and compaction records.
  Context rebuild, continuation readiness, provider request preparation,
  runtime events, replay-safe carry-forward, product surface, and CLI/session
  status consume the same retained/excluded/stale/unsafe/missing/unsupported
  and provenance facts.
- User-facing value: resume/continue status can distinguish active branch,
  retained context, excluded context, stale or unsafe compaction, missing facts,
  unsupported facts, request blockers, and next action before any model request.
- Owner domains: `session/schema`, `session/store`, `session`,
  `session/continuation`, `session/replay`, `context`, `provider/request`,
  `runtime/loop`, `runtime/events`, `presentation`, `session/presentation`, and
  `core/shell`.
- Evidence: `packages/ts-shell/src/runtime/loop/sessionContinuity.test.ts`,
  `packages/ts-shell/src/session/store/threadState.test.ts`, and the focused
  session/context/continuation/provider/request/events/replay/surface/status
  owner suite.
- Boundary: branch creation, active leaf selection, compaction creation, context
  rebuild, continuation readiness, provider request preparation, events, replay,
  product surface, and CLI/session status remain non-success facts. Terminal
  truth still belongs to `evidence`/`result`. Raw transcript, raw provider
  output, raw command output, raw edit text, patch bodies, and secrets remain
  excluded from report-safe surfaces.

### Completed Batch: Host Contract And Deterministic Evaluation Runtime

- Proven result: a structured host command boundary now validates envelopes,
  supports start turn, continue session, status, session head listing, session
  summary inspection, stop/cancel requests, and deterministic evaluation case
  execution. The same lane carries synthetic provider/tool/mutation runtime
  facts through events, status snapshots, final host responses, replay-safe
  facts, evaluation case results, and evidence/result truth projections without
  terminal scraping.
- User-facing value: future non-interactive callers can consume typed host
  facts for happy, blocked, evaluation, and truth lanes while missing proof,
  provider blockers, tool outcomes, mutation apply, replay, status, and
  evaluation execution remain non-success.
- Owner domains: `runtime/api`, `runtime/events`, `runtime/evaluation`,
  `runtime/loop`, `session/store`, `session/replay`, `session/presentation`,
  `provider/request`, `provider/response`, `tools`, `edit`, `verification`,
  `repair`, `evidence`, and `result`.
- Evidence: `packages/ts-shell/src/runtime/api/host/runtime.test.ts` covers the
  host happy lane, blocked lane, deterministic evaluation lane, and truth lane
  across the required host/session/provider/tool/mutation/replay/redaction
  states. The focused owner suite also covers runtime events, loop lanes,
  session replay/status, provider synthetic/request, tool outcomes, edit
  recovery, and evidence/result verdicts.
- Boundary: this is an in-process host contract and deterministic evaluation
  runtime, not a broad SDK/RPC server. Live providers remain default-off;
  dynamic loading, external tool servers, browser automation, command allowlist
  expansion, arbitrary writers, uncontrolled broad parallel mutation, and
  terminal-text APIs remain out of scope.

### Completed Batch: Runtime Host API And Package Readiness Surface

- Proven result: non-interactive host input can enter through a package/CLI
  surface, validate a command envelope, select or create a session, execute the
  runtime host lane, project structured host event envelopes, status snapshot,
  final response, result summary, diagnostics, blockers, redacted details,
  replay facts, truth facts, evaluation results, and explicit exit
  classification without scraping terminal text.
- User-facing value: scripts and package consumers can use `host-json-response.v1`
  and package readiness facts for happy, blocked, evaluation, package smoke,
  and truth lanes while CLI exit zero, JSON emission, smoke, readiness, events,
  replay, provider/tool/mutation/evaluation facts, and terminal rendering remain
  non-success unless evidence/result prove completion.
- Owner domains: `cli`, `runtime/api`, `runtime/events`,
  `runtime/evaluation`, `runtime/distribution`, `session/store`,
  `session/replay`, `provider/request`, `provider/response`, `tools`, `edit`,
  `verification`, `repair`, `evidence`, `result`, `presentation`, `scripts`,
  and package metadata.
- Evidence: `packages/ts-shell/src/runtime/api/host/runtime.test.ts`,
  `packages/ts-shell/src/runtime/api/host/io.test.ts`,
  `packages/ts-shell/src/cli/host/runner.test.ts`,
  `packages/ts-shell/src/runtime/distribution/model.test.ts`,
  `packages/ts-shell/src/result/host/verdict.test.ts`,
  `packages/ts-shell/src/smoke.test.ts`, and
  `scripts/verify-host-surface.mjs`.
- Boundary: package readiness is a static/package host smoke, not package
  installation, dynamic loading, executable plugin behavior, broad SDK/RPC
  server behavior, browser automation, external tool server behavior, command
  allowlist expansion, arbitrary writers, or default live-provider behavior.
  Terminal truth still belongs only to `evidence`/`result`.

### Completed Batch: Provider Compatibility And Evaluation Hardening

- Proven result: provider registry now projects explicit compatibility matrix
  and readiness facts for provider/model pairs. Request preparation consumes
  compatibility, config readiness, auth readiness, unsupported modes, redaction,
  and opt-in facts before invocation. Controlled synthetic or injected provider
  execution remains the default validation lane; optional live behavior remains
  skipped unless an explicit external gate is selected.
- User-facing value: host evaluation can exercise compatibility happy,
  readiness blocked, fallback completed, fallback failed, redaction, skipped
  live gate, unsupported provider mode, and missing-proof lanes without terminal
  scraping or live credentials. Evaluation results can now report passed,
  failed, blocked, unsupported, skipped, and not-proven.
- Owner domains: `provider/registry`, `provider/request`,
  `provider/response`, `runtime/api`, `runtime/evaluation`, `runtime/events`,
  `runtime/loop`, `session/replay`, `session/presentation`, `presentation`,
  `core/shell`, `evidence`, and `result`.
- Evidence: `packages/ts-shell/src/provider/registry/provider.test.ts`,
  `packages/ts-shell/src/provider/request/boundary.test.ts`,
  `packages/ts-shell/src/provider/request/invocation.test.ts`,
  `packages/ts-shell/src/provider/request/attempt.test.ts`,
  `packages/ts-shell/src/provider/request/fallback.test.ts`,
  `packages/ts-shell/src/provider/response/adapter.test.ts`,
  `packages/ts-shell/src/runtime/api/host/runtime.test.ts`,
  `packages/ts-shell/src/runtime/events/projection.test.ts`,
  `packages/ts-shell/src/session/replay/state.test.ts`,
  `packages/ts-shell/src/session/presentation/envelope.test.ts`,
  `packages/ts-shell/src/presentation/surface/model.test.ts`, and the focused
  evidence/result truth tests.
- Boundary: compatibility, readiness, invocation eligibility, response
  normalization, fallback, evaluation execution, events, replay, surface, and
  CLI/session status remain provider/control facts, not task success. Terminal
  truth remains owned by `evidence`/`result`. Live provider execution is not
  required for completion and remains default-off; broad SDK/RPC servers,
  dynamic execution, browser automation, external tool servers, and broad
  parallel mutation remain unproven.

### Completed Batch: Controlled Read-Only Parallel Tool Runtime

- Proven result: controlled synthetic provider tool calls now flow through
  effect classification, dependency facts, policy, read-only parallel scheduling,
  sanctioned dispatch, deterministic result ordering, partial
  failure/cancel/timeout/skipped facts, tool result messages, next-turn
  preparation, runtime events, host evaluation, replay-safe carry-forward,
  product surface, CLI/session status, and evidence/result truth boundaries.
- User-facing value: independent read-only tools can run in parallel without
  changing model-facing result order, while ordered dependencies run
  deterministically, mutation/unknown/authority/unsupported/conflicting tools do
  not enter parallel execution, partial failures stay visible, and missing proof
  remains not-proven.
- Owner domains: `tools/policy`, `tools/scheduling`, `tools`, `turn`,
  `runtime/loop`, `runtime/events`, `runtime/api`, `runtime/evaluation`,
  `session/replay`, `session/presentation`, `presentation`, `core/shell`,
  `evidence`, and `result`.
- Evidence: `packages/ts-shell/src/tools/toolBatchDispatch.test.ts`,
  `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts`,
  `packages/ts-shell/src/runtime/api/host/runtime.test.ts`,
  `packages/ts-shell/src/runtime/events/projection.test.ts`,
  `packages/ts-shell/src/session/replay/state.test.ts`,
  `packages/ts-shell/src/session/presentation/envelope.test.ts`,
  `packages/ts-shell/src/presentation/surface/model.test.ts`,
  `packages/ts-shell/src/core/shell/cliSessionProductSurface.test.ts`, and the
  focused evidence/result truth tests.
- Boundary: only read-only tool calls with safe independent dependency facts can
  run in parallel. Mutation tools, unknown-effect tools, authority-required
  tools, unsupported tools, and conflicting tools remain outside parallel
  execution. Scheduling, policy allow, dispatch, result messages, next-turn
  preparation, host evaluation, events, replay, product surface, and CLI/session
  status are not terminal success. Live provider behavior, external tool
  servers, dynamic loading, browser automation, command allowlist expansion,
  arbitrary writer behavior, and uncontrolled broad parallel mutation remain
  unproven.

## Medium-Term Runtime Capability Batches

### Completed Planning Item: Provider/Model Compatibility Registry

- Goal: expand provider/model metadata, auth readiness, compatibility flags,
  fallback eligibility, and request blockers without enabling real providers by
  default.
- User-facing value: provider readiness failures become precise before calls.
- Owner domains: `provider/registry`, `provider/request`, `provider/response`,
  `runtime/events`, `presentation`.
- Expected areas: provider registry projections, request boundary, invocation
  gate, response/reentry events.
- Required tests: synthetic/default-off provider tests, missing-auth tests,
  redaction tests, no-provider-call assertions.
- Forbidden shortcuts: reading private provider homes, default real-provider
  enablement, treating readiness/fallback eligibility as execution.
- Completion condition: request preparation explains compatibility/auth
  blockers and explicit opt-in requirements with no live call. The completed
  provider/model runtime boundary also proves controlled fallback decision and
  response normalization facts.

### Completed Batch: Programmatic Runtime Event Contract

- Proven result: machine-readable JSON runtime events and host event envelopes
  carry schema/version metadata, ordering, event ids, event types, redaction,
  not-proven claims, and `terminalSuccessClaim: false` for host consumption.
- Boundary: the event contract remains observation-only. Broad RPC servers,
  external tool servers, dynamic plugin loading, and terminal-output parsing are
  still not enabled.

### Batch 4: Tool Policy And Read-Only Parallelism

- Goal: strengthen tool policy interception, dispatch ordering, receipts,
  outcome next action, and read-only parallel execution before mutation
  concurrency.
- User-facing value: safe independent reads can speed up work while blocked or
  authority-needed tool outcomes stay clear.
- Owner domains: `tools`, `tools/policy`, `runtime/execution`, `turn`,
  `runtime/events`.
- Expected areas: tool policy decisions, dispatch planning, execution receipts,
  tool result messages, outcome bundle.
- Required tests: sequential vs read-only parallel ordering, blocked authority,
  redaction, failed tool, and next-turn result-message cases.
- Forbidden shortcuts: parallel writes, command allowlist expansion, bypassing
  `ExecutionService`, tool-success-as-task-success.
- Completion condition: read-only parallel tool paths produce ordered,
  report-safe result messages and preserve non-success outcomes.

### Batch 5: Verification And Repair Recovery Loop

- Goal: carry verification failures, repair eligibility, authority, apply
  observations, and post-repair verification through the loop until result-owned
  verdicts settle.
- User-facing value: repair attempts become auditable and less likely to hide
  incomplete verification.
- Owner domains: `verification`, `repair`, `evidence`, `result`,
  `runtime/loop`, `runtime/events`, `presentation`.
- Expected areas: repair handoff boundaries, proof input, result projection,
  finalization, completion packet.
- Required tests: original failure preserved, proposal-only not success,
  apply-only not success, post-repair failed/not-run not success, complete proof
  success.
- Forbidden shortcuts: repair proposal as success, apply as success, skipped
  verification as success, broad rebaseline.
- Completion condition: the product path reaches complete only through
  evidence/result proof with task-relevant post-repair verification.

## Large Future Capability Areas

### Batch 6: Capability Inventory Governance

- Goal: move from static resource/package projections to a robust governance
  model for installed/enabled/disabled/conflicting/unsupported resources.
- User-facing value: users can see which capabilities are available, disabled,
  blocked, conflicting, or unsupported before relying on them.
- Owner domains: `runtime/resources`, `policy`, future static registration
  owners.
- Expected areas: package/resource inventory projections, resource trust policy,
  event and surface projections for inventory status.
- Required tests: manifest validation, conflict detection, trust policy,
  redaction, unsupported executable packages.
- Forbidden shortcuts: package install/load, dynamic discovery, script
  execution, plugin execution, provider default enablement.
- Conservative boundary: no package install/load or executable plugin behavior.
- Completion condition: inventory facts distinguish enabled, disabled, blocked,
  conflicting, unsupported, and rejected resources without executing any package
  or plugin behavior.

### Batch 7: Extension Contract Without Execution

- Goal: define non-executable lifecycle and hook contracts that can observe,
  annotate, block, redact, or suggest next actions without mutating truth.
- User-facing value: future extension points can be planned and audited without
  letting third-party behavior execute or rewrite success.
- Owner domains: `runtime/extensions`, `policy`, `runtime/events`, `tools`,
  `provider/request`.
- Expected areas: extension lifecycle descriptors, hook policy outcomes,
  forbidden effect taxonomy, event projection, surface status.
- Required tests: forbidden effects rejected, allowed effects remain
  evidence-only, default unsupported/executable false.
- Forbidden shortcuts: dynamic loading, executable plugin code, provider/tool
  default execution, authority bypass, terminal-success rewrite.
- Conservative boundary: no dynamic loading, plugin code execution, provider
  default execution, shell/file mutation, or hidden transcript mutation.
- Completion condition: static internal hook descriptors can be validated and
  projected, and every forbidden effect is rejected with `terminalSuccessClaim:
  false`.

### Batch 8: Interactive Branch And Compaction Controls

- Goal: add mature CLI/session controls for selecting branches, inspecting active
  leaves, and requesting compact/resume actions on top of the proven durable
  branch/compaction fact model.
- User-facing value: users can intentionally navigate alternate leaves and
  compacted context without losing stale/unsafe/missing fact visibility.
- Owner domains: `core/shell`, `session/store`, `session/replay`,
  `session/continuation`, `context`, `presentation`.
- Expected areas: branch selection commands or actions, compact/resume controls,
  active leaf status, replay/context rebuild projections, and CLI/session status
  rendering.
- Required tests: branch selection UX, active leaf switching through shell
  actions, compact/resume controls, stale/unsafe facts, resume replay, and
  terminal-success preservation.
- Forbidden shortcuts: summary-as-evidence, raw transcript carry-forward,
  unplanned schema migration, success claims from compacted context.
- Conservative boundary: migration and backward compatibility must be explicit;
  summaries are context aids, not evidence.
- Completion condition: interactive controls consume persisted branch and
  compaction records, rebuild safe continuation context, preserve
  unsupported/stale/unsafe facts, and do not create terminal success.

### Batch 9: SDK Or RPC Host Integration

- Goal: decide whether a narrow SDK or RPC host integration should sit on top of
  the proven host JSON/package surface, without broad server behavior or dynamic
  execution.
- User-facing value: future external callers can use the same structured host
  facts without depending on terminal output or package smoke internals.
- Owner domains: `runtime/api`, `contracts` only if a real cross-runtime
  consumer exists, `session/store`, `session/replay`, `evidence`, `result`, and
  package metadata.
- Expected areas: versioned host request/response schema, transport-neutral
  adapters, cancellation/stop mapping, replay-safe status reads, and package
  compatibility checks.
- Required tests: SDK/RPC contract tests if scoped, status/replay continuity,
  blocked/unsupported/default-off provider lanes, redaction, and result-owned
  truth.
- Forbidden shortcuts: broad SDK/RPC server, external tool server behavior,
  dynamic package loading, live-provider default gates, terminal-text parsing,
  or compatibility-shim business logic.
- Conservative boundary: no server or dynamic execution should be added unless
  a concrete consumer and side-effect boundary are explicitly scoped.
- Completion condition: any new host integration delegates to the existing host
  API, preserves `host-json-response.v1` truth semantics or a versioned
  successor, and keeps evidence/result as the only success owner.

## Validation Expectations

- Documentation-only updates: consistency review, link/path sanity, `rtk git diff
  --check`, and `rtk git diff --cached --check` if staged.
- Product-code changes: owner-focused tests first, then build only when imports,
  contracts, runtime-facing types, or broad behavior changed.
- False-success-sensitive changes: always include evidence/result verdict tests,
  completion-packet tests, and representative presentation/event tests.
- Provider changes: default-off synthetic tests first; real-provider gates only
  under explicit opt-in and without reading or printing private provider config.

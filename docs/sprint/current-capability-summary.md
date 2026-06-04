# Current Capability Summary

This document summarizes current proven capabilities for the sprint knowledge
base. Code and focused tests remain the source of truth; this document is not
itself product evidence.

## Current Shape

The project is a TypeScript-first coding-agent runtime and control plane. The
root package still describes a three-layer workspace, but current product
behavior lives mainly in `packages/ts-shell/src`:

- Runtime loop and control facts: `runtime/loop/`.
- Runtime events and JSON projection: `runtime/events/`.
- Execution boundary and report-safe receipts: `runtime/execution/`.
- Session, replay, continuation, and presentation facts: `session/`.
- Context rebuild and planning substrate: `context/`, `planning/`.
- Provider registry/request/response boundaries: `provider/`.
- Tool call, policy, dispatch, result-message, and outcome ownership: `tools/`,
  `turn/`.
- Terminal truth and verdict ownership: `evidence/`, `result/`.
- Product-facing rendering: `presentation/`.

Rust remains a native executor candidate, not the current general execution
owner. Python is offline evaluation only.

## Proven Or Partially Proven Capabilities

| Area | Current status | Evidence |
|---|---|---|
| TypeScript runtime/control plane | Proven as the primary product runtime and shell/control surface. | `package.json`, `packages/ts-shell/src/runtime/`, `packages/ts-shell/src/cli/`, `packages/ts-shell/src/session/` |
| Explicit execution boundary | Proven for command/file/tool side-effect receipts through `ExecutionService` and runtime receipts. | `packages/ts-shell/src/runtime/execution/executionService.ts`, `packages/ts-shell/src/runtime/execution/receipt.ts` |
| Evidence/result terminal truth | Proven as the only success-verdict owner for repair-to-success. Presentation, runtime, events, replay, request preparation, tool outcome, proposal, authority, and apply-only states keep `terminalSuccessClaim: false`. | `packages/ts-shell/src/evidence/projection/repair/verdict.ts`, `packages/ts-shell/src/result/projection/repair/verdict.ts`, `packages/ts-shell/src/runtime/loop/truthMatrix.test.ts` |
| Product loop truth consolidation | Proven for a shared product path matrix covering complete proof, failed verification, repair required, proposal-only, authority-only, apply without post-repair verification, post-repair failed verification, blocked request preparation, failed tool outcome, partial/stopped loop, waiting for user, and missing proof. Complete proof is the only matrix path that reaches result-owned `COMPLETE`; all consumers remain observation/control surfaces. | `packages/ts-shell/src/runtime/loop/truthMatrix.test.ts`, `packages/ts-shell/src/runtime/loop/completionPacket.test.ts`, `packages/ts-shell/src/runtime/events/projection.test.ts`, `packages/ts-shell/src/runtime/events/stream.test.ts`, `packages/ts-shell/src/session/replay/state.test.ts`, `packages/ts-shell/src/presentation/surface/model.test.ts`, `packages/ts-shell/src/evidence/projection/repair/verdict.test.ts`, `packages/ts-shell/src/result/projection/repair/verdict.test.ts` |
| CLI/session status envelope | Proven for a structured terminal-facing envelope derived from product surface owner facts. The envelope carries terminal verdict, loop control status, next action, request/continuation/replay/tool/verification/repair status, missing proof, not-proven claims, safe details, user-action-needed, blocked/failed, and complete-proof state, and is consumed by the existing CLI session product surface path. | `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/core/shell/cliSessionProductSurface.ts`, `packages/ts-shell/src/presentation/terminal/renderer.ts`, `packages/ts-shell/src/session/presentation/envelope.test.ts`, `packages/ts-shell/src/core/shell/cliSessionProductSurface.test.ts` |
| Agent Loop governed substrate | Proven as a broad observation/control substrate with infrastructure categories, finalization, completion packet, trajectory, and events. Product-loop truth propagation is now matrix-tested; this does not prove every CLI, host, storage, provider, or dynamic execution path. | `packages/ts-shell/src/runtime/loop/infrastructure.ts`, `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/loop/finalization.ts`, `packages/ts-shell/src/runtime/loop/trajectory.ts` |
| Context and planning substrate | Proven for report-safe context rebuild and planning fact handoff; not a guarantee of context completeness. | `packages/ts-shell/src/context/sessionContextRebuildProjection.ts`, `packages/ts-shell/src/context/rebuildInput.ts`, `packages/ts-shell/src/context/acquisition/summary.ts` |
| Provider request boundary | Proven for default-off request preparation, provider/model selection, missing provider, missing model, unsupported model mode, safe auth readiness, safe request messages, redaction blockers, explicit invocation readiness, and synthetic request blocker projection. It does not prove live provider calls. | `packages/ts-shell/src/provider/request/boundary.ts`, `packages/ts-shell/src/provider/request/invocation.ts`, `packages/ts-shell/src/provider/request/fallback.ts`, `packages/ts-shell/src/runtime/events/projection.ts` |
| Provider/model runtime boundary | Proven for a controlled shared lane from registry resolution through explicit compatibility matrix facts, config/auth readiness, model capability checks, request preparation, invocation gate, synthetic or injected controlled invocation by default, response normalization, assistant accumulation, text/tool-call handling, failure classification including malformed response and safety block, fallback decision/attempt/failure, next runtime action, runtime events, replay-safe carry-forward, product surface, CLI/session status, and non-success truth preservation. | `packages/ts-shell/src/provider/registry/provider.ts`, `packages/ts-shell/src/provider/request/boundary.ts`, `packages/ts-shell/src/provider/request/invocation.ts`, `packages/ts-shell/src/provider/request/attempt.ts`, `packages/ts-shell/src/provider/request/fallback.ts`, `packages/ts-shell/src/provider/response/adapter.ts`, `packages/ts-shell/src/provider/response/stream.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts` |
| Synthetic provider response lane | Proven for deterministic synthetic completed text, tool calls, provider failure facts, provider stream events, model boundary phase projection, assistant accumulation, tool extraction, registry-backed request boundary facts, and request blocker carry-forward without live provider credentials. | `packages/ts-shell/src/provider/response/synthetic.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.ts`, `packages/ts-shell/src/provider/response/synthetic.test.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts` |
| Continuation-aware request handoff | Proven as projection from continuation readiness into request preparation, replay-safe facts, trajectory/events, and presentation. | `packages/ts-shell/src/session/continuation/readiness.ts`, `packages/ts-shell/src/provider/request/boundary.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/runtime/events/projection.ts` |
| End-to-end turn lane | Proven for a controlled synthetic provider-to-tool-to-next-turn runtime lane: user turn request boundary, deterministic synthetic response intake, assistant accumulation, tool extraction, allowed dispatch through the sanctioned seam, tool result message preparation, next-turn request preparation, controlled invocation gate, fallback decision/attempt facts, optional continuation to the next turn, runtime events, replay-safe carry-forward, product surface, and CLI/session status envelope. It remains observation/control unless evidence/result prove success. | `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.ts`, `packages/ts-shell/src/runtime/loop/modelBoundary.ts`, `packages/ts-shell/src/tools/toolBatchDispatch.ts`, `packages/ts-shell/src/tools/toolOutcomeBundle.ts`, `packages/ts-shell/src/turn/toolResultMessage.ts`, `packages/ts-shell/src/turn/nextTurnBundle.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts` |
| Controlled read-only parallel tool runtime | Proven for controlled synthetic-provider tool calls that classify effects and dependencies, allow independent read-only parallel groups, force ordered read-only dependencies through deterministic sequential groups, block mutation/unknown/unsupported/authority/conflicting tools from parallel execution, preserve model-facing tool result order, carry partial failure/cancel/timeout/skipped facts, prepare next-turn facts, emit runtime events, feed host evaluation, replay, product surface, and CLI/session status, and keep terminal truth in evidence/result. | `packages/ts-shell/src/tools/policy/effects.ts`, `packages/ts-shell/src/tools/scheduling/plan.ts`, `packages/ts-shell/src/tools/toolBatchDispatch.ts`, `packages/ts-shell/src/turn/toolResultMessage.ts`, `packages/ts-shell/src/turn/nextTurnBundle.ts`, `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/runtime/api/host/runtime.ts`, `packages/ts-shell/src/runtime/evaluation/model.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/session/replay/host/facts.ts`, `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/core/shell/cliSessionProductSurface.ts`, `packages/ts-shell/src/tools/toolBatchDispatch.test.ts`, `packages/ts-shell/src/runtime/loop/providerBoundary.test.ts`, `packages/ts-shell/src/runtime/api/host/runtime.test.ts` |
| Controlled mutation and recovery runtime | Proven for a bounded synthetic-provider tool lane that carries tool policy, explicit mutation authority, final stale-read, snapshot/restore planning, sanctioned `ExecutionService` apply observation, task-relevant verification, rollback or repair decision, optional repair apply, post-repair verification, result-owned verdict, runtime events, replay-safe carry-forward, product surface, and CLI/session status from the same owner facts. Apply, rollback, repair, events, replay, surface, and status remain non-success unless evidence/result produce complete proof. | `packages/ts-shell/src/edit/recovery/model.ts`, `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/edit/recovery/model.test.ts`, `packages/ts-shell/src/runtime/loop/mutationRecovery.test.ts` |
| Bounded parallel multi-target mutation runtime | Proven for controlled synthetic-provider edit intent through multi-target plan, target classification, conflict detection, mutation graph, batch and target authority, per-target stale-read, per-target snapshot/restore plan, bounded parallel eligibility, explicit capped groups, sanctioned `ExecutionService` apply per target, deterministic settlement ordering independent of completion order, partial group failure classification, skipped follow-on targets, rollback with original failure preservation, per-target/per-group/whole-task verification, repair eligibility, evidence proof input, result-owned verdict, runtime events, host evaluation, replay, product surface, CLI/session status, and redaction. Uncontrolled or broad parallel mutation remains unsupported; graph, eligibility, group creation, queue, apply, settlement, rollback, verification observations, events, replay, surface, and status remain non-success unless evidence/result produce complete proof. | `packages/ts-shell/src/edit/multifile/model.ts`, `packages/ts-shell/src/evidence/projection/mutation/proof.ts`, `packages/ts-shell/src/result/projection/mutation/verdict.ts`, `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/runtime/api/host/runtime.ts`, `packages/ts-shell/src/runtime/evaluation/model.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/presentation/terminal/renderer.ts`, `packages/ts-shell/src/edit/multifile/model.test.ts`, `packages/ts-shell/src/runtime/loop/mutationRuntime.test.ts`, `packages/ts-shell/src/runtime/api/host/runtime.test.ts` |
| Tool outcome next action | Proven in `tools`: outcome status derives next action and carry-forward facts; loop/events/presentation only project them. | `packages/ts-shell/src/tools/toolOutcomeBundle.ts`, `packages/ts-shell/src/tools/toolOutcomeBundle.test.ts` |
| Runtime event projection | Proven for many observation events, JSON stream entries, provider compatibility/readiness facts, redaction, and non-success claims. Event emission is not terminal truth. | `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/runtime/events/stream.ts` |
| Replay-safe carry-forward | Proven for IDs, statuses, blocker summaries, request facts, provider compatibility/readiness facts, provider invocation/fallback status, tool outcome facts, product completion facts, and redaction exclusions. Raw transcripts, secrets, raw provider output, patch text, and command output are excluded. | `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/session/replay/host/facts.ts` |
| Storage-backed session branch and compaction runtime | Proven for durable thread facts in session state, parent/child turn relationships, explicit active leaf selection, branch creation and switching, compaction records with retained/excluded/stale/unsafe/missing/unsupported/provenance facts, context rebuild, continuation readiness, provider request preparation, runtime events, replay-safe carry-forward, product surface, CLI/session status, and non-success truth preservation in controlled synthetic lanes. | `packages/ts-shell/src/session/schema/sessionThread.ts`, `packages/ts-shell/src/session/store/threadState.ts`, `packages/ts-shell/src/session/sessionTreeProjection.ts`, `packages/ts-shell/src/context/sessionContextRebuildProjection.ts`, `packages/ts-shell/src/session/continuation/readiness.ts`, `packages/ts-shell/src/runtime/loop/sessionContinuity.test.ts`, `packages/ts-shell/src/session/store/threadState.test.ts` |
| Host command contract and deterministic evaluation runtime | Proven for an in-process structured host boundary that validates command envelopes, starts and continues sessions, reports status, lists heads, inspects session summaries, records stop/cancel requests, runs deterministic evaluation cases, streams JSON-safe events, carries replay-safe provider compatibility/readiness/fallback facts, reports passed/failed/blocked/unsupported/skipped/not-proven evaluation results, and preserves evidence/result as the only complete-proof owner. | `packages/ts-shell/src/runtime/api/host/contract.ts`, `packages/ts-shell/src/runtime/api/host/runtime.ts`, `packages/ts-shell/src/runtime/evaluation/model.ts`, `packages/ts-shell/src/runtime/events/host/envelope.ts`, `packages/ts-shell/src/session/store/host/state.ts`, `packages/ts-shell/src/session/replay/host/facts.ts`, `packages/ts-shell/src/evidence/host/proof.ts`, `packages/ts-shell/src/result/host/verdict.ts`, `packages/ts-shell/src/runtime/api/host/runtime.test.ts` |
| Deterministic task capability assessment, shared task-loop runtime, and opt-in live task execution | Proven for a task-owned deterministic assessment layer and explicit live report path that call the same product task-loop runtime. `runtime/evaluation/task/loop.ts` owns ordered execution from goal and state through context, plan, request, provider turn, action, observation, verification, repair, proof, and verdict, while each step delegates to the rightful owner domains: `context/selection`, `planning/execution`, `provider/request`, `provider/response`, `tools/policy`, `edit`, `verification/execution`, `artifacts/workflow`, `repair/loop`, `evidence/task`, and `result/task`. `progression.ts` is a thin adapter over loop output. Current audited deterministic results remain 18 complete, 1 skipped, and 1 unsupported. The repeatable live task report defines thirteen entries and now projects safe live gate receipts, quality records, and SP029 hard-gate counts inside `runtime/evaluation/task` instead of script-owned per-entry observations. A measured explicit opt-in live gauntlet executed all 13 entries through loop-owned progression: 11 completed with task proof, 3 completed write tasks produced reviewed disposable apply plus post-apply task proof with zero manual correction, 5 write-capable entries produced patch intent and dry-run diff metadata, 3 completed write entries were correction-free, 2 remaining manual corrections had blocker or failing dispositions, 3 reviewed real-workspace readiness records were present, 1 selected-workspace apply ran in a disposable isolated workspace, 1 debug/repair task completed, rollback recovery reached useful partial with exact repair-verification status, 1 coordinated edit carried multi-file target metadata, artifact/report and continuation/context entries completed, fallback metadata stayed safe, and redaction passed. Latest user-reported manual live smoke evidence showed read-only smoke passed, anchored provider smoke passed with the primary provider, fallback was configured but skipped because primary succeeded, raw provider output did not leak, and no-write/no-apply behavior was preserved. Scripts only invoke existing explicit gates, pass safe receipts, and print safe metadata. Terminal success remains false outside evidence/result; provider calls, fallback, patch intent, dry-run diff, review authority, isolated apply, selected-workspace apply metadata, and live report status are not task success by themselves. | `packages/ts-shell/src/runtime/evaluation/task/loop.ts`, `packages/ts-shell/src/runtime/evaluation/task/model.ts`, `packages/ts-shell/src/runtime/evaluation/task/progression.ts`, `packages/ts-shell/src/runtime/evaluation/task/model.test.ts`, `packages/ts-shell/src/runtime/evaluation/task/liveRun.ts`, `packages/ts-shell/src/runtime/evaluation/task/liveRun.test.ts`, `packages/ts-shell/src/runtime/evaluation/task/quality.ts`, `packages/ts-shell/src/context/selection/model.ts`, `packages/ts-shell/src/context/selection/model.test.ts`, `packages/ts-shell/src/planning/execution/model.ts`, `packages/ts-shell/src/provider/request/packet.ts`, `packages/ts-shell/src/provider/request/packet.test.ts`, `packages/ts-shell/src/tools/policy/strategy.ts`, `packages/ts-shell/src/verification/selection/model.ts`, `packages/ts-shell/src/verification/execution/model.ts`, `packages/ts-shell/src/artifacts/workflow/model.ts`, `packages/ts-shell/src/repair/loop/model.ts`, `packages/ts-shell/src/evidence/task/proof.ts`, `packages/ts-shell/src/evidence/task/proof.test.ts`, `packages/ts-shell/src/result/task/verdict.ts`, `scripts/verify-live-task-execution.ts` |
| Non-interactive host API and package readiness surface | Proven for a structured `--host-command` package/CLI-facing lane that parses host JSON input, delegates to the in-process host runtime, emits `host-json-response.v1` with command/session/turn ids, event ordering, event category/severity envelopes, status snapshot, final response, result summary, diagnostics, blockers, redaction details, replay facts, truth facts, evaluation results, and exit classification. Package readiness checks prove built package importability, CLI artifact availability, host command availability, JSON shape, default-off live provider blocking, deterministic evaluation through the package surface, redaction, and evidence/result-owned truth. | `packages/ts-shell/src/cli/host/runner.ts`, `packages/ts-shell/src/runtime/api/host/io.ts`, `packages/ts-shell/src/runtime/distribution/model.ts`, `packages/ts-shell/src/index.ts`, `scripts/verify-host-surface.mjs`, `packages/ts-shell/src/runtime/api/host/io.test.ts`, `packages/ts-shell/src/cli/host/runner.test.ts`, `packages/ts-shell/src/runtime/distribution/model.test.ts`, `packages/ts-shell/src/result/host/verdict.test.ts`, `packages/ts-shell/src/smoke.test.ts` |
| Product surface rendering | Proven for rendering coding result, loop trajectory, provider/model, fallback, request, tool, replay, event, verdict, and next-action facts without owning success. | `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/presentation/terminal/renderer.ts` |
| Verification and repair readiness | Proven for verification intent/result observations, repair handoff/proposal/authority/apply observations, post-repair verification, proof input, and result verdict projection. | `packages/ts-shell/src/verification/result/boundary.ts`, `packages/ts-shell/src/repair/handoff/boundary.ts`, `packages/ts-shell/src/evidence/projection/repair/verdict.ts`, `packages/ts-shell/src/result/projection/repair/verdict.ts` |
| Not-proven claim preservation | Proven across loop infrastructure, request preparation, tool outcomes, replay, completion packet, and surface. | `packages/ts-shell/src/runtime/loop/infrastructure.ts`, `packages/ts-shell/src/provider/request/boundary.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/presentation/surface/model.ts` |
| Static package/resource governance | Proven only as explicit static inventory and trust/policy projection. Package install/load, dynamic discovery, plugin execution, scripts, network lookup, and provider default enablement remain disabled. | `packages/ts-shell/src/runtime/resources/inventory.ts`, `packages/ts-shell/src/runtime/resources/projection.ts` |
| Extension/hook governance | Proven only as metadata/policy contract. Hooks are static, internal, non-executable, unsupported for runtime plugin execution, and forbidden effects are rejected. | `packages/ts-shell/src/runtime/extensions/lifecycle.ts` |

## Current Missing Areas

- Real task completion is not broadly proven. Current evidence proves many
  trusted runtime lanes, context/planning sub-capabilities, host automation
  facts, and deterministic evaluation cases, but it does not prove that the
  product can reliably complete underspecified real tasks across coding,
  debugging, documents, reports, data analysis, slides, or artifact workflows.
- Task-goal handling and ambiguity collaboration are not proven as a complete
  product workflow. Planning tests can carry assumptions, constraints, task-kind
  hints, and handoff facts, but the product does not yet have a broad
  collaboration policy that asks the smallest useful question, revises plans
  after user input, and resumes work with task state.
- Workspace intelligence is partially proven, not complete. Bounded repository
  discovery, staged context acquisition, graph/test-impact facts, continuation
  memory, and stale/unsafe memory rejection are owner-tested under
  `context/discovery`, `context/acquisition`, and `context/memory`, but they do
  not prove full workspace understanding or target correctness for arbitrary
  real tasks.
- Planning is partially proven, not task execution. `planning/runtime` and
  `planning/quality` can produce grounded analysis, executable plan facts, edit
  target selection, verification intent, and no-write mutation handoff facts,
  but those facts do not grant mutation authority, execute verification, or
  prove task success.
- Real task evaluation is still narrow. The deterministic task capability
  assessment now measures coding edit, debug repair, pathless workspace
  understanding, docs/report, data/artifact, continuation, unsupported, and
  skipped-live cases with rubrics, richer context packets, execution planning,
  request packets, tool strategy, verification selection/execution, artifact
  correction, repair action, task proof, task verdict, proof records,
  before/after blockers, live gate plans, safe live execution observations,
  repeatable live task run entries, shared deterministic/live task-loop
  progression, explicit live gate receipt projection, reviewed isolated apply
  metadata, quality records, selected-workspace readiness facts, disposable
  selected-workspace apply proof, and failure attribution. It does not
  prove broad real task completion because the cases are deterministic,
  the remaining unsupported and skipped-live deterministic paths are deliberately
  not complete, write/artifact live paths still use explicit isolated,
  disposable, and manual-review gates rather than broad real-workspace write
  authority, and live completion remains limited to explicit default-off live
  receipts with task proof and reviewed disposable apply metadata rather than
  broad autonomous live work. The current live gauntlet proves repeatability,
  task-loop execution, task proof for completed entries, and safe metadata
  across thirteen entries; it does not prove task-specific raw provider output
  inspection, provider defaults, or broad real-workspace write authority.
- Artifact workflow capability is now present as a first-class deterministic
  receipt and correction owner for report and structured-data task cases, and
  report/data cases can enter an explicit opt-in artifact dry-run live path that
  validates proposed output without writing. It is not yet a broad artifact
  writer/export runtime: documents, reports, data outputs, slides, and exports
  still need real durable artifact production, richer source policies, rendered
  validation, manual review or sanctioned write gates, and task-specific
  evidence/result verdicts.
- A mature interactive CLI with full queue ergonomics, rich session management,
  and interactive compact/resume controls is not proven. Storage-backed branch
  and compaction facts now reach the product surface and CLI/session status, but
  broad interactive branch navigation UX remains narrower than the runtime fact
  model.
- A stable in-process host command contract and non-interactive package/CLI
  host JSON surface are proven for deterministic local lanes, evaluation cases,
  package readiness checks, default-off provider blocking, redaction, replay
  facts, and evidence/result truth boundaries. Broad SDK/RPC servers and
  external host integration remain unproven.
- Storage-backed branch and compaction runtime is proven for controlled session
  state, context rebuild, continuation, request-preparation, events, replay,
  product surface, and CLI/session status lanes. Broader interactive branch
  navigation UX and SDK/RPC host contracts remain unproven.
- Synthetic provider-to-tool-to-next-turn execution, the controlled provider
  model boundary, and provider compatibility/evaluation hardening are proven
  through deterministic and injected provider facts, including compatibility
  matrix, config/auth readiness, fallback decision/attempt/failure, response
  normalization, redaction, replay, surface, CLI/session status, and evaluation
  result lanes. Live provider behavior remains default-off and optional through
  explicit gates only; broad auth refresh and default live provider behavior are
  not product capabilities.
- Provider prompting and live task behavior remain weak beyond the explicit
  gates. Provider request, response, stream, fallback, compatibility, and
  default-off gates are tested, and the live task report now records completed
  opt-in task evidence through `runTaskLoop`, but provider-shaped task prompts,
  insufficient-output recovery, richer live debug repair, durable artifact
  output, and broad real-workspace write completion are not proven.
- Dynamic extensions, package loading, executable hooks, and external tool
  server behavior are intentionally not enabled.
- Tool execution is bounded by policy and `ExecutionService`; controlled
  read-only parallel groups, the controlled single-target mutation recovery
  lane, and bounded parallel multi-target mutation groups are proven, but
  uncontrolled broad parallel mutation and uncontrolled writer behavior remain
  unproven.
- Product-loop truth propagation, the CLI/session status envelope, the
  synthetic provider tool lane, the controlled provider/model runtime boundary,
  controlled read-only parallel tool runtime, controlled mutation recovery,
  bounded parallel multi-target mutation runtime, storage-backed branch/compaction facts, the deterministic host/evaluation
  lane, the non-interactive host/package readiness surface, and controlled
  provider compatibility hardening are proven for bounded owner-tested paths.
  Live-provider default behavior, broad auth refresh, broad uncontrolled
  parallel mutation, interactive branch navigation UX, SDK/RPC servers, and
  dynamic execution areas remain unproven.

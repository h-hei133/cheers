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
| Controlled mutation and recovery runtime | Proven for a bounded synthetic-provider tool lane that carries tool policy, explicit mutation authority, final stale-read, snapshot/restore planning, sanctioned `ExecutionService` apply observation, task-relevant verification, rollback or repair decision, optional repair apply, post-repair verification, result-owned verdict, runtime events, replay-safe carry-forward, product surface, and CLI/session status from the same owner facts. Apply, rollback, repair, events, replay, surface, and status remain non-success unless evidence/result produce complete proof. | `packages/ts-shell/src/edit/recovery/model.ts`, `packages/ts-shell/src/runtime/loop/contract.ts`, `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/edit/recovery/model.test.ts`, `packages/ts-shell/src/runtime/loop/mutationRecovery.test.ts` |
| Tool outcome next action | Proven in `tools`: outcome status derives next action and carry-forward facts; loop/events/presentation only project them. | `packages/ts-shell/src/tools/toolOutcomeBundle.ts`, `packages/ts-shell/src/tools/toolOutcomeBundle.test.ts` |
| Runtime event projection | Proven for many observation events, JSON stream entries, provider compatibility/readiness facts, redaction, and non-success claims. Event emission is not terminal truth. | `packages/ts-shell/src/runtime/events/projection.ts`, `packages/ts-shell/src/runtime/events/stream.ts` |
| Replay-safe carry-forward | Proven for IDs, statuses, blocker summaries, request facts, provider compatibility/readiness facts, provider invocation/fallback status, tool outcome facts, product completion facts, and redaction exclusions. Raw transcripts, secrets, raw provider output, patch text, and command output are excluded. | `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/session/replay/host/facts.ts` |
| Storage-backed session branch and compaction runtime | Proven for durable thread facts in session state, parent/child turn relationships, explicit active leaf selection, branch creation and switching, compaction records with retained/excluded/stale/unsafe/missing/unsupported/provenance facts, context rebuild, continuation readiness, provider request preparation, runtime events, replay-safe carry-forward, product surface, CLI/session status, and non-success truth preservation in controlled synthetic lanes. | `packages/ts-shell/src/session/schema/sessionThread.ts`, `packages/ts-shell/src/session/store/threadState.ts`, `packages/ts-shell/src/session/sessionTreeProjection.ts`, `packages/ts-shell/src/context/sessionContextRebuildProjection.ts`, `packages/ts-shell/src/session/continuation/readiness.ts`, `packages/ts-shell/src/runtime/loop/sessionContinuity.test.ts`, `packages/ts-shell/src/session/store/threadState.test.ts` |
| Host command contract and deterministic evaluation runtime | Proven for an in-process structured host boundary that validates command envelopes, starts and continues sessions, reports status, lists heads, inspects session summaries, records stop/cancel requests, runs deterministic evaluation cases, streams JSON-safe events, carries replay-safe provider compatibility/readiness/fallback facts, reports passed/failed/blocked/unsupported/skipped/not-proven evaluation results, and preserves evidence/result as the only complete-proof owner. | `packages/ts-shell/src/runtime/api/host/contract.ts`, `packages/ts-shell/src/runtime/api/host/runtime.ts`, `packages/ts-shell/src/runtime/evaluation/model.ts`, `packages/ts-shell/src/runtime/events/host/envelope.ts`, `packages/ts-shell/src/session/store/host/state.ts`, `packages/ts-shell/src/session/replay/host/facts.ts`, `packages/ts-shell/src/evidence/host/proof.ts`, `packages/ts-shell/src/result/host/verdict.ts`, `packages/ts-shell/src/runtime/api/host/runtime.test.ts` |
| Product surface rendering | Proven for rendering coding result, loop trajectory, provider/model, fallback, request, tool, replay, event, verdict, and next-action facts without owning success. | `packages/ts-shell/src/presentation/surface/model.ts`, `packages/ts-shell/src/session/presentation/envelope.ts`, `packages/ts-shell/src/presentation/terminal/renderer.ts` |
| Verification and repair readiness | Proven for verification intent/result observations, repair handoff/proposal/authority/apply observations, post-repair verification, proof input, and result verdict projection. | `packages/ts-shell/src/verification/result/boundary.ts`, `packages/ts-shell/src/repair/handoff/boundary.ts`, `packages/ts-shell/src/evidence/projection/repair/verdict.ts`, `packages/ts-shell/src/result/projection/repair/verdict.ts` |
| Not-proven claim preservation | Proven across loop infrastructure, request preparation, tool outcomes, replay, completion packet, and surface. | `packages/ts-shell/src/runtime/loop/infrastructure.ts`, `packages/ts-shell/src/provider/request/boundary.ts`, `packages/ts-shell/src/session/replay/state.ts`, `packages/ts-shell/src/presentation/surface/model.ts` |
| Static package/resource governance | Proven only as explicit static inventory and trust/policy projection. Package install/load, dynamic discovery, plugin execution, scripts, network lookup, and provider default enablement remain disabled. | `packages/ts-shell/src/runtime/resources/inventory.ts`, `packages/ts-shell/src/runtime/resources/projection.ts` |
| Extension/hook governance | Proven only as metadata/policy contract. Hooks are static, internal, non-executable, unsupported for runtime plugin execution, and forbidden effects are rejected. | `packages/ts-shell/src/runtime/extensions/lifecycle.ts` |

## Current Missing Areas

- A mature interactive CLI with full queue ergonomics, rich session management,
  and interactive compact/resume controls is not proven. Storage-backed branch
  and compaction facts now reach the product surface and CLI/session status, but
  broad interactive branch navigation UX remains narrower than the runtime fact
  model.
- A stable in-process host command contract is proven for deterministic local
  lanes and evaluation cases. Programmatic SDK packages, RPC servers, and broad
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
- Dynamic extensions, package loading, executable hooks, and external tool
  server behavior are intentionally not enabled.
- Tool execution is bounded by policy and `ExecutionService`; the controlled
  single-target mutation recovery lane is proven, but broad parallel mutation,
  file mutation queues, and snapshot/revert-backed wide editing remain
  unproven.
- Product-loop truth propagation, the CLI/session status envelope, the
  synthetic provider tool lane, the controlled provider/model runtime boundary,
  controlled mutation recovery, storage-backed branch/compaction facts, and the
  deterministic host/evaluation lane, and controlled provider compatibility
  hardening are proven for bounded owner-tested paths. Live-provider default
  behavior, broad auth refresh, broad parallel mutation, interactive branch
  navigation UX, SDK/RPC servers, and dynamic execution areas remain unproven.

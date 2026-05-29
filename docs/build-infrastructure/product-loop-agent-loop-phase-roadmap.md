# Product Loop Agent Loop Phase Roadmap

Status: PL003 roadmap.
Date: 2026-05-29.

## Roadmap Rule

The Agent Loop should be productized from the inside out:

1. prove the model response and tool-call boundary,
2. prove tool dispatch and tool result messages,
3. prove save point and next-turn delivery ordering,
4. prove verification and repair handoff,
5. prove continuation/context rebuild,
6. only then consolidate the product loop adapter or expose host APIs.

Do not replace the current product loop wholesale. Each route must preserve
owner-domain facts and keep result/evidence/verdict as terminal truth owners.

## Recommended PL004 Onward Sequence

| Route | Implements | Defers | Owner domains | Validation expectation | Completion criteria |
|---|---|---|---|---|---|
| PL004 model response and tool-call boundary | Provider/model response boundary, assistant response accumulation, normalized tool-call extraction, observation/event wiring. | Real provider default enablement, tool execution, tool result messages, verification/repair. | `provider`, `turn`, `runtime/loop`, `runtime/events`, `result`, `evidence`, `presentation` as consumer. | Focused fake/default-safe provider boundary tests, accumulator tests, tool-call extraction tests, trajectory/event/product surface truthfulness tests, result-contract if terminal mapping touched, package build if product code changes. | CLI product path can observe a report-safe assistant response boundary and normalized tool-call batch without executing tools or changing terminal success. |
| PL005 tool batch dispatch and tool result messages | Before-tool policy application, sequential local batch dispatch through sanctioned owners, execution receipts, after-tool annotations, tool result message construction for next turn. | Parallel writes, command allowlist expansion, edit behavior changes, dynamic tools/plugins/packages, verification/repair integration. | `tools`, `runtime/execution`, `runtime/loop`, `policy`, `evidence`, `result`, `runtime/events`. | Tool policy allow/deny tests, `ExecutionService` receipt tests, tool result split/message tests, abort/cancellation tests, no-success-from-tool tests. | A PL004 tool-call batch can produce ordered, report-safe tool result messages and receipts; denied/pending/failed states remain distinct. |
| PL006 save point, prepare-next-turn, steering and follow-up | Evidence-only save point placement after assistant/tool phases, executable prepare-next-turn boundary, steering/follow-up queue delivery ordering, next-turn event projection. | Durable session schema migration, storage-backed branch/compaction, verification/repair handoff, SDK/RPC. | `evidence`, `turn`, `runtime/loop`, `session`, `context`, `core/shell`, `runtime/events`. | Save point tests, queue ordering tests, abort-before/after-delivery tests, next-turn not-success tests, session runtime consumer tests. | The loop can prepare and deliver the next turn from owner facts without treating preparation, delivery, or context rebuild as success. |
| PL007 verification and repair handoff inside loop | Verification failure handoff, repair handoff, original failure preservation, re-verification ordering, result/evidence linkage inside loop events. | New verification behavior, weak skips, repair apply without re-verification, broad command changes. | `verification`, `repair`, `runtime/execution`, `evidence`, `result`, `runtime/loop`, `presentation`. | Task-relevant verification tests, repair-to-success tests, original-failure preservation tests, no selected-not-run success, result-contract gate. | Verification and repair are explicit loop handoffs, and only passed relevant evidence can upgrade result truth. |
| PL008 session context rebuild and continuation hardening | Session active path as executable next-turn input, safe context rebuild after continuation/compaction, stopped/interrupted continuation behavior. | Durable schema migration unless explicitly scoped, storage-backed branching, SDK/RPC, browser paths. | `session`, `context`, `core/shell`, `runtime/loop`, `runtime/events`, `result`. | Session continuation tests, context rebuild projection/input tests, compaction-safe tests, redaction tests, terminal parity tests. | Continue/resume can feed the loop with safe reconstructed context; enough-context success remains not proven unless evidenced. |
| PL009 product loop adapter consolidation | Consolidate proven PL004-PL008 phases into a product loop adapter while keeping current coordinator/session boundaries stable. | SDK/RPC server, TUI, browser/external tools, dynamic plugin/package execution. | `runtime`, `runtime/loop`, `core/shell`, plus phase owners. | End-to-end CLI product loop tests, regression tests for coordinator/session runtime, result-contract, build. | The local CLI coding path uses the consolidated loop adapter without compatibility shim growth or owner-boundary collapse. |
| PL010 optional JSON host or SDK route | Host-neutral JSON/API surface for the stable local loop, if product need is proven. | Network server defaults, auth lifecycle, public API promises beyond scoped route, TUI/browser integration. | `runtime/events`, future host owner, `core/shell` adapter if needed. | API/stream contract tests, redaction tests, cancellation tests, no default network exposure. | External host can consume stable loop events without changing local CLI truth or enabling unsafe defaults. |

## Immediate Next Implementation Route: PL004

Route title:

`Model Response And Tool-Call Boundary`

Goal:

- Connect a real product-loop model response boundary to the CLI coding path in
  a fake/default-safe way.
- Accumulate assistant response state into a report-safe boundary object.
- Extract and normalize tool calls into a tool-call batch that future PL005 can
  dispatch.
- Keep the route observation/contract focused: no real provider default, no
  tool execution, no success upgrade.

Owner domains:

- `provider`: provider/model metadata and fake/default-safe response adapter
  boundary.
- `turn`: assistant response accumulation and turn snapshot facts.
- `runtime/loop`: model boundary, normalized tool-call batch shape, phase
  ordering, not-proven claims.
- `runtime/events`: host-neutral events for response boundary and tool-call
  observation.
- `result` and `evidence`: terminal truth guardrails.
- `presentation` and `core/shell`: render/consume only if observation needs to
  surface.

Likely files to inspect:

- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/runtime/loop/agentLoopContract.ts`
- `packages/ts-shell/src/runtime/loop/trajectoryProjection.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.ts`
- `packages/ts-shell/src/provider/providerRegistry.ts`
- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/turn/roleDraftStage.ts`
- `packages/ts-shell/src/turn/turnSnapshot.ts`
- `packages/ts-shell/src/tools/interception.ts`
- `packages/ts-shell/src/tools/resultSplit.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
- `packages/ts-shell/src/presentation/productSurface.ts`

Allowed changes:

- Add or connect owner-domain model response boundary types/projections under
  `provider`, `turn`, or `runtime/loop`.
- Add fake/default-safe assistant response accumulation tests and implementation
  if the existing owner surface is insufficient.
- Normalize tool-call metadata into a batch for observation and later dispatch.
- Attach response/tool-call boundary observations to existing trajectory/events
  without changing terminal truth.
- Render newly available not-proven facts if needed through presentation as a
  consumer.

Forbidden shortcuts:

- No real provider calls or real provider default enablement.
- No manual reads of `/home/wang/.private-agents-real`.
- No tool execution, command allowlist expansion, edit behavior changes, or
  verification behavior changes.
- No treating provider response observed, tool calls extracted, or response
  accumulation as success.
- No route-numbered product files, compatibility shim logic growth, helper
  buckets, SDK/RPC/TUI/browser work, dynamic plugin execution, package loading,
  or new dependencies.
- No product loop replacement.

Tests:

- Provider/model boundary unit tests with fake/default-safe response data.
- Assistant response accumulation tests covering partials, final message,
  aborted, failed, and tool-call stop reasons.
- Tool-call extraction/normalization tests covering argument key projection,
  redaction, unsupported calls, and empty call batches.
- Runtime event and JSON stream tests if new events are added.
- Trajectory/product surface tests proving not-proven claims remain visible.
- Result mapper/result-contract tests if terminal result surfaces are touched.

Validation:

- Focused package tests for touched files.
- `rtk npm run build -w packages/ts-shell` if product TypeScript changes.
- `rtk npm run verify:result-contract` if result/terminal truth changes.
- `rtk git diff --check`.
- `rtk git status --short --branch`.

Completion criteria:

- A CLI product-path turn can expose a report-safe model response boundary with
  accumulated assistant response facts.
- Tool calls from that boundary are normalized into a batch for later PL005
  dispatch.
- Missing provider/tool facts are explicit not-proven claims.
- Terminal success remains owned by result/evidence/verdict.
- No provider default, tool execution, command authority, verification, repair,
  or session schema behavior changes.

Not-proven after PL004:

- Provider success.
- Model quality or task satisfaction.
- Tool execution success.
- Tool result messages for next model turn.
- Verification success.
- Repair success.
- Next-turn execution.
- Session context sufficiency.
- Product loop replacement.

## Combination Rules

Can combine:

- Model response boundary with assistant response accumulation and tool-call
  extraction.
- Tool batch dispatch with tool result message construction.
- Save point with prepare-next-turn and queue delivery ordering, if no durable
  session migration is introduced.
- Verification failure handoff with repair handoff.
- Session context rebuild with continuation hardening.

Must stay separate:

- Real provider streaming from default provider enablement.
- Tool execution behavior from command allowlist expansion.
- Session schema migration from product loop adapter consolidation.
- SDK/RPC host from CLI loop stabilization.
- Browser/external tool integration from local tool loop stabilization.
- Dynamic plugin/package execution from local tool result messages.

## When The Loop Is Close To Target

The local loop can be considered close to the architecture study target only
after PL004 through PL008 are complete and proven:

- assistant responses are accumulated into product loop state,
- tool calls are extracted, policy-gated, dispatched, and converted into next
  model turn messages,
- save points and prepare-next-turn have executable ordering semantics,
- steering and follow-up delivery are explicit and abort-safe,
- verification and repair handoffs preserve evidence truth,
- session continuation/context rebuild feeds safe next-turn input,
- event and product surfaces report the phases without owning truth.

PL009 can then consolidate the adapter. PL010 should remain optional and should
only expose host APIs after the local CLI loop is stable.


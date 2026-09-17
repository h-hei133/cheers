# Module Atlas

Route: `docs/agent-routes/route131-module-atlas.md`

This is the main responsibility-based module atlas for the project. Modules here are not directories. Directories and files are evidence for responsibility ownership.

## Executive Summary

The project is no longer a toy architecture, but it is still route-grown. It has real bounded capabilities around edit/patch safety, result contracts, session/continue, provider readiness, browser runtime, browser transactions, MCP taxonomy, and deterministic release gates. The remaining architecture risk is cross-layer concentration:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` still mixes agent loop, provider routing, browser plan selection, tool lifecycle, mutation routing, permission projection, runtime outcome, and result handoff.
- `packages/ts-shell/src/session/SessionManager.ts` still mixes persistence, session selection, replay, continuity, compact, approval memory, and reentry summaries.
- `packages/ts-shell/src/entrypoints/cli.tsx` still mixes entry parsing, approval bridge, MCP control surface, session commands, runtime context, and invocation.
- `scripts/verify-real-user-capabilities.mjs` still mixes many verifier families and readiness claims.

The next-stage architecture should consolidate by capability lifecycle, not by moving folders around.

## Proposed Module Map

1. Agent Loop Engineering
2. Tool Engineering
3. Runtime Engineering
4. Context Engineering
5. Memory Engineering
6. Harness Engineering
7. Eval / Benchmark Engineering
8. Permission / Policy Engineering
9. Result Surface Engineering
10. Session / Continue Engineering
11. Provider / Model Engineering
12. CLI / UX Engineering
13. Workspace / File Context Engineering
14. Edit / Patch Engineering
15. Browser Engineering
16. Capability Contract Architecture

## Module Dependency Graph

```text
CLI / UX
  -> Session / Continue
  -> Agent Loop
  -> Result Surface

Agent Loop
  -> Provider / Model
  -> Tool Engineering
  -> Context Engineering
  -> Permission / Policy
  -> Edit / Patch
  -> Browser Engineering
  -> Runtime Engineering
  -> Result Surface

Tool Engineering
  -> Permission / Policy
  -> Runtime Engineering
  -> MCP adapter
  -> Workspace / File Context
  -> Browser Engineering

Edit / Patch
  -> Workspace / File Context
  -> Permission / Policy
  -> Result Surface
  -> Session / Continue

Browser Engineering
  -> Runtime Engineering
  -> Permission / Policy
  -> Context Engineering
  -> Eval / Benchmark
  -> Result Surface

Session / Continue
  -> Memory Engineering
  -> Result Surface
  -> Capability Contract

Harness Engineering
  -> Eval / Benchmark
  -> Capability Contract
  -> all capability modules through public/runtime entrypoints
```

Rule: dependencies should point from orchestration to capability contracts, not from capability internals back into CLI/session rendering.

## Per-Module Ownership

### 1. Agent Loop Engineering

Purpose: own turn progression, capability selection, provider/tool iteration, and high-level stop/continue decisions.

Responsibilities:

- Query/turn loop.
- Model response interpretation at orchestration level.
- Capability route selection.
- Continuation target selection.
- Handoff to result mapping.

Non-responsibilities:

- Low-level file writes.
- Terminal rendering.
- Session persistence details.
- Provider credential loading.
- Browser DOM mechanics.

Current files:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/workflowIntentProjection.ts`
- `packages/ts-shell/src/orchestration/workflowTaskPlanner.ts`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`
- `packages/ts-shell/src/core/query/*`
- `packages/ts-shell/src/orchestration/types.ts`

Current strengths:

- Main flow can reach provider, tools, mutation, browser, result mapping, and session handoff.
- Several projections have already been extracted.

Current drift:

- `runMvpIntegratedFlow.ts` remains a cross-layer concentration point.
- Browser routing, mutation routing, provider outcome, approval, and result lineage are still wired in one file.

Reference patterns:

- ClaudeCode `query.ts` shows a mature but large query loop.
- opencode `session/processor.ts` composes services and snapshots.
- mini-swe-agent keeps the loop visibly simple.

Adopt/adapt/reject:

- Adopt explicit service/capability projections.
- Adapt mini-swe-agent clarity without losing safety.
- Reject making one loop file the long-term owner of policy/result/session semantics.

Innovation opportunity:

- Keep a small "turn kernel" and make capability lifecycle projections the extension seam.

Next routes:

- Route 132: Agent loop responsibility ledger and no-behavior extraction boundary.
- Route 137: Tool lifecycle event contract alignment.

### 2. Tool Engineering

Purpose: own tool registry, tool contracts, execution context, execution provenance, tool result metadata, and MCP/tool adapter boundaries.

Responsibilities:

- Tool definitions and schemas.
- Tool permission hooks.
- Tool execution context.
- Tool result/provenance projection.
- MCP tool descriptor integration.

Non-responsibilities:

- Session persistence.
- CLI rendering of full results.
- Mutation policy beyond tool-level metadata.

Current files:

- `packages/ts-shell/src/core/tools/registry.ts`
- `packages/ts-shell/src/core/tools/toolLifecycleProjection.ts`
- `packages/ts-shell/src/core/tools/toolExecutionProvenance.ts`
- `packages/ts-shell/src/core/tools/toolResultLifecycle.ts`
- `packages/ts-shell/src/tools/*`
- `packages/ts-shell/src/core/mcp/*`

Current strengths:

- Tool lifecycle projection distinguishes approval denied, unavailable tool, MCP unavailable, MCP isError, protocol/process failure, permission blocked, and environment blocked.
- Registry integrates local, daemon, MCP, and browser tools.

Current drift:

- Some registry responsibilities mix local command execution, daemon selection, MCP metadata, and browser definitions.

Reference patterns:

- opencode `tool/tool.ts` has a strong typed execution context.
- ClaudeCode per-tool folders include UI/result summaries.
- Inspect AI tool and approval modules separate transcript event types.

Next routes:

- Route 137: Tool lifecycle contract and registry ownership split.
- Route 140: MCP local/external readiness claim split.

### 3. Runtime Engineering

Purpose: own process execution, daemon/local execution, browser runtime availability, cancellation, timeouts, sandbox preflight, and cleanup receipts.

Responsibilities:

- Rust daemon/local command execution.
- Browser runtime loading and lifecycle.
- Timeout/cancel semantics.
- Process/sandbox preflight.
- Cleanup status.

Non-responsibilities:

- Prompt planning.
- Result surface text.
- Session replay semantics.

Current files:

- `packages/ts-shell/src/daemon/*`
- `packages/ts-shell/src/sandbox/*`
- `packages/ts-shell/src/core/context/pwRuntime.ts`
- `packages/ts-shell/src/core/context/browserRuntime*.ts`
- `packages/rust-core/src/*`
- `contracts/*`

Current strengths:

- TS/Rust split is documented in `AGENTS.md`.
- Browser runtime status and deterministic browser gates exist.

Current drift:

- Runtime status sometimes enters orchestration through feature-specific paths rather than one runtime contract.

Reference patterns:

- opencode pty/snapshot services.
- OpenHands sandbox/conversation lifecycle.
- mini-swe-agent environment abstraction.

Next routes:

- Route 138: Runtime receipt contract for shell and browser.

### 4. Context Engineering

Purpose: own prompt/context assembly, workspace context, browser context, project memory injection planning, and future-turn context injection.

Responsibilities:

- Prompt context assembly.
- Browser snapshot/context summaries.
- Project memory/future-turn injection.
- File/read context packaging.
- Context budget hints.

Non-responsibilities:

- Durable session storage.
- Tool execution.
- Eval scoring.

Current files:

- `packages/ts-shell/src/core/context/*`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts` future-turn injection hooks
- `packages/ts-shell/src/orchestration/targetResolution.ts`
- `packages/ts-shell/src/orchestration/fileConstraintAssertions.ts`

Current strengths:

- Browser context is rich: accessibility snapshots, action cache, capability surface, evidence bundles, transaction plan/execution.
- Future-turn memory injection has explicit planners.

Current drift:

- Browser context, browser runtime, browser policy, browser agent planning, and browser harness concepts are intermingled under `core/context`.

Reference patterns:

- gemini-cli prompt processors.
- ClaudeCode attachments/context/compact.
- Stagehand browser snapshot context.

Next routes:

- Route 139: Context ownership taxonomy and browser-context sub-boundaries.

### 5. Memory Engineering

Purpose: own project memory, compact memory, future-turn retained facts, and memory store contracts.

Responsibilities:

- Memory store contract.
- Project memory injection state.
- Compact live checkpoints.
- Retained/injected memory facts.

Non-responsibilities:

- Session directory persistence itself.
- General result rendering.

Current files:

- `packages/ts-shell/src/core/context/projectMemory*.ts`
- `packages/ts-shell/src/core/context/compact*.ts`
- `packages/ts-shell/src/core/commands/memoryCommandRuntime.ts`
- `packages/ts-shell/src/session/compact*.ts`

Current strengths:

- Memory injection and compact injection are explicit surfaces.

Current drift:

- Memory and session/compact responsibilities overlap and need clearer handoff contracts.

Reference patterns:

- ClaudeCode SessionMemory and compact services.
- gemini-cli memory service.
- Inspect AI store/state events.

Next routes:

- Route 143: Memory-to-session handoff contract.

### 6. Harness Engineering

Purpose: own deterministic scenario execution, fixtures, smoke runners, CLI harnesses, and verification plumbing.

Responsibilities:

- Scenario fixtures and runners.
- CLI harness.
- Real-provider dry-run/default-skip safety.
- Dirty repo/audit cleanup guards.
- Gate composition wrappers.

Non-responsibilities:

- Product runtime behavior.
- Capability claim policy unless it is verifying explicit policy.

Current files:

- `packages/ts-shell/src/core/harness/*`
- `packages/ts-shell/src/test-utils/*`
- `scripts/verify-*.mjs`
- `scripts/real-user-capabilities/*`
- `scripts/support/*`

Current strengths:

- Deterministic release meta gate, browser transaction gate, MCP local/error taxonomy gates, session durability gate, real-user capability suites.

Current drift:

- `scripts/verify-real-user-capabilities.mjs` is too large and mixes many route families.
- Some gates are readiness claim aggregators and scenario runners at the same time.

Reference patterns:

- Inspect AI task/solver/scorer/log.
- Stagehand evals.
- mini-swe-agent benchmark runners.

Next routes:

- Route 135: Decompose real-user capability verifier.
- Route 142: Gate taxonomy and ownership manifest.

### 7. Eval / Benchmark Engineering

Purpose: own scoring, benchmark definitions, pass/fail/skip semantics, reports, and release evidence.

Responsibilities:

- Eval task definitions.
- Scorers.
- Reports.
- Gate-level output markers.
- Release evidence composition.

Non-responsibilities:

- Runtime execution policy.
- CLI UX behavior.

Current files:

- `packages/ts-shell/src/core/harness/browserTxnEval.ts`
- `packages/ts-shell/src/core/harness/browserEvalBenchmark*.ts`
- `scripts/verify-release-deterministic.mjs`
- `scripts/verify-release-core.mjs`

Current strengths:

- Browser eval gate validates trace, cleanup, redaction, score status.
- Release deterministic gate asserts output contracts, not only exit codes.

Current drift:

- Eval/report/gate scripts are not yet consistently separated from scenario execution.

Reference patterns:

- Inspect AI scorer/log/view.
- Stagehand eval package.

Next routes:

- Route 144: Eval report schema for capability gates.

### 8. Permission / Policy Engineering

Purpose: own trust boundaries, approval ask/reply semantics, allowlists, workspace policy, provider opt-in, MCP policy, browser policy, and denial provenance.

Responsibilities:

- Approval prompts and decisions.
- Permission memory.
- Workspace authority.
- Provider real-home boundary.
- Browser local/public/external policy.
- MCP unavailable/rejection taxonomy.

Non-responsibilities:

- Low-level write application.
- Terminal rendering beyond policy projection.

Current files:

- `packages/ts-shell/src/entrypoints/approvalPromptBridge.ts`
- `packages/ts-shell/src/core/shell/approvalTrustPolicy.ts`
- `packages/ts-shell/src/session/approval*.ts`
- `packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/core/context/browser*Policy*.ts`
- `packages/ts-shell/src/core/mcp/errorTaxonomy.ts`

Current strengths:

- Approval and tool execution provenance are distinguishable.
- Workspace authority refuses symlink/outside/missing/descriptor violations.
- MCP failure taxonomy redacts private provider paths and secrets.

Current drift:

- Approval UX and CLI bridging still sit close to `cli.tsx`.
- Policy surfaces exist by capability but no single policy contract exists.

Reference patterns:

- opencode permission request/reply/events.
- ClaudeCode filesystem permission checks.
- Inspect AI approval policies.

Next routes:

- Route 136: Permission/policy contract inventory.

### 9. Result Surface Engineering

Purpose: own truthful terminal/session/user-visible surfaces, result mapping, DoNext guidance, changed/failed/planned files, and stopped/error/success classification.

Responsibilities:

- Terminal classification.
- User-readable summaries.
- Session state surface.
- Result mapping from capability outcomes.
- Recovery guidance.

Non-responsibilities:

- Execution.
- Permission decisions.
- Persistence implementation.

Current files:

- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionStateSurface.ts`
- `packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts`
- `packages/ts-shell/src/orchestration/providerOutcomeProjection.ts`
- `packages/ts-shell/src/orchestration/doNextProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/*Result*.ts`

Current strengths:

- Truthful terminal mapping prevents many false success cases.
- Session state renders durable status and recoverability.

Current drift:

- Result projections live across query, shell, orchestration, patch result, and browser evidence.

Reference patterns:

- ClaudeCode per-tool UI/result surfaces.
- opencode projectors/message parts.
- Inspect AI logs/view reports.

Next routes:

- Route 141: Result surface ownership table and duplicate result fields cleanup.

### 10. Session / Continue Engineering

Purpose: own durable sessions, current session selection, project binding, transcript, replay, compact continuity, stopped continuation, permission memory, and recovery snapshots.

Responsibilities:

- Session metadata/transcript/state.
- Current session selection.
- Project binding and rebasing.
- Prompt barriers.
- Replay plans.
- Compact continuity summaries.
- Stopped/error next-turn context.

Non-responsibilities:

- Capability-specific execution.
- Provider credential loading.
- CLI command parsing.

Current files:

- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/session/currentSessionSelection.ts`
- `packages/ts-shell/src/session/sessionReplayBuilder.ts`
- `packages/ts-shell/src/session/stoppedSessionContinuity.ts`
- `packages/ts-shell/src/session/compactContinuitySummary.ts`
- `packages/ts-shell/src/session/actionableFailureContinuity.ts`
- `packages/ts-shell/src/core/shell/continueShellActionRuntime.ts`

Current strengths:

- Directory-based session substrate exists.
- Stopped session, compact, planned files, mutation continuity, long durability all have focused tests/gates.

Current drift:

- `SessionManager.ts` remains too large and owns too many projection concerns.

Reference patterns:

- opencode session/compaction/revert.
- OpenHands conversation/event service split.
- ClaudeCode session restore/compact.

Next routes:

- Route 134: SessionManager codec/projection extraction map.

### 11. Provider / Model Engineering

Purpose: own provider identity, auth/config readiness, model adapter boundaries, real-provider opt-in, network/auth/config classification, and provider outcome projection.

Responsibilities:

- Runtime config.
- Credential resolution.
- Provider readiness taxonomy.
- Model adapters.
- Provider outcome projection.
- Real-provider gate isolation/redaction.

Non-responsibilities:

- Tool execution.
- Session persistence.
- General CLI UX except command surface.

Current files:

- `packages/ts-shell/src/config/runtimeConfig.ts`
- `packages/ts-shell/src/core/auth/*`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/core/shell/providerCredentials.ts`
- `packages/ts-shell/src/model-adapters/*`
- `packages/ts-shell/src/orchestration/providerOutcomeProjection.ts`
- `scripts/verify-provider-readiness.mjs`
- `scripts/verify-real-provider-readiness-smoke.mjs`

Current strengths:

- Readiness taxonomy distinguishes missing config, auth, unsupported provider, network-like failure, default skip/opt-in.

Current drift:

- Provider readiness is partly script-driven and partly shell/runtime-driven.

Reference patterns:

- opencode provider service/auth.
- gemini-cli core provider/MCP auth split.
- Stagehand LLM clients/providers.

Next routes:

- Route 145: Provider readiness contract and script/runtime parity.

### 12. CLI / UX Engineering

Purpose: own entrypoint parsing, transport modes, slash commands, interactive/print/stdin parity, command surfaces, and terminal UX wiring.

Responsibilities:

- CLI args and transport.
- Slash command routing.
- Interactive loop.
- Print/stdin mode.
- Approval prompt bridge UI.
- Session command UI.
- MCP command UI.

Non-responsibilities:

- Query loop behavior.
- Session persistence internals.
- Provider credential storage.
- Write policy.

Current files:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/entrypoints/cliArgs.ts`
- `packages/ts-shell/src/entrypoints/cliModeDispatch.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts`
- `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- `packages/ts-shell/src/core/commands/*`
- `packages/ts-shell/src/cli-baseline.test.ts`

Current strengths:

- CLI modes have dedicated runners and baseline coverage.

Current drift:

- `cli.tsx` still imports and wires too many surfaces.

Reference patterns:

- gemini-cli CLI/core split and prompt processors.
- ClaudeCode commands and Ink rendering.

Next routes:

- Route 133: CLI entrypoint responsibility ledger and command-surface extraction boundary.

### 13. Workspace / File Context Engineering

Purpose: own workspace root binding, target path resolution, file context, file constraints, read/write authority facts, and stale-read inputs.

Responsibilities:

- Workspace binding.
- Target resolution.
- File constraints.
- Safe path normalization.
- Read verified file.
- Workspace authority facts.

Non-responsibilities:

- Patch application algorithm.
- Terminal result rendering.

Current files:

- `packages/ts-shell/src/session/projectBindingPolicy.ts`
- `packages/ts-shell/src/session/projectRootRebaseProjection.ts`
- `packages/ts-shell/src/orchestration/targetResolution.ts`
- `packages/ts-shell/src/orchestration/fileConstraintAssertions.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/core/paths/*`

Current strengths:

- Selected workspace authority is explicit and defensive.

Current drift:

- Workspace authority is strongly tied to patch result today; file context should become broader than writes.

Reference patterns:

- opencode file/protected/ripgrep.
- ClaudeCode file read/edit utilities.
- gemini-cli `@file` prompt processors.

Next routes:

- Route 136 or 138: workspace/file context contract consolidation.

### 14. Edit / Patch Engineering

Purpose: own edit capability shape, patch parsing/classification, bounded write lanes, stale-read verification, post-write verification, no-partial apply, unsupported patch stopped results, and mutation recovery evidence.

Responsibilities:

- Single/multi-file bounded patch shape.
- Add/update/delete/move route contracts where supported.
- No-write planning.
- Stale-read/post-write verification.
- Partial/unverified failure.
- Mutation continuity evidence.

Non-responsibilities:

- General session persistence.
- General CLI parsing.
- Provider auth.

Current files:

- `packages/ts-shell/src/orchestration/patchMutationLane.ts`
- `packages/ts-shell/src/orchestration/mutationExecution.ts`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`
- `packages/ts-shell/src/orchestration/patchApplication/*`
- `packages/ts-shell/src/orchestration/patchResult/*`
- `scripts/verify-real-user-capabilities.mjs`
- `scripts/real-user-capabilities/*`

Current strengths:

- Bounded edit safety is much stronger than general capability.
- Workspace authority, no-partial apply, supported/unsupported shape classification, and candidate mutation gates exist.

Current drift:

- Patch capability status is spread across runtime modules, result modules, scripts, and route docs.
- Verifier script size is now a module debt.

Reference patterns:

- opencode broad patch parser/snapshot/revert.
- ClaudeCode file edit read-first/stale/diff/UI.

Next routes:

- Route 135: Verifier decomposition.
- Route 146 candidate: edit capability manifest and ownership cleanup.

### 15. Browser Engineering

Purpose: own browser observe/act/extract, browser transaction planning/execution, browser runtime adapter, browser cache, browser evidence, browser repair, and browser eval.

Responsibilities:

- Browser capability model.
- Browser action target/snapshot.
- Browser tool policy.
- Browser transaction planning/execution/report.
- Browser cache and replay.
- Browser eval gate.
- Browser redaction/cleanup.

Non-responsibilities:

- General session persistence.
- General provider readiness.
- External MCP readiness claims.

Current files:

- `packages/ts-shell/src/core/context/browser*.ts`
- `packages/ts-shell/src/core/context/pw*.ts`
- `packages/ts-shell/src/core/harness/browser*.ts`
- ~~`scripts/verify-browser-txn-gate.mjs`~~ (removed 2026-09-17)
- `docs/agent-routes/route100-130*.md`

Current strengths:

- Browser runtime, transaction, action loop, cache, public-readonly, controlled-network, and eval gates have been built route by route.

Current drift:

- Browser files currently live in `core/context` even when they own runtime, policy, evidence, harness, and eval concepts.

Reference patterns:

- Stagehand observe/act/extract and browser cache/evals.
- Playwright MCP snapshot/tool contract.
- gemini-cli browser MCP wrapper.

Next routes:

- Route 132 or 139: Browser module internal atlas.

### 16. Capability Contract Architecture

Purpose: own the cross-capability lifecycle vocabulary and acceptance standard.

Responsibilities:

- Standard stage vocabulary.
- Required evidence fields.
- Redaction and cleanup expectations.
- Result/session/eval handoff requirements.
- Module route template.

Non-responsibilities:

- Implementing a capability.
- Owning capability-specific policy.

Current files:

- `docs/architecture/capability-contract.md`
- `docs/agent-routes/module-route-template.md`
- `docs/architecture/module-atlas.md`
- `docs/architecture/reference-module-matrix.md`

Current strengths:

- Route 131 creates the first unified architecture language.

Current drift:

- Before Route 131, capability contracts were mostly route-specific.

Reference patterns:

- Inspect AI event/log/scorer contracts.
- opencode schemas/services.
- MCP tool schemas.

Next routes:

- Route 132: Adopt this template for the next architecture hardening route.

## Capability Flow Maps

### Browser Transaction

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Runtime + Browser | `pwRuntime.ts`, browser runtime status | unify runtime receipt vocabulary |
| policy | Browser + Policy | browser tool/execution/network policy files | keep public/external claims separate |
| planning | Browser | `browserAgent.ts`, `browserPlan.ts` | browser planner should not live in agent loop |
| execution | Browser + Runtime | `browserTxn.ts`, adapters | emit generic capability receipt |
| observation | Browser | accessibility/DOM snapshot files | preserve redaction |
| evidence | Browser | `browserTxnEvidence.ts`, `browserTrace.ts` | keep trace/report safe |
| result mapping | Result Surface | currently via orchestration projections | browser-owned projection first |
| transcript | Session | session runtime/continuity | preserve browser evidence without raw DOM |
| eval/report | Eval + Harness | `browserTxnEval.ts`, benchmark/report files | separate scenario execution from scoring |
| cleanup/redaction | Browser + Harness | cleanup/redaction evidence files | keep cleanup status required |

### Edit / Patch

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Edit / Patch | bounded candidate classifiers | capability manifest needed |
| policy | Policy + Workspace | workspace authority, permission UX contracts | unify workspace/file context module |
| planning | Edit / Patch | no-write runtime route, multi-file planning result | keep plannedFiles distinct |
| execution | Edit / Patch | patchApplication files | no rollback/atomicity claim |
| observation | Workspace | read verified file, stale checks | make stale-read contract explicit |
| evidence | Edit / Patch | patchResult projections | central manifest could reduce duplication |
| result mapping | Result Surface | resultMapper/runtime projections | no false success is strong |
| transcript | Session | mutation continuity/compact tests | preserve stopped context |
| eval/report | Harness/Eval | real-user capability verifier | verifier decomposition needed |
| cleanup/redaction | Harness | fixture cleanup and redaction helpers | script responsibilities too concentrated |

### Shell Command

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Runtime | daemon availability/client | one runtime receipt contract |
| policy | Policy | sandbox, allowlist, process permission | command intent/policy separation |
| planning | Agent Loop | command detection/projections | avoid prompt text as authorization |
| execution | Tool + Runtime | registry local/daemon execution | separate registry from execution implementations |
| observation | Tool | stdout/stderr/status | truncation/evidence contract |
| result mapping | Result Surface | shell result assembly | unify with tool lifecycle |
| transcript | Session | session runtime events | command failure continuity |

### File Read / Workspace Context

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Workspace/File Context | project binding, target resolution | root binding must be first-class |
| policy | Policy | path/workspace permission | read vs write authority split |
| planning | Workspace/File Context | target resolution/file constraints | file context module missing |
| execution | Tool | read/list/search tools | registry should not own context policy |
| evidence | Context | file assertions/read evidence | stale evidence shape consistency |
| transcript | Session | replay/context builders | avoid stale context overclaim |

### Memory / Continuation

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Memory + Session | memory stores/checkpoint stores | memory readiness status |
| policy | Policy + Session | permission memory/project binding | retention policy |
| planning | Memory | compact retention/future-turn planners | shared lifecycle contract |
| execution | Session | SessionManager state/transcript writes | split codecs/projections |
| observation | Session | reentry summaries/snapshots | long real-provider continuity unknown |
| evidence | Session | continuity summaries | source labels for compact facts |
| result mapping | Result Surface | session state surface | keep planned vs changed |

### Provider / Model Call

| Stage | Owner | Current Files | Gap / Opportunity |
|---|---|---|---|
| availability | Provider / Model | provider readiness/credentials | runtime/script parity |
| policy | Policy | real-provider opt-in boundary | never default real execution |
| planning | Provider / Model | runtime config/model adapter | explicit provider identity |
| execution | Provider / Model | adapters/provider call path | provider outcome receipt |
| observation | Agent Loop | model response/tool calls | model-output failure taxonomy |
| evidence | Provider | readiness scripts/projections | no secret-bearing logs |
| result mapping | Result Surface | provider outcome projection | config/network/model-output split |

## Current File-to-Module Ownership Table

Representative current files and families:

| File | Primary module | Secondary modules | Role | Drift risk | Future action |
|---|---|---|---|---|---|
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` | Agent Loop Engineering | Tool, Provider, Browser, Edit, Policy, Result, Session | integrated turn/orchestration flow | cross-layer concentration, oversized | ledger first; extract only clear projections |
| `packages/ts-shell/src/session/SessionManager.ts` | Session / Continue Engineering | Memory, Policy, Result | directory session substrate, replay, continuity, reentry | cross-layer concentration, oversized | extract codecs/projections only |
| `packages/ts-shell/src/entrypoints/cli.tsx` | CLI / UX Engineering | Session, Policy, MCP, Provider, Result | CLI entry and wiring | cross-layer concentration, oversized | keep thinning entrypoint by command/runtime bridges |
| `scripts/verify-real-user-capabilities.mjs` | Harness Engineering | Edit, Provider, Release, CLI, Result | large real-user capability verifier | oversized, route-specific residue | behavior-preserving decomposition |
| `packages/ts-shell/src/core/query/resultMapper.ts` | Result Surface Engineering | Agent Loop, Edit | truthful terminal projection | shared contract | keep generic; feed feature projections in |
| `packages/ts-shell/src/core/shell/sessionRuntime.ts` | Result Surface Engineering | Session, Memory, Agent Loop | terminal runtime execution surface and future-turn injection | cross-layer concentration | clarify display vs session mutation |
| `packages/ts-shell/src/core/shell/sessionStateSurface.ts` | Result Surface Engineering | Session | session list/current/continue display | single-module | keep |
| `packages/ts-shell/src/core/shell/providerReadiness.ts` | Provider / Model Engineering | Result, CLI | provider readiness classification | shared contract | keep parity with scripts |
| `packages/ts-shell/src/core/tools/registry.ts` | Tool Engineering | Runtime, MCP, Browser, Policy | tool registry and execution | cross-layer concentration | split registry from implementations later |
| `packages/ts-shell/src/core/tools/toolLifecycleProjection.ts` | Tool Engineering | Result, Policy, MCP | tool result provenance projection | shared contract | keep central |
| `packages/ts-shell/src/core/mcp/errorTaxonomy.ts` | Tool Engineering | Policy, Result | MCP failure taxonomy/redaction | shared contract | keep local/external claims distinct |
| `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts` | Edit / Patch Engineering | Agent Loop, Workspace, Result | apply_patch route selection | cross-layer but purposeful | keep routing-only |
| `packages/ts-shell/src/orchestration/patchMutationLane.ts` | Edit / Patch Engineering | Workspace | single-file replace lane | single-module | preserve bounded semantics |
| `packages/ts-shell/src/orchestration/patchApplication/*` | Edit / Patch Engineering | Workspace | low-level patch application | single-module | do not add result rendering here |
| `packages/ts-shell/src/orchestration/patchResult/*` | Edit / Patch Engineering | Policy, Result, Session | route contracts/results/readiness | many small route files | consolidate manifest carefully |
| `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts` | Workspace / File Context Engineering | Policy, Edit | safe write/create/move/delete authority | shared contract | may move conceptually to workspace module |
| `packages/ts-shell/src/orchestration/mutationExecution.ts` | Edit / Patch Engineering | Agent Loop, Result | mutation execution branch | cross-layer | keep execution, project result out |
| `packages/ts-shell/src/core/context/browserTxn.ts` | Browser Engineering | Runtime, Policy, Evidence | browser transaction execution | cross-layer within browser | split later by txn lifecycle |
| `packages/ts-shell/src/core/context/browserAgent.ts` | Browser Engineering | Agent Loop, Context | prompt-to-browser action/txn detection | cross-layer | isolate browser planner |
| `packages/ts-shell/src/core/harness/browserTxnEval.ts` | Eval / Benchmark Engineering | Browser, Harness | browser transaction golden eval | good boundary | keep |
| `packages/ts-shell/src/core/harness/browserEvalBenchmarkRunner.ts` | Eval / Benchmark Engineering | Browser, Harness | browser benchmark runner | good boundary | keep |
| `packages/ts-shell/src/core/context/browserActionCache.ts` | Browser Engineering | Memory | browser action cache | single-module | keep |
| `packages/ts-shell/src/core/context/projectMemoryStoreContract.ts` | Memory Engineering | Context | memory store contract | shared contract | keep |
| `packages/ts-shell/src/core/context/projectMemoryFutureTurnInjection.ts` | Memory Engineering | Session, Context | future-turn memory injection planning | shared contract | define lifecycle stage |
| `packages/ts-shell/src/session/compactContinuitySummary.ts` | Session / Continue Engineering | Memory, Result | compact continuity summary builder | good extraction | keep |
| `packages/ts-shell/src/session/stoppedSessionContinuity.ts` | Session / Continue Engineering | Result, Edit | stopped-session continuity projection | good extraction | keep |
| `packages/ts-shell/src/session/currentSessionSelection.ts` | Session / Continue Engineering | CLI | active/current session selection | single-module | keep |
| `packages/ts-shell/src/core/commands/slashRouter.ts` | CLI / UX Engineering | Session, Commands | slash routing | single-module | keep command semantics out of cli.tsx |
| `packages/ts-shell/src/core/commands/browserCommandRuntime.ts` | CLI / UX Engineering | Browser | `/browser` command runtime | shared CLI/capability bridge | keep |
| `packages/ts-shell/src/model-adapters/providers/openai/OpenAIModelAdapter.ts` | Provider / Model Engineering | Agent Loop | provider adapter | single-module | keep provider details here |
| `scripts/verify-release-deterministic.mjs` | Eval / Benchmark Engineering | Harness, Provider, Release | deterministic release meta gate | good marker contract | keep output assertions |
| `scripts/verify-mcp-local-execution.mjs` | Harness Engineering | Tool, MCP | local MCP execution verifier | local-only claim | avoid external overclaim |
| ~~`scripts/verify-browser-txn-gate.mjs`~~ | Eval / Benchmark Engineering | Browser, Harness | removed 2026-09-17; guarded a deleted chain | — | — |

## Cross-Cutting Contracts

- Terminal classification: success/stopped/error.
- File mutation effect: changedFiles, failedFiles, plannedFiles.
- Tool lifecycle: approval, unavailable, execution failed, MCP classes.
- Provider readiness: config/auth/network/provider/model.
- Workspace authority: path, realpath, symlink, descriptor.
- Browser evidence: trace id, cleanup, redaction, observation/action.
- Session continuity: prompt barrier, compact summary, replay seed, project binding.
- Gate evidence: output markers, dry-run, opt-in, dirty repo, redaction, residue.

## Current Architecture Drift

1. Agent loop owns too much wiring.
2. SessionManager owns too many codecs/projections.
3. CLI entrypoint remains broad.
4. Real-user capability verifier is too large and mixes claim families.
5. Browser module is conceptually strong but physically mixed under context/harness.
6. Workspace/File Context exists mainly as edit safety, not general file context.
7. Eval/gate ownership is inconsistent across scripts.
8. Capability contract vocabulary is new and not yet enforced by route templates.

## What Reference Projects Teach

- ClaudeCode: a powerful product loop still benefits from tool-specific ownership and compact/session services.
- opencode: permission, tool, provider, patch, snapshot, and session should be separate services/contracts.
- OpenHands: event/conversation separation is useful for durable products.
- Stagehand: browser capability should be observe/act/extract plus snapshot/evidence.
- Playwright MCP: browser MCP is an adapter, not an agent architecture.
- Inspect AI: eval/report must be first-class and separate from runtime behavior.
- mini-swe-agent: loop clarity matters; collapsed modules only work at small scope.
- gemini-cli: CLI/core split and prompt processors are strong boundaries.

## Project-Specific Architecture Innovation

This project can combine:

- bounded edit safety from its route history
- truthful result/session surfaces
- deterministic and opt-in verification gates
- browser transaction/eval evidence
- TS product runtime/control plane and Rust native executor candidate

The innovation should be a capability lifecycle architecture where every capability is independently testable and produces reusable evidence for result, session, and eval surfaces.

## Recommended Development Order

1. Decompose oversized verifier scripts before adding more scenarios.
2. Create module ownership ledgers for `runMvpIntegratedFlow.ts`, `SessionManager.ts`, and `cli.tsx`.
3. Define runtime receipt contracts for shell/browser/tool execution.
4. Unify workspace/file context beyond edit-only usage.
5. Split browser module responsibilities internally without moving general session/policy into browser.
6. Align provider readiness scripts and runtime surfaces.
7. Introduce gate/eval report schemas.
8. Only then consider broader mutation capability and snapshot/revert.

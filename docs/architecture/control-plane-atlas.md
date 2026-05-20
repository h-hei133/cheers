# Control-Plane Atlas

Route: `docs/agent-routes/route136-control-plane-atlas.md`

## Scope

This atlas consolidates the Route 131 module map and the Route 136 ledgers into
one control-plane view. It is based on current code first, with Route 131/135
documents and a bounded reference scan used only to calibrate responsibility
boundaries.

Hard boundaries for this route:

- no behavior, schema, provider/model, browser, edit, dependency, or CLI UX
  changes
- no real-provider live call
- no broad `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or `cli.tsx`
  refactor
- projection-only extraction is allowed only when the rule is already pure and
  directly covered

## Reference Scan

Bounded reference files inspected for control-plane shape:

- ClaudeCode: `query.ts`
- opencode: `session/processor.ts`, `tool/tool.ts`, `permission/index.ts`
- OpenHands: `openhands/app_server/event/README.md`
- gemini-cli: `packages/cli/src/gemini.tsx`
- Inspect AI: `src/inspect_ai/event/_event.py`, `src/inspect_ai/event/_score.py`
- mini-swe-agent: `src/minisweagent/agents/default.py`

The references agree on the same pressure: a central loop can compose the turn,
but tool execution context, permission request/reply, session transcript,
result/scoring events, and CLI bootstrapping should be named boundaries. No
reference implementation code is copied.

## Control-Plane Flow

```text
CLI / UX
  -> session bootstrap and active-session selection
  -> approval bridge and non-interactive policy surface
  -> ShellSessionRuntime
  -> runMvpIntegratedFlow
  -> QueryEvent transcript
  -> resultMapper truthfulness projection
  -> SessionManager persistence / continue / replay
  -> sessionStateSurface / terminal output
```

The durable flow is already split across files, but the large files still carry
too many cross-layer decisions:

- `packages/ts-shell/src/entrypoints/cli.tsx`: argument/mode dispatch,
  approval bridge, session commands, workspace binding, provider snapshot, and
  runtime invocation.
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`: query event rendering,
  terminal accumulation, future-turn injection, and session persistence calls.
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: prompt
  classification, capability planning, browser/edit/tool/provider dispatch,
  policy handoff, result construction, and evidence notes.
- `packages/ts-shell/src/core/query/resultMapper.ts`: terminal truthfulness and
  actionable stopped/error mapping.
- `packages/ts-shell/src/session/SessionManager.ts`: directory persistence,
  transcript/state snapshots, compact/replay, approval memory, continuity, and
  CLI-facing reentry summaries.

## Responsibility Modules

### Agent Loop

Current owners:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/workflowTaskPlanner.ts`
- `packages/ts-shell/src/orchestration/workflowIntentProjection.ts`
- `packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts`
- `packages/ts-shell/src/core/query/*`

Mixed responsibilities:

- planning and dispatch are still coupled to browser, edit, provider, tool, and
  result construction in the main loop
- continuation diagnostics and provider outcome projection feed back into
  planning
- fallback paths build user-facing text and result fields close to execution

Lifecycle coverage:

- availability: partial through runtime/provider/browser checks
- policy: delegated to tool, approval, workspace, and browser policy modules
- planning: present, but large and dispersed
- execution/evidence/result: present, but result construction is still close to
  capability branches
- transcript/continue: handed off through `QueryEvent` and continuity state

Missing boundary:

- a small turn kernel that only composes planning, capability execution
  receipts, and generic result projection

Safe extraction candidates:

- provider diagnostic handoff projector
- mutation target selection projector
- read-window continuation projector
- generic capability-result-to-coding-summary projector

Unsafe areas:

- moving provider execution/auth, workspace write authority, browser execution,
  or mutation semantics out of the loop without a dedicated route

### Tool

Current owners:

- `packages/ts-shell/src/core/tools/registry.ts`
- `packages/ts-shell/src/core/tools/toolLifecycleProjection.ts`
- `packages/ts-shell/src/core/tools/toolExecutionProvenance.ts`
- `packages/ts-shell/src/tools/*`
- `packages/ts-shell/src/core/mcp/*`

Mixed responsibilities:

- registry composition still spans local, daemon, MCP, and browser tools
- tool lifecycle facts are projected separately, but the main loop still
  decides how some tool failures become coding results

Lifecycle coverage:

- execution and provenance are explicit
- MCP unavailable/protocol/process/tool-is-error classes are distinct
- permission/approval facts are projected into tool lifecycle

Missing boundary:

- one tool-result contract consumed by result/session projections without
  capability-specific interpretation in the agent loop

Safe extraction candidates:

- tool lifecycle to capability lifecycle row projector
- safe MCP detail projector

Unsafe areas:

- broad registry or MCP behavior changes during an atlas route

### Permission / Policy

Current owners:

- `packages/ts-shell/src/core/shell/approvalTrustPolicy.ts`
- `packages/ts-shell/src/entrypoints/approvalPromptBridge.ts`
- `packages/ts-shell/src/core/tools/approvalFlow.ts`
- `packages/ts-shell/src/core/tools/permissionContext.ts`
- `packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts`
- `packages/ts-shell/src/core/context/browser*Policy.ts`

Mixed responsibilities:

- CLI owns approval prompting and some non-interactive decision projection
- session owns approval memory persistence and continuity
- write/browser/MCP policies are capability-specific, while result mapping owns
  terminal truthfulness after blocks

Lifecycle coverage:

- approval ask/deny/allow-once/allow-always are represented
- workspace write authority is explicit for guarded patch routes
- browser runtime and network policy are explicit and opt-in
- provider live behavior remains opt-in through readiness/runtime gates

Missing boundary:

- a policy outcome vocabulary shared by approval, workspace, browser, MCP,
  command allowlist, and provider opt-in surfaces

Safe extraction candidates:

- policy reason normalizer
- approval audit projector surfaces

Unsafe areas:

- inferring write authorization from prompt text
- changing provider opt-in or default gates

### Runtime

Current owners:

- `packages/ts-shell/src/daemon/*`
- `packages/ts-shell/src/sandbox/*`
- `packages/ts-shell/src/core/context/pwRuntime.ts`
- `packages/ts-shell/src/core/context/browserRuntime*.ts`
- `packages/rust-core/src/*`
- `contracts/*`

Mixed responsibilities:

- runtime receipts are capability-specific rather than one shared receipt
  vocabulary
- browser runtime status enters agent-loop planning directly

Lifecycle coverage:

- command execution, browser runtime status, sandbox preflight, timeout/cancel,
  and cleanup appear in focused modules

Missing boundary:

- a shared receipt projection for shell/local/daemon/browser execution

Safe extraction candidates:

- receipt status projector and cleanup summary projector

Unsafe areas:

- moving control-plane semantics into Rust or adding a new runtime layer

### Result Surface

Current owners:

- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionStateSurface.ts`
- `packages/ts-shell/src/core/shell/turnBoundarySurface.ts`
- capability-specific evidence/report projectors

Mixed responsibilities:

- `resultMapper.ts` owns core truthfulness, while `sessionRuntime.ts` still
  accumulates terminal status and renders query events
- capability branches still create user-facing output close to execution

Lifecycle coverage:

- success/stopped/error are explicitly classified
- actionable blockers prevent false success for approval, MCP, browser, command,
  verification, and patch failures

Missing boundary:

- a capability result summary projector consumed consistently by terminal,
  session, and report surfaces

Safe extraction candidates:

- durable terminal-status projection
- coding summary/result surface projector

Unsafe areas:

- changing terminal classification rules without result-contract coverage

### Session / Continue

Current owners:

- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/session/sessionReplayBuilder.ts`
- `packages/ts-shell/src/session/sessionResumeContextBuilder.ts`
- `packages/ts-shell/src/session/compactContinuitySummary.ts`
- `packages/ts-shell/src/session/mutationContinuityState.ts`
- `packages/ts-shell/src/session/approval*`

Mixed responsibilities:

- `SessionManager.ts` remains the substrate for persistence, snapshots,
  current-session state, reentry summaries, repair trust boundaries, approval
  memory, and compact/replay calls
- many helpers already exist, but terminal durability projection was still
  embedded locally before this route

Lifecycle coverage:

- transcript and query events are persisted
- compact and replay builders exist
- mutation and approval continuity facts survive into future turns

Missing boundary:

- codecs/projections should continue moving out as pure helpers while the class
  keeps filesystem state transitions

Safe extraction candidates:

- durable status projector
- recovery snapshot codec helpers
- session reentry summary projector

Unsafe areas:

- schema changes, transcript event migration, or replay semantic changes

### CLI / UX

Current owners:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/entrypoints/cliArgs.ts`
- `packages/ts-shell/src/entrypoints/cliModeDispatch.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts`
- `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- `packages/ts-shell/src/core/commands/*`

Mixed responsibilities:

- `cli.tsx` remains a large composition root for startup, session commands,
  approval, workspace binding, provider snapshot, prompt execution, and display
  helpers
- many mode helpers exist, but session switch and permissions display remain in
  the entrypoint

Lifecycle coverage:

- CLI selects session/project context, routes print/stdin/replay/interactive
  modes, and bridges slash commands
- non-interactive approval behavior is explicit

Missing boundary:

- a CLI core facade that wires runtime dependencies while keeping display
  helpers outside the entrypoint

Safe extraction candidates:

- permissions list/explain renderer
- session switch diagnostics helper
- workspace-info prompt detector

Unsafe areas:

- CLI UX redesign or changing compatibility behavior

### Provider / Model

Current owners:

- `packages/ts-shell/src/core/shell/providerCredentials.ts`
- `packages/ts-shell/src/core/shell/providerReadiness.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/orchestration/providerOutcomeProjection.ts`
- `packages/ts-shell/src/model-adapters/*`

Mixed responsibilities:

- CLI resolves provider credential snapshots
- orchestration streams provider output and projects provider diagnostic
  handoff from continuity

Lifecycle coverage:

- default synthetic mode and real-provider opt-in are explicit
- readiness scripts classify provider/config/network failures

Missing boundary:

- provider outcome projection should remain data-only and not pull auth/runtime
  behavior into planning helpers

Safe extraction candidates:

- diagnostic handoff projector

Unsafe areas:

- reading or printing real-provider config, changing default gates, or adding
  provider behavior

### Browser Lifecycle Example

Current owners:

- `packages/ts-shell/src/core/context/browserAgent.ts`
- `packages/ts-shell/src/core/context/browserTxn.ts`
- `packages/ts-shell/src/core/context/browserTrace.ts`
- `packages/ts-shell/src/core/context/browser*Policy.ts`
- `packages/ts-shell/src/core/harness/browser*`

Lifecycle coverage:

- availability, policy, planning, execution, trace/evidence, eval/report,
  cleanup, and redaction are comparatively mature

Gap:

- result mapping is still partly wired through the agent loop instead of a
  generic capability-result projection

Unsafe area:

- public web or write/action expansion

### Edit / Patch Lifecycle Example

Current owners:

- `packages/ts-shell/src/orchestration/patchResult/*`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`
- `packages/ts-shell/src/orchestration/mutationExecution.ts`
- `packages/ts-shell/src/orchestration/patchMutationLane.ts`

Lifecycle coverage:

- supported shapes, planning/no-write lanes, guarded write authority, stale
  read, post-write verification, and result mapping are explicit

Gap:

- no broad rollback/snapshot/multi-file engine should be inferred from bounded
  lanes

Unsafe area:

- broad `apply_patch`, delete/move, rollback, AST/fuzzy patch, or prompt-based
  write authorization

### Harness / Eval

Current owners:

- `scripts/verify/*`
- `scripts/verify-real-user-capabilities.mjs`
- `scripts/verify-result-contract.mjs`
- `scripts/verify-edit-capability-closeout.mjs`
- `packages/ts-shell/src/core/harness/*`

Lifecycle coverage:

- Route 135 split the real-user verifier behind a compatibility entrypoint
- deterministic gates assert output markers and opt-in boundaries

Gap:

- gate/report vocabulary still varies across verifier families

Safe extraction candidates:

- report marker projector and gate taxonomy manifest

Unsafe area:

- making harness behavior the source of runtime behavior

## Cross-Layer Concentration Points

1. `runMvpIntegratedFlow.ts`: capability planning plus execution plus result
   assembly.
2. `SessionManager.ts`: persistence substrate plus projection/codecs/reentry
   summaries.
3. `cli.tsx`: entrypoint plus command/display/session/provider/approval
   wiring.
4. `sessionRuntime.ts`: query event rendering plus terminal accumulation plus
   persistence calls.
5. `resultMapper.ts`: correct truthfulness owner, but now the place every
   capability must satisfy before claiming success.

## Capability Lifecycle Gaps

| Capability | Strong stages | Gap |
|---|---|---|
| Edit / Patch | policy, planning, execution, observation, evidence, result, continue, eval | broad rollback/snapshot explicitly absent |
| Browser | availability, policy, planning, execution, evidence, eval, report, cleanup, redaction | generic result/session projection still incomplete |
| Shell / Tool | execution/provenance, approval, MCP failure classes | shared runtime receipt and transcript vocabulary |
| Provider | opt-in, readiness classification, diagnostic handoff | provider outcome projection still touches planning flow |
| Session / Continue | transcript, compact, replay, approval/mutation continuity | schema-neutral projector extraction not finished |
| CLI | args/mode helpers, startup surface, slash registry | entrypoint still owns display helpers and switch details |
| Harness / Eval | deterministic gates and Route 135 verifier modules | common gate/report taxonomy still pending |

## Extraction Decision

Completed in this route:

- `packages/ts-shell/src/session/durableStatusProjection.ts`
  - extracts the existing SessionManager durable terminal-status projection
  - no schema change
  - no behavior change
  - directly covered by `durableStatusProjection.test.ts`

Deferred:

- agent-loop/provider/mutation projections are plausible but touch more
  coupling and should be Route 137 work
- CLI display helper extraction is safe-looking, but it is lower leverage than
  session/result projection and should wait for the CLI/core preparation route

## Post-Route-149 Roadmap Reset

Route 144 established the green runMvp/package baseline, and Routes 145-148
turned the next work into module-owned contracts rather than feature-first
cleanup. After Route 149, module-first development is the default: new
capability work must enter through the owning module contract before it reaches
the Agent Loop.

Agent Loop should compose module receipts and projections; it should not absorb
new edit, browser, provider, workspace, or CLI policy logic. The next
control-plane candidates are Agent Loop dispatch extraction v2, Runtime receipt
contract, Workspace / File Context contract, and CLI / core split preparation.

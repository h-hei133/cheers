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

Implementation routes that wire or extend capability paths should first consult
`docs/implementation-context/`. That directory contains the AI-oriented
capability flow graph, machine-readable manifest, and route recipes derived
from this atlas and the Route 154-160 facade passes. It is implementation
context, not import policing.

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
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`: shell/runtime event
  ordering, facade invocation, state-machine coordination, and SessionManager
  write-call ordering.
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
- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionStateSurface.ts`
- `packages/ts-shell/src/core/shell/turnBoundarySurface.ts`
- capability-specific evidence/report projectors

Mixed responsibilities:

- `resultMapper.ts` remains the final truthfulness composition root, while
  Result Surface facades now own actionable blocker classification, terminal
  label fallback, and capability hard-failure/caveat classification
- `sessionRuntime.ts` still accumulates terminal status and renders query
  events
- capability branches still create user-facing output close to execution

Lifecycle coverage:

- success/stopped/error are explicitly classified
- actionable blockers prevent false success for approval, MCP, browser, command,
  verification, and patch failures
- terminal classification fallback and retryable continuation classification
  are facade-owned without changing explicit terminal precedence

Missing boundary:

- a capability result summary projector consumed consistently by terminal,
  session, and report surfaces

Safe extraction candidates:

- coding summary/result surface projector where capability branches still build
  user-facing result text close to execution
- shared report/result schema projector if Harness / Eval report vocabulary
  becomes the blocker

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
- `packages/ts-shell/src/entrypoints/cliApprovalModule.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeModule.ts`
- `packages/ts-shell/src/entrypoints/cliSessionModule.ts`
- `packages/ts-shell/src/entrypoints/cliWorkspaceModule.ts`
- `packages/ts-shell/src/entrypoints/cliPermissionModule.ts`
- `packages/ts-shell/src/entrypoints/cliArgs.ts`
- `packages/ts-shell/src/entrypoints/cliModeDispatch.ts`
- `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts`
- `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts`
- `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts`
- `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- `packages/ts-shell/src/core/commands/*`

Mixed responsibilities:

- `cli.tsx` remains the process entrypoint and top-level interactive
  composition root for bootstrap ordering, mode selection, readline lifecycle,
  MCP gateway lifetime, and compatibility glue
- module facades now own approval prompt internals, non-interactive runtime
  turn handoff, session command surfaces, workspace attach/status surfaces, and
  permissions display/mutation surfaces

Lifecycle coverage:

- CLI selects session/project context, routes print/stdin/replay/interactive
  modes, and bridges slash commands
- non-interactive approval behavior is explicit
- facade boundary tests characterize approval-mode projection,
  root-binding/session switch diagnostics, and workspace-info classification

Missing boundary:

- MCP control command execution still lives in the entrypoint because gateway
  lifetime is tied to current runtime cwd

Safe extraction candidates:

- MCP control command facade once gateway lifecycle is characterized
- provider/workspace startup display facade if startup output needs another
  behavior-preserving reduction

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
- `scripts/verify/verifierCliModule.mjs`
- `scripts/verify/verifierCaseModule.mjs`
- `scripts/verify/verifierSafetyModule.mjs`
- `scripts/verify/verifierReportModule.mjs`
- `scripts/verify-real-user-capabilities.mjs`
- `scripts/verify-result-contract.mjs`
- `scripts/verify-edit-capability-closeout.mjs`
- `packages/ts-shell/src/core/harness/*`

Lifecycle coverage:

- Route 135 split the real-user verifier behind a compatibility entrypoint
- deterministic gates assert output markers and opt-in boundaries
- Route 159 keeps the public verifier entrypoint as a thin shim and moves
  CLI/options, suite/case planning, selection safety, and report construction
  behind Harness-owned facades

Gap:

- gate/report vocabulary still varies across verifier families

Safe extraction candidates:

- report marker projector and gate taxonomy manifest

Unsafe area:

- making harness behavior the source of runtime behavior

## Cross-Layer Concentration Points

1. `runMvpIntegratedFlow.ts`: capability planning plus execution plus result
   assembly. Route 154 reduced direct helper-fragment imports for
   read/inspect/workspace, verification, and continuation by adding
   module-owned facades, but the file remains the highest concentration point
   because execution branches and result assembly still live there.
2. `SessionManager.ts`: acceptable stateful Session / Continue substrate after
   Route 157; avoid regrowing store/layout, registry, compact, approval-memory,
   or pure continuity evidence internals there.
3. `cli.tsx`: acceptable CLI entrypoint composition root after Route 158;
   avoid regrowing approval prompt internals, runtime turn execution internals,
   session/workspace command internals, or permission surface details there.
4. `sessionRuntime.ts`: acceptable shell/runtime composition root after Route
   156; avoid regrowing rendering, terminal projection, persistence payload, or
   future-turn internals there.
5. `scripts/verify/index.mjs`: acceptable Harness / Eval readiness composition
   root after Route 159; avoid regrowing CLI parsing, suite/case planning,
   selection safety, or top-level report object construction there.
6. `resultMapper.ts`: acceptable Result Surface truthfulness root after Route
   160; avoid regrowing blocker marker parsing, terminal fallback projection,
   or capability hard-failure/caveat classification there.

## Capability Lifecycle Gaps

| Capability | Strong stages | Gap |
|---|---|---|
| Edit / Patch | policy, planning, execution, observation, evidence, result, continue, eval | broad rollback/snapshot explicitly absent |
| Browser | availability, policy, planning, execution, evidence, eval, report, cleanup, redaction | generic result/session projection still incomplete |
| Shell / Tool | execution/provenance, approval, MCP failure classes | shared runtime receipt and transcript vocabulary |
| Provider | opt-in, readiness classification, diagnostic handoff | provider outcome projection still touches planning flow |
| Session / Continue | transcript, compact, replay, approval/mutation continuity, stateful substrate | CLI-facing action wiring still concentrated in entrypoint |
| CLI | args/mode helpers, startup surface, slash registry | entrypoint still owns display helpers and switch details |
| Harness / Eval | deterministic gates, verifier CLI/case/safety/report facades | common gate/report taxonomy still pending |

Route 163 adds `docs/foundation/` as the current foundation consistency audit
surface. The audit confirms the extraction/result-flow foundation is mostly
consistent. Route 164 resolves its high-risk Result Surface / Session terminal
surface contradiction by making `sessionTerminalState` consume the shared
Result Surface blocker classification for provider/browser/edit actionable
markers instead of keeping a narrower local marker subset.

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

## Post-Route-154 Agent Loop Facade Pass

Route 154 starts the owner-module extraction pass for
`runMvpIntegratedFlow.ts`.

New module facades:

- `packages/ts-shell/src/orchestration/readInspectModule.ts`
  - owner: Workspace / File Context Engineering
  - exposes read/inspect intent, read continuation target recovery,
    repo-explain evidence selection, diagnosis metadata, and workspace target
    stopped surfaces
- `packages/ts-shell/src/orchestration/verificationModule.ts`
  - owner: Result Surface / Verification Engineering
  - exposes verification planning, retry, skipped/not-requested/command
    projection, and verification evidence
- `packages/ts-shell/src/orchestration/continuationModule.ts`
  - owner: Session / Continue Engineering
  - exposes continuation intent, replay-safe lineage, target derivation,
    lineage activation projection, repair/verify continuation objects, and
    verify-resume facts

`runMvpIntegratedFlow.ts` remains the Agent Loop composition root. It should
keep turn ordering, capability selection composition, facade invocation,
receipt aggregation, and final handoff. It should not regain direct imports of
read/inspect, verification, or continuation helper fragments unless a route
explicitly reopens that ownership.

Deferred from Route 154:

- edit execution facade adoption
- browser module facade
- provider diagnostic/execution facade
- runtime receipt consumer adoption
- generic result surface handoff
- broad intent-planner movement

Next central file recommendation: `sessionRuntime.ts`.

Reason: Route 153 reduced `cli.tsx` pressure, and Route 154 starts reducing
`runMvpIntegratedFlow.ts` by facade ownership. The next highest-value central
file is `sessionRuntime.ts`, where query event rendering, terminal
accumulation, future-turn injection, and persistence calls still converge
between Agent Loop output and Session / Result Surface ownership. A narrow
route should extract one rendering or terminal-status projection boundary
without changing schema, result truthfulness, CLI behavior, provider behavior,
or session persistence semantics.

## Post-Route-155 Execution / Result Facade Pass

Route 155 continued the `runMvpIntegratedFlow.ts` owner-module extraction pass
into heavier execution/result handoffs.

New or consolidated module facades:

- `packages/ts-shell/src/orchestration/browserModule.ts`
  - owner: Browser Engineering
  - owns browser plan detection and browser continuation / transaction /
    observation execution-result handoff
- `packages/ts-shell/src/orchestration/toolRuntimeModule.ts`
  - owner: Tool Engineering / Runtime Engineering
  - owns tool lifecycle dispatch entrypoint and coding-result provenance
    collector/summary handoff
- `packages/ts-shell/src/orchestration/resultSurfaceModule.ts`
  - owner: Result Surface Engineering
  - owns runtime coding outcome, blocked outcome, and turn result handoff access
- `packages/ts-shell/src/orchestration/providerModule.ts`
  - owner: Provider / Model Engineering
  - owns provider diagnostic continuity projection with no live/config reads

`runMvpIntegratedFlow.ts` is now acceptable as an Agent Loop composition root:
it still owns turn ordering, capability branch selection, and module facade
composition, but it should not regain direct imports of browser result/evidence,
tool dispatch/provenance, provider diagnostic projection, or runtime/turn
result handoff helpers.

Remaining non-Agent-Loop responsibilities to avoid growing:

- edit execution and mutation-result reconciliation remain inline and should be
  a future Edit / Patch route if touched
- runtime receipt consumer adoption remains partial
- large intent-planning order remains in the Agent Loop file and should only
  move with characterization coverage
- capability-specific fallback strings remain in some branches and should move
  only under Result Surface coverage

Next central file recommendation: `sessionRuntime.ts`.

Reason: after Routes 154-155, `runMvpIntegratedFlow.ts` is a large but
acceptable composition root. `sessionRuntime.ts` is now the next better target
because it still joins query event rendering, terminal status accumulation,
future-turn injection, result handoff, and session persistence calls.

## Post-Route-156 Session Runtime Facade Pass

Route 156 ran the owner-module extraction pass for
`packages/ts-shell/src/core/shell/sessionRuntime.ts`.

New module facades:

- `packages/ts-shell/src/core/shell/sessionEventSurface.ts`
  - owner: Result Surface Engineering
  - owns QueryEvent display facts, compact retry notice rendering, runtime
    event digest accumulation, and execution summary rendering
- `packages/ts-shell/src/core/shell/sessionTerminalState.ts`
  - owner: Result Surface Engineering
  - owns terminal state accumulation plus terminal/coding/continuation result
    surface rendering, while preserving `resultMapper` as the truthfulness owner
- `packages/ts-shell/src/core/shell/sessionPersistenceProjection.ts`
  - owner: Session / Continue Engineering
  - owns assistant-turn and terminal save payload projection for existing
    SessionManager calls
- `packages/ts-shell/src/core/shell/sessionFutureTurnProjection.ts`
  - owner: Session / Continue Engineering
  - owns compact and project-memory future-turn prompt projection

`sessionRuntime.ts` is now acceptable as a shell/runtime composition root: it
keeps event consumption order, `ShellStateMachine` coordination, `runPrompt`
invocation, continuity snapshot selection, and SessionManager write-call order.
It should not regain direct QueryEvent rendering helpers, terminal result
projection helpers, persistence payload construction, or future-turn injection
internals.

Remaining non-runtime responsibilities to avoid growing:

- continuity snapshot selection still uses optional SessionManager methods and
  should move only with schema-neutral Session / Continue coverage
- SessionManager still concentrates persistence substrate, state/schema update
  coordination, codecs, compact/replay, and reentry summaries
- CLI/session command wiring remains in `cli.tsx` and should only move through
  CLI-owned action boundaries

Next central file recommendation: `SessionManager.ts`.

Reason: after Routes 153-156, `cli.tsx`, `runMvpIntegratedFlow.ts`, and
`sessionRuntime.ts` all have acceptable composition-root classifications for
their current scopes. `SessionManager.ts` is now the highest-value central file
because persistence substrate, schema-neutral projection/codecs, compact/replay,
approval/mutation continuity, and CLI-facing reentry summaries still converge
there.

## Post-Route-157 SessionManager Facade Pass

Route 157 ran the owner-module extraction pass for
`packages/ts-shell/src/session/SessionManager.ts`.

New module facades:

- `packages/ts-shell/src/session/sessionStore.ts`
  - owner: Session / Continue Engineering
  - owns session root/layout facts, current-session store path, per-session file
    layout, session id generation, and id validation
- `packages/ts-shell/src/session/sessionRegistry.ts`
  - owner: Session / Continue Engineering
  - owns current-session registry read/write/remove projection and delegates
    selection semantics to `currentSessionSelection.ts`
- `packages/ts-shell/src/session/sessionApprovalMemoryModule.ts`
  - owner: Session / Continue Engineering and Permission / Policy Engineering
  - owns approval audit working-memory payload projection and history trimming
- `packages/ts-shell/src/session/sessionCompactModule.ts`
  - owner: Session / Continue Engineering
  - owns compact retention projection inputs and continuity handoff payloads
- `packages/ts-shell/src/session/sessionContinuityModule.ts`
  - owner: Session / Continue Engineering
  - owns pure continuity evidence extraction, transcript event discovery, seed
    influence parsing, and replay-safe summary normalization helpers

`SessionManager.ts` is now acceptable as a stateful Session / Continue
substrate. It keeps public API methods, metadata/state/transcript schema
ownership, filesystem state-transition ordering, transcript append order, state
locks, atomic writes, and unreadable-session warning state. It should not regain
store/path layout helpers, current-session registry persistence, approval
memory payload construction, compact retention projection, or pure continuity
evidence extraction.

Remaining non-substrate responsibilities to avoid growing:

- CLI session commands and display/action wiring still live in `cli.tsx`
- recovery trust-boundary decisions remain inside SessionManager because they
  depend on live snapshots and should move only with dedicated recovery
  characterization coverage
- session listing warning state remains in SessionManager to avoid CLI output
  drift

Next central file recommendation: `cli.tsx`.

Reason: after Routes 154-157, `runMvpIntegratedFlow.ts`, `sessionRuntime.ts`,
and `SessionManager.ts` all have acceptable composition/substrate
classifications. `cli.tsx` is now the highest-value central file because
argument mode dispatch, slash command action wiring, session command surfaces,
provider snapshot display, approval bridge wiring, and runtime invocation still
converge there.

## Post-Route-158 CLI Module Facade Pass

Route 158 ran the owner-module extraction pass for
`packages/ts-shell/src/entrypoints/cli.tsx`.

New module facades:

- `packages/ts-shell/src/entrypoints/cliApprovalModule.ts`
  - owner: Permission / Policy Engineering and CLI / UX Engineering
  - owns approval-mode cue projection, conflict analysis, approval prompt
    handler creation, non-interactive approval resolution, audit-surface
    emission, and apply-patch approval decision projection
- `packages/ts-shell/src/entrypoints/cliRuntimeModule.ts`
  - owner: Agent Loop Engineering and CLI / UX Engineering
  - owns non-interactive prompt/replay/stdin handoff, runtime invocation event
    streaming, and prompt turn execution payload construction
- `packages/ts-shell/src/entrypoints/cliSessionModule.ts`
  - owner: Session / Continue Engineering and CLI / UX Engineering
  - owns session command surfaces, switch reference resolution, root-binding
    diagnostics, and runtime-context session rebinding projection
- `packages/ts-shell/src/entrypoints/cliWorkspaceModule.ts`
  - owner: Workspace / File Context Engineering and CLI / UX Engineering
  - owns workspace-info prompt classification, workspace attach/status/recent
    command surfaces, root-mode resolution, and project-root projection
- `packages/ts-shell/src/entrypoints/cliPermissionModule.ts`
  - owner: Permission / Policy Engineering and CLI / UX Engineering
  - owns `/permissions` list/explain/revoke/reset display and trust-grant
    mutation surface

`cli.tsx` is now acceptable as a CLI entrypoint composition root. It keeps
process startup, argv parse and early exits, bootstrap ordering, top-level mode
selection, readline lifecycle, signal hooks, prompt chrome, cancellation
handling, MCP gateway lifetime, and high-level interactive slash dispatch. It
should not regain direct approval prompt internals, non-interactive runtime turn
execution internals, session switch/root-binding helpers, workspace attach/path
helpers, or permission-list/explain surface details.

Remaining CLI-adjacent responsibilities to avoid growing:

- MCP control command execution is still inline because gateway lifetime is tied
  to the current runtime cwd and needs separate characterization before moving
- provider credential snapshot resolution and startup display wiring remain in
  the entrypoint, while redacted provider projection stays in existing helpers
- compatibility process exits for version, doctor, and invalid project path
  remain in `cli.tsx`

Next central file recommendation:
`scripts/verify-real-user-capabilities.mjs`.

Reason: after Routes 154-158, `runMvpIntegratedFlow.ts`, `sessionRuntime.ts`,
`SessionManager.ts`, and `cli.tsx` all have acceptable
composition/substrate/entrypoint classifications. The verifier script remains a
large readiness/reporting control surface and should be decomposed only through
Harness / Eval owned facades that preserve flags, markers, report fields,
redaction, exit codes, and opt-in behavior.

## Post-Route-159 Verifier Module Facade Pass

Route 159 ran the owner-module extraction pass for the real-user capability
verifier surface.

Entrypoint classification:

- `scripts/verify-real-user-capabilities.mjs` is acceptable as a thin
  compatibility entrypoint. It only imports `scripts/verify/index.mjs` and
  should not gain verifier logic.
- `scripts/verify/index.mjs` remains the Harness / Eval readiness composition
  root for ordering early self-tests, path/runner setup, provider env contract
  lifecycle, provider preflight, scenario execution, marker emission, report
  writing, and exit decisions.

New module facades:

- `scripts/verify/verifierCliModule.mjs`
  - owner: Harness / Eval Engineering
  - owns verifier option parsing, tier/suite values, flag aliases, and invalid
    option exit-code behavior
- `scripts/verify/verifierCaseModule.mjs`
  - owner: Harness / Eval Engineering
  - owns tier/suite/case planning, skipped-case projection, selected-case
    metadata, and dry-run/list plan report inputs
- `scripts/verify/verifierSafetyModule.mjs`
  - owner: Harness / Eval Engineering and Provider / Model Engineering
  - owns selection safety checks and include-real opt-in constraints without
    touching real-provider config
- `scripts/verify/verifierReportModule.mjs`
  - owner: Harness / Eval Engineering
  - owns config/preflight/final/unhandled failure report object construction
    while preserving report fields and exit-code inputs

`scripts/verify/index.mjs` is acceptable as a Harness / Eval readiness
composition root for this route. It should not regain direct CLI parsing,
suite/case planning, selection safety checks, or top-level report object
construction. Larger real-provider smoke bodies and provider env contract
loading remain in `index.mjs` intentionally because moving them would need
separate redaction/config characterization.

Next central file recommendation: `resultMapper.ts`.

Reason: after Routes 154-159, the main control-plane composition roots,
session substrate, CLI entrypoint, and verifier readiness surface all have
acceptable owner-module classifications. `resultMapper.ts` remains the shared
truthfulness boundary every capability must satisfy before a terminal success,
stopped, or error claim.

## Post-Route-160 ResultMapper Module Facade Pass

Route 160 ran the owner-module extraction pass for
`packages/ts-shell/src/core/query/resultMapper.ts`.

New module facades:

- `packages/ts-shell/src/core/query/actionableBlockerModule.ts`
  - owner: Result Surface Engineering
  - owns actionable blocker kinds, evidence marker parsing, reason selection,
    approval-denied next-action projection, and command/MCP/browser/edit policy
    blocker classification from safe result facts
- `packages/ts-shell/src/core/query/terminalClassificationProjection.ts`
  - owner: Result Surface Engineering
  - owns pure `TerminalReason` plus continuation fallback classification while
    preserving explicit terminalClassification precedence in `resultMapper.ts`
- `packages/ts-shell/src/core/query/capabilityResultClassification.ts`
  - owner: Result Surface Engineering
  - owns successful mutation with verification caveat classification, hard
    failure detection, and approved bash execution failure provenance

`resultMapper.ts` is acceptable as the Result Surface truthfulness composition
root. It keeps latest coding-result selection, top-level
`OrchestrationResult` construction, explicit terminal fact precedence, final
completed/stopped/error ordering, and fallback stop-reason selection. It should
not regain direct actionable blocker marker parsing, terminal classification
fallback logic, or capability hard-failure/caveat classification.

Central-file pass classification: complete for the current atlas set. Routes
154-160 now classify the main control-plane composition roots, session
substrate, CLI entrypoint, verifier readiness surface, and Result Surface
truthfulness root as acceptable under owner-module boundaries.

Next central file recommendation: none. Choose the next route by product risk
and module lifecycle gap instead of continuing central-file extraction by
default.

## Post-Route-162 Vertical Result-Flow Calibration

Route 162 started vertical stopped/result calibration across Provider / Model,
Browser, Edit / Patch, Runtime, Result Surface, and Harness / Eval without
introducing a global handoff abstraction.

Calibrated capability facts:

- provider not-configured, opt-in-required, and unsupported-provider markers
  now reach Result Surface as provider-specific stopped facts when the current
  code already supplies safe provider readiness evidence
- browser cleanup failure is distinct from adapter failure while unavailable,
  policy, timeout, target-missing, and redaction-safe runtime receipt summaries
  remain capability-owned
- Edit / Patch module stopped projections now emit no-write actionable markers
  for missing target, missing content, stale-read, and unsupported future edit
  preconditions

`resultMapper.ts` remains the terminal truthfulness root. These markers are
classification inputs only; they do not authorize provider calls, browser
actions, edit writes, session schema changes, or CLI behavior changes.

Route 165 followed this recommendation for the Tool / Runtime success/failure
flow. Keep considering shared handoff extraction only after several more
capability-specific flows stabilize around repeated fields.

## Post-Route-165 Tool / Runtime Execution Flow Calibration

Route 165 calibrated the existing command execution path across Tool, Runtime,
Result Surface, Session / Continue, and Harness / Eval. The runtime already
attached budgeted `metadata.runtimeReceipt` projections to command, sandbox,
daemon, MCP, and browser-adjacent paths; Route 165 adds a narrow
`flowDispatch.ts` evidence bridge so run-command and verification results carry
stable `runtime-receipt-*` markers without changing command execution or
terminal truthfulness.

Calibrated command facts:

- command success remains completed when verification/task evidence is
  satisfied
- approved nonzero command failure remains a hard command error, not a
  completed result
- timeout/cancel/unavailable receipt facts remain non-completed local runtime
  evidence where current fixtures support them
- allowlist blocked and approval-denied command paths remain actionable stopped
  paths
- stdout/stderr summaries are budgeted and redacted before entering evidence

`resultMapper.ts` remains the terminal truthfulness root, and
`sessionTerminalState.ts` remains a consumer of mapped terminal facts. Runtime
receipt markers are evidence-only; they do not authorize commands, bypass
approval, broaden allowlists, change session schema, or alter CLI behavior.

Next recommendation: choose `Harness / gate taxonomy` if release/report
confidence is now the blocker. Do not extract a broader shared handoff until
more capability-specific flows prove repeated stable fields.

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

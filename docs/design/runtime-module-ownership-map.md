# Runtime Module Ownership Map

Route: 18
Date: 2026-05-13
Status: ownership map only; Route 29-33 sync

This document records runtime/module ownership after the recent extraction work.
It is based on current code, recent commits, and a narrow reference comparison.
It does not implement migrations, change product behavior, change scripts or
default gates, or make a new readiness claim.

## 1. Migration Status As Of Current HEAD

Current HEAD includes the runtime/session/CLI extraction series through
`57fb568 Extract CLI runtime command bridge helpers`, covering the Route 29-33
projection, planning, codec, policy, and CLI wrapper/bridge extraction work.

This status is an ownership synchronization, not a release-readiness claim. The
current large-file sizes observed in this pass are:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 9,640 lines.
- `packages/ts-shell/src/session/SessionManager.ts`: 3,442 lines.
- `packages/ts-shell/src/entrypoints/cli.tsx`: 2,902 lines.

Completed orchestration extractions:

| Responsibility | Current owner | Status |
| --- | --- | --- |
| Shell result assembly | `packages/ts-shell/src/orchestration/shellResultAssembly.ts` | completed |
| Runtime outcome projection | `packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts` | completed |
| Runtime/session handoff projection | `packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts` | completed |
| Tool execution failure/outcome projection | `packages/ts-shell/src/orchestration/toolExecutionOutcomeProjection.ts` | completed |
| DoNext / next-action text projection | `packages/ts-shell/src/orchestration/doNextProjection.ts` | completed |
| Provider outcome projection | `packages/ts-shell/src/orchestration/providerOutcomeProjection.ts` | completed |
| Approval authority projection | `packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts` | completed |
| Capability boundary projection | `packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts` | completed |
| Workflow task planner | `packages/ts-shell/src/orchestration/workflowTaskPlanner.ts` | completed |
| Continuation planning | `packages/ts-shell/src/orchestration/continuationPlanning.ts` | completed |
| Workflow intent projection | `packages/ts-shell/src/orchestration/workflowIntentProjection.ts` | completed |

Completed session extractions:

| Responsibility | Current owner | Status |
| --- | --- | --- |
| Resume/stopped/continue context construction | `packages/ts-shell/src/session/sessionResumeContextBuilder.ts` | completed |
| Shared continuity types | `packages/ts-shell/src/session/sessionContinuityTypes.ts` | completed |
| Compact retention planning/projection | `packages/ts-shell/src/session/compactRetentionPlanner.ts` | completed |
| Mutation/planned-files continuity state | `packages/ts-shell/src/session/mutationContinuityState.ts` | completed |
| Replay transcript/runtime seed construction | `packages/ts-shell/src/session/sessionReplayBuilder.ts` | completed |
| Obsolete replay plan builder | `packages/ts-shell/src/session/replayPlanBuilder.ts` | removed; no runtime/test call sites |
| Approval memory codec | `packages/ts-shell/src/session/approvalMemoryCodec.ts` | completed |
| Permission request memory codec | `packages/ts-shell/src/session/permissionRequestMemoryCodec.ts` | completed |
| Approval audit projection | `packages/ts-shell/src/session/approvalAuditProjection.ts` | completed |
| Project binding policy | `packages/ts-shell/src/session/projectBindingPolicy.ts` | completed |
| Project-root rebase projection | `packages/ts-shell/src/session/projectRootRebaseProjection.ts` | completed |
| Current-session selection expansion | `packages/ts-shell/src/session/currentSessionSelection.ts` | completed |

Completed CLI extractions:

| Responsibility | Current owner | Status |
| --- | --- | --- |
| Typed CLI argument parsing | `packages/ts-shell/src/entrypoints/cliArgs.ts` | completed |
| Slash-command positional fallback collision fix | `packages/ts-shell/src/entrypoints/cliArgs.ts` | completed |
| CLI mode dispatch | `packages/ts-shell/src/entrypoints/cliModeDispatch.ts` | completed |
| Print mode runner | `packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts` | completed |
| Stdin mode runner | `packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts` | completed |
| Provider readiness CLI surface | `packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts` | completed |
| Slash command registry/help surface | `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts` | completed |
| Workspace CLI surface | `packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts` | completed |
| MCP control CLI surface | `packages/ts-shell/src/entrypoints/mcpControlCliSurface.ts` | completed |
| Approval prompt/display bridge | `packages/ts-shell/src/entrypoints/approvalPromptBridge.ts` | completed |
| Runtime invocation wrapper | `packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts` | completed |
| Command execution bridge | `packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts` | completed |
| Interactive loop state projection | `packages/ts-shell/src/entrypoints/cliInteractiveLoopState.ts` | completed |

Search checks from this pass:

- `replayPlanBuilder|buildReplayPlanFromSnapshot` has no matches under
  `packages/ts-shell/src`.
- The orchestration extraction modules are imported by
  `runMvpIntegratedFlow.ts` or their focused tests.
- The session extraction modules are imported by `SessionManager.ts` or focused
  tests.
- The CLI extraction modules listed above exist, have focused tests, and are
  imported by `cli.tsx` where bootstrap, command execution, authorization,
  session switching, MCP calls, and lifecycle wiring still need them.
- The slash-command positional fallback fix is covered in `cliArgs.test.ts`;
  reserved shell slash commands such as `/continue`, `/sessions`, `/mcp`,
  `/resume`, `/workspace`, `/help`, and `/pwd` are not treated as positional
  project fallback, while path-like values such as `nested/project` and
  `/tmp/project` still are.

## 2. Reference Comparison Calibration

The reference comparison was read-only and narrow. No reference implementation
was copied.

Claude Code search keywords:

- `query loop`
- `orchestration`
- `tool result`
- `failed tool result`
- `compact`
- `resume`
- `session transcript`
- `continue`
- `CLI`
- `print`
- `interactive`
- `slash command`
- `permission`
- `file edit`
- `result projection`

Claude Code files/fragments read:

- `/home/wang/projects/source-claudecode/query.ts`
  - Checked compact and tool-result references inside the query path.
- `/home/wang/projects/source-claudecode/services/compact/compact.ts`
  - Checked post-compact message ordering and compact service ownership.
- `/home/wang/projects/source-claudecode/entrypoints/agentSdkTypes.ts`
  - Checked transcript/session API surface descriptions.
- `/home/wang/projects/source-claudecode/cli/print.ts`
  - Checked print-mode resume, transcript restore, permission prompting, and
    result-output handling.

Claude Code calibration:

- The query loop can remain the coordinator while compact/message preparation,
  tool-result shaping, and transcript/session access live behind named
  services.
- Tool result and failure projection should stay separate from direct tool
  dispatch so later summaries and transcripts do not depend on dispatch
  internals.
- Compact/resume/transcript work benefits from distinct builders or service
  surfaces rather than one manager method cluster owning every reentry shape.
- CLI entrypoints should trend toward bootstrap, mode dispatch, and wiring;
  print/interactivity, slash commands, permission prompts, and resume handling
  should not keep accumulating in one entry file.

Claude Code items not applicable here:

- Reactive compaction, prompt-cache editing, hook ecosystems, sidechain agents,
  remote session machinery, mature interactive UI structure, and forked-agent
  state are outside this project's current runtime boundary.
- This project should not mirror Claude Code's layout. The current TypeScript
  product runtime/control plane, explicit execution boundary, Rust native
  executor candidate, and `contracts/` boundary remain the source of truth.

opencode search keywords:

- `tool execution`
- `tool result`
- `permission`
- `permission denied`
- `apply_patch`
- `patch parse`
- `patch apply`
- `session output`
- `snapshot`
- `revert`
- `CLI`
- `TUI`
- `command`
- `changed files`
- `failed files`
- `user-visible error`

opencode files/fragments read:

- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
  - Checked parse/verify, per-file metadata, permission, apply, and output
    summary phases.
- `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
  - Checked permission ask/reply/list service shape and explicit rejected,
    corrected, and denied errors.
- `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`
  - Checked tool call completion/failure state and snapshot capture around
    session processing.
- `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`
  - Checked persistence projectors as a layer separate from UI/CLI rendering.
- `/home/wang/projects/opencode/packages/opencode/src/cli/cmd/run.ts`
  - Checked command runner rendering of tool/session events and permission
    replies.
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
  - Checked snapshot restore/revert enough to classify it as not applicable.

opencode calibration:

- Tool execution, permission metadata, write metadata, and user-visible output
  are layered concepts even when one tool implementation coordinates the
  phases.
- Permission handling benefits from explicit request/reply/error models. The
  completed approval codec/projection extraction remains
  persistence/projection-oriented and does not change authorization semantics.
- Session persistence projectors and CLI/TUI command output are separate
  surfaces. That supports keeping `cli.tsx` as bootstrap/dispatch and avoiding
  execution details in entrypoint code.
- Snapshot/revert in opencode is a mature product capability layered around
  session processing; it is not a reason to add rollback, revert, or broader
  patch support here.

opencode items not applicable here:

- Broad `apply_patch` add/update/delete/move support is explicitly out of
  scope.
- Snapshot/revert/unrevert, client/server APIs, mature product TUI architecture,
  complex remote command surfaces, and broad external MCP readiness should not
  be copied into this project.

## 3. Current Giant-File Boundaries

### `runMvpIntegratedFlow.ts`

Current boundary: high-level orchestration entrypoints, apply-patch route
pre-check, integrated runner construction, query/control flow sequencing,
provider calls and adapter setup, dispatcher calls, mutation route/execution,
verification read/write sequencing, and high-level orchestration wiring.

The file should continue to retain:

- Query/control flow sequencing.
- Provider calls and provider adapter setup.
- Dispatcher calls.
- Mutation route/execution.
- Verification read/write sequencing.
- High-level orchestration wiring.
- Dependency wiring for MCP gateway, sandbox, provider mode, abort signal, and
  escalation prompt handler.

The file should not regain ownership of completed projection modules:

- Shell result assembly.
- Runtime outcome projection.
- Runtime/session handoff projection.
- Tool execution failure/outcome projection.
- DoNext / next-action text projection.
- Provider outcome projection.
- Approval authority projection.
- Capability boundary projection.
- Workflow task planning.
- Continuation planning.
- Workflow intent projection.

Provider call execution itself should not be listed as migration work. The
orchestrator owns deciding when provider execution is needed and wiring the
adapter call.

### `SessionManager.ts`

Current boundary: public session lifecycle facade, persistence reads/writes,
locking, atomic writes, session loading, recovery trust boundary,
schema-bearing writes, compact trigger control, and calls to the extracted
resume, compact, continuity, mutation, replay, approval, project binding, and
current-session selection helpers.

The file should continue to retain:

- Public session lifecycle facade.
- Persistence read/write timing.
- Locks and atomic writes.
- Session loading.
- Recovery trust boundary.
- Schema-bearing writes.
- Compact trigger control.

The file should not regain ownership of completed builder modules:

- Resume/stopped/continue context construction.
- Shared continuity type definitions.
- Compact retention planning/projection.
- Mutation/planned-files continuity state.
- Replay transcript/runtime seed construction.
- `replayPlanBuilder.ts`, which was removed because it had no runtime/test call
  sites.
- Approval memory codec.
- Permission request memory codec.
- Approval audit projection.
- Project binding policy.
- Project-root rebase projection.
- Current-session selection expansion.

Session persistence gateway work remains high risk and should not be the next
default extraction target without a separate architecture reassessment.

### `cli.tsx`

Route 24-33 completed the low/medium-risk CLI extraction batches for argument
parsing, mode dispatch, print/stdin runners, provider/workspace/MCP surfaces,
slash command registry/help rendering, approval prompt display bridging,
runtime invocation wrapping, command execution bridging, and prompt chrome/state
projection.

The file should continue to retain:

- Process bootstrap.
- Runtime/session/provider wiring.
- Actual command execution.
- MCP gateway calls.
- Approval authorization/persistence.
- Session switching.
- Readline lifecycle.
- SIGINT/close/process exit.

The file should not regain ownership of completed CLI modules:

- CLI argument parsing and slash-command positional fallback handling.
- CLI mode dispatch.
- Print/stdin mode runner control.
- Provider readiness display projection.
- Slash command registry/help/session command map rendering.
- Workspace attach/status display projection.
- MCP control-plane display projection.
- Approval prompt/display/provenance/response text surface.
- Runtime invocation wrapper.
- Command execution bridge.
- Interactive loop state projection.

Further CLI extraction should not be the default next move. If implementation
continues, it must first prove that a remaining seam is a pure
projection/wrapper and does not touch execution, persistence, lifecycle, or
authorization.

Reference calibration for CLI ownership:

- The CLI entrypoint is now closer to bootstrap, wiring, command execution, and
  lifecycle ownership. Route 24-33 moved lower-risk parsing, display, bridge,
  wrapper, and state projection surfaces out of `cli.tsx`.
- Command execution, MCP gateway calls, approval authorization/persistence,
  session switching, readline lifecycle, and process exit remain entrypoint
  boundaries.
- Interactive/TUI-related extraction remains higher risk because readline
  lifecycle, mode precedence, prompt transport, and process-exit behavior must
  remain stable.

## 4. Updated Ownership Tables

### `runMvpIntegratedFlow.ts`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Exported runtime entrypoints | `runMvpIntegratedFlow.ts` | keep | Composition boundary for runtime execution. |
| Query/control flow sequencing | `runMvpIntegratedFlow.ts` | keep | Core orchestration responsibility. |
| Provider calls / adapter setup | `runMvpIntegratedFlow.ts` | keep | Execution and adapter wiring stay here. |
| Dispatcher calls | `runMvpIntegratedFlow.ts` | keep | Execution wiring stays orchestration-level. |
| Mutation route/execution | `runMvpIntegratedFlow.ts` | keep | Do not migrate execution into projection helpers. |
| Verification read/write sequencing | `runMvpIntegratedFlow.ts` | keep | Ordering remains orchestration-owned. |
| High-level orchestration wiring | `runMvpIntegratedFlow.ts` | keep | Owns dependency assembly and turn coordination. |
| Shell result assembly | `shellResultAssembly.ts` | completed | Pure assembly/projection owner. |
| Runtime outcome projection | `runtimeOutcomeProjection.ts` | completed | Pure runtime coding/mutation/blocked outcome projection. |
| Runtime/session handoff projection | `runtimeHandoffProjection.ts` | completed | Continuity and handoff facts. |
| Tool execution failure/outcome projection | `toolExecutionOutcomeProjection.ts` | completed | Verification failure classification and next actions. |
| DoNext / next-action text projection | `doNextProjection.ts` | completed | Target/edit execution failure wording. |
| Provider outcome projection | `providerOutcomeProjection.ts` | completed | Redacted provider/model-output outcome facts. |
| Approval authority projection | `approvalAuthorityProjection.ts` | completed | Approval authority facts without authorization changes. |
| Capability boundary projection | `capabilityBoundaryProjection.ts` | completed | Capability stop/diagnostic projection. |
| Workflow task planner | `workflowTaskPlanner.ts` | completed | Workflow task planning helper. |
| Continuation planning | `continuationPlanning.ts` | completed | Continuation planning helper. |
| Workflow intent projection | `workflowIntentProjection.ts` | completed | Intent projection helper. |

### `SessionManager.ts`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Public session lifecycle facade | `SessionManager.ts` | keep | Existing callers depend on this API. |
| Persistence timing | `SessionManager.ts` | keep | Gateway extraction is high risk/later. |
| Locks / atomic writes | `SessionManager.ts` | keep | Storage safety boundary. |
| Session loading | `SessionManager.ts` | keep | Tied to public lifecycle facade. |
| Recovery trust boundary | `SessionManager.ts` | keep | Lifecycle/recovery decision boundary. |
| Schema-bearing writes | `SessionManager.ts` | keep | Durable state writes remain manager-owned. |
| Compact trigger control | `SessionManager.ts` | keep | Lifecycle-adjacent; retention planning already moved. |
| Resume/stopped/continue context construction | `sessionResumeContextBuilder.ts` | completed | Called from `SessionManager.ts`. |
| Shared continuity types | `sessionContinuityTypes.ts` | completed | Shared session continuity shape. |
| Compact retention planning/projection | `compactRetentionPlanner.ts` | completed | Pure retention plan application. |
| Mutation/planned-files continuity state | `mutationContinuityState.ts` | completed | Preserves planned/changed/failed/verified continuity facts. |
| Replay transcript/runtime seed construction | `sessionReplayBuilder.ts` | completed | `SessionManager.ts` delegates replay preparation. |
| Obsolete replay plan builder | deleted | completed | No `replayPlanBuilder` or `buildReplayPlanFromSnapshot` call sites remain. |
| Approval memory codec | `approvalMemoryCodec.ts` | completed | Approval state encode/decode helper. |
| Permission request memory codec | `permissionRequestMemoryCodec.ts` | completed | Permission request encode/decode helper. |
| Approval audit projection | `approvalAuditProjection.ts` | completed | Audit projection helper. |
| Project binding policy | `projectBindingPolicy.ts` | completed | Binding decision policy helper. |
| Project-root rebase projection | `projectRootRebaseProjection.ts` | completed | Project-root rebase projection. |
| Current-session selection expansion | `currentSessionSelection.ts` | completed | Selection helper expanded while facade stays in `SessionManager.ts`. |
| Session persistence gateway | future module only after reassessment | deferred | High risk; not a default next extraction. |

### `cli.tsx`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Process entrypoint/bootstrap | `cli.tsx` | keep | Should remain composition root. |
| Runtime/session/provider wiring | `cli.tsx` | keep | Composition root for shell runtime. |
| Actual command execution | `cli.tsx` | keep | Command semantics remain in the entrypoint path. |
| MCP gateway calls | `cli.tsx` | keep | Gateway calls stay in entrypoint wiring. |
| Approval authorization/persistence | `cli.tsx` | keep | Authorization and persistence semantics stay here. |
| Session switching | `cli.tsx` | keep | Interactive session selection remains entrypoint-owned. |
| Readline lifecycle | `cli.tsx` | keep | Higher-risk boundary; do not move casually. |
| SIGINT/close/process exit | `cli.tsx` | keep | Entrypoint process responsibility. |
| CLI arg parsing | `cliArgs.ts` | completed | Includes path-like positional project fallback. |
| Slash-command positional fallback collision fix | `cliArgs.ts` | completed | Reserved shell slash commands are not project fallback. |
| Mode dispatch | `cliModeDispatch.ts` | completed | Dispatch plan only; no mode behavior rewrite. |
| Print mode runner | `cliPrintModeRunner.ts` | completed | Runner surface outside entrypoint. |
| Stdin mode runner | `cliStdinModeRunner.ts` | completed | Runner surface outside entrypoint. |
| Provider readiness CLI surface | `providerReadinessCliSurface.ts` | completed | Preserves redaction/display boundary. |
| Slash command registry/bridge surface | `slashCommandRegistry.ts` | completed | Registry/help/session command map rendering. |
| Workspace CLI surface | `cliWorkspaceSurface.ts` | completed | Workspace attach/status display projection. |
| MCP control CLI surface | `mcpControlCliSurface.ts` | completed | MCP status/tools/doctor/blocked display projection. |
| Approval prompt bridge | `approvalPromptBridge.ts` | completed | Display/provenance/response shaping only; no authorization changes. |
| Runtime invocation wrapper | `cliRuntimeInvocation.ts` | completed | Wrapper preserves runtime/provider readiness behavior. |
| Command execution bridge | `cliCommandExecutionBridge.ts` | completed | Bridge resolves repo-aware command/prompt expansion without executing actions. |
| Interactive loop state projection | `cliInteractiveLoopState.ts` | completed | Prompt chrome/context tag projection. |
| Interactive/TUI loop boundary audit | future audit only after reassessment | deferred | Later/high risk; not a default next extraction. |

## 5. Migration Priority Table

Completed P0/P1 items are no longer future work:

| Completed item | Source file | Current module/status |
| --- | --- | --- |
| `shellResultAssembly` | `runMvpIntegratedFlow.ts` | `shellResultAssembly.ts` |
| `runtimeOutcomeProjection` | `runMvpIntegratedFlow.ts` | `runtimeOutcomeProjection.ts` |
| `runtimeHandoffProjection` | `runMvpIntegratedFlow.ts` | `runtimeHandoffProjection.ts` |
| `toolExecutionOutcomeProjection` | `runMvpIntegratedFlow.ts` | `toolExecutionOutcomeProjection.ts` |
| `doNextProjection` | `runMvpIntegratedFlow.ts` | `doNextProjection.ts` |
| `providerOutcomeProjection` | `runMvpIntegratedFlow.ts` | `providerOutcomeProjection.ts` |
| `approvalAuthorityProjection` | `runMvpIntegratedFlow.ts` | `approvalAuthorityProjection.ts` |
| `capabilityBoundaryProjection` | `runMvpIntegratedFlow.ts` | `capabilityBoundaryProjection.ts` |
| `workflowTaskPlanner` | `runMvpIntegratedFlow.ts` | `workflowTaskPlanner.ts` |
| `continuationPlanning` | `runMvpIntegratedFlow.ts` | `continuationPlanning.ts` |
| `workflowIntentProjection` | `runMvpIntegratedFlow.ts` | `workflowIntentProjection.ts` |
| `sessionResumeContextBuilder` | `SessionManager.ts` | `sessionResumeContextBuilder.ts` |
| `sessionContinuityTypes` | `SessionManager.ts` | `sessionContinuityTypes.ts` |
| `compactRetentionPlanner` | `SessionManager.ts` | `compactRetentionPlanner.ts` |
| `mutationContinuityState` | `SessionManager.ts` | `mutationContinuityState.ts` |
| `sessionReplayBuilder` | `SessionManager.ts` | `sessionReplayBuilder.ts` |
| `replayPlanBuilder` removal | `SessionManager.ts`/session replay area | deleted; no call sites |
| `approvalMemoryCodec` | `SessionManager.ts` | `approvalMemoryCodec.ts` |
| `permissionRequestMemoryCodec` | `SessionManager.ts` | `permissionRequestMemoryCodec.ts` |
| `approvalAuditProjection` | `SessionManager.ts` | `approvalAuditProjection.ts` |
| `projectBindingPolicy` | `SessionManager.ts` | `projectBindingPolicy.ts` |
| `projectRootRebaseProjection` | `SessionManager.ts` | `projectRootRebaseProjection.ts` |
| `currentSessionSelection` expansion | `SessionManager.ts` | `currentSessionSelection.ts` |
| `cliArgs` | `cli.tsx` | `cliArgs.ts` |
| Slash-command positional fallback fix | `cli.tsx`/CLI args | `cliArgs.ts` |
| `cliModeDispatch` | `cli.tsx` | `cliModeDispatch.ts` |
| `cliPrintModeRunner` | `cli.tsx` | `cliPrintModeRunner.ts` |
| `cliStdinModeRunner` | `cli.tsx` | `cliStdinModeRunner.ts` |
| `providerReadinessCliSurface` | `cli.tsx` | `providerReadinessCliSurface.ts` |
| `slashCommandRegistry` | `cli.tsx` | `slashCommandRegistry.ts` |
| `cliWorkspaceSurface` | `cli.tsx` | `cliWorkspaceSurface.ts` |
| `mcpControlCliSurface` | `cli.tsx` | `mcpControlCliSurface.ts` |
| `approvalPromptBridge` | `cli.tsx` | `approvalPromptBridge.ts` |
| `cliRuntimeInvocation` | `cli.tsx` | `cliRuntimeInvocation.ts` |
| `cliCommandExecutionBridge` | `cli.tsx` | `cliCommandExecutionBridge.ts` |
| `cliInteractiveLoopState` | `cli.tsx` | `cliInteractiveLoopState.ts` |

Default next direction:

| Priority | Scope | Candidate | Risk | Timing |
| --- | --- | --- | --- | --- |
| Next | docs/code map | architecture maintainability reassessment / score update | low | next direction |
| Only after proof | remaining runtime/session/CLI seams | pure projection or wrapper only | medium/high | later |

Do not default to continuing extraction from the three large files. Further
implementation must first prove that the remaining seam is pure projection or
wrapper work and does not touch execution, persistence, lifecycle, or
authorization.

## 6. Migration Batches

### Completed: runMvpIntegratedFlow Projection/Planning Batches

Outcome/result/handoff/provider/capability/planning projection ownership is
complete for the Route 29-33 scope.

Completed:

- `shellResultAssembly.ts`
- `runtimeOutcomeProjection.ts`
- `runtimeHandoffProjection.ts`
- `toolExecutionOutcomeProjection.ts`
- `doNextProjection.ts`
- `providerOutcomeProjection.ts`
- `approvalAuthorityProjection.ts`
- `capabilityBoundaryProjection.ts`
- `workflowTaskPlanner.ts`
- `continuationPlanning.ts`
- `workflowIntentProjection.ts`

Retained boundary: query/control flow sequencing, provider calls/adapter setup,
dispatcher calls, mutation route/execution, verification read/write sequencing,
and high-level orchestration wiring stay in `runMvpIntegratedFlow.ts`.

Stop condition for any future work in this family: do not move provider call
execution, provider auth, writer capability, MCP core, mutation capability
limits, verification ordering, or other execution semantics.

### Completed: SessionManager Context/Codec/Policy Batches

Session context, compact, continuity, replay, approval codec/projection, project
binding, project-root rebase, and current-session selection ownership is
complete for the Route 29-33 scope.

Completed:

- `sessionResumeContextBuilder.ts`
- `sessionContinuityTypes.ts`
- `compactRetentionPlanner.ts`
- `mutationContinuityState.ts`
- `sessionReplayBuilder.ts`
- deletion of obsolete `replayPlanBuilder.ts`
- `approvalMemoryCodec.ts`
- `permissionRequestMemoryCodec.ts`
- `approvalAuditProjection.ts`
- `projectBindingPolicy.ts`
- `projectRootRebaseProjection.ts`
- `currentSessionSelection.ts` expansion

Retained boundary: public lifecycle facade, persistence timing, locks/atomic
writes, session loading, recovery trust boundary, schema-bearing writes, and
compact trigger control stay in `SessionManager.ts`.

Stop condition for any future work in this family: no session schema migration,
new persistence layer, broad history compaction rewrite, recovery trust
expansion, lifecycle rewrite, or authorization behavior change.

### Completed: CLI Args/Mode/Print/Stdin Batch

The lower-risk CLI control extraction batch is complete.

Completed:

- `cliArgs.ts`
- slash-command positional fallback fix in `cliArgs.ts`
- `cliModeDispatch.ts`
- `cliPrintModeRunner.ts`
- `cliStdinModeRunner.ts`

### Completed: CLI Provider/Workspace/MCP/Approval Surface Batch

The CLI display/surface extraction batch is complete.

Completed:

- `providerReadinessCliSurface.ts`
- `slashCommandRegistry.ts`
- `cliWorkspaceSurface.ts`
- `mcpControlCliSurface.ts`
- `approvalPromptBridge.ts`

### Completed: CLI Runtime Command Bridge Batch

The Route 33 runtime invocation, command bridge, and prompt-state projection
batch is complete.

Completed:

- `cliRuntimeInvocation.ts`
- `cliCommandExecutionBridge.ts`
- `cliInteractiveLoopState.ts`

Retained boundary: process bootstrap, runtime/session/provider wiring, actual
command execution, MCP gateway calls, approval authorization/persistence,
session switching, readline lifecycle, and SIGINT/close/process exit stay in
`cli.tsx`.

Stop condition for any future work in this family: no CLI grammar rewrite, UI
redesign, provider config migration, default real-provider execution,
authorization behavior change, lifecycle migration, persistence migration, or
live TTY readiness claim.

## 7. Validation Strategy

Validation remains tied to the module family being changed.

Local validation examples recently used or relevant to completed modules:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeHandoffProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/toolExecutionOutcomeProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/doNextProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/providerOutcomeProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/approvalAuthorityProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/workflowTaskPlanner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/continuationPlanning.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/workflowIntentProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/projectBindingPolicy.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/projectRootRebaseProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/currentSessionSelection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/providerReadinessCliSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/slashCommandRegistry.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliWorkspaceSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/mcpControlCliSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/approvalPromptBridge.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliRuntimeInvocation.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliCommandExecutionBridge.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliInteractiveLoopState.test.ts`

Batch/full validation examples:

- `rtk npm run verify:session-durability:long`
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
- `rtk npm run verify:release:deterministic`
- `rtk npm run verify:result-contract`
- `rtk npm run verify:cli-entry`
- `rtk npm run build -w packages/ts-shell`

For docs-only updates, use:

- `rtk git diff --check`
- `rtk git status --short --branch`

Real-provider gates remain explicit opt-in and are not part of this docs-only
update.

## 8. Recommended Next Direction

Recommended next direction: architecture maintainability score reassessment
and score update before selecting another implementation migration.

Target file:

- `docs/design/runtime-module-ownership-map.md` or a dedicated assessment
  artifact if a future route explicitly allows one.

Target module:

- None for the reassessment itself.
- If implementation follows, first prove the selected remaining seam is a pure
  projection or wrapper and does not touch execution, persistence, lifecycle,
  or authorization.

Why now:

- Route 29-33 completed the requested runMvp, SessionManager, and CLI
  projection/wrapper/bridge batches.
- The remaining obvious candidates are higher risk because they are closer to
  execution, persistence, lifecycle, or authorization boundaries.
- A reassessment can compare the remaining hotspot size, ownership clarity,
  validation coverage, and risk before choosing the next implementation route.

Default implementation recommendation:

- Do not default to another extraction from `runMvpIntegratedFlow.ts`,
  `SessionManager.ts`, or `cli.tsx`.
- Continue implementation only after a reassessment proves a specific remaining
  seam is pure projection/wrapper work.

Allowed files for that future route:

- For reassessment: docs/design only, unless the route explicitly asks for
  read-only code inspection.
- For any later implementation: the focused module and test for the proven seam,
  with minimal wiring in the owning large file only if the seam is pure.

Forbidden files for that future route:

- `packages/ts-shell/src/session/SessionManager.ts`.
- Provider/auth core.
- MCP core.
- `packages/ts-shell/src/entrypoints/cli.tsx`, unless a future route proves a
  pure CLI projection/wrapper seam.
- `scripts/*`.
- `package.json`.
- Default gates.

Local validation for that future route:

- For reassessment: `rtk git diff --check`.
- For later implementation: focused module tests plus the relevant runtime,
  session, CLI, result, build, and diff checks dictated by the touched
  boundary.

Stop conditions for that future route:

- Provider config or credential handling changes.
- Provider call execution migration.
- Provider auth/core changes.
- Redaction weakening.
- Default gate changes or full real-provider execution.
- Runtime invocation behavior changes outside a pure projection/wrapper.
- Session persistence, schema, lifecycle, or authorization changes.
- CLI command execution, MCP gateway, approval authorization/persistence,
  session switching, readline lifecycle, or process-exit migration.

SessionManager persistence ownership audit and CLI interactive boundary audit
remain valid future reassessment topics, but they should start read-only and
not as another extraction by default.

## 9. Readiness Claims Not Changed

This document update does not claim:

- Broad release readiness.
- 4+ file mutation support.
- Broad `apply_patch`.
- 3+ mixed operation writes.
- Multi-delete, multi-move beyond exactly-two mixed lanes, rollback, or fuzzy
  patch support.
- External MCP readiness.
- Default real-provider readiness.
- Full runtime architecture completion.

The runtime architecture is clearer after the completed extraction work, but it
is not fully solved.

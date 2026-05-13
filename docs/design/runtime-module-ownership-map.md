# Runtime Module Ownership Map

Route: 18
Date: 2026-05-13
Status: ownership map only

This document records runtime/module ownership after the recent extraction work.
It is based on current code, recent commits, and a narrow reference comparison.
It does not implement migrations, change product behavior, change scripts or
default gates, or make a new readiness claim.

## 1. Migration Status As Of Current HEAD

Current HEAD includes the runtime/session extraction series through
`2a57077 Remove obsolete replay plan builder`, plus the Route 24-28 CLI
extraction series through the approval prompt bridge.

This status is an ownership synchronization, not a release-readiness claim. The
current large-file sizes observed in this pass are:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 11,646 lines.
- `packages/ts-shell/src/session/SessionManager.ts`: 4,815 lines.
- `packages/ts-shell/src/entrypoints/cli.tsx`: 3,099 lines.

Completed orchestration extractions:

| Responsibility | Current owner | Status |
| --- | --- | --- |
| Shell result assembly | `packages/ts-shell/src/orchestration/shellResultAssembly.ts` | completed |
| Runtime outcome projection | `packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts` | completed |
| Runtime/session handoff projection | `packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts` | completed |
| Tool execution failure/outcome projection | `packages/ts-shell/src/orchestration/toolExecutionOutcomeProjection.ts` | completed |
| DoNext / next-action text projection | `packages/ts-shell/src/orchestration/doNextProjection.ts` | completed |

Completed session extractions:

| Responsibility | Current owner | Status |
| --- | --- | --- |
| Resume/stopped/continue context construction | `packages/ts-shell/src/session/sessionResumeContextBuilder.ts` | completed |
| Shared continuity types | `packages/ts-shell/src/session/sessionContinuityTypes.ts` | completed |
| Compact retention planning/projection | `packages/ts-shell/src/session/compactRetentionPlanner.ts` | completed |
| Mutation/planned-files continuity state | `packages/ts-shell/src/session/mutationContinuityState.ts` | completed |
| Replay transcript/runtime seed construction | `packages/ts-shell/src/session/sessionReplayBuilder.ts` | completed |
| Obsolete replay plan builder | `packages/ts-shell/src/session/replayPlanBuilder.ts` | removed; no runtime/test call sites |

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

Search checks from this pass:

- `replayPlanBuilder|buildReplayPlanFromSnapshot` has no matches under
  `packages/ts-shell/src`.
- The orchestration extraction modules are imported by
  `runMvpIntegratedFlow.ts` or their focused tests.
- The session extraction modules are imported by `SessionManager.ts` or focused
  tests.
- The CLI extraction modules listed above exist, have focused tests, and are
  imported by `cli.tsx` where runtime wiring still needs them.
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
  control plane, Rust execution plane, and `contracts/` boundary remain the
  source of truth.

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
- Permission handling benefits from explicit request/reply/error models. That
  supports extracting approval context from `SessionManager.ts` only if the
  extraction remains persistence/projection-oriented and does not change
  authorization semantics.
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
provider calls and adapter setup, dispatcher calls, workflow planning, mutation
target selection, mutation execution and verification read/write sequencing,
continuation lineage, result handoff, and high-level orchestration wiring.

The file should continue to retain:

- Query/control flow sequencing.
- Provider calls and provider adapter setup.
- Dispatcher calls.
- Mutation execution and verification read/write sequencing.
- High-level orchestration wiring.
- Dependency wiring for MCP gateway, sandbox, provider mode, abort signal, and
  escalation prompt handler.

The file should not regain ownership of completed projection modules:

- Shell result assembly.
- Runtime outcome projection.
- Runtime/session handoff projection.
- Tool execution failure/outcome projection.
- DoNext / next-action text projection.

Remaining candidates to consider later:

| Candidate | Target shape | Risk | Timing |
| --- | --- | --- | --- |
| Provider outcome projection / safe provider diagnostic projection | Pure redacted provider/model-output outcome facts | higher-risk | later |
| Capability boundary projection, if a pure projection remains | Pure capability stop/diagnostic facts | medium/high | later |

Provider call execution itself should not be listed as migration work. The
orchestrator owns deciding when provider execution is needed and wiring the
adapter call.

### `SessionManager.ts`

Current boundary: public session lifecycle facade, persistence reads/writes,
locking, session loading, current session selection, project binding, recovery
trust boundary, approval/request parsing where still tightly coupled, compact
trigger control where lifecycle-adjacent, and calls to the extracted resume,
compact, continuity, mutation, and replay builders.

The file should continue to retain:

- Public session lifecycle facade.
- Persistence read/write timing.
- Locking and atomic write boundaries.
- Session loading.
- Current session selection facade.
- Project binding facade.
- Recovery trust boundary.
- Approval/request parsing while it remains tightly coupled to durable state
  shape.
- Compact trigger control while it remains lifecycle-adjacent.

The file should not regain ownership of completed builder modules:

- Resume/stopped/continue context construction.
- Shared continuity type definitions.
- Compact retention planning/projection.
- Mutation/planned-files continuity state.
- Replay transcript/runtime seed construction.
- `replayPlanBuilder.ts`, which was removed because it had no runtime/test call
  sites.

Remaining candidates to consider later:

| Candidate | Target shape | Risk | Timing |
| --- | --- | --- | --- |
| Approval context persistence / approval request parsing | Pure persistence/projection helper, no authorization changes | medium/high | later |
| Session persistence gateway | Storage gateway over metadata/state/transcript I/O | high | later |
| Project binding helper | Pure binding decision helper if it can be isolated | medium/high | later |
| Current-session selection helper expansion | More selection logic outside facade, only with strong tests | medium/high | later |

### `cli.tsx`

Route 24-28 completed the low/medium-risk CLI extraction batches for argument
parsing, mode dispatch, print/stdin runners, provider/workspace/MCP surfaces,
slash command registry/help rendering, and approval prompt display bridging.

The file should continue to retain:

- Process bootstrap.
- High-level runtime/session/provider wiring.
- Interactive loop and readline lifecycle.
- Actual command execution.
- Trust policy evaluation.
- Allow-once cache and allow-always persistence.
- Runtime handler wiring.
- Terminal lifecycle and process exit boundary.

The file should not regain ownership of completed CLI modules:

- CLI argument parsing and slash-command positional fallback handling.
- CLI mode dispatch.
- Print/stdin mode runner control.
- Provider readiness display projection.
- Slash command registry/help/session command map rendering.
- Workspace attach/status display projection.
- MCP control-plane display projection.
- Approval prompt/display/provenance/response text surface.

Remaining candidates to consider later:

| Candidate | Target shape | Risk | Timing |
| --- | --- | --- | --- |
| Interactive/TUI loop boundary audit | Read-only boundary audit before any extraction | high | later |
| Runtime invocation wrapper | Pure wrapper only, with strong CLI/runtime tests | medium/high | later |
| Command execution bridge | Bridge only if command semantics and mode precedence do not change | medium/high | later |
| Approval semantic/persistence work | Persistence/semantic split only; no authorization behavior change | high | later |

Reference calibration for CLI ownership:

- The CLI entrypoint should become closer to bootstrap, mode dispatch, and
  wiring; the completed Route 24-28 extraction moved the lower-risk typed args,
  dispatch, runner, and display surfaces in that direction.
- Command execution and approval semantics should not be confused with display
  surfaces. The display bridges can stay extracted while authorization,
  persistence, and actual command execution remain in `cli.tsx` until a
  dedicated higher-risk route exists.
- Interactive/TUI-related extraction is still higher risk even after args and
  mode dispatch moved out, because readline lifecycle, mode precedence, prompt
  transport, and process-exit behavior must remain stable.

## 4. Updated Ownership Tables

### `runMvpIntegratedFlow.ts`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Exported runtime entrypoints | `runMvpIntegratedFlow.ts` | keep | Composition boundary for runtime execution. |
| Query/control flow sequencing | `runMvpIntegratedFlow.ts` | keep | Core orchestration responsibility. |
| Provider calls / adapter setup | `runMvpIntegratedFlow.ts` | keep | Calls stay; only redacted projection may later move. |
| Dispatcher calls | `runMvpIntegratedFlow.ts` | keep | Execution wiring stays orchestration-level. |
| Mutation execution / verification read-write sequencing | `runMvpIntegratedFlow.ts` | keep | Do not migrate into projection helpers. |
| High-level orchestration wiring | `runMvpIntegratedFlow.ts` | keep | Owns dependency assembly and turn coordination. |
| Shell result assembly | `shellResultAssembly.ts` | completed | Pure assembly/projection owner. |
| Runtime outcome projection | `runtimeOutcomeProjection.ts` | completed | Pure runtime coding/mutation/blocked outcome projection. |
| Runtime/session handoff projection | `runtimeHandoffProjection.ts` | completed | Continuity and handoff facts. |
| Tool execution failure/outcome projection | `toolExecutionOutcomeProjection.ts` | completed | Verification failure classification and next actions. |
| DoNext / next-action text projection | `doNextProjection.ts` | completed | Target/edit execution failure wording. |
| Provider outcome / safe diagnostic projection | future module only if pure | deferred | Higher-risk because of redaction/provider attribution. |
| Capability boundary projection | future module only if still present and pure | deferred | Do not expand capability or taxonomy. |

### `SessionManager.ts`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Public session lifecycle facade | `SessionManager.ts` | keep | Existing callers depend on this API. |
| Persistence reads/writes | `SessionManager.ts` | keep | Gateway extraction is high risk/later. |
| Locking | `SessionManager.ts` | keep | Storage safety boundary. |
| Session loading | `SessionManager.ts` | keep | Tied to public lifecycle facade. |
| Current session selection | `SessionManager.ts` plus `currentSessionSelection.ts` | keep/later | Selection helper exists; broader extraction needs tests. |
| Project binding | `SessionManager.ts` | keep/later | Helper only if pure and behavior-preserving. |
| Recovery trust boundary | `SessionManager.ts` | keep | Lifecycle/recovery decision boundary. |
| Approval/request parsing | `SessionManager.ts` | keep/later | Candidate only as persistence/projection helper. |
| Compact trigger control | `SessionManager.ts` | keep | Lifecycle-adjacent; retention planning already moved. |
| Resume/stopped/continue context construction | `sessionResumeContextBuilder.ts` | completed | Called from `SessionManager.ts`. |
| Shared continuity types | `sessionContinuityTypes.ts` | completed | Shared session continuity shape. |
| Compact retention planning/projection | `compactRetentionPlanner.ts` | completed | Pure retention plan application. |
| Mutation/planned-files continuity state | `mutationContinuityState.ts` | completed | Preserves planned/changed/failed/verified continuity facts. |
| Replay transcript/runtime seed construction | `sessionReplayBuilder.ts` | completed | `SessionManager.ts` delegates replay preparation. |
| Obsolete replay plan builder | deleted | completed | No `replayPlanBuilder` or `buildReplayPlanFromSnapshot` call sites remain. |
| Session persistence gateway | future module | deferred | High risk/later; no schema or persistence behavior change now. |

### `cli.tsx`

| Responsibility | Current owner | Status | Notes |
| --- | --- | --- | --- |
| Process entrypoint/bootstrap | `cli.tsx` | keep | Should remain composition root. |
| High-level runtime/session/provider wiring | `cli.tsx` | keep | Composition root for shell runtime. |
| Interactive loop / readline lifecycle | `cli.tsx` | keep | Higher-risk boundary; do not move casually. |
| Actual command execution | `cli.tsx` | keep | Command semantics remain in the entrypoint path for now. |
| Trust policy evaluation | `cli.tsx` | keep | Authorization semantics stay out of display bridges. |
| Allow-once cache / allow-always persistence | `cli.tsx` | keep | Approval persistence semantics stay here for now. |
| Runtime handler wiring | `cli.tsx` | keep | Owns runtime handler composition. |
| Terminal lifecycle / process exit boundary | `cli.tsx` | keep | Entrypoint process responsibility. |
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
| Interactive/TUI loop boundary audit | future audit | deferred | Later/high risk. |
| Runtime invocation wrapper | future module only if pure | deferred | Requires strong tests. |
| Command execution bridge | future bridge only if semantics are unchanged | deferred | Preserve mode precedence and command behavior. |
| Approval semantic/persistence split | future module only with explicit route | deferred | Later/high risk. |

## 5. Migration Priority Table

Completed P0/P1 items are no longer future work:

| Completed item | Source file | Current module/status |
| --- | --- | --- |
| `shellResultAssembly` | `runMvpIntegratedFlow.ts` | `shellResultAssembly.ts` |
| `runtimeOutcomeProjection` | `runMvpIntegratedFlow.ts` | `runtimeOutcomeProjection.ts` |
| `runtimeHandoffProjection` | `runMvpIntegratedFlow.ts` | `runtimeHandoffProjection.ts` |
| `toolExecutionOutcomeProjection` | `runMvpIntegratedFlow.ts` | `toolExecutionOutcomeProjection.ts` |
| `doNextProjection` | `runMvpIntegratedFlow.ts` | `doNextProjection.ts` |
| `sessionResumeContextBuilder` | `SessionManager.ts` | `sessionResumeContextBuilder.ts` |
| `sessionContinuityTypes` | `SessionManager.ts` | `sessionContinuityTypes.ts` |
| `compactRetentionPlanner` | `SessionManager.ts` | `compactRetentionPlanner.ts` |
| `mutationContinuityState` | `SessionManager.ts` | `mutationContinuityState.ts` |
| `sessionReplayBuilder` | `SessionManager.ts` | `sessionReplayBuilder.ts` |
| `replayPlanBuilder` removal | `SessionManager.ts`/session replay area | deleted; no call sites |
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

Remaining candidates:

| Priority | Source file | Candidate module | Risk | Timing |
| --- | --- | --- | --- | --- |
| Later orchestration projection | `runMvpIntegratedFlow.ts` | provider outcome projection | higher-risk | later |
| Later session helper | `SessionManager.ts` | approval context extraction | medium/high | later |
| Later session gateway | `SessionManager.ts` | session persistence gateway | high | later |
| Possible CLI audit | `cli.tsx` | interactive/TUI loop boundary audit | high | later/read-only first |
| Possible CLI wrapper | `cli.tsx` | runtime invocation wrapper | medium/high | later only if pure |
| Possible architecture reset | docs/code map | maintainability score reassessment | low | next direction candidate |

## 6. Migration Batches

### Completed/Marginally Open: runMvpIntegratedFlow Batch 1

Outcome/result/handoff projection is mostly complete.

Completed:

- `shellResultAssembly.ts`
- `runtimeOutcomeProjection.ts`
- `runtimeHandoffProjection.ts`
- `toolExecutionOutcomeProjection.ts`
- `doNextProjection.ts`

Remaining from this family:

- Provider outcome / safe diagnostic projection is deferred.
- Capability boundary projection is deferred unless a clearly pure projection
  remains.

Stop condition for this family: do not move provider call execution, provider
auth, writer capability, MCP core, or mutation capability limits.

### Completed/Marginally Open: SessionManager Context/Compact/Continuity/Replay Batch

Session context, compact, continuity, and replay ownership is mostly complete.

Completed:

- `sessionResumeContextBuilder.ts`
- `sessionContinuityTypes.ts`
- `compactRetentionPlanner.ts`
- `mutationContinuityState.ts`
- `sessionReplayBuilder.ts`
- deletion of obsolete `replayPlanBuilder.ts`

Remaining from this family:

- Approval context persistence/parsing is deferred.
- Session lifecycle/persistence gateway work is deferred.
- Project binding and current-session helper expansion are deferred until they
  can be pure and well tested.

Stop condition for this family: no session schema migration, new persistence
layer, broad history compaction rewrite, or recovery trust expansion.

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

### Deferred/High Risk: CLI Interactive/Runtime Execution Batch

Remaining CLI work should not start as automatic extraction. It should begin
with a boundary audit or a narrowly testable pure wrapper.

Remaining:

- Interactive/TUI loop boundary audit: deferred/high risk.
- Runtime invocation wrapper: only if pure and well tested.
- Command execution bridge: only if it preserves command semantics and mode
  precedence.
- Approval semantic/persistence work: later/high risk.

Stop condition for this family: no CLI grammar rewrite, UI redesign, provider
config migration, default real-provider execution, authorization behavior
change, or live TTY readiness claim.

## 7. Validation Strategy

Validation remains tied to the module family being changed.

Local validation examples recently used or relevant to completed modules:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeHandoffProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/toolExecutionOutcomeProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/doNextProjection.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/providerReadinessCliSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/slashCommandRegistry.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/cliWorkspaceSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/mcpControlCliSurface.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/entrypoints/approvalPromptBridge.test.ts`

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

## 8. Recommended Next Migration

Recommended next direction: architecture maintainability score reassessment
before selecting another implementation migration.

Target file:

- `docs/design/runtime-module-ownership-map.md` or a dedicated assessment
  artifact if a future route explicitly allows one.

Target module:

- None for the reassessment itself. If implementation follows, pick one of:
  `runMvpIntegratedFlow.ts` provider outcome / safe diagnostic projection,
  `SessionManager.ts` approval/persistence ownership audit, or a read-only
  `cli.tsx` interactive boundary audit.

Why now:

- The recent runMvp and SessionManager P0/P1 projection/context batches are
  mostly complete.
- Route 24-28 completed the lower-risk CLI args/mode/runner/surface batches.
- The remaining obvious candidates are higher risk: provider diagnostic
  projection must preserve redaction and attribution; SessionManager approval
  work must not change authorization or persistence semantics; CLI interactive
  work touches readline, command execution, and terminal lifecycle.
- A reassessment can compare the remaining hotspot size, ownership clarity,
  validation coverage, and risk before choosing the next implementation route.

Best implementation candidate after reassessment:

- `runMvpIntegratedFlow.ts` provider outcome / safe diagnostic projection, but
  only if a clearly pure projection remains and can be tested without provider
  execution, provider auth changes, or default gate changes.

Allowed files for that future route:

- For reassessment: docs only, unless the route explicitly asks for read-only
  code inspection.
- For provider outcome projection: `packages/ts-shell/src/orchestration/`
  focused projection module and tests, with minimal wiring in
  `runMvpIntegratedFlow.ts` only if the projection is pure.

Forbidden files for that future route:

- `packages/ts-shell/src/session/SessionManager.ts`.
- Provider/auth core.
- MCP core.
- `packages/ts-shell/src/entrypoints/cli.tsx`, unless the future route is a
  read-only CLI audit.
- `scripts/*`.
- `package.json`.
- Default gates.

Local validation for that future route:

- For reassessment: `rtk git diff --check`.
- For provider projection implementation: focused projection tests, relevant
  runtime outcome/result tests, `rtk npm run verify:result-contract`,
  `rtk npm run build -w packages/ts-shell`, and `rtk git diff --check`.

Stop conditions for that future route:

- Provider config or credential handling changes.
- Provider call execution migration.
- Provider auth/core changes.
- Redaction weakening.
- Default gate changes or full real-provider execution.
- Runtime invocation behavior changes outside a pure projection.

SessionManager approval/persistence ownership audit remains a valid alternate
next direction if the goal is to continue session work. CLI interactive
boundary audit remains valid if the goal is to continue CLI work, but it should
start read-only and not as another extraction by default.

## 9. Readiness Claims Not Changed

This document update does not claim:

- Broad release readiness.
- 3-file writes.
- 3+ file mutation support.
- Broad `apply_patch`.
- Delete/move/rollback/fuzzy patch support.
- External MCP readiness.
- Default real-provider readiness.
- Full runtime architecture completion.

The runtime architecture is clearer after the completed extraction work, but it
is not fully solved.

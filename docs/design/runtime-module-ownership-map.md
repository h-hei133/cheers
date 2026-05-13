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
`2a57077 Remove obsolete replay plan builder`.

This status is an ownership synchronization, not a release-readiness claim. The
current large-file sizes observed in this pass are:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`: 11,646 lines.
- `packages/ts-shell/src/session/SessionManager.ts`: 4,815 lines.
- `packages/ts-shell/src/entrypoints/cli.tsx`: 3,693 lines.

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

Search checks from this pass:

- `replayPlanBuilder|buildReplayPlanFromSnapshot` has no matches under
  `packages/ts-shell/src`.
- The orchestration extraction modules are imported by
  `runMvpIntegratedFlow.ts` or their focused tests.
- The session extraction modules are imported by `SessionManager.ts` or focused
  tests.
- No CLI extraction module names such as `cliArgs`, `cliModeDispatch`,
  `cliPrintModeRunner`, `cliStdinModeRunner`, `slashCommandRegistry`,
  `approvalPromptBridge`, or `providerReadinessCliSurface` exist yet.

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

No runtime extraction has completed yet for `cli.tsx`; CLI extraction remains
pending.

The file currently remains the process entrypoint and still owns option
parsing, startup/bootstrap, print/stdin/replay/interactive mode branching,
slash command bridge behavior, approval prompt bridge behavior, provider
readiness display, session switching surfaces, workspace attach/status
rendering, MCP control-plane rendering, runtime invocation, and terminal output
behavior.

Candidate modules remain:

- `cliArgs.ts`
- `cliModeDispatch.ts`
- `cliPrintModeRunner.ts`
- `cliStdinModeRunner.ts`
- `slashCommandRegistry.ts`
- `approvalPromptBridge.ts`
- `providerReadinessCliSurface.ts`

Reference calibration for CLI ownership:

- The CLI entrypoint should become closer to bootstrap, mode dispatch, and
  wiring.
- Command/slash/approval/provider-readiness display should not live long-term
  in one entrypoint file.
- Interactive/TUI-related extraction is higher risk and should come after args
  and mode dispatch, because mode precedence and prompt transport must remain
  stable.

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
| CLI arg parsing | `cli.tsx` | pending | Candidate `cliArgs.ts`; likely first CLI batch. |
| Mode dispatch | `cli.tsx` | pending | Candidate `cliModeDispatch.ts`; after typed args. |
| Print mode runner | `cli.tsx` | pending | Candidate `cliPrintModeRunner.ts`; after args/mode dispatch. |
| Stdin mode runner | `cli.tsx` | pending | Candidate `cliStdinModeRunner.ts`; after args/mode dispatch. |
| Slash command registry/bridge | `cli.tsx` and existing slash modules | pending | Candidate `slashCommandRegistry.ts`; avoid grammar changes. |
| Approval prompt bridge | `cli.tsx` | pending | Candidate `approvalPromptBridge.ts`; no authorization changes. |
| Provider readiness CLI surface | `cli.tsx` and readiness helpers | pending | Candidate `providerReadinessCliSurface.ts`; preserve redaction. |
| Interactive/TUI loop details | `cli.tsx` | deferred | Higher-risk; later than args/mode dispatch. |

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

Remaining candidates:

| Priority | Source file | Candidate module | Risk | Timing |
| --- | --- | --- | --- | --- |
| Next possible CLI batch | `cli.tsx` | `cliArgs.ts` | low/medium | next |
| Next possible CLI batch | `cli.tsx` | `cliModeDispatch.ts` | medium | after `cliArgs.ts` |
| Later CLI runners | `cli.tsx` | `cliPrintModeRunner.ts` / `cliStdinModeRunner.ts` | medium | after args/mode dispatch |
| Later orchestration projection | `runMvpIntegratedFlow.ts` | provider outcome projection | higher-risk | later |
| Later session helper | `SessionManager.ts` | approval context extraction | medium/high | later |
| Later session gateway | `SessionManager.ts` | session persistence gateway | high | later |

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

### Pending: CLI Mode/Command/Approval Batch

CLI extraction has not started.

Likely sequence:

1. `cliArgs.ts`
2. `cliModeDispatch.ts`
3. Print/stdin mode runners
4. Slash/approval/provider-readiness surfaces
5. Interactive/TUI-related extraction only after lower-risk dispatch seams are
   stable

Stop condition for this family: no CLI grammar rewrite, UI redesign, provider
config migration, default real-provider execution, or live TTY readiness claim.

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

Recommended next migration: start the CLI batch with typed argument parsing.

Target file:

- `packages/ts-shell/src/entrypoints/cli.tsx`

Target module:

- `packages/ts-shell/src/entrypoints/cliArgs.ts`

Why now:

- The recent runMvp and SessionManager P0/P1 projection/context batches are
  mostly complete.
- `cli.tsx` has no completed runtime extraction yet and remains 3,693 lines.
- Reference comparison supports moving CLI entrypoints toward bootstrap, mode
  dispatch, and wiring before extracting interactive/TUI behavior.
- Typed args are lower risk than provider outcome projection or approval
  context persistence because they can be tested without provider execution,
  session schema changes, or writer behavior changes.

Allowed files for that future route:

- `packages/ts-shell/src/entrypoints/cli.tsx` for minimal wiring only.
- `packages/ts-shell/src/entrypoints/cliArgs.ts`.
- A focused CLI args test if needed under the existing test conventions.

Forbidden files for that future route:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`.
- `packages/ts-shell/src/session/SessionManager.ts`.
- Provider/auth core.
- MCP core.
- `scripts/*`.
- `package.json`.
- Default gates.

Local validation for that future route:

- `rtk npm run verify:cli-entry`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts` if the
  existing baseline still covers the parsed option behavior.
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

Stop conditions for that future route:

- CLI grammar rewrite.
- Mode precedence changes.
- Provider config or credential handling changes.
- Runtime invocation behavior changes.
- Approval authorization changes.
- Interactive/TUI redesign.

Provider outcome projection remains a valid later candidate if a clearly pure,
redacted projection remains in `runMvpIntegratedFlow.ts`. Approval context
extraction remains a valid later candidate if it can be kept to durable
persistence/projection shape and not authorization behavior.

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

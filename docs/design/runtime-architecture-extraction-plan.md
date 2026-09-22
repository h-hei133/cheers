# Runtime Architecture Extraction Plan

Route: 16
Date: 2026-05-12
Status: planning only

This document is a runtime maintainability plan. It does not implement any
extraction, does not change product behavior, and does not change readiness
claims.

## 1. Executive Summary

The next maintainability problem is no longer missing deterministic evidence.
The current runtime has useful gates for selected-workspace mutation, candidate
mutation, stopped continuity, local MCP execution, result contracts, long
session durability, and deterministic release aggregation. The remaining risk is
that the runtime path still concentrates too many responsibilities in three
large files:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` at 12,703
  lines.
- `packages/ts-shell/src/session/SessionManager.ts` at 5,857 lines.
- `packages/ts-shell/src/entrypoints/cli.tsx` at 3,693 lines.

The extraction program should move complete runtime responsibilities into named
modules while preserving current behavior. The most important near-term target
is `runMvpIntegratedFlow.ts`, because it currently owns orchestration wiring,
workflow planning, provider calls, tool lifecycle dispatch, mutation handoff,
result assembly, failure projection, and terminal-facing delivery.

Recommended first implementation route:

- Extract `shellResultAssembly.ts` from `runMvpIntegratedFlow.ts`.
- Scope: move coding result assembly, action-result delivery, stopped/failure
  action-blocker projection, and execution summary formatting into a focused
  projection module.
- Reason: it is behaviorally important, self-contained enough to test, avoids
  provider execution changes, avoids session persistence changes, and creates a
  stable receiving surface for later provider/tool/mutation extractions.

This plan intentionally does not continue verifier decomposition. Route 15
covered verifier-side maintainability. Route 16 is runtime-only.

## 2. Why Runtime Architecture Maintainability Is Now The Priority

The project now has enough deterministic gates that the biggest risk is not
whether a narrow happy path can be proved. The risk is whether future runtime
changes can be made without editing the same giant files and accidentally
crossing provider, session, writer, MCP, or result-surface boundaries.

Current evidence supports a bounded product claim:

- MVP selected-workspace single-file existing `Update File` is deterministic.
- Candidate mutation covers single-file create and exactly-two update.
- Exactly-three update planning/no-write exists as stopped evidence.
- Planned files continuity distinguishes planned targets from changed files.
- Unsupported patch shapes stop/error instead of becoming success claims.
- Local deterministic MCP execution and MCP error taxonomy are covered.
- Long-session durability covers compact, reload, `/continue`, mutation success,
  and partial failure continuity.
- `verify:release:deterministic` is the deterministic release-candidate
  aggregate and must remain deterministic-only.

The next maintainability step should make runtime responsibilities easier to
change without adding capability. The goal is not lower line count by itself;
the goal is ownership clarity:

- orchestration wiring stays in orchestration
- result/failure projection moves out of orchestration
- session persistence stays separate from resume/compact policy
- CLI dispatch is separated from command semantics and runtime invocation
- provider/MCP/writer boundaries stay explicit and gated

## 3. Current Evidence Baseline

Project-state documents and scripts currently describe a bounded readiness
surface:

- `PROJECT_STATE.md` records Routes 01-12 and release-readiness closeout as
  limited dogfood / deterministic release-candidate, not broad release.
- `RUNBOOK.md` identifies `/connect` as the current provider onboarding command,
  distinguishes compact and verbose output contracts, and lists
  `verify:release:deterministic` as the deterministic meta gate.
- `package.json` includes route-relevant commands:
  - `verify:real-user-capabilities`
  - `verify:real-user-capabilities:two-file-cli-evidence`
  - `verify:real-user-capabilities:unsupported-patch-e2e`
  - `verify:real-user-capabilities:three-file-planning-no-write`
  - `verify:real-user-capabilities:planned-files-continuity`
  - `verify:session-durability:long`
  - `verify:mcp:local-execution`
  - `verify:mcp:error-taxonomy`
  - `verify:result-contract`
  - `verify:release:deterministic`
- `docs/audits/routes-01-12-closeout.md` confirms that prior routes did not
  widen default gates, real-provider default behavior, external MCP readiness,
  or mutation capability.
- `docs/design/three-file-planning-no-write-evaluation.md` confirms that
  exactly-three update planning is no-write stopped evidence, not 3-file write
  support.

Baseline boundaries this plan must preserve:

- No broad `apply_patch`.
- No 3-file writes or 3+ file mutation support.
- No delete/move.
- No rollback or atomicity.
- No external MCP readiness claim.
- No default real-provider readiness claim.
- No release/default gate membership change.
- No provider/auth core change.

## 4. Reference Comparison Summary

The reference comparison was read-only and narrow. No reference code or
architecture was copied wholesale.

Search terms used for Claude Code:

- `compact`, `resume`, `transcript`, `slash command`, `print mode`,
  `tool result`, `permission`

Claude Code snippets inspected:

- `/home/wang/projects/source-claudecode/query.ts`
  - compaction is handled by compact services before the query call continues
  - tool result summary logic is separate from direct tool dispatch loops
- `/home/wang/projects/source-claudecode/services/compact/compact.ts`
  - compact behavior has explicit constants, post-compact restoration policy,
    message normalization, and hook integration
- `/home/wang/projects/source-claudecode/entrypoints/agentSdkTypes.ts`
  - session transcript, listing, metadata, rename, tag, and fork are represented
    as distinct API surfaces even where implementation is elsewhere

Useful Claude Code lessons:

- A query loop can remain the coordinator while compact/message preparation is
  owned by compact-specific services.
- Transcript/session access benefits from named read/list/mutate/fork surfaces
  instead of one manager method cluster owning every user-facing reentry shape.
- Tool-result processing should have its own projection path before being fed
  into later summaries or transcript state.

Rejected Claude Code ideas:

- Reactive compaction, prompt-cache editing, hook ecosystems, sidechain agents,
  and complex forked-agent state are not current scope.
- UI-specific permission dialogs and remote session machinery are not applicable
  to this repository's narrower CLI/runtime boundary.
- This project should not mirror Claude Code's file layout; it should preserve
  the existing TS product runtime/control plane, explicit execution boundary,
  Rust native executor candidate, and contracts boundary.

Search terms used for opencode:

- `apply_patch`, `permission denied`, `tool execution`, `session output`,
  `changed files`, `failed files`, `snapshot`, `revert`, `TUI`, `command`

opencode snippets inspected:

- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
  - parsing, per-file metadata, permission request metadata, and application
    are distinct phases inside the tool
- `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
  - permission ask/reply/list is modeled as a service with explicit errors and
    events
- `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`
  - session persistence uses event projectors rather than UI/CLI code directly
    mutating every table shape
- `/home/wang/projects/opencode/packages/opencode/src/cli/cmd/run.ts`
  - CLI command output rendering is a narrow projection over tool/session parts

Useful opencode lessons:

- Tool permission metadata and result metadata should be projected explicitly,
  so the CLI can render without owning execution internals.
- Session persistence and user-visible session projections should be separate
  concepts even if this project keeps a simpler file-based substrate.
- CLI command runners can render execution parts without becoming the owner of
  provider, tool, or writer semantics.

Rejected opencode ideas:

- Broad `apply_patch` support with add/update/delete/move is explicitly out of
  scope.
- Revert/unrevert, snapshots, client/server APIs, TUI plugins, and external
  command registries are not current readiness claims.
- opencode's permission service shape is useful as a boundary lesson, but this
  route must not replace the current approval bridge or provider/auth core.

## 5. Target Files And Current Responsibility Maps

### runMvpIntegratedFlow.ts

Current size: 12,703 lines.

Current responsibilities:

- exported runtime entrypoints: `runMvpIntegratedFlow`,
  `streamMvpIntegratedFlow`
- apply_patch runtime route pre-check through
  `runApplyPatchRuntimeRouteIfRequested`
- workspace file reads and workspace-boundary checks
- integrated runner construction with dispatcher, sandbox, provider config, MCP
  gateway, and synthetic/real provider selection
- workflow task intent parsing and planning
- continuation-state merging, lineage extraction, repair context derivation,
  target rebinding, and cross-file repair candidate recovery
- query loop and workflow execution in `executeWorkflowTaskPlan`
- provider/model adapter setup and streaming response handling
- tool dispatch lifecycle and QueryEvent emission
- approval requested/resolved event insertion
- tool execution projection through `projectToolLifecycle`
- verification command classification and next-action projection
- mutation instruction resolution, target selection, low-risk generated content,
  scoped replace handling, and mutation execution integration
- mutation result aggregation and mutation verification handoff
- action-result contract assembly in `assembleActionResultContract`
- user-facing delivery in `buildActionResultDelivery`
- verbose execution summary rendering in `renderExecutionSummary`
- read/explain/summary grounded deliverables
- reflective state query handling
- approval memory and scoped approval authority resolution
- runtime coding result construction in `buildCodingResult`
- actionable blocker classification and `DoNext` projection
- terminal-visible result shaping and resultMapper handoff
- sessionRuntime handoff through QueryEvents and OrchestrationResult

Observed issue:

- The file is not only an orchestrator. It owns policy, projection,
  user-facing wording, continuity lineage, mutation selection, provider/tool
  interpretation, and final result assembly. Future fixes in any of those areas
  require editing the same file.

### SessionManager.ts

Current size: 5,857 lines.

Current responsibilities:

- directory-based session substrate, metadata, transcript, and state paths
- current-session selection by project root
- session creation, loading, deletion, rename, and root rebinding
- requested workspace root / git root / direct root binding
- resume and try-resume behavior
- turn barriers, run phases, interrupted/completed/error/terminated state
- approval audit decision recording
- transcript append, normalization, repair, and replay preparation
- recovery snapshot and lifecycle index derivation
- runtime state seed building
- recent session and recent project context listing
- reentry summary scoring and recovery suggestion selection
- session reentry surface construction
- resume eligibility and trust-boundary classification
- continuity snapshot building
- compact continuity context and prompt continuity context
- stopped-session continuity extraction
- mutation continuity, planned-files continuity, write continuity, seed
  influence, success/failure handoff diagnostics
- legacy permission root rebasing and permission memory parsing
- approval audit history persistence and parsing from summaries/state
- path target extraction and continuation prompt classification
- auto-compact retention
- state snapshot read/write, atomic writes, lock retry, and transient I/O
  handling

Observed issue:

- The file mixes a storage gateway, a session lifecycle service, a reentry
  surface builder, a replay builder, a compact planner, approval-memory
  persistence, and low-level durability mechanics. It already imports useful
  extracted modules, but too much policy remains in private methods.

### cli.tsx

Current size: 3,693 lines.

Current responsibilities:

- CLI option parsing and runtime startup
- provider credential resolution and readiness display
- session bootstrap and project/root binding diagnostics
- stdin transport parsing and sequential prompt execution
- `--print` mode
- replay-file mode
- interactive readline loop and prompt rendering
- slash command registration through `routeSlashCommand`
- `/continue`, `/resume`, `/sessions`, `/mcp`, `/permissions`, provider
  control, and workspace info command surfaces
- non-interactive approval mode parsing and prompt-derived approval decisions
- interactive approval prompt bridge and answer handling
- runtime invocation through `streamMvpIntegratedFlow`
- ShellSessionRuntime construction and turn execution
- terminal output rendering, turn boundaries, stopped/error fallback, and
  result block handling
- MCP status/refresh/tools/doctor control-plane rendering
- session switching diagnostics and current-session display
- workspace root resolution and root-mode selection

Observed issue:

- The entrypoint is more than composition. It owns transport modes, command
  semantics, approval policy interpretation, provider readiness surface,
  session switch diagnostics, and runtime invocation details. This makes CLI
  behavior difficult to test without running the full entrypoint.

## 6. Existing Extractions And What They Solved

### mutationRoutingProjection.ts

Status: useful but partial.

What it solved:

- Localized apply_patch runtime route selection.
- Keeps no-write, create, exactly-two update, exactly-three planning/no-write,
  and single-file write projection out of the central flow.
- Preserves explicit runtime opt-in and workspace-write opt-in gates.

Remaining gap:

- The central flow still creates the workspace authority and still owns
  pre-route wiring. This module should not be expanded into provider or session
  policy.

### mutationExecution.ts

Status: useful but partial.

What it solved:

- Gives mutation branch execution a named place away from result projection.

Remaining gap:

- Higher-level mutation instruction resolution, result assembly, verification
  interpretation, and continuation handoff remain in `runMvpIntegratedFlow.ts`.

### patchMutationLane.ts

Status: complete enough for current single-file lane.

What it solved:

- Keeps the bounded single-file replace patch lane separate from orchestration.

Do not expand now:

- This route must not add broad apply_patch, delete/move, rollback, fuzzy patch,
  or 3-file write behavior.

### patchResult/*

Status: strong focused extraction family.

What it solved:

- Workspace authority, route gates, production/no-write route results, mutation
  verification projection, create route, multi-file route, and exactly-three
  planning/no-write have named modules and focused tests.

Remaining gap:

- Runtime orchestration still assembles final coding results and terminal
  wording after route results are produced.

### patchApplication/*

Status: complete enough for low-level patch application.

What it solved:

- Single-file create/update, two-file update, and no-partial-apply mechanics are
  not embedded in runtime orchestration.

Do not expand now:

- Do not make this a general patch engine in the architecture extraction route.

### compactContinuitySummary.ts

Status: useful but partial.

What it solved:

- Moved compact continuity summary merging and approval/write/seed/failure
  continuity inserts out of `SessionManager.ts`.

Remaining gap:

- `SessionManager.ts` still owns when compact happens, what evidence is
  extracted, how prompt continuity snapshots are shaped, and how state snapshot
  persistence interacts with compact retention.

### stoppedSessionContinuity.ts

Status: useful but partial.

What it solved:

- Localized stopped-session continuity kind classification, write continuity,
  and failure handoff diagnostic generation.

Remaining gap:

- `SessionManager.ts` still owns extraction of the surrounding recovery and
  reentry snapshot and still carries many parsing helpers.

### sessionStateSurface.ts

Status: useful surface extraction.

What it solved:

- Rendering session list/current/switched/stopped-continuation guidance is out
  of `cli.tsx`.

Remaining gap:

- CLI still owns when to call these surfaces, session-switch diagnostics, and
  command routing around them.

### resultMapper.ts

Status: complete enough for generic terminal-to-orchestration mapping.

What it solved:

- Query terminal truthfulness and coding-result terminal downgrades are not
  embedded in the CLI.

Remaining gap:

- `runMvpIntegratedFlow.ts` still constructs the coding result and actionable
  failure contract that resultMapper consumes.

### toolLifecycleProjection.ts

Status: strong projection module.

What it solved:

- Tool execution result classes, MCP failure classes, approval-denied, sandbox
  preflight, and next-action projections are outside orchestration.

Remaining gap:

- `runMvpIntegratedFlow.ts` still owns event emission and verification failure
  classification after the projection.

### toolExecutionProvenance.ts

Status: strong helper.

What it solved:

- Provides a normalized provenance kind/source/failure boundary from legacy tool
  result metadata.

Remaining gap:

- Provenance aggregation into coding result remains orchestration-owned.

### providerReadiness.ts

Status: useful provider-facing boundary.

What it solved:

- Real provider readiness classification, redaction, unsupported provider,
  missing-key/config, auth, network, and unknown failure attribution are not in
  the entrypoint.

Remaining gap:

- CLI still owns readiness display and runtime routing around provider
  credential resolution.

## 7. Remaining Responsibility Clusters

Runtime clusters still trapped in giant files:

- Shell/coding result assembly.
- Stopped/failure/actionable blocker projection.
- Provider call outcome interpretation.
- Tool execution event emission and verification failure projection.
- Mutation session handoff.
- Continuity and compact planning.
- Replay preparation and runtime seed assembly.
- Project/current-session binding.
- Session persistence gateway and lock/atomic I/O.
- CLI mode dispatch.
- CLI print/stdin/replay runners.
- Slash command bridge.
- Approval prompt bridge.
- Provider readiness CLI surface.
- Session switch/continue command bridge.

These should become modules only when a route can move a complete
responsibility with tests and validation.

## 8. Target Architecture Principles

Runtime architecture maintainability 4/5 should mean:

- `runMvpIntegratedFlow.ts` is orchestration wiring and high-level query loop
  coordination, not result/failure/session/tool/provider policy owner.
- `SessionManager.ts` is a lifecycle coordinator over named session services,
  not the owner of every persistence, replay, compact, approval-memory, and
  reentry detail.
- `cli.tsx` is entrypoint composition and mode dispatch, not owner of slash
  command semantics, approval state policy, provider readiness text, or session
  bridge details.
- Runtime result and failure surfaces have named projection modules.
- Session continuity and compact behavior have explicit builders/planners.
- CLI mode behavior is testable without reading the full entrypoint.
- No extraction route expands mutation capability.
- No extraction route changes default gates or readiness claims.
- Every route preserves answer-first compact output and verbose developer
  details.

## 9. Proposed Decomposition For runMvpIntegratedFlow.ts

### shellResultAssembly.ts

Source file:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

Responsibility:

- Own `assembleActionResultContract`, `buildActionResultDelivery`,
  `renderExecutionSummary`, `buildCodingResult`, and actionable blocker
  projection needed by shell/session result surfaces.

Inputs:

- task kind
- changed/failed/verified/unverified files
- patches
- verification summary
- repair notes
- evidence
- provenance
- cross-file remaining/degraded/skipped/failure metadata

Outputs:

- `CodingResultSummary`
- user-facing output string
- execution summary string
- actionable blocker next action

Side effects:

- none

Forbidden responsibilities:

- provider calls
- file reads/writes
- workspace authority construction
- session persistence
- CLI rendering
- mutation capability changes

Existing tests to reuse:

- `src/core/query/resultMapper.test.ts`
- `src/core/shell/sessionRuntime.test.ts`
- `src/cli-baseline.test.ts`
- candidate mutation suite
- result contract verifier

New tests needed:

- `packages/ts-shell/src/orchestration/shellResultAssembly.test.ts`
  covering success, verification-blocked, verification-failed, partial
  mutation, cross-file remaining, and actionable blocker `DoNext`.

Validation commands:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:result-contract`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run build -w packages/ts-shell`

Risk level:

- low to medium. The behavior is user-visible, but the responsibility is pure
  projection and can be tested without provider or filesystem behavior.

Recommended implementation route:

- Route A, first.

Why responsibility-sized:

- It moves a complete result/failure projection responsibility, not a small
  helper. Later provider/tool/mutation routes can target a stable result API.

### providerCallOutcomeProjection.ts

Responsibility:

- Interpret real/synthetic provider setup, provider readiness failures, request
  model selection, streaming output status, and model-output failure classes
  before orchestration assembles terminal results.

Inputs:

- provider mode
- provider credential/config resolution
- adapter response or failure
- selected model
- redacted provider failure text

Outputs:

- provider call outcome object
- terminal reason/classification suggestion
- redacted stop reason
- evidence markers

Side effects:

- none; provider I/O remains outside this module.

Forbidden responsibilities:

- reading provider config
- constructing auth
- calling network
- changing real-provider opt-in behavior
- exposing secrets

Tests:

- focused projection test with synthetic provider errors
- `providerReadiness.test.ts`
- provider readiness default/classification gates

Validation:

- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- `rtk npm run verify:release:deterministic`

Risk:

- medium, because redaction and readiness attribution are sensitive.

Recommended route:

- Route C, after result assembly is extracted.

### toolExecutionOutcomeProjection.ts

Responsibility:

- Own tool dispatch event shape, lifecycle projection consumption,
  verification failure classification, and verification next-action mapping.

Inputs:

- `ToolExecutionResult`
- tool identity
- approval requirement
- tool lifecycle projection

Outputs:

- `QueryEvent[]`
- `ToolLifecycleResult`
- verification blocked/failed classification
- provenance summary

Side effects:

- none in projection; actual dispatch remains injected by caller.

Forbidden responsibilities:

- registering tools
- invoking MCP gateway
- changing sandbox/approval behavior
- changing allowlist

Tests:

- existing tool lifecycle/provenance tests
- new orchestration projection test with denied, MCP unavailable, sandbox
  preflight, and generic failure cases

Validation:

- `rtk npm run verify:mcp:local-execution`
- `rtk npm run verify:mcp:error-taxonomy`
- `rtk npm run verify:result-contract`

Risk:

- medium.

Recommended route:

- Route D.

### mutationSessionHandoff.ts

Responsibility:

- Convert mutation execution summaries and mutation verification projection into
  continuity evidence consumed by session runtime and compact continuity.

Inputs:

- mutation execution results
- verification summary
- changed/failed/planned/unverified files
- action-result seed

Outputs:

- session handoff facts
- continuity evidence strings
- planned/changed/failed file projections

Side effects:

- none

Forbidden responsibilities:

- mutation routing
- patch application
- workspace write authority
- capability limits

Tests:

- mutation compact continuity
- planned-files continuity
- candidate mutation

Validation:

- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
- `rtk npm run verify:session-durability:long`

Risk:

- medium.

Recommended route:

- Route E.

### runtimeCapabilityBoundary.ts

Responsibility:

- Make runtime capability decisions explicit for supported/stopped mutation and
  no-write paths.

Inputs:

- task intent
- route options
- capability family

Outputs:

- capability decision object
- stop reason if unsupported

Side effects:

- none

Forbidden responsibilities:

- adding support for unsupported operations
- changing mutation route behavior
- changing default gates

Tests:

- mutation routing projection tests
- unsupported patch E2E verifier

Validation:

- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`

Risk:

- medium to high. Defer until the projection seams are stable.

Recommended route:

- Route G.

## 10. Proposed Decomposition For SessionManager.ts

### sessionPersistenceGateway.ts

Responsibility:

- Own metadata/state/transcript paths, atomic JSON writes, transcript append,
  lock retry, transient I/O classification, and safe state reads.

Inputs:

- session id
- session metadata/state/transcript events

Outputs:

- loaded session/state/transcript records
- write completion/failure

Side effects:

- session filesystem reads/writes under the configured home

Forbidden responsibilities:

- resume policy
- compact policy
- reentry scoring
- approval-memory semantics
- CLI rendering

Tests:

- long session durability
- session lifecycle
- targeted persistence gateway tests

Validation:

- `rtk npm run verify:session-durability:long`
- `rtk npm run verify:release:core`

Risk:

- high. Defer until simpler projection extractions are complete.

Recommended route:

- Route H.

### sessionResumeContextBuilder.ts

Responsibility:

- Build continuity snapshots, prompt continuity context, resume eligibility,
  and recovery trust boundary decisions from loaded session state.

Inputs:

- recovery snapshot
- session state snapshot
- current prompt
- transcript events

Outputs:

- `SessionContinuitySnapshot`
- prompt continuity context string
- resume eligibility
- trust-boundary block

Side effects:

- none

Forbidden responsibilities:

- file I/O
- session selection
- compact retention writes
- CLI output rendering

Tests:

- stopped-session continuity tests
- long session durability
- continue shell action runtime tests

Validation:

- `rtk npm run verify:session-durability:long`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`

Risk:

- medium.

Recommended route:

- Route B or F, after result assembly.

### compactRetentionPlanner.ts

Responsibility:

- Decide when auto-compact retention applies and build compact continuity input
  without owning persistence writes.

Inputs:

- turn count
- current session state snapshot
- coding result summaries
- approval audit state

Outputs:

- compact retention plan
- compact continuity summary input

Side effects:

- none

Forbidden responsibilities:

- writing state
- model/provider compaction calls
- changing compact threshold behavior

Tests:

- `mutationCompactContinuity.test.ts`
- `longSessionDurability.test.ts`

Validation:

- `rtk npm run verify:session-durability:long`

Risk:

- medium.

Recommended route:

- Route F.

### sessionReplayBuilder.ts

Responsibility:

- Own transcript normalization, replay preparation, turn pairing, and runtime
  state seed construction.

Inputs:

- transcript events
- recovery boundary
- session state

Outputs:

- replay plan
- runtime state seed
- transcript repair diagnostics

Side effects:

- none

Forbidden responsibilities:

- session file writes
- CLI replay mode parsing
- provider execution

Tests:

- replay and CLI baseline tests
- result contract

Validation:

- `rtk npm run verify:cli-entry`
- `rtk npm run verify:result-contract`

Risk:

- medium to high.

Recommended route:

- Route I.

### sessionProjectBinding.ts

Responsibility:

- Own current-session selection store, project root normalization, root
  mismatch diagnostics, and workspace binding updates.

Inputs:

- project root
- session id
- requested workspace root
- root mode

Outputs:

- current session selection resolution
- binding update result
- root mismatch diagnostics

Side effects:

- current-session selection store reads/writes

Forbidden responsibilities:

- reentry scoring
- prompt execution
- CLI rendering

Tests:

- current session selection tests if present or new focused test
- CLI baseline session switching cases

Validation:

- `rtk npm run verify:cli-entry`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`

Risk:

- medium.

Recommended route:

- Route J.

## 11. Proposed Decomposition For cli.tsx

### cliModeDispatch.ts

Responsibility:

- Parse resolved CLI options into one of: doctor/help/setup, replay,
  print/non-interactive, stdin stream, or interactive loop.

Inputs:

- parsed CLI options
- runtime environment facts
- stdin TTY state

Outputs:

- mode decision object

Side effects:

- none

Forbidden responsibilities:

- session mutation
- provider readiness calls
- runtime invocation
- terminal rendering

Tests:

- new `cliModeDispatch.test.ts`
- CLI baseline

Validation:

- `rtk npm run verify:cli-entry`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`

Risk:

- low to medium.

Recommended route:

- Route K, after runtime/session projections are stable.

### cliPrintModeRunner.ts

Responsibility:

- Own `--print` prompt execution setup, non-interactive result rendering, and
  stopped/error fallback for print mode.

Inputs:

- session manager
- renderer
- provider readiness result
- runtime invocation function
- resolved prompt

Outputs:

- exit status / rendered output

Side effects:

- session updates through injected manager
- terminal output through renderer

Forbidden responsibilities:

- parsing stdin
- interactive loop
- slash command semantics
- provider credential loading

Tests:

- CLI baseline print cases
- two-file CLI evidence verifier

Validation:

- `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
- `rtk npm run verify:cli-entry`

Risk:

- medium.

Recommended route:

- Route L.

### cliStdinModeRunner.ts

Responsibility:

- Own stream-first stdin prompt parsing and sequential non-TTY execution.

Inputs:

- stdin text
- stdin transport mode
- execution callback

Outputs:

- prompt execution sequence result

Side effects:

- only through injected execution callback

Forbidden responsibilities:

- slash command registry
- interactive readline loop
- runtime provider behavior

Tests:

- CLI baseline stdin cases
- new runner tests for fenced/multiline prompt transport

Validation:

- `rtk npm run verify:cli-entry`

Risk:

- medium.

Recommended route:

- Route M.

### slashCommandRegistry.ts

Responsibility:

- Own registration/dispatch bridge from CLI prompts into shell actions and
  slash-router outcomes.

Inputs:

- raw prompt
- shell runtime context
- command dependencies

Outputs:

- handled / shell-action / execute decision

Side effects:

- command-specific injected operations only

Forbidden responsibilities:

- actual provider calls
- session storage internals
- permission policy changes

Tests:

- `slashRouter.test.ts`
- CLI baseline command cases

Validation:

- `rtk npm run verify:cli-entry`

Risk:

- medium to high because interactive command behavior is user-visible.

Recommended route:

- Route N.

### approvalPromptBridge.ts

Responsibility:

- Own interactive approval prompt rendering, readline mapping, non-interactive
  approval mode object materialization, and approval-decision source reporting.

Inputs:

- escalation prompt
- approval mode
- approval audit facts

Outputs:

- escalation response
- approval audit record

Side effects:

- terminal prompt
- approval audit recording through injected callback

Forbidden responsibilities:

- sandbox enforcement
- permission cache policy
- provider/auth behavior

Tests:

- permission-memory gate
- CLI baseline approval cases

Validation:

- `rtk npm run verify:permission-memory`
- `rtk npm run verify:cli-entry`

Risk:

- high. Defer until lower-risk CLI runner extractions are complete.

Recommended route:

- later than Route N.

### providerReadinessCliSurface.ts

Responsibility:

- Convert provider readiness/check results into CLI-visible lines and stop
  decisions without reading provider config itself.

Inputs:

- provider readiness result
- selected provider label
- print/interactive mode

Outputs:

- render lines
- stop/continue decision

Side effects:

- none

Forbidden responsibilities:

- loading credentials
- checking network
- changing redaction
- changing opt-in real-provider behavior

Tests:

- `providerReadiness.test.ts`
- CLI baseline provider-readiness cases

Validation:

- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`

Risk:

- medium.

Recommended route:

- Route O.

## 12. Cross-Cutting Invariants

All implementation routes must preserve:

- answer-first compact output
- verbose diagnostic output when requested
- `changedFiles` only for verified writes
- planned files distinct from changed files
- stopped/error outcomes not becoming success claims
- real provider execution remains explicit opt-in
- provider config and secrets are never printed
- MCP evidence remains local/deterministic unless a future explicit route
  changes that claim
- TypeScript product runtime/control plane owns runtime/session/CLI semantics
- Rust remains a native executor candidate until concrete execution paths prove broader ownership
- contracts boundary remains explicit
- local TypeScript imports keep `.js` suffixes

## 13. What Must Not Change

Do not change:

- product capability
- mutation lane capability limits
- provider/auth core
- MCP core
- default gates
- release readiness claims
- broad apply_patch support
- 3-file writes or 3+ mutation support
- delete/move
- rollback or atomicity
- external/user-configured MCP readiness
- real-provider default execution
- package scripts
- verifier decomposition as part of Route 16

## 14. Route Sequence: Meaningful Implementation Routes

### Route A: Extract shell result assembly

Target file:

- `runMvpIntegratedFlow.ts`

Why now:

- It is pure projection, user-visible, heavily reused, and lower risk than
  provider/session/CLI lifecycle changes.

Allowed files:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/shellResultAssembly.ts`
- `packages/ts-shell/src/orchestration/shellResultAssembly.test.ts`

Forbidden files:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `scripts/**`
- provider/auth core
- MCP core
- package.json

Implementation seam:

- Move result assembly and blocker projection behind a pure function API.

Tests to add/reuse:

- new assembly tests
- resultMapper/sessionRuntime tests
- candidate mutation suite

Validation commands:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`

Success criteria:

- no behavior change in mutation/result/session surfaces
- `runMvpIntegratedFlow.ts` delegates result assembly to the new module
- no capability expansion

Failure criteria:

- changed terminal wording without tests
- changed status/classification semantics
- route touches provider/session/CLI internals

Stop conditions:

- assembly depends on live provider behavior
- required types force broad orchestration type churn

Evidence strength expected:

- strong deterministic local evidence

Maintainability impact:

- reduces result/failure policy density in the largest runtime file.

### Route B: Extract session resume context builder

Target file:

- `SessionManager.ts`

Why now:

- Resume/continue continuity is core user-facing behavior and already has
  stopped-session helpers to build on.

Allowed files:

- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/session/sessionResumeContextBuilder.ts`
- matching focused test

Forbidden files:

- CLI entrypoint
- provider core
- mutation capability files
- scripts

Implementation seam:

- Move continuity snapshot and resume eligibility construction into pure builder
  functions fed by loaded session/recovery data.

Validation:

- `rtk npm run verify:session-durability:long`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`

Success criteria:

- same `/continue` and stopped continuity behavior
- no persistence behavior change

Failure criteria:

- lost planned-files or writer-started continuity

Stop conditions:

- extraction requires changing session schema

Evidence strength:

- strong synthetic durability and session runtime evidence

Maintainability impact:

- separates recovery policy from session storage mechanics.

### Route C: Extract provider call outcome projection

Target file:

- `runMvpIntegratedFlow.ts`

Why now:

- Provider failures are sensitive and should be classified without spreading
  redaction logic through orchestration.

Allowed files:

- `runMvpIntegratedFlow.ts`
- `providerCallOutcomeProjection.ts`
- focused tests

Forbidden files:

- provider auth/core config loaders
- readiness scripts
- package.json

Implementation seam:

- Keep provider I/O where it is, project outcomes in the new module.

Validation:

- `rtk npm run verify:provider-readiness:real`
- `rtk npm run verify:provider-readiness:real -- --classification-self-test`
- `rtk npm run verify:release:deterministic`

Success criteria:

- same redacted output and failure attribution

Failure criteria:

- provider config path/secret appears in output

Stop conditions:

- extraction needs provider auth changes

Evidence strength:

- medium to strong, bounded by deterministic readiness classification

Maintainability impact:

- isolates provider failure semantics from query orchestration.

### Route D: Extract tool execution outcome projection

Target file:

- `runMvpIntegratedFlow.ts`

Why now:

- Tool/MCP status and verification blockers are user-visible and already have
  lifecycle projection helpers.

Allowed files:

- `runMvpIntegratedFlow.ts`
- `toolExecutionOutcomeProjection.ts`
- focused tests

Forbidden files:

- MCP core behavior
- ToolDispatcher behavior
- sandbox behavior
- provider core

Implementation seam:

- Keep actual dispatch injected; move event/projection/classification assembly.

Validation:

- `rtk npm run verify:mcp:local-execution`
- `rtk npm run verify:mcp:error-taxonomy`
- `rtk npm run verify:result-contract`

Success criteria:

- same QueryEvents and same verification blocked/failed classification

Failure criteria:

- changed MCP taxonomy or approval-denied behavior

Stop conditions:

- extraction requires changing tool runtime registry

Evidence strength:

- strong deterministic MCP evidence

Maintainability impact:

- separates tool result interpretation from workflow execution.

### Route E: Extract mutation session handoff

Target file:

- `runMvpIntegratedFlow.ts`

Why now:

- Mutation success/stopped/partial-failure facts feed compact and `/continue`.
  Handoff must be explicit before any future mutation-route work.

Allowed files:

- `runMvpIntegratedFlow.ts`
- `mutationSessionHandoff.ts`
- focused tests

Forbidden files:

- patch application
- workspace authority
- mutation capability gates
- scripts

Implementation seam:

- Project mutation facts into continuity-ready handoff data.

Validation:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
- `rtk npm run verify:session-durability:long`

Success criteria:

- planned/changed/failed/unverified file semantics unchanged

Failure criteria:

- planned files shown as changed files

Stop conditions:

- extraction requires capability expansion

Evidence strength:

- strong candidate mutation and durability evidence

Maintainability impact:

- decouples mutation execution from session continuity projection.

### Route F: Extract compact retention planner

Target file:

- `SessionManager.ts`

Why now:

- Compact behavior is safety-sensitive and currently mixed with state writes.

Allowed files:

- `SessionManager.ts`
- `compactRetentionPlanner.ts`
- focused tests

Forbidden files:

- provider/model compaction calls
- CLI
- scripts

Implementation seam:

- Produce compact plans and summary inputs without performing writes.

Validation:

- `rtk npm run verify:session-durability:long`
- `rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts`

Success criteria:

- same compact summaries and continuity evidence

Failure criteria:

- changed auto-compact threshold or lost approval/write continuity

Stop conditions:

- route needs session schema changes

Evidence strength:

- strong long-session evidence

Maintainability impact:

- separates compact policy from persistence mechanics.

### Route G: Extract runtime capability boundary

Target file:

- `runMvpIntegratedFlow.ts`

Why now:

- Unsupported operations must remain explicit and testable as more code moves
  out of the giant file.

Allowed files:

- `runMvpIntegratedFlow.ts`
- `runtimeCapabilityBoundary.ts`
- focused tests

Forbidden files:

- mutation lane capability limits
- patch application
- package scripts

Implementation seam:

- Pure decision/projection module for capability-supported vs stopped.

Validation:

- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`

Success criteria:

- unsupported operations remain stopped/error

Failure criteria:

- any new operation becomes supported

Stop conditions:

- route requires adding 3-file/broad patch/delete/move support

Evidence strength:

- strong deterministic unsupported evidence

Maintainability impact:

- keeps capability boundaries visible during future refactors.

### Route H: Extract session persistence gateway

Target file:

- `SessionManager.ts`

Why now:

- Persistence/locking/atomic writes are low-level mechanics that should not be
  interleaved with resume and compact policy.

Allowed files:

- `SessionManager.ts`
- `sessionPersistenceGateway.ts`
- focused tests

Forbidden files:

- CLI
- orchestration
- provider/MCP core
- scripts

Implementation seam:

- Move file path, JSON read/write, transcript append, lock retry, and transient
  I/O handling behind a gateway used by `SessionManager`.

Validation:

- `rtk npm run verify:session-durability:long`
- `rtk npm run verify:release:core`

Success criteria:

- session files remain byte-compatible or intentionally equivalent
- no lost transcript events

Failure criteria:

- changed session layout or recovery behavior

Stop conditions:

- route requires migration layer or schema rewrite

Evidence strength:

- medium to strong; higher risk requires broad session gates

Maintainability impact:

- separates durable substrate from lifecycle policy.

### Route I: Extract session replay builder

Target file:

- `SessionManager.ts`

Why now:

- Replay and runtime seed construction are distinct from persistence and should
  be testable independently.

Allowed files:

- `SessionManager.ts`
- `sessionReplayBuilder.ts`
- focused tests

Forbidden files:

- CLI replay mode parsing
- provider runtime
- scripts

Implementation seam:

- Move transcript normalization, turn pairing, replay plan, and runtime state
  seed logic behind pure builder functions.

Validation:

- `rtk npm run verify:cli-entry`
- `rtk npm run verify:result-contract`

Success criteria:

- replay and resume semantics unchanged

Failure criteria:

- broken replay-file or runtime seed behavior

Stop conditions:

- extraction requires event schema changes

Evidence strength:

- medium

Maintainability impact:

- isolates replay semantics from session lifecycle mechanics.

### Route J: Extract CLI mode dispatch and print runner

Target file:

- `cli.tsx`

Why now:

- Once runtime/session projections are stable, CLI can be reduced to
  composition by moving non-interactive mode decisions and print execution into
  testable modules.

Allowed files:

- `cli.tsx`
- `cliModeDispatch.ts`
- `cliPrintModeRunner.ts`
- focused tests

Forbidden files:

- provider/auth core
- SessionManager internals
- orchestration behavior
- package scripts

Implementation seam:

- Move mode decision and print runner behind injected runtime/session/renderer
  dependencies.

Validation:

- `rtk npm run verify:cli-entry`
- `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts`

Success criteria:

- identical print/stdin/interactive routing behavior

Failure criteria:

- print mode no longer shares the turn execution backbone

Stop conditions:

- route requires redesigning slash commands or approval lifecycle

Evidence strength:

- strong CLI baseline and two-file CLI evidence

Maintainability impact:

- turns the entrypoint toward composition and makes transport mode behavior
  locally testable.

## 15. Recommended First Implementation Route

Route name:

- Extract shell result assembly

Target module:

- `packages/ts-shell/src/orchestration/shellResultAssembly.ts`

Expected files changed:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/shellResultAssembly.ts`
- `packages/ts-shell/src/orchestration/shellResultAssembly.test.ts`

Allowed files:

- only the three files above unless a type-only export must move to an existing
  orchestration type file

Forbidden files:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `scripts/**`
- `package.json`
- provider/auth core
- MCP core
- patch application/write capability files

Implementation entry point:

- Start with `assembleActionResultContract`, `buildActionResultDelivery`,
  `renderExecutionSummary`, `buildCodingResult`,
  `deriveActionableBlockerContract`, and supporting pure helpers.
- Keep `executeWorkflowTaskPlan` as the caller.
- Keep mutation execution, provider calls, tool dispatch, file I/O, and session
  handoff in place.

Focused tests:

- new unit test for `shellResultAssembly.ts`
- reuse `resultMapper.test.ts`
- reuse `sessionRuntime.test.ts`
- candidate mutation verifier

Required validation:

- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
- `rtk npm run verify:result-contract`
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`

Success criteria:

- same user-facing result strings for covered cases
- same `CodingResultSummary` shape
- same terminal classification behavior through resultMapper/sessionRuntime
- no mutation capability expansion
- no provider/MCP/default gate changes

Stop conditions:

- extracting the result assembly requires changing provider call semantics
- extracting requires session schema changes
- extracting requires moving writer authority or mutation capability limits
- tests reveal existing uncovered behavior that needs product direction

Why this moves maintainability toward 4/5:

- It removes a complete responsibility from the largest file and creates a
  stable result projection boundary. Later runtime extractions can return
  structured outcomes into this module instead of constructing terminal/session
  facts directly inside the query loop.

## 16. Validation Matrix

Required Route 16 validation:

| Command | Purpose |
| --- | --- |
| `rtk git status --short --branch` | confirm starting and ending tree state |
| `rtk git log --oneline -45` | capture current baseline commits |
| `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation` | candidate mutation synthetic gate |
| `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test` | failure taxonomy stays deterministic |
| `rtk npm run verify:real-user-capabilities:two-file-cli-evidence` | CLI/user-entry two-file evidence |
| `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e` | unsupported patch stopped/error surface |
| `rtk npm run verify:real-user-capabilities:three-file-planning-no-write` | exactly-three planning/no-write evidence |
| `rtk npm run verify:real-user-capabilities:planned-files-continuity` | planned-files stopped continuity |
| `rtk npm run verify:session-durability:long` | compact/reload/continue durability |
| `rtk npm run verify:mcp:local-execution` | local deterministic MCP execution |
| `rtk npm run verify:mcp:error-taxonomy` | MCP failure taxonomy |
| `rtk npm run verify:result-contract` | terminal/session result contract |
| `rtk npm run build -w packages/ts-shell` | TS shell build |
| `rtk npm run verify:release:deterministic` | deterministic release meta gate |
| `rtk git diff --check` | diff hygiene |

Optional Route 16 validation:

| Command | Purpose |
| --- | --- |
| `rtk npm run verify:cli-entry` | CLI entry and transport behavior |
| `rtk npm run verify:release:core` | broader deterministic hard gate |
| `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts` | full CLI baseline |
| `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` | shell runtime surface |
| `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts` | result mapper truthfulness |

For this planning-only route, validation proves the existing baseline remains
green after adding the plan document. Future implementation routes should run
the subset tied to their touched responsibility plus build and diff hygiene.

## 17. Risk Matrix

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Pure projection extraction changes user-visible wording | medium | snapshot focused result assembly tests before moving callers |
| Session extraction changes recovery/continue behavior | high | defer persistence gateway, run long-session durability and CLI baseline |
| Provider projection leaks secrets | high | do not read provider config; preserve existing redaction tests/gates |
| Tool projection changes MCP taxonomy | medium | reuse local MCP execution and error taxonomy gates |
| CLI mode extraction breaks stdin/print shared backbone | medium | run CLI entry and CLI baseline; keep runtime invocation injected |
| Extraction becomes line-count cleanup | medium | require each route to move a complete responsibility and add tests |
| Capability expansion sneaks into refactor | high | forbid patchApplication/capability-limit changes unless separate route |
| Default gate changes | high | forbid package.json/scripts/default release changes |
| Verifier decomposition bleeds into runtime plan | low | keep Route 16 runtime-only; route verifier work separately |

## 18. Definition Of Runtime Architecture Maintainability 4/5

Runtime architecture maintainability reaches 4/5 when:

- The three giant files still compose the runtime but no longer own unrelated
  policy clusters.
- `runMvpIntegratedFlow.ts` delegates:
  - result assembly
  - provider outcome projection
  - tool outcome projection
  - mutation session handoff
  - capability boundary decisions
- `SessionManager.ts` delegates:
  - persistence gateway
  - resume context builder
  - compact retention planner
  - replay builder
  - project binding
- `cli.tsx` delegates:
  - mode dispatch
  - print/stdin runners
  - slash command bridge
  - approval prompt bridge
  - provider readiness surface
- Focused tests exist for extracted modules, and broad gates become regression
  evidence rather than the only way to understand behavior.
- Unsupported operations remain explicitly unsupported.
- Default release and real-provider boundaries remain unchanged.

This is not a 5/5 target. A 5/5 target would require deeper event protocol,
session schema, and possibly service boundary redesign, which is outside this
bounded route.

## 19. Stop Conditions For The Overall Extraction Program

Stop and replan if any route requires:

- changing provider/auth core
- changing MCP core
- changing package scripts or default gates
- adding mutation capability
- broad apply_patch
- 3-file writes or 3+ write support
- delete/move
- rollback/atomicity
- session schema migration
- moving control-plane semantics into Rust
- broad CLI/session/provider redesign
- full rewrite of any giant file
- copying reference repository implementation
- reading or exposing real-provider configuration

## 20. Appendix: Commands Run And Results

Pre-plan inspection:

- `rtk git status --short --branch`
  - result: passed; output showed `## main...origin/main`
- `sed -n '1,900p' docs/agent-routes/route16-runtime-architecture-extraction-plan.md`
  - result: passed; read Route 16 objective, constraints, quality bar,
    required reading, validation, success criteria, and final report format
- `rg --files docs | rg 'architecture|route16|runtime'`
  - result: passed; Route 16 target plan file was not present before this
    document was created
- project state/readiness reads:
  - `PROJECT_STATE.md`
  - `RUNBOOK.md`
  - `package.json`
  - `docs/audits/routes-01-12-closeout.md`
  - `docs/design/three-file-planning-no-write-evaluation.md`
- target runtime reads:
  - `wc -l` on the three target files
  - symbol searches in `runMvpIntegratedFlow.ts`, `SessionManager.ts`, and
    `cli.tsx`
  - targeted snippets around orchestration result assembly, tool lifecycle,
    session manager methods, CLI runtime invocation, and shell session runtime
- existing module reads:
  - `mutationRoutingProjection.ts`
  - `compactContinuitySummary.ts`
  - `stoppedSessionContinuity.ts`
  - `sessionStateSurface.ts`
  - `resultMapper.ts`
  - `providerReadiness.ts`
  - `toolLifecycleProjection.ts`
  - `toolExecutionProvenance.ts`
  - `sessionRuntime.ts`
  - patchResult / patchApplication / MCP file lists
  - CLI baseline test surface
- reference comparison:
  - searched Claude Code with compact/resume/transcript/slash/print/tool
    result/permission terms
  - inspected `query.ts`, `services/compact/compact.ts`, and
    `entrypoints/agentSdkTypes.ts`
  - searched opencode with apply_patch/permission/tool/session/revert/TUI
    terms
  - inspected `tool/apply_patch.ts`, `permission/index.ts`,
    `session/projectors.ts`, and `cli/cmd/run.ts`

Post-plan validation:

- `rtk git status --short --branch`
  - result: passed before validation; only this plan file was pending after
    creation
- `rtk git log --oneline -45`
  - result: passed; current HEAD was `3c55f08 update doc`
- `rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation`
  - result: passed; six synthetic candidate mutation cases passed,
    real-provider cases skipped by default, `realProviderTouched=false`
- `rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`
  - result: passed; config, network-auth, model-output, route, post-write,
    unsupported, product-regression, and unknown taxonomy cases passed
- `rtk npm run verify:real-user-capabilities:two-file-cli-evidence`
  - result: passed; two-file CLI path succeeded, unsupported three-file/delete
    paths stayed stopped, post-write failure classified as `post-write`
- `rtk npm run verify:real-user-capabilities:unsupported-patch-e2e`
  - result: passed; unsupported real-model-like shapes stopped/error with no
    writes and no rollback claim
- `rtk npm run verify:real-user-capabilities:three-file-planning-no-write`
  - result: passed; exactly-three planning/no-write remained stopped with
    `writerInvoked=false` and unchanged workspace
- `rtk npm run verify:real-user-capabilities:planned-files-continuity`
  - result: passed; planned files survived compact-equivalent continuity and
    remained distinct from changed files
- `rtk npm run verify:session-durability:long`
  - result: passed; two long-session durability tests passed,
    `realProviderTouched=false`
- `rtk npm run verify:mcp:local-execution`
  - result: passed; local deterministic MCP fixture only,
    `externalMcpServerUsed=false`, `userMcpConfigUsed=false`
- `rtk npm run verify:mcp:error-taxonomy`
  - result: passed; deterministic MCP taxonomy scenarios passed,
    external/user MCP readiness remained unclaimed
- `rtk npm run verify:result-contract`
  - result: passed; result mapper, terminal classification, provider readiness
    terminal result, print, and replay contract checks passed
- `rtk npm run build -w packages/ts-shell`
  - result: passed; `tsc -p tsconfig.build.json`
- `rtk npm run verify:release:deterministic`
  - result: passed; build, full CLI baseline, release core, MVP gate,
    candidate mutation, dry-run real listing, and provider readiness
    classification passed. Output preserved `realProviderTouched=false`,
    `candidateMutationRealExecuted=false`, `externalMcpServerUsed=false`,
    `userMcpConfigUsed=false`, and `realProviderOptInEnvCleared=true`
- `rtk git diff --check`
  - result: passed

Residue notes:

- Validation appended generated audit entries to:
  - `.sisyphus/audit/permissions.jsonl`
  - `packages/ts-shell/.sisyphus/audit/permissions.jsonl`
- Validation created `undefined/.rustup/settings.toml`.
- Real-user-capabilities verifiers wrote
  `/tmp/cheers-test/test-results/real-user-capabilities-report.json`.
- Cleanup performed:
  - restored both tracked audit files with `rtk git restore`
  - removed `undefined/`
  - removed the generated real-user-capabilities report JSON
- Final cleanup status at appendix update time:
  - no tracked audit residue remained
  - `undefined/` was gone
  - the generated report JSON was gone
  - only `docs/design/runtime-architecture-extraction-plan.md` remained
    pending

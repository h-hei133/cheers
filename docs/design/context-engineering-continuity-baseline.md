# Context Engineering Continuity Baseline

Status: Route 74 baseline candidate; Route 75 Compact v2 packet implemented;
Route 76 command integration added.
Date: 2026-05-15

## Post-Edit-Closeout Baseline

Route 73 sealed the bounded selected-workspace edit surface as a closeout
candidate. Route 74 starts the next phase by defining a compact-safe context
substrate for future compact, project memory, startup warm context, sidebar,
undo/restore UX, and sandbox-policy routes.

Route 76 adds a preview-only `/compact` command surface for the Compact v2
packet and markdown handoff. It keeps the context projection pure and still
does not add memory storage, sidebar UI, startup cache, provider/model
summarization, SessionManager schema changes, restore execution, automatic
recovery, atomic rollback, or edit runtime changes.

This route is not a memory implementation, sidebar UI, startup cache, provider
change, MCP change, compact rewrite, SessionManager schema change, edit runtime
change, automatic recovery, or atomic rollback route.

## Bounded Reference Scan

Files inspected: 16 total.

- ClaudeCode, 6 files:
  `/home/wang/projects/source-claudecode/context.ts`,
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/query.ts`,
  `/home/wang/projects/source-claudecode/memdir/memoryScan.ts`,
  `/home/wang/projects/source-claudecode/cli/print.ts`,
  `/home/wang/projects/source-claudecode/utils/sessionStorage.ts`
- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/session/processor.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/summary.ts`
- gemini-cli, 5 files:
  `/home/wang/projects/gemini-cli/packages/core/src/context/contextManager.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/context/memoryContextManager.ts`,
  `/home/wang/projects/gemini-cli/docs/cli/checkpointing.md`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/chatCommand.ts`

Directional findings:

- ClaudeCode separates cached system/user context from transcript persistence,
  compact messages, and resume loading. It strips or reinjects bulky context
  classes around compact instead of letting raw media/tool payloads survive
  blindly.
- ClaudeCode memory scanning exposes a small manifest of memory headers before
  deeper recall. The useful pattern is a machine-readable index first, not a
  raw memory dump.
- opencode stores session parts, patch parts, snapshots, summaries, and revert
  state as separate projected surfaces. File restore depends on snapshot
  authority, not on natural-language summary.
- opencode session summary keeps file diff metadata separate from message
  text, which supports sidebar/status views without rereading whole history.
- gemini-cli has a context manager with a working buffer, protected active tool
  nodes, and budget-triggered compression. Its compression preserves recent
  tool output more strongly than older tool output and truncates oversized
  function responses to references.
- gemini-cli memory context is hierarchical and reloadable, while checkpointing
  records conversation state plus a file snapshot. That is a useful future
  direction, but Route 74 should only define candidates and compact-safe
  references.

Local implication: keep Route 74 as a typed projection layer that exposes
machine-readable context facts and redaction decisions. Do not implement
memory, checkpointing, sidebar UI, startup cache, or broader compact behavior.

## Why Context Engineering Is Next

The edit surface is now bounded and closeout-candidate. The next product risk is
not another edit lane; it is whether future turns, compact summaries, sidebar
views, and restore UX preserve the right facts without carrying unsafe raw
content. Context engineering provides the shared vocabulary before those routes
split into separate compact, memory, startup, sidebar, and sandbox work.

## Context Layers

Route 74 defines these layers in
`packages/ts-shell/src/core/context/contextLayerModel.ts`:

1. Immediate prompt context
2. Task/goal context
3. Project context
4. Route/history context
5. Edit capability context
6. Mutation/evidence context
7. Recovery/restore context
8. Tool/MCP/skills availability context
9. Compact summary context
10. Future memory candidate context
11. Sidebar state context
12. Startup warm context

Each layer has a retention class, sensitivity class, payload kind, compact
survivability flag, memory-candidate flag, sidebar-candidate flag, and
startup-warm-candidate flag.

## Continuity Contract

Machine-readable facts that must survive compact/session continuation:

- current task goal or route objective
- active constraints and forbidden boundaries
- safe project root
- Route 73 edit closeout status
- supported bounded edit envelope
- blocked-by-design edit capabilities
- last mutation `plannedFiles`, `changedFiles`, and `failedFiles`
- recovery/restore availability summary
- recovery authority ids or references, not raw original content
- validation status summary
- explicit user decisions and approvals already supported by the session
  contract
- unresolved blockers and next action

These requirements are encoded in
`packages/ts-shell/src/core/context/contextContinuityManifest.ts`.

## Compact Survivability Contract

Compact survivors must be safe summaries or structured evidence. They must not
include:

- raw original content blobs
- raw secrets or provider credentials
- raw recovery authority content
- ephemeral temp paths unless they are explicit user-provided ledger roots
- full command output without summarization
- hidden chain-of-thought
- broad raw file dumps

The context projection records redactions for these inputs and outputs only
summaries, ids, file lists, and explicit blocked reasons.

## Current Context / Compact / Session Audit

Already machine-readable:

- `SessionContinuitySnapshot` carries recent changed, target, failed, verified,
  writer-started, write-effect, verification, approval, and tool provenance
  fields.
- `mutationContinuityState.ts` derives recent target/change/failure file lists.
- `compactContinuitySummary.ts` and `compactRetentionPlanner.ts` carry compact
  continuity fields for approvals, write effect, seed influence, and handoff
  diagnostics.
- Route 73 edit state is machine-readable through
  `editCapabilityReadiness.ts` and `editCapabilityCloseoutManifest.ts`.
- Recovery/restore availability is machine-readable through
  `recoverySurfaceProjection.ts`.

Currently mostly natural-language:

- high-level project/route phase summaries in docs
- human-facing current-session and stopped-continuation surfaces
- validation explanations in final reports and runbooks

Survives session continuation today:

- session id, project root, last intent/output/failure, terminal
  classification, recent changed/target/failed/verified files, approval
  memory, tool provenance, write effect, failure handoff, and next-action
  diagnostics where present.

Survives compact today:

- compact summary text plus selected continuity fields added by
  `compactContinuitySummary.ts`: approval state, write effect, seed influence,
  failure/success diagnostics, and action handoff summary.

Facts at risk without Route 74 baseline:

- Route 73 edit closeout status can be summarized in prose but lacked a
  context-layer projection.
- Recovery authority ids are safe to preserve, but raw original content must
  remain out of compact survivors.
- Blocked-by-design edit decisions are useful future project memory candidates,
  but route-specific transient evidence must not automatically become memory.

Where route history is represented:

- route docs under `docs/agent-routes/`
- design docs under `docs/design/`
- `PROJECT_STATE.md`
- recent git commits

Where project facts are represented:

- `AGENTS.md`, `RUNBOOK.md`, `PROJECT_STATE.md`, `WORKSPACE.md`,
  `OWNERSHIP.md`, and focused design docs

Where user-facing summaries are generated:

- `sessionStateSurface.ts`
- `sessionRuntime.ts`
- `resultMapper.ts`
- route-specific result projections under `orchestration/patchResult/` and
  `orchestration/patchRecovery/`

Future memory extraction hook:

- use context projection `memoryCandidates` as the input to a later route.
  Route 74 does not persist or rank memory.

What Route 74 should not implement:

- full memory storage, compact rewrite, sidebar UI, startup cache,
  provider/MCP discovery, SessionManager schema changes, automatic recovery,
  atomic rollback, or edit runtime expansion.

## Implemented Modules

- `packages/ts-shell/src/core/context/contextLayerModel.ts`
- `packages/ts-shell/src/core/context/contextContinuityManifest.ts`
- `packages/ts-shell/src/core/context/contextStateProjection.ts`
- `packages/ts-shell/src/core/context/compactCommandContract.ts`
- `packages/ts-shell/src/core/context/compactCommandRunner.ts`
- `packages/ts-shell/src/core/context/compactSessionSurface.ts`

The modules are pure. They do not perform file I/O, provider access, MCP
discovery, persistence, session schema migration, edit routing, write execution,
restore execution, or CLI rendering.

## Projection Behavior

`projectContextState` accepts explicit inputs:

- task goal and constraints
- route info
- safe project info
- Route 73 edit closeout manifest or structural equivalent
- mutation evidence
- recovery surface summary or structural equivalent
- validation evidence
- caller-supplied tool availability placeholders
- compact summary

It returns:

- `layers`
- `compactSurvivorFacts`
- `memoryCandidates`
- `sidebarFacts`
- `startupWarmCandidates`
- `redactions`
- `warnings`
- `evidence`

The projection keeps blocked capabilities visible, preserves mutation and
recovery facts, stores recovery authority ids only as references, summarizes
full command output, and records redactions for raw content, raw file dumps,
full command output, and secrets.

## Continuity Tests

Focused tests cover:

- one row per context layer and layer classification helpers
- manifest must-survive, must-not-survive, memory-only, sidebar-only, and
  startup-warm sections
- Route 73 edit closeout status, bounded cap 32, bounded safe patch support,
  arbitrary broad blocked, fuzzy blocked, automatic recovery blocked, and
  atomic rollback blocked
- mutation `plannedFiles`, `changedFiles`, `failedFiles`,
  `postWriteVerification`, and writer flags
- recovery availability, explicit restore availability, recovery authority id,
  hidden user edit guard summary, and no raw original content leakage
- compact redaction for raw content, secrets, raw file dumps, and full command
  output
- memory candidates distinct from route transient facts
- sidebar facts and tool/MCP/skills placeholders without discovery

## Route 75 Compact v2 Note

Route 75 added a pure Compact v2 handoff layer on top of this baseline:

- `compactContinuityPacket.ts` defines the structured packet shape.
- `compactRedactionPolicy.ts` enforces compact-safe redaction.
- `routeContinuityHandoff.ts` builds packets from Route 74 projection plus
  route, edit closeout, recovery, mutation, and validation inputs.
- `compactHandoffRenderer.ts` renders copyable compact-safe markdown.

The integration into live compact/session runtime remains deferred because the
existing compact/session surfaces are lifecycle-coupled. Route 75 keeps memory
storage, sidebar UI, startup cache, SessionManager schema changes, provider/MCP
behavior, edit runtime changes, automatic recovery, and atomic rollback out of
scope.

## Session Hook Status

Deferred. The existing session surfaces already render current-session and
stopped-continuation facts. Route 74 keeps the context projection as a pure
testable substrate, and Route 75 adds the packet/renderer. A future route can
add a narrow session surface hook after choosing an explicit compact/session
integration point.

## Residual Risks

- The projection does not yet feed live compact or `/sessions current`; it is
  deliberately a pure baseline.
- Future memory extraction still needs ranking, persistence boundaries, and
  user controls.
- Future sidebar state should consume `sidebarFacts` rather than inventing a
  separate taxonomy.
- Future startup warm context should consume `startupWarmCandidates` only after
  a separate cache policy route.

## Next Recommendation

Recommended next route: Route 76 Compact v2 session integration.

Reason: context layers, compact survivors, redactions, edit/recovery facts, and
the Compact v2 packet/renderer are now machine-checkable enough to wire a live
compact/session integration without reopening edit runtime behavior.

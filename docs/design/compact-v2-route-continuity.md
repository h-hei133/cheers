# Compact v2 Route Continuity

Status: Route 75 implemented candidate; Route 76 command integration added;
Route 77 live checkpoint added; Route 78 future-turn injection added; Route 79
quality/merge hardening added.
Date: 2026-05-15

## Post-Route 74 Baseline

Route 74 added the pure context layer model, continuity manifest, and
compact-safe context state projection under
`packages/ts-shell/src/core/context/`. Route 75 builds on that substrate by
turning compact survivor facts into a structured, copyable handoff packet and
markdown rendering surface.

This route does not implement memory storage, sidebar UI, startup cache,
provider/MCP changes, package scripts, SessionManager schema changes, edit
runtime behavior changes, automatic recovery, or atomic rollback.

## Bounded Reference Scan

Files inspected: 15 total.

- ClaudeCode, 5 files:
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/services/compact/prompt.ts`,
  `/home/wang/projects/source-claudecode/services/compact/postCompactCleanup.ts`,
  `/home/wang/projects/source-claudecode/utils/sessionRestore.ts`,
  `/home/wang/projects/source-claudecode/utils/sessionStorage.ts`
- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/session/summary.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/projectors.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/v2/session-message.ts`
- gemini-cli, 5 files:
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/context/contextManager.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/context/memoryContextManager.ts`,
  `/home/wang/projects/gemini-cli/docs/cli/checkpointing.md`,
  `/home/wang/projects/gemini-cli/docs/cli/session-management.md`

Directional findings:

- ClaudeCode compact is a natural-language summary path, but it also strips
  media/tool-heavy payloads, creates compact boundary messages, preserves a
  recent segment where needed, restores selected post-compact context such as
  recent file reads and plan references, and removes drafting `<analysis>`
  before the summary is injected.
- ClaudeCode resume restores transcript-derived state such as file history,
  attribution, todos, context-collapse commits, agent selection, and model
  state. The useful local pattern is separate recovery of structured state
  from a natural-language compact summary.
- opencode keeps session summary/diff, projectors, snapshot, revert, shell,
  tool, and compaction message shapes as separate surfaces. File diff and
  revert facts are computed from snapshots and structured session parts, not
  from prose.
- gemini-cli compression preserves recent turns and active tool nodes more
  strongly than older history, truncates older large function responses to
  references, and treats checkpoint/restore as a separate snapshot authority
  from session summary.
- Across references, durable restore/checkpoint facts are not inferred from a
  compact summary. Compact can carry references and summaries, while authority
  remains in structured session/snapshot state.

Local implication: Compact v2 should be a pure structured packet plus renderer
fed by Route 74 projection. It should preserve route facts and recovery
references, not raw authority content or hidden reasoning.

## Current Compact / Session Audit

Existing local compact/session continuity is useful but not yet a full route
handoff surface.

- `compactContinuitySummary.ts` and `compactRetentionPlanner.ts` preserve
  approval audit, write effect, seed influence, and handoff diagnostics in a
  compact summary object.
- `compactSummaryFormatter.ts` merges selected continuity keys into summary
  text.
- `SessionContinuitySnapshot` carries session id, project root, last intent,
  failure, terminal classification, mutation files, verification facts,
  approval memory, permission request facts, and unresolved items.
- `mutationContinuityState.ts` derives recent target, changed, failed, and
  verified files.
- `sessionResumeContextBuilder.ts` selects when continuation context should be
  attached and can build boundary-only snapshots.
- `core/shell/sessionStateSurface.ts` renders current-session and stopped
  continuation facts, including changed/planned/verified/failed files, writer
  state, write effect, failure handoff, and no rollback.

Current gaps before Route 75:

- Compact is mostly summary text plus selected continuity keys, not a typed
  route handoff packet.
- Route constraints, forbidden scope, stop conditions, and next action are not
  grouped into a machine-checkable compact handoff shape.
- Route 73 edit closeout facts are available through manifest/projection but
  were not rendered as a Compact v2 handoff.
- Recovery references are safe to preserve, but raw recovery authority content
  must remain excluded.
- Validation status can be summarized, but full command output must not
  survive compact.

Route 75 does not wire the packet into live compact/session runtime because the
current compact/session paths are lifecycle-coupled. The core packet and
renderer are ready for a later narrow integration route.

## Compact v2 Objectives

Compact v2 preserves these facts through compact or manual handoff:

- current task, route id/name/objective, phase, constraints, forbidden scope,
  stop conditions, and next action
- safe project root, branch/base commit, and repository hints when provided
- edit closeout status, supported default envelope, non-default and
  explicit-opt-in capabilities, blocked-by-design capabilities, cap 32, and no
  automatic recovery or atomic rollback
- mutation evidence: planned, changed, failed files, post-write verification,
  writer started/effect, and writer flags
- recovery/restore state: explicit restore availability, preview availability,
  recovery authority references, restorable/blocked files, current-content
  guard summary, no raw content, no automatic recovery, no atomic rollback
- validation evidence: focused tests, verifiers, build/result-contract status,
  and summarized command output
- labeled compact survivors, memory candidates, sidebar facts, and startup
  warm candidates without implementing any storage or UI

## Packet Model

`compactContinuityPacket.ts` defines `CompactContinuityPacket` with:

- `packetVersion: "compact-v2"`
- `generatedAt`
- `source`: `compact`, `session-handoff`, `route-handoff`, or
  `manual-export`
- `taskGoal`, `route`, `project`
- `editCapability`, `mutationEvidence`, `recovery`, `validation`
- `context` labels for compact survivors, memory candidates, sidebar facts,
  and startup warm candidates
- `redactions`, `warnings`, and `evidence`

The model is pure and has no persistence behavior.

## Redaction Policy

`compactRedactionPolicy.ts` applies a deterministic pure redaction pass.

It removes or redacts:

- raw original content
- raw recovery authority content
- explicit secret values and secret-looking strings
- provider credentials, authorization, token, headers, and provider config
  fields
- hidden chain-of-thought fields
- full command output fields

It preserves:

- recovery authority ids and route ids as references
- project-safe file paths already projected by callers
- blocked-by-design capability facts
- summarized command output

Redactions are recorded in `packet.redactions`; unsafe inputs also produce
warning evidence when secret-like text is found.

## Route Handoff Builder

`routeContinuityHandoff.ts` builds a `CompactContinuityPacket` from:

- Route 74 `ContextStateProjection` or explicit projection inputs
- optional route/task/project metadata
- `editCapabilityCloseoutManifest`
- optional readiness entries
- optional recovery surface summary
- optional validation evidence

It reuses `projectContextState()` rather than duplicating projection logic.
Redaction runs after aggregation. Missing critical facts produce warnings,
which keeps partial packets machine-checkable without pretending they are
complete.

## Markdown Rendering

`compactHandoffRenderer.ts` renders a copyable compact-safe markdown handoff
with these stable sections:

- Current task / route
- Project state
- Supported edit capability envelope
- Blocked-by-design capabilities
- Mutation evidence
- Recovery / restore state
- Validation evidence
- Constraints / forbidden scope
- Context projection labels
- Next action
- Redactions / warnings

The renderer explicitly states that restore execution is explicit-only,
automatic recovery is unavailable, and atomic rollback is unavailable.

## Survivability Coverage

Focused tests under `packages/ts-shell/src/core/context/` cover:

- edit closeout survives with cap 32, bounded safe patch support, fenced diff
  support, arbitrary broad blocked, fuzzy blocked, automatic recovery blocked,
  and atomic rollback blocked
- mutation evidence survives with planned, changed, failed files,
  post-write verification, and writer flags
- recovery state survives with restore preview available, explicit-only
  restore execution, recovery authority reference, current-content guard
  summary, and no raw original content
- route constraints, forbidden scope, stop conditions, next action, and
  validation status survive
- secrets, raw command output, and raw recovery content are excluded or
  summarized
- markdown contains required sections and separates supported, non-default,
  explicit opt-in, and blocked capabilities

## Future Hooks

Memory candidates, sidebar facts, and startup warm candidates remain labels.
They are not persisted, ranked, displayed in UI, or cached at startup by Route
75.

Route 76 note: `compactCommandContract.ts`, `compactCommandRunner.ts`,
`compactSessionSurface.ts`, and the `/compact` local command now expose this
packet through the command surface as a preview-only handoff. The command
renders markdown by default and can return structured JSON. It still does not
compact runtime history, persist memory, change SessionManager schema, call a
provider/model, execute restore, add sidebar UI, add startup cache, or change
edit behavior.

Route 77 note: `/compact` and `/handoff` now create/update an in-memory latest
Compact v2 checkpoint. The checkpoint stores the redacted packet, rendered
markdown, survivor labels, redactions, warnings, and command source. A
future-turn adapter can produce candidate model-facing context from that
checkpoint, but it remains `candidate-only` and `not-injected`.

Route 78 note: `/compact` and `/handoff` now mark the latest live checkpoint
pending for next normal turn injection. The next normal runtime prompt receives
the compact-safe handoff facts once, then the checkpoint injection state becomes
consumed. The injected context preserves route/task, edit closeout, mutation,
recovery references, validation, constraints, redactions, warnings, and next
action without raw content, secrets, persistence, memory write, provider calls,
automatic recovery, or atomic rollback.

Route 79 note: repeated compact use is now guarded by an in-memory merge
policy, continuity quality checks, and injected context budget/dedupe. Latest
pending checkpoint facts win, stale checkpoints are blocked, stable survivor
labels can carry forward, and state is consumed only after a safe budgeted
context is ready.

Recommended next route: Route 80 project memory candidate extraction.

## Non-Goals

Route 75 does not implement:

- full memory system or persistent memory storage
- sidebar UI
- startup warm cache
- provider or MCP behavior
- package scripts or default gates
- SessionManager schema changes
- edit runtime behavior changes
- automatic recovery
- atomic rollback
- raw recovery content persistence

## Residual Risks

- Runtime history compaction remains separate from the preview-only handoff
  command.
- Future-turn injection has focused quality/merge hardening, but durable memory
  extraction and ranking remain separate future work.
- Future command polish may add richer arguments, but should keep mutation,
  persistence, provider/model calls, and recovery execution out of the default
  command path.
- Future memory extraction must rank and persist only stable memory candidates
  under a separate policy.
- Future sidebar/startup routes should consume the existing labels rather than
  introduce a separate taxonomy.

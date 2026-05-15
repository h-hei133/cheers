# Compact Live Checkpoint and Future-Turn Adapter

Status: Route 77 implemented candidate.
Date: 2026-05-15

## Scope

Route 77 turns the Route 76 `/compact` handoff into a live, in-memory,
session-scoped Compact v2 checkpoint. It also adds a future-turn adapter that
can project a checkpoint into candidate model-facing context, but it does not
inject that context into the query loop or provider/model calls.

Non-goals remain: persistence, memory storage, sidebar UI, startup cache,
provider/MCP changes, package script changes, SessionManager schema changes,
edit runtime changes, automatic recovery, atomic rollback, and broad `cli.tsx`
rewrites.

## Bounded Reference Scan

Primary files inspected: 10.

- ClaudeCode:
  `/home/wang/projects/source-claudecode/commands/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/query.ts`,
  `/home/wang/projects/source-claudecode/bootstrap/state.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/message-v2.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/session.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/context/utils/snapshotGenerator.ts`,
  `/home/wang/projects/gemini-cli/packages/sdk/src/session.ts`

Reference answers:

1. ClaudeCode exposes the latest compact result by replacing the active query
   messages with `buildPostCompactMessages(compactionResult)` and by marking a
   one-shot post-compaction runtime flag. opencode stores a typed compaction
   part with `tail_start_id`, a summary assistant message, and compaction
   events. gemini-cli returns a compressed `newHistory`, preserves snapshot
   state, and resumes SDK sessions by loading prior messages into chat history.
2. Reference compact state can be immediately injected into future context
   after successful compaction, and some implementations persist typed session
   parts or history. Route 77 deliberately only creates an in-memory checkpoint
   and candidate adapter payload.
3. References distinguish user-visible summary from model-facing context by
   using compact notices/events for users and separate summary messages,
   snapshot state, retained tails, or compressed histories for model input.
4. This project should copy the conceptual separation: a latest compact
   checkpoint with redacted packet/markdown for status, plus a separate adapter
   that can create candidate future-turn context without injecting it.
5. Route 78 should own actual query-loop/provider context injection, ordering
   relative to prompt continuity, and any runtime behavior that consumes the
   checkpoint automatically.

## Current `/compact` Behavior

Route 76 `/compact`:

- parses simple modes: default render, preview, and JSON
- builds a Compact v2 packet from explicit compact command inputs
- renders markdown by default
- returns structured JSON in dev-oriented JSON mode
- does not compact runtime history
- does not persist
- does not call a provider/model
- does not execute restore

Route 77 preserves that user-facing simplicity. Normal users still run
`/compact`; no new required flags are added.

## Live Checkpoint Model

`packages/ts-shell/src/core/context/compactLiveCheckpoint.ts` defines an
in-memory checkpoint store.

Checkpoint facts:

- `checkpointId`
- `sessionScopeId`
- `packetVersion`
- `createdAt`
- `sourceCommand`
- `status`: `created`, `superseded`, `cleared`, or `invalid`
- redacted Compact v2 packet
- rendered markdown
- compact survivor fact labels
- redactions and warnings
- no persistence, no provider call, no future-turn injection
- no automatic recovery or atomic rollback

The store supports latest lookup, update latest, clear latest, and mark
superseded. Tests inject deterministic clocks and ids.

`/compact` and `/handoff` update the latest checkpoint through the existing
command runtime. A second compact supersedes the previous latest checkpoint.
The command context can carry an optional `sessionId`; when unavailable, the
fallback scope is process-local and cwd-derived. No SessionManager schema is
changed.

## Future-Turn Adapter Model

`packages/ts-shell/src/core/context/compactFutureTurnAdapter.ts` converts a
live checkpoint into a candidate context payload.

Adapter output:

- `adapterVersion`
- `checkpointId`
- compact-safe `modelFacingSummary`
- structured facts for task/route, edit capability, mutation evidence,
  recovery references, validation status, constraints, and next action
- excluded facts and redactions
- warnings
- `injectionStatus: "candidate-only"`
- `providerInjectionStatus: "not-injected"`

The adapter performs no provider/model calls, no query-loop injection, no
persistence, no hidden reasoning projection, no restore execution, no automatic
recovery, and no atomic rollback. Blocked-by-design edit facts and
explicit-only restore facts survive in the candidate payload.

## Checkpoint Surface

`packages/ts-shell/src/core/context/compactCheckpointSurface.ts` renders concise
user/session status:

- latest checkpoint exists or not
- created time and id
- source command
- route/edit/mutation/recovery/validation counts
- compact survivor count
- redaction and warning counts
- future-turn adapter readiness
- not-yet-injected status
- next action

The surface does not dump raw packet JSON or hidden packet content. JSON packet
mode remains the Route 76 dev-oriented output path.

## Safety Guarantees

Route 77 preserves:

- no persistence or memory storage
- no SessionManager schema changes
- no provider/model calls
- no MCP behavior changes
- no package script/default gate changes
- no sidebar UI or startup cache
- no edit runtime changes
- no actual future-turn injection
- no automatic recovery
- no atomic rollback
- no raw recovery content, raw original content, secrets, provider
  credentials, or hidden reasoning in checkpoints or adapter payloads

## Route 78 Ownership

Route 78 should decide:

- how the latest checkpoint is selected for the next turn
- where candidate adapter context is inserted relative to prompt continuity
- how to avoid duplicate context when multiple compact checkpoints exist
- how terminal/session surfaces explain injected versus merely available
  compact context
- which focused tests prove provider/model input receives the candidate safely

Recommended next route: Route 78 actual future-turn injection from live Compact
v2 checkpoint.

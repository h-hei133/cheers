# Route 77: Compact live checkpoint and future-turn adapter

## Goal

Build on Route 76 and turn Compact v2 from a render-only command into a live session checkpoint substrate.

Route 76 added:

- `/compact`
- `/handoff` alias
- Compact v2 command contract
- command runner
- session-facing formatter
- JSON packet mode
- no runtime history rewrite
- no persistence

Route 77 should add:

- a session-scoped live compact checkpoint
- latest compact checkpoint lookup/update semantics
- compact checkpoint status for session surfaces
- a future-turn adapter that converts a Compact v2 checkpoint into a safe future-turn context payload
- tests proving the adapter is ready but not yet injected into model/provider context

Route 77 must not perform real future-turn injection. Route 78 will handle actual injection.

User-facing command principle:

- `/compact` should remain the simple user command.
- Do not require normal users to pass complicated flags.
- Any extra flags or JSON paths should remain internal/dev-oriented and should not become the primary UX.
- The default user experience should be: run `/compact`, receive a compact handoff/checkpoint summary, and know future turns can continue from it once injection is enabled.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/compact-v2-session-integration.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- Compact v2 packet/rendering exists.
- `/compact` and `/handoff` command surface exists.
- `/compact` currently produces handoff preview/packet but does not rewrite live history.
- No live future-turn injection exists yet.
- No memory system, sidebar UI, startup cache, or SessionManager schema change exists yet.

## Reference scan

Do a bounded scan before code edits.

Reference repos:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- 12 files total by default
- may exceed by 2 only for a directly relevant compact/session/future-turn integration file

Search focus:

- compact checkpoint
- compaction result
- session summary
- future turn
- resume
- conversation state
- command result
- context injection
- compression service

Answer in docs/design/compact-live-checkpoint-future-turn-adapter.md:

1. How do references store or expose the latest compact result?
2. Is compact state immediately injected, persisted, or only represented as a command result?
3. How do they distinguish user-visible summary from model-facing future context?
4. What should this project copy conceptually for a live checkpoint without yet injecting it?
5. What should Route 78 own instead of Route 77?

## This route changes

Allowed:

- docs/design/compact-live-checkpoint-future-turn-adapter.md
- docs/design/compact-v2-session-integration.md, Route 77 note only
- docs/design/compact-v2-route-continuity.md, Route 77 note only
- docs/design/context-engineering-continuity-baseline.md, Route 77 note only
- docs/design/edit-capability-roadmap.md, concise Route 77 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/compactLiveCheckpoint.ts
- packages/ts-shell/src/core/context/compactFutureTurnAdapter.ts
- packages/ts-shell/src/core/context/compactCheckpointSurface.ts

Allowed if clean:

- update the existing `/compact` command runtime to save/update a session-scoped live checkpoint
- expose latest checkpoint status through a narrow session surface helper
- add internal/dev JSON exposure for tests only if existing command conventions already support it

## This route must preserve

Route-specific boundaries:

- no actual future-turn model/provider injection
- no prompt/context injection into query loop
- no provider/MCP behavior changes
- no package script/default gate changes
- no SessionManager persistence schema changes
- no persistent memory storage
- no sidebar UI
- no startup cache
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw recovery content, raw original content, secrets, provider credentials, or hidden reasoning in compact checkpoints
- no broad cli.tsx rewrite

## Tasks

### 1. Design and audit

Create docs/design/compact-live-checkpoint-future-turn-adapter.md.

Include:

- reference scan summary
- current `/compact` command behavior
- current command/session audit
- live checkpoint model
- future-turn adapter model
- user-visible versus model-facing separation
- why actual injection is deferred to Route 78
- redaction and safety guarantees
- UX principle: `/compact` stays simple
- next-route decision criteria

### 2. Add live compact checkpoint model

Add packages/ts-shell/src/core/context/compactLiveCheckpoint.ts.

Expected concepts:

- checkpointId
- packetVersion
- createdAt
- sourceCommand: "/compact" | "/handoff" | "internal"
- packet summary/reference
- renderedMarkdown
- compactSurvivorFacts
- redactions
- warnings
- status:
  - "created"
  - "superseded"
  - "cleared"
  - "invalid"
- latest checkpoint lookup
- update latest checkpoint
- clear checkpoint
- mark superseded

Keep it session-scoped and in-memory only unless existing session state already provides a safe non-persistent holder.

Required behavior:

- deterministic IDs in tests or injectable clock/id generator
- raw content redacted
- no persistence
- no provider/model calls
- no session schema changes

Add focused tests.

### 3. Connect `/compact` command to live checkpoint

Update existing Compact v2 command runtime from Route 76.

Required behavior:

- default `/compact` builds packet + markdown as before
- default `/compact` also creates/updates latest live compact checkpoint
- user-facing output stays simple
- `/handoff` alias may create the same checkpoint if currently equivalent
- JSON/dev output still works if Route 76 implemented it
- no live history rewrite
- no future-turn injection
- no persistence

Add focused tests:

- `/compact` creates latest checkpoint
- second `/compact` supersedes previous latest or updates status deterministically
- checkpoint contains redacted packet/markdown
- checkpoint does not include raw content/secrets
- command output remains understandable

### 4. Add future-turn adapter

Add packages/ts-shell/src/core/context/compactFutureTurnAdapter.ts.

The adapter should convert a live checkpoint into a future-turn candidate context payload.

Expected output:

- adapterVersion
- checkpointId
- modelFacingSummary
- structuredFacts:
  - task/route
  - edit capability
  - mutation evidence
  - recovery/restore references
  - validation status
  - constraints
  - next action
- excludedFacts / redactions
- warnings
- injectionStatus:
  - "candidate-only"
  - "not-injected"

Required behavior:

- no provider/model calls
- no query loop injection
- no hidden reasoning
- no raw content
- no raw recovery content
- no automatic recovery or atomic rollback implication
- blocked-by-design edit facts survive
- restore execute remains explicit-only

Add focused tests.

### 5. Add checkpoint/session surface helper

Add packages/ts-shell/src/core/context/compactCheckpointSurface.ts.

It should render a concise status for users/session output:

- latest compact checkpoint exists / not exists
- createdAt
- checkpoint id
- key facts preserved
- redactions/warnings
- future-turn status:
  - ready-for-adapter
  - not-yet-injected
- next action:
  - continue normally
  - Route 78 will wire injection
  - use handoff markdown for manual migration if needed

Do not expose raw packet content unless explicitly in existing `/compact` output.

Add focused tests.

### 6. Optional narrow session surface integration

If clean:

- sessionRuntime or sessionStateSurface can display checkpoint status after `/compact`
- do not change unrelated session output
- do not add new command flags for normal users
- do not add persistence

If too coupled:

- keep compactCheckpointSurface helper tested
- document runtime blocker

### 7. Add continuity tests

Required tests:

- live checkpoint preserves edit closeout facts
- live checkpoint preserves mutation evidence
- live checkpoint preserves recovery references safely
- future-turn adapter includes blocked-by-design facts
- future-turn adapter excludes secrets/raw content/raw recovery content
- adapter reports candidate-only / not-injected
- `/compact` user output remains simple
- `/compact` does not persist or call provider/model
- no automatic recovery / atomic rollback claims

### 8. Update docs and roadmap

Update:

- docs/design/compact-live-checkpoint-future-turn-adapter.md with final notes
- docs/design/compact-v2-session-integration.md with Route 77 note
- docs/design/compact-v2-route-continuity.md with Route 77 note
- docs/design/context-engineering-continuity-baseline.md with Route 77 note
- docs/design/edit-capability-roadmap.md with concise status and Route 78 recommendation

Recommended next route:

- Route 78: actual future-turn injection from live Compact v2 checkpoint

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad `src/core/shell` or `src/session` paths expose unrelated existing failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- live checkpoint requires SessionManager schema changes
- command integration requires broad cli.tsx rewrite
- future-turn adapter requires actual query loop/provider injection
- persistence becomes necessary
- memory implementation becomes necessary
- sidebar UI becomes necessary
- startup cache implementation becomes necessary
- raw content or secrets would need to be persisted
- `/compact` user UX becomes flag-heavy or confusing

## Final report

1. What changed
2. Reference scan summary
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.

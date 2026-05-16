# Route 87: startup warm context cache prototype

## Goal

Prototype a project-scoped startup warm context cache after edit, compact, and memory foundations are stable.

Current state:

- edit capability is closeout-candidate
- Compact v2 future-turn injection is wired and quality-hardened
- project memory candidate extraction / review / save / recall / invalidate / explicit injection exists
- memory injection quality / merge hardening exists
- no startup cache exists yet

Route 87 should improve startup experience by adding a safe local warm context cache:

- build a project-scoped warm cache from safe structured sources
- read/cache health check on startup-like paths
- expose concise cache status to the user/session
- optionally add a simple `/warmup` or `/context` command if the existing command registry makes it clean
- optionally wire a narrow session startup read if clean
- do not auto-inject warm cache into model context yet

This route starts the "startup cooling" feature, but it must remain safe and non-invasive.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/memory-injection-quality-merge-hardening.md
- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/project-memory-invalidation-delete-ux.md
- docs/design/edit-capability-roadmap.md

Current phase baseline:

- memory retrieval and explicit injection exist
- memory invalidation/delete filtering exists
- Compact v2 injection exists
- startup warm cache does not exist
- sidebar does not exist
- automatic startup memory injection does not exist

## Reference scan

Do a bounded scan before code edits.

Memory/startup reference:

- MemPalace: /home/wang/projects/mempalace

Coding-agent references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- MemPalace: inspect at most 8 directly relevant files
- ClaudeCode/opencode/gemini-cli: inspect at most 8 files total
- total default budget: 16 files
- may exceed by 2 only for directly relevant startup/cache/wake-up/session-load files

MemPalace search focus:

- wake-up
- layers
- identity
- cache
- startup
- recall
- status
- palace path
- local store
- CLI wake-up

Coding-agent search focus:

- startup
- resume
- session load
- context cache
- memory load
- compact
- warm
- status

Answer in docs/design/startup-warm-context-cache.md:

1. How does MemPalace keep wake-up cost low?
2. What should be borrowed from layered wake-up without copying palace terminology?
3. What startup facts should this project cache?
4. What should remain live-computed instead of cached?
5. How should cache invalidation/staleness work?
6. What should remain deferred until auto-startup injection or sidebar?

## This route changes

Allowed:

- docs/design/startup-warm-context-cache.md
- docs/design/context-engineering-continuity-baseline.md, Route 87 note only
- docs/design/memory-injection-quality-merge-hardening.md, Route 87 note only
- docs/design/project-memory-retrieval-wakeup-recall.md, Route 87 note only
- docs/design/edit-capability-roadmap.md, concise Route 87 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/startupWarmContextCache.ts
- packages/ts-shell/src/core/context/startupWarmContextBuilder.ts
- packages/ts-shell/src/core/context/startupWarmContextHealth.ts
- packages/ts-shell/src/core/context/startupWarmContextSurface.ts
- packages/ts-shell/src/core/context/startupWarmCommandContract.ts
- packages/ts-shell/src/core/context/startupWarmCommandRunner.ts

Allowed if clean:

- project-scoped local cache file with explicit project root
- deterministic test cache root
- `/warmup` command if command registry integration is simple
- `/memory wake` may mention cache status if clean
- session startup may read cache status only, not inject into model context

## This route must preserve

Route-specific boundaries:

- no automatic model-context injection from startup cache
- no startup auto-load into future turns
- no vector DB / ChromaDB / embeddings
- no provider/model calls
- no MCP memory tools
- no sidebar UI
- no package script/default gate changes
- no provider/MCP behavior changes
- no SessionManager schema changes
- no edit runtime changes
- no automatic recovery
- no atomic rollback
- no raw file content, raw recovery content, secrets, provider credentials, or hidden reasoning in cache
- invalidated/deleted memory records must not be cached as active facts
- startup cache must be project-scoped and safe to discard

## Tasks

### 1. Design and audit

Create docs/design/startup-warm-context-cache.md.

Include:

- MemPalace reference scan summary
- coding-agent reference scan summary
- current context/compact/memory baseline
- startup warm cache goals
- cache input sources
- cache record/schema
- cache build/read/health model
- staleness and invalidation policy
- user/session surface model
- why automatic model injection is deferred
- future sidebar/startup integration boundary
- next-route decision criteria

### 2. Add startup warm cache model

Add packages/ts-shell/src/core/context/startupWarmContextCache.ts.

Expected concepts:

- cacheVersion
- projectRootHash or projectRef
- createdAt
- sourceSummary
- editCapabilitySummary
- compactSummary
- memoryWakeupSummary
- validationSummary
- routePhaseSummary
- redactions
- warnings
- staleness:
  - "fresh"
  - "stale"
  - "invalid"
  - "unknown"
- cacheMode:
  - "disabled"
  - "explicit-local"
  - "test-only"

Required behavior:

- pure types/helpers
- no provider/model calls
- no raw content/secrets
- deterministic ids/timestamps in tests if helper logic exists

Add focused tests.

### 3. Add warm context builder

Add packages/ts-shell/src/core/context/startupWarmContextBuilder.ts.

Builder should consume safe sources:

- edit capability closeout manifest/readiness
- context continuity manifest
- Compact v2 stable summaries if provided
- project memory wake-up preview from approved non-invalidated records
- memory injection quality summary if provided
- validation evidence if provided
- route phase / next action if provided

Required behavior:

- exclude raw file content
- exclude raw recovery content
- exclude secrets
- exclude hidden reasoning
- exclude invalidated/deleted memory records
- summarize long sections
- produce deterministic output
- never persist directly
- never call provider/model

Add focused tests.

### 4. Add local cache store and health

Add packages/ts-shell/src/core/context/startupWarmContextHealth.ts.

If useful, keep store and health in one module or split cleanly.

Required behavior:

- explicit project/cache root required
- write warm cache only through explicit build command / test harness
- read warm cache
- check cache health
- stale if source signatures differ or TTL exceeded if TTL implemented
- safe if cache file missing
- cache is discardable
- no SessionManager schema changes
- no global default path unless already passed as explicit project root

Add focused tests using temp cache path.

### 5. Add startup warm surface

Add packages/ts-shell/src/core/context/startupWarmContextSurface.ts.

Renderer should show:

- warm cache status
- project summary
- edit capability summary
- memory wake-up summary
- validation summary
- stale/invalid warnings
- redactions
- “Injected into model: no”
- “Startup auto-load: no”
- next action

Keep output concise and user-friendly.

Add focused tests.

### 6. Add warm command contract and runner

Add:

- packages/ts-shell/src/core/context/startupWarmCommandContract.ts
- packages/ts-shell/src/core/context/startupWarmCommandRunner.ts

Preferred command forms if registered:

- `/warmup`
- `/warmup status`
- `/warmup rebuild`

Normal user path:

- `/warmup` shows current warm cache status and builds/rebuilds only if command semantics are clear
- `/warmup status` is read-only
- `/warmup rebuild` explicitly rebuilds cache

If command UX feels too technical, keep command runner internal and document future UX.

Required behavior:

- build requires explicit project/cache root harness
- no provider/model calls
- no future-turn injection
- no memory auto-load
- no raw content/secrets
- invalidated/deleted memory excluded

Add focused tests.

### 7. Register `/warmup` if clean

Integrate with command registry if clean.

Required behavior:

- `/warmup` remains simple
- `/warmup status` shows status
- `/warmup rebuild` rebuilds explicitly
- no complex flags for normal users
- no startup auto-injection
- missing cache handled clearly

If command registration is coupled:

- keep command runner/surface tested
- document blocker

### 8. Optional narrow session startup cache read

If clean, allow session startup/session surface to read warm cache status.

Strict boundary:

- status/read only
- no model injection
- no history rewrite
- no SessionManager schema change
- no provider/model call
- no memory auto-load

If coupled, defer and document.

### 9. Startup warm cache tests

Required tests:

- builder includes edit capability summary
- builder includes memory wake-up summary from approved active records
- invalidated/deleted memory records are excluded
- raw content/secrets are excluded
- local cache write/read works with explicit temp root
- missing cache handled clearly
- stale/invalid status reported
- surface says injected into model: no
- `/warmup status` works if command registered
- `/warmup rebuild` writes explicit local cache if command registered
- no provider/model calls
- no SessionManager schema change
- no future-turn injection

### 10. Docs and roadmap update

Update:

- docs/design/startup-warm-context-cache.md with final notes
- docs/design/context-engineering-continuity-baseline.md with Route 87 note
- docs/design/memory-injection-quality-merge-hardening.md with Route 87 note
- docs/design/project-memory-retrieval-wakeup-recall.md with Route 87 note
- docs/design/edit-capability-roadmap.md with concise status and Route 88 recommendation

Recommended next route:

- Route 88: sidebar state model
  - if warm cache status and memory/compact/edit surfaces are stable enough
- or Route 88: startup warm cache session integration
  - if command/internal cache exists but startup read was deferred
- or Route 88: memory retrieval ranking hardening
  - if recall quality remains the next blocker

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad src/core/shell or src/session paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- startup warm cache requires provider/model calls
- startup warm cache requires SessionManager schema changes
- automatic model injection becomes necessary
- global default persistent cache semantics become unclear
- raw content or secrets would need to be cached
- invalidated/deleted records cannot be excluded
- command UX becomes confusing or flag-heavy
- startup lifecycle integration requires broad cli.tsx rewrite

## Final report

1. What changed
2. Reference scan summary, including MemPalace
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.

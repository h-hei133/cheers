# Route 90: sidebar live event capture and session integration

## Goal

Turn the Route 89 sidebar event bridge into a live session-scoped event capture path.

Route 88 added `/sidebar` state preview.
Route 89 added sidebar event model, explicit event bridge, recent activity projection, and quality checks.
Route 90 should connect that event substrate to real command/session activity without building an actual UI.

Target behavior:

- `/sidebar` shows current state plus recent live activity from the current session.
- command runtimes can emit sidebar events through a safe in-memory event sink.
- sidebar events remain bounded, redacted, read-only, and session-scoped.
- compact, memory, warmup, restore/status, validation-like command summaries can appear as recent activity where clean.
- no actual React/TUI/sidebar panel yet.
- no persistent event store.
- no provider/model calls.
- no dynamic MCP/skills discovery.

This route makes `/sidebar` useful as a live status surface before building an actual UI.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/sidebar-state-model.md
- docs/design/sidebar-event-log-bridge.md
- docs/design/startup-warm-context-cache.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/memory-injection-quality-merge-hardening.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/sidebar` exists as read-only text preview.
- sidebar event model and activity projection exist.
- event bridge currently consumes explicit inputs only.
- no live runtime event capture exists.
- no actual sidebar UI exists.

## Reference scan

Use the expanded reference pool from `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Secondary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Budget:

- OpenHands: at most 8 files
- opencode + gemini-cli: at most 6 files total
- ClaudeCode + Stagehand + Playwright MCP: at most 5 files total
- total default budget: 19 files
- exceed by 2 only for directly relevant event/session/status capture files

Focus:

OpenHands:

- event store
- event stream
- session events
- agent state
- GUI/local activity panel
- command/result activity

opencode / gemini-cli:

- session event emission
- command result capture
- tool result summaries
- status rendering
- compact/session lifecycle activity

ClaudeCode:

- session activity
- result/status surface
- command events if visible

Stagehand:

- action preview / execution status
- cached action / self-healing status events

Playwright MCP:

- tool/server status events
- concise browser/tool state surface

Answer in docs/design/sidebar-live-event-capture.md:

1. Where should this project capture live sidebar events?
2. What should be session-scoped in-memory versus persisted?
3. Which command results should emit user-visible events?
4. How should event budgets, redaction, and developer-only visibility work?
5. What should remain deferred until actual UI/TUI?

## This route changes

Allowed:

- docs/design/sidebar-live-event-capture.md
- docs/design/sidebar-event-log-bridge.md, Route 90 note only
- docs/design/sidebar-state-model.md, Route 90 note only
- docs/design/context-engineering-continuity-baseline.md, Route 90 note only
- docs/design/edit-capability-roadmap.md, concise Route 90 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/sidebarLiveEventStore.ts
- packages/ts-shell/src/core/context/sidebarEventSink.ts
- packages/ts-shell/src/core/context/sidebarCommandEventAdapter.ts
- packages/ts-shell/src/core/context/sidebarSessionSurface.ts

Allowed if clean:

- add an optional sidebarEventSink to command runtime context/types
- make `/compact`, `/memory`, `/warmup`, `/restore` or existing local commands emit concise sidebar events
- make `/sidebar` read from current session live event store
- expose event buffer status in sidebar output
- capture validation-like command results only if already surfaced locally

## This route must preserve

Route-specific boundaries:

- no actual sidebar UI / TUI / React panel
- no persistent event store
- no dynamic MCP/skills discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in captured events
- live event capture must be bounded and read-only
- `/sidebar` output must remain concise

## Tasks

### 1. Design and audit

Create docs/design/sidebar-live-event-capture.md.

Include:

- Route 90 reference scan summary
- Route 89 explicit event bridge baseline
- live capture architecture
- session-scoped event store model
- command event sink model
- event budget/redaction policy
- user-visible vs developer-only event policy
- `/sidebar` live read model
- why persistent event store and actual UI are deferred
- next-route decision criteria

### 2. Add live sidebar event store

Add packages/ts-shell/src/core/context/sidebarLiveEventStore.ts.

Expected behavior:

- session-scoped in-memory event buffer
- append event
- append many
- list recent events
- clear events
- event budget / ring buffer
- deterministic clock/id injection for tests
- redaction on append or before render
- developer-only events not user-visible by default
- no persistence

Add focused tests.

### 3. Add sidebar event sink

Add packages/ts-shell/src/core/context/sidebarEventSink.ts.

Expected behavior:

- minimal interface command runtimes can receive
- emit user-visible event
- emit developer-only event
- emit warning/blocker
- no-op sink for tests/defaults
- safe adapter to sidebarLiveEventStore
- redaction enforcement
- no provider/model calls

Add focused tests.

### 4. Add command event adapter

Add packages/ts-shell/src/core/context/sidebarCommandEventAdapter.ts.

Convert command results into sidebar events.

Initial event families:

- compact:
  - compact checkpoint created
  - compact injected/consumed if visible
  - compact warning/blocker

- memory:
  - candidates reviewed
  - candidate approved/rejected
  - memory saved
  - memory recalled/wake preview
  - memory use staged/injected
  - memory invalidated/deleted
  - memory warning/blocker

- warmup:
  - warmup status read
  - warmup rebuilt
  - warmup stale/invalid warning

- restore/recovery if clean:
  - restore preview
  - restore execute
  - restore blocked

- sidebar:
  - sidebar rendered, developer-only or omitted if noisy

Required behavior:

- concise event title/summary
- no raw content/secrets
- severity mapping
- source references
- deterministic mapping
- unknown command result handled gracefully

Add focused tests.

### 5. Wire command runtimes to emit events

Add optional `sidebarEventSink` to the existing command runtime context if clean.

Wire at least:

- `/compact`
- `/memory`
- `/warmup`
- `/sidebar` reads events; it does not need to emit by default

Optional if clean:

- `/restore`
- validation/status command paths if they exist locally

Required behavior:

- command success emits concise success/info event
- warnings emit warning events
- blockers/errors emit blocked/error events
- no command behavior changes except event emission
- event emission failure must not fail the command unless redaction safety fails
- no persistent store

Add focused tests.

### 6. Make `/sidebar` consume live events

Update sidebarCommandRuntime / sidebar projection / surface.

Required behavior:

- `/sidebar` reads current session live events if available
- recent activity is shown from live events
- explicit test-provided events still work
- no events means current state output still works
- event budget enforced
- warnings/blockers preserved over normal events
- developer-only events hidden by default
- output remains concise

Add focused tests.

### 7. Add session/runtime integration if clean

If ShellSessionRuntime or command bridge can carry session-scoped event store cleanly:

- create or pass live sidebar event store for session
- command runtimes receive event sink
- `/sidebar` reads same session store
- do not change SessionManager schema
- do not persist events
- do not alter original user prompt persistence

If runtime integration is too coupled:

- keep command runtime/event sink tests in isolation
- document blocker
- recommend Route 91 runtime integration

Attempt clean integration first.

### 8. Quality and safety tests

Required tests:

- `/compact` emits sidebar event
- `/memory save` emits sidebar event
- `/memory recall` emits sidebar event
- `/memory use` emits sidebar event
- `/memory invalidate/delete` emits sidebar event if command paths exist
- `/warmup status/rebuild` emits sidebar event
- `/sidebar` shows recent live activity
- event budget caps normal events
- warning/blocker events survive budget
- developer-only events hidden by default
- no raw content/secrets/hidden reasoning leak
- event store is session-scoped
- event emission does not persist
- command behavior unchanged apart from event capture

### 9. Docs and roadmap update

Update:

- docs/design/sidebar-live-event-capture.md with final notes
- docs/design/sidebar-event-log-bridge.md with Route 90 note
- docs/design/sidebar-state-model.md with Route 90 note
- docs/design/context-engineering-continuity-baseline.md with Route 90 note
- docs/design/edit-capability-roadmap.md with concise status and Route 91 recommendation

Recommended next route:

- Route 91: actual sidebar UI/TUI prototype
  - if live event capture is stable
- or Route 91: sidebar live event quality/polish
  - if runtime integration was partial
- or Route 91: memory retrieval ranking hardening
  - if visible state is sufficient and memory quality is the next blocker

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

- live event capture requires persistent event store
- live event capture requires SessionManager schema changes
- actual UI implementation becomes necessary
- dynamic MCP/skills discovery becomes necessary
- provider/model calls become necessary
- raw content/secrets would need to appear
- command integration requires broad cli.tsx rewrite
- `/sidebar` output becomes too noisy

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

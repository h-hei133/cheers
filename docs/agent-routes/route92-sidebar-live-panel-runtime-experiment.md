# Route 92: sidebar live panel runtime experiment

## Goal

Build a bounded opt-in live sidebar panel experiment on top of Route 91.

Route 88 added sidebar state projection.
Route 89 added event-log bridge.
Route 90 added live session event capture.
Route 91 added explicit terminal panel rendering through `/sidebar panel`, `/sidebar compact`, and `/sidebar detail`.

Route 92 should add a live/watch-capable panel runtime without rewriting the whole CLI lifecycle.

Target behavior:

- `/sidebar panel` keeps working as a snapshot.
- `/sidebar watch` or equivalent opt-in command can render a refreshed panel view from the current session event store.
- Live rendering remains bounded, read-only, explicit, and testable.
- The panel can show new events arriving after command runtimes emit sidebar events.
- Runtime is safe to disable or defer if existing CLI lifecycle is too coupled.
- No always-on default UI.
- No React UI.
- No dynamic MCP/skills discovery.
- No provider/model calls.

This route should be an experiment with clear boundaries, not a permanent UI architecture rewrite.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/sidebar-tui-panel-prototype.md
- docs/design/sidebar-live-event-capture.md
- docs/design/sidebar-event-log-bridge.md
- docs/design/sidebar-state-model.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/sidebar` text preview exists.
- `/sidebar panel`, `/sidebar compact`, `/sidebar detail` exist.
- live command events are captured into session-scoped in-memory event store.
- no live/watch sidebar runtime exists.
- no actual always-on sidebar exists.

## Reference scan

Use the expanded reference pool from `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Secondary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- OpenHands: at most 7 files
- opencode + gemini-cli: at most 8 files total
- Stagehand + Playwright MCP + ClaudeCode: at most 5 files total
- total default budget: 20 files
- exceed by 2 only for directly relevant live panel / terminal watch / status-refresh files

Focus:

OpenHands:

- live UI state
- event stream consumption
- activity panel refresh
- task progress display
- local GUI session status

opencode / gemini-cli:

- terminal rendering
- TUI/live status update
- interactive command loop
- command output lifecycle
- status refresh conventions

Stagehand:

- live action status
- action preview / execution status
- cached action state

Playwright MCP:

- tool/server status display
- concise capability status
- snapshot refresh patterns

ClaudeCode:

- CLI lifecycle boundaries
- status/result rendering caution

Answer in docs/design/sidebar-live-panel-runtime-experiment.md:

1. What live panel behavior is safe without CLI lifecycle rewrite?
2. How should snapshot panel and live/watch panel differ?
3. What refresh model should be used: event-driven, polling, or manual ticks?
4. What must stay opt-in / experimental?
5. What should remain deferred until a real TUI route?

## This route changes

Allowed:

- docs/design/sidebar-live-panel-runtime-experiment.md
- docs/design/sidebar-tui-panel-prototype.md, Route 92 note only
- docs/design/sidebar-live-event-capture.md, Route 92 note only
- docs/design/sidebar-state-model.md, Route 92 note only
- docs/design/context-engineering-continuity-baseline.md, Route 92 note only
- docs/design/edit-capability-roadmap.md, concise Route 92 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/sidebarLivePanelRuntime.ts
- packages/ts-shell/src/core/context/sidebarLivePanelRenderer.ts
- packages/ts-shell/src/core/context/sidebarLivePanelCommandContract.ts
- packages/ts-shell/src/core/context/sidebarLivePanelCommandRunner.ts
- packages/ts-shell/src/core/context/sidebarLivePanelQuality.ts

Allowed if clean:

- add `/sidebar watch`
- add `/sidebar live` as alias only if UX remains clear
- add deterministic test clock/tick source
- add manual tick/update API for tests
- integrate with session-scoped sidebar event store
- expose live panel as explicit command output, not default UI

## This route must preserve

Route-specific boundaries:

- no default always-on sidebar
- no React UI
- no full TUI app
- no broad cli.tsx lifecycle rewrite
- no dynamic MCP/skills discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in live panel output
- `/sidebar panel` snapshot behavior must remain stable

## Tasks

### 1. Design and audit

Create docs/design/sidebar-live-panel-runtime-experiment.md.

Include:

- Route 92 reference scan summary
- Route 91 panel baseline
- snapshot vs live/watch panel distinction
- refresh model decision
- event source model
- render budget policy
- terminal output constraints
- opt-in experiment boundary
- no default always-on UI boundary
- future real TUI route boundary
- next-route decision criteria

### 2. Add live panel runtime model

Add packages/ts-shell/src/core/context/sidebarLivePanelRuntime.ts.

Expected behavior:

- consume SidebarStateSnapshot
- consume SidebarLiveEventStore or explicit events
- support deterministic ticks/refreshes in tests
- produce live panel frames
- maintain bounded frame history if needed
- no persistence
- no provider/model calls
- no terminal side effects in pure model

Add focused tests.

### 3. Add live panel renderer

Add packages/ts-shell/src/core/context/sidebarLivePanelRenderer.ts.

Renderer should:

- render current frame using existing sidebar panel renderer/layout
- include frame metadata:
  - frame number
  - updatedAt
  - event count
  - warning/blocker count
- show clear label that this is live/watch preview
- keep output bounded
- no ANSI by default unless existing conventions support deterministic ANSI-free fallback
- no raw content/secrets

Add focused tests.

### 4. Add live panel command contract / runner

Add:

- packages/ts-shell/src/core/context/sidebarLivePanelCommandContract.ts
- packages/ts-shell/src/core/context/sidebarLivePanelCommandRunner.ts

Preferred command:

- `/sidebar watch`

Optional aliases:

- `/sidebar live`

Runner should:

- be read-only
- render one or more deterministic frames
- use current live event store if available
- support test-only tick/frame count input
- avoid blocking indefinite loops in tests
- return clear output if live runtime is not available
- preserve `/sidebar panel` behavior

Add focused tests.

### 5. Integrate with `/sidebar`

Update sidebar command runtime if clean.

Required behavior:

- `/sidebar` existing preview remains
- `/sidebar panel` remains snapshot panel
- `/sidebar watch` uses live panel runner
- if runtime cannot truly watch in current CLI, provide a bounded “live snapshot with refresh-ready metadata” and document limitation
- invalid args rejected clearly
- no lifecycle rewrite

Add focused command tests.

### 6. Live panel quality checks

Add packages/ts-shell/src/core/context/sidebarLivePanelQuality.ts or extend existing panel quality.

Checks:

- frame has current state
- frame has recent activity
- blockers/warnings visible
- next action visible
- frame under max lines/width
- no raw content leak
- no secret leak
- no hidden reasoning leak
- watch output bounded
- snapshot command unaffected

Add focused tests.

### 7. Runtime/session integration if clean

If ShellSessionRuntime or command bridge can provide a live event store cleanly:

- `/sidebar watch` reads the same session live event store as `/sidebar`
- command events emitted before watch appear in first frame
- events emitted during test tick can appear in later frame if feasible

If coupled:

- keep live panel runtime tested with explicit event inputs
- document blocker
- recommend follow-up route

Do not rewrite CLI lifecycle.

### 8. Tests

Required tests:

- live runtime produces deterministic frame
- live renderer includes frame metadata
- watch command routes
- watch command output is bounded
- existing `/sidebar panel` snapshot still works
- live panel shows recent activity
- warning/blocker survives budget
- developer-only events hidden by default
- raw content/secrets/hidden reasoning redacted
- no provider/model calls
- no persistence
- no indefinite loop in tests

### 9. Docs and roadmap update

Update:

- docs/design/sidebar-live-panel-runtime-experiment.md with final notes
- docs/design/sidebar-tui-panel-prototype.md with Route 92 note
- docs/design/sidebar-live-event-capture.md with Route 92 note
- docs/design/sidebar-state-model.md with Route 92 note
- docs/design/context-engineering-continuity-baseline.md with Route 92 note
- docs/design/edit-capability-roadmap.md with concise status and Route 93 recommendation

Recommended next route:

- Route 93: sidebar runtime polish / always-on TUI decision
  - if watch prototype works
- or Route 93: browser capability boundary
  - if sidebar/product surface is stable enough
- or Route 93: memory retrieval ranking hardening
  - if memory quality is the next blocker

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

- live panel requires broad cli.tsx lifecycle rewrite
- live panel requires actual TUI app
- provider/model calls become necessary
- SessionManager schema changes become necessary
- dynamic MCP/skills discovery becomes necessary
- watch mode risks indefinite test/runtime loops
- output becomes too noisy for terminal use
- snapshot `/sidebar panel` would break

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

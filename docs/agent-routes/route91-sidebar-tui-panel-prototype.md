# Route 91: sidebar TUI panel prototype

## Goal

Prototype an actual terminal sidebar/status panel on top of the Route 88-90 sidebar state substrate.

Route 88 added sidebar state model and `/sidebar` preview.
Route 89 added event-log bridge and quality checks.
Route 90 added session-scoped live event capture from real command runtimes.

Route 91 should make this visible surface more product-like:

- add a TUI-ready sidebar panel model
- add a compact terminal panel renderer
- add `/sidebar panel` or equivalent explicit command if clean
- display current state + live activity + blockers + next action in a structured panel
- keep output concise, stable, and testable
- preserve `/sidebar` simple text preview
- avoid always-on async UI or full CLI lifecycle rewrite

This route should produce an actual user-facing panel rendering, but not a full React/TUI application.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/sidebar-state-model.md
- docs/design/sidebar-event-log-bridge.md
- docs/design/sidebar-live-event-capture.md
- docs/design/startup-warm-context-cache.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/sidebar` exists as read-only text preview.
- live command activity is captured in session-scoped event store.
- sidebar state projection and quality checks exist.
- no actual panel renderer exists.
- no always-on sidebar UI exists.

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
- opencode + gemini-cli: at most 7 files total
- Stagehand + Playwright MCP + ClaudeCode: at most 5 files total
- total default budget: 19 files
- exceed by 2 only for directly relevant terminal panel / status rendering / activity UI files

Focus:

OpenHands:

- GUI/local status panels
- event/activity display
- task progress surfaces
- file-change display
- session state panels

opencode / gemini-cli:

- TUI/CLI status rendering
- command result cards
- event/status formatting
- compact terminal output
- interactive shell display conventions

Stagehand:

- action preview/status display
- cached action / self-healing status wording
- concise automation state

Playwright MCP:

- tool/server status surface
- token-efficient status summaries
- browser/tool state display

ClaudeCode:

- CLI result/status conventions
- session activity surface

Answer in docs/design/sidebar-tui-panel-prototype.md:

1. What panel sections should be visible by default?
2. How do references keep activity/status surfaces concise?
3. What should be hidden behind developer-only output?
4. What should the terminal panel layout look like?
5. What remains deferred until a real always-on TUI/sidebar?

## This route changes

Allowed:

- docs/design/sidebar-tui-panel-prototype.md
- docs/design/sidebar-live-event-capture.md, Route 91 note only
- docs/design/sidebar-event-log-bridge.md, Route 91 note only
- docs/design/sidebar-state-model.md, Route 91 note only
- docs/design/context-engineering-continuity-baseline.md, Route 91 note only
- docs/design/edit-capability-roadmap.md, concise Route 91 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/sidebarPanelModel.ts
- packages/ts-shell/src/core/context/sidebarPanelLayout.ts
- packages/ts-shell/src/core/context/sidebarPanelRenderer.ts
- packages/ts-shell/src/core/context/sidebarPanelCommandContract.ts
- packages/ts-shell/src/core/context/sidebarPanelCommandRunner.ts

Allowed if clean:

- extend `/sidebar` with:
  - `/sidebar panel`
  - `/sidebar compact`
  - `/sidebar detail` only if simple
- add terminal-width-aware rendering if deterministic in tests
- add ANSI-free default rendering; ANSI/color only if existing conventions support it safely
- show tool/MCP/skills placeholder status from explicit inputs only

## This route must preserve

Route-specific boundaries:

- no always-on async sidebar
- no React UI
- no persistent UI state
- no dynamic MCP/skills discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in panel output
- panel output must stay concise and bounded
- `/sidebar` existing simple preview must keep working

## Tasks

### 1. Design and audit

Create docs/design/sidebar-tui-panel-prototype.md.

Include:

- Route 91 reference scan summary
- Route 88-90 sidebar substrate baseline
- terminal panel layout decision
- default panel sections
- compact vs detail decision
- width/budget policy
- color/ANSI decision
- developer-only hiding policy
- no always-on UI boundary
- future always-on sidebar/TUI route boundary
- next-route decision criteria

### 2. Add sidebar panel model

Add packages/ts-shell/src/core/context/sidebarPanelModel.ts.

Expected concepts:

- SidebarPanel
- SidebarPanelSection:
  - header
  - task-route
  - edit
  - compact
  - memory
  - warmup
  - tools
  - validation
  - activity
  - blockers
  - next-action
  - footer
- SidebarPanelDensity:
  - compact
  - normal
  - detail
- SidebarPanelRenderMode:
  - plain
  - ansi-safe if supported
- SidebarPanelBudget:
  - maxWidth
  - maxSections
  - maxActivityItems
  - maxLines
- SidebarPanelLine
- SidebarPanelWarning

Model must be pure and non-persistent.

Add focused tests if helpers exist.

### 3. Add panel layout builder

Add packages/ts-shell/src/core/context/sidebarPanelLayout.ts.

Builder should consume SidebarStateSnapshot and produce SidebarPanel.

Required behavior:

- deterministic section ordering
- hides empty/noisy sections in compact mode
- preserves blockers/warnings
- preserves next action
- preserves live recent activity within budget
- represents missing/unknown tool status honestly
- developer-only events hidden by default
- invalidated/deleted memory not shown as active
- no raw content/secrets
- stable output for tests

Add focused tests.

### 4. Add panel renderer

Add packages/ts-shell/src/core/context/sidebarPanelRenderer.ts.

Renderer should produce terminal text.

Required behavior:

- plain text default
- concise box/panel layout
- deterministic width handling
- line truncation with safe ellipsis if needed
- no ANSI by default unless local conventions already support it
- no raw content/secrets
- clear labels:
  - Task
  - Edit
  - Compact
  - Memory
  - Warmup
  - Tools
  - Recent activity
  - Blockers
  - Next
- panel clearly says if it is a preview, not an always-on UI

Add focused tests.

### 5. Add sidebar panel command contract/runner

Add:

- packages/ts-shell/src/core/context/sidebarPanelCommandContract.ts
- packages/ts-shell/src/core/context/sidebarPanelCommandRunner.ts

Preferred command forms:

- `/sidebar panel`
- `/sidebar compact`
- `/sidebar detail`

Normal user path:

- `/sidebar` keeps existing preview.
- `/sidebar panel` shows TUI-like panel.
- `/sidebar compact` shows shortest view.
- `/sidebar detail` may include more activity if clean.

Required behavior:

- read-only
- no dynamic discovery
- no provider/model calls
- no persistence
- invalid args rejected clearly
- output uses existing live event store if available

Add focused tests.

### 6. Integrate with `/sidebar`

Update sidebar command runtime if clean.

Required behavior:

- `/sidebar` existing behavior preserved
- `/sidebar panel` renders panel
- `/sidebar compact` and `/sidebar detail` only if contract added
- live activity appears in panel
- no events still produces useful panel
- output remains bounded

Add focused command tests.

### 7. Panel quality checks

Extend sidebarStateQuality or add panel-specific checks if useful.

Required checks:

- has header
- has next action
- blockers visible
- activity budget respected
- output under max lines/width
- no raw content leak
- no secret leak
- no hidden reasoning leak
- developer-only hidden by default

Add focused tests.

### 8. Panel tests

Required tests:

- panel renders edit/compact/memory/warmup/tools/validation sections
- panel renders live recent activity
- panel hides empty/noisy sections in compact mode
- panel preserves blockers and next action
- panel truncates long lines safely
- panel respects activity budget
- panel hides developer-only events
- panel redacts raw content/secrets/hidden reasoning
- `/sidebar panel` routes correctly
- existing `/sidebar` preview remains unchanged or compatibly stable

### 9. Docs and roadmap update

Update:

- docs/design/sidebar-tui-panel-prototype.md with final notes
- docs/design/sidebar-live-event-capture.md with Route 91 note
- docs/design/sidebar-event-log-bridge.md with Route 91 note
- docs/design/sidebar-state-model.md with Route 91 note
- docs/design/context-engineering-continuity-baseline.md with Route 91 note
- docs/design/edit-capability-roadmap.md with concise status and Route 92 recommendation

Recommended next route:

- Route 92: sidebar panel live/runtime polish
  - if panel prototype works but needs better event integration
- or Route 92: actual always-on TUI sidebar experiment
  - if explicit panel output is stable enough
- or Route 92: memory retrieval ranking hardening
  - if product surface is good enough and memory quality is next
- or Route 92: browser capability boundary
  - if moving toward browser/tooling phase

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

- panel requires actual always-on UI
- panel requires broad cli.tsx lifecycle rewrite
- dynamic MCP/skills discovery becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- raw content/secrets would need to appear
- output becomes too noisy or too wide for terminal use
- existing `/sidebar` behavior would be broken

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

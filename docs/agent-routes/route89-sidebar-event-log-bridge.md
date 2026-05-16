# Route 89: sidebar state quality and event-log bridge

## Goal

Upgrade the Route 88 sidebar state preview from a static status projection into a stable visible-agent-state substrate with recent event-log bridge and quality checks.

Route 88 added:

- sidebar state model
- tool/MCP/skills availability placeholders
- sidebar state projection
- sidebar state surface renderer
- read-only `/sidebar` command
- no actual UI

Route 89 should add:

- sidebar event model
- event-log bridge from explicit command/session events where clean
- recent activity projection
- sidebar quality checks
- concise timeline rendering
- blocker/warning aggregation
- next-action quality enforcement
- tests proving the sidebar state is useful, stable, concise, and safe

This route must not build a real sidebar UI/TUI/React panel. It should create the data/event substrate that a future UI can consume.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/sidebar-state-model.md
- docs/design/startup-warm-context-cache.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/sidebar` exists as read-only text preview.
- `/status` semantics remain unchanged.
- no actual sidebar UI exists.
- no dynamic MCP/skills discovery exists.
- edit / compact / memory / warmup state projections exist.
- sidebar does not yet have event-log bridge or quality checks.

## Reference scan

Use the expanded reference pool from `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Secondary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- OpenHands: at most 7 files
- Stagehand: at most 4 files
- Playwright MCP: at most 3 files
- ClaudeCode/opencode/gemini-cli combined: at most 5 files
- total default budget: 19 files
- exceed by 2 only for directly relevant event-log / activity / sidebar / status files

Focus:

OpenHands:

- event stream
- session event store
- task progress
- file-change/activity display
- conversation status
- GUI/local status surface

Stagehand:

- action preview
- action/cache event status
- observe/act/extract activity
- self-healing/cached-action status

Playwright MCP:

- tool state
- snapshot/status event surface
- MCP server status
- concise tool output

Coding-agent baselines:

- CLI/session event summaries
- command result display
- compact/status surface
- tool result / validation activity

Answer in docs/design/sidebar-event-log-bridge.md:

1. What should be represented as current state versus recent activity?
2. How do references avoid noisy or unbounded event logs?
3. What events are useful for users versus developer-only diagnostics?
4. How should warnings/blockers and next actions be aggregated?
5. What should remain deferred until actual sidebar UI/TUI?

## This route changes

Allowed:

- docs/design/sidebar-event-log-bridge.md
- docs/design/sidebar-state-model.md, Route 89 note only
- docs/design/startup-warm-context-cache.md, Route 89 note only
- docs/design/context-engineering-continuity-baseline.md, Route 89 note only
- docs/design/edit-capability-roadmap.md, concise Route 89 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/sidebarEventModel.ts
- packages/ts-shell/src/core/context/sidebarEventBridge.ts
- packages/ts-shell/src/core/context/sidebarActivityProjection.ts
- packages/ts-shell/src/core/context/sidebarStateQuality.ts

Allowed if clean:

- extend `/sidebar` output with a short “Recent activity” section
- add explicit event inputs to sidebar projection
- bridge from existing command result/session event objects only when clean
- add developer-only event facts if they remain hidden or clearly labeled

## This route must preserve

Route-specific boundaries:

- no actual sidebar UI / TUI / React panel
- no dynamic MCP/skills discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in sidebar events or output
- event bridge must be read-only
- sidebar output must stay concise

## Tasks

### 1. Design and audit

Create docs/design/sidebar-event-log-bridge.md.

Include:

- Route 89 reference scan summary
- Route 88 sidebar baseline
- current-state versus event-log distinction
- visible event categories
- developer-only event categories
- event retention/budget policy
- quality checks
- warning/blocker aggregation
- next-action aggregation
- no-UI boundary
- future sidebar UI route boundary
- next-route decision criteria

### 2. Add sidebar event model

Add packages/ts-shell/src/core/context/sidebarEventModel.ts.

Expected concepts:

- SidebarEvent
- SidebarEventId
- SidebarEventKind:
  - command
  - edit
  - compact
  - memory
  - warmup
  - validation
  - tool
  - warning
  - blocker
  - route
- SidebarEventSeverity:
  - info
  - success
  - warning
  - blocked
  - error
- SidebarEventVisibility:
  - user-visible
  - developer-only
  - hidden
- SidebarEventSource:
  - slash-command
  - session-runtime
  - compact
  - memory
  - warmup
  - validation
  - tool-availability
  - route
- timestamp
- title
- summary
- references
- redactions
- nextAction

Model must be pure and non-persistent.

Add focused tests if helpers exist.

### 3. Add sidebar event bridge

Add packages/ts-shell/src/core/context/sidebarEventBridge.ts.

Bridge should convert explicit inputs into SidebarEvent objects.

Inputs may include:

- command result summaries
- compact checkpoint/injection status
- memory review/save/recall/use/invalidation status
- warmup status/rebuild result
- validation evidence
- edit mutation evidence if provided
- tool/MCP/skills placeholder changes
- route status

Required behavior:

- read-only
- deterministic ordering
- event count budget
- no raw content/secrets
- no provider/model call
- unknown inputs handled gracefully
- developer-only facts not shown as user-visible by default

Add focused tests.

### 4. Add recent activity projection

Add packages/ts-shell/src/core/context/sidebarActivityProjection.ts.

Projection should:

- take sidebar snapshot + sidebar events
- produce recent activity section
- group by severity/kind if useful
- dedupe repeated events
- cap max visible events
- preserve blockers/warnings even when over budget
- preserve latest next action
- keep output concise

Add focused tests.

### 5. Add sidebar state quality checks

Add packages/ts-shell/src/core/context/sidebarStateQuality.ts.

Quality checks should report:

- hasCurrentTaskOrRoute
- hasNextAction
- hasEditStatus
- hasCompactStatus
- hasMemoryStatus
- hasWarmupStatus
- hasValidationStatus
- hasToolAvailabilityStatus
- hasWarningsIfAny
- hasNoRawContentLeak
- hasNoSecretLeak
- hasNoHiddenReasoningLeak
- outputSizeStatus
- eventBudgetStatus
- blockerVisibilityStatus

Output:

- qualityStatus:
  - pass
  - warn
  - fail
- warnings
- blockers
- evidence

Quality checks must not call provider/model or persist.

Add focused tests.

### 6. Integrate with sidebar projection and renderer

Update sidebarStateProjection.ts and sidebarStateSurface.ts.

Required behavior:

- `/sidebar` includes concise recent activity if events are provided
- no events means output still works
- blockers/warnings are visible
- next action remains clear
- developer-only events are hidden unless explicitly requested by test/dev input
- output remains concise and stable

Add focused tests.

### 7. Optional command/session bridge

If clean, bridge existing slash command runtime outputs into sidebar events for `/sidebar` preview tests.

Examples:

- `/compact` produced checkpoint
- `/memory save` wrote record
- `/memory use` staged injection
- `/warmup rebuild` wrote cache
- validation result available
- warning/blocker present

If runtime bridge is too coupled:

- keep event bridge as pure adapter
- document runtime integration blocker
- recommend follow-up

### 8. Event-log and quality tests

Required tests:

- command events render in recent activity
- compact events render
- memory events render
- warmup events render
- validation events render
- warning/blocker events are preserved over budget
- duplicate events are deduped
- event budget caps normal events
- developer-only events are hidden by default
- raw content/secrets/hidden reasoning are redacted
- sidebar quality passes for complete state
- quality warns for missing next action
- quality fails for leaked raw/secret markers
- `/sidebar` output remains concise

### 9. Docs and roadmap update

Update:

- docs/design/sidebar-event-log-bridge.md with final notes
- docs/design/sidebar-state-model.md with Route 89 note
- docs/design/startup-warm-context-cache.md with Route 89 note
- docs/design/context-engineering-continuity-baseline.md with Route 89 note
- docs/design/edit-capability-roadmap.md with concise status and Route 90 recommendation

Recommended next route:

- Route 90: actual sidebar UI/TUI prototype
  - if state + event substrate is stable
- or Route 90: sidebar session integration/event capture
  - if event bridge remains pure/test-only
- or Route 90: memory retrieval ranking hardening
  - if product surface is good enough and memory quality is the next blocker

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

- event bridge requires actual UI implementation
- dynamic MCP/skills discovery becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- raw content/secrets would need to appear
- event log becomes noisy/unbounded
- command integration requires broad cli.tsx rewrite
- sidebar output becomes too verbose for user-facing display

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

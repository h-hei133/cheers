# Route 88: sidebar state model and visible agent state surface

## Goal

Create the shared state model that a future sidebar / status panel can use.

Route 87 added explicit startup warm context cache and `/warmup`.
Current project now has mature state surfaces for:

- edit capability closeout
- Compact v2 checkpoint / injection
- project memory review / store / recall / invalidation / explicit injection
- startup warm cache
- validation evidence
- route continuity

Route 88 should not build a full UI. It should build the data contract and projection layer for a future sidebar.

The sidebar state model should answer, in one stable place:

- What is the current task / route?
- What changed?
- What is restorable?
- What compact checkpoint exists?
- What memory state exists?
- What warm cache state exists?
- What tools/MCP/skills are available or deferred?
- What validations ran?
- What warnings/blockers require user attention?
- What is the next suggested action?

This route should create a shared visible-agent-state substrate, not a React/sidebar implementation.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/compact-v2-route-continuity.md
- docs/design/compact-v2-future-turn-injection.md
- docs/design/memory-injection-quality-merge-hardening.md
- docs/design/project-memory-retrieval-wakeup-recall.md
- docs/design/startup-warm-context-cache.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- edit closeout state exists
- compact state exists
- project memory state exists
- warmup state exists
- no sidebar state model exists
- no sidebar UI exists
- no MCP/skills discovery implementation exists yet

## Reference pool update

Before route-specific implementation, update route discipline docs so future routes know about the expanded local reference pool.

Add or update `docs/agent-routes/REFERENCE_SCAN_POLICY.md` if it does not exist. If reference scan policy currently lives inside `COMMON_BOUNDARIES.md`, keep that stable but add the standalone file and link it from the common/index section if clean.

Reference pool to document:

Coding-agent baseline:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Memory/context references:

- MemPalace: /home/wang/projects/mempalace
- Mem0: /home/wang/projects/mem0
- Graphiti: /home/wang/projects/graphiti

Browser/tooling/product references:

- Stagehand: /home/wang/projects/stagehand
- browser-use: /home/wang/projects/browser-use, if present
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands

Policy:

- each route should select only the relevant 1-4 primary references
- default total budget should stay small, usually 8-16 files
- route docs must specify focus keywords and questions
- do not scan all references by default

## Reference scan for Route 88

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Secondary references:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Budget:

- OpenHands: at most 6 files
- Stagehand: at most 4 files
- Playwright MCP: at most 3 files
- ClaudeCode/opencode/gemini-cli combined: at most 5 files
- total default budget: 18 files
- exceed by 2 only for a directly relevant state/event/sidebar/status surface file

Focus:

OpenHands:

- session events
- GUI/local UI state
- conversation status
- agent state
- event stream
- task progress
- file changes
- command result display

Stagehand:

- action preview
- action/cache state
- observe/act/extract status
- user-visible automation status
- self-healing/cached action status

Playwright MCP:

- tool availability
- MCP server status
- accessibility snapshot surface
- CLI vs MCP / token cost
- browser tool status

Coding-agent references:

- CLI status
- compact/status surface
- session summary
- tool result cards
- validation display

Answer in docs/design/sidebar-state-model.md:

1. What state should be visible to users?
2. What should be machine-readable only?
3. How do references separate event log, current status, warnings, and next action?
4. How should tools/MCP/skills availability be represented without discovering them yet?
5. What should remain deferred until actual UI/sidebar implementation?

## This route changes

Allowed:

- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/agent-routes/COMMON_BOUNDARIES.md only to link reference policy if clean
- docs/design/sidebar-state-model.md
- docs/design/startup-warm-context-cache.md, Route 88 note only
- docs/design/context-engineering-continuity-baseline.md, Route 88 note only
- docs/design/edit-capability-roadmap.md, concise Route 88 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/sidebarStateModel.ts
- packages/ts-shell/src/core/context/sidebarStateProjection.ts
- packages/ts-shell/src/core/context/sidebarStateSurface.ts
- packages/ts-shell/src/core/context/sidebarToolAvailability.ts

Allowed if clean:

- add `/status` command or extend an existing status surface
- add `/sidebar` only as a state-preview command, not UI
- integrate sidebar projection into session surface read-only status
- include MCP/skills/tool placeholders from explicit inputs only

## This route must preserve

Route-specific boundaries:

- no actual sidebar UI / React / TUI panel
- no dynamic MCP/skills discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence changes
- no startup auto-load / model auto-injection changes
- no raw content/secrets/hidden reasoning in sidebar state
- sidebar state is projection/read-only

## Tasks

### 1. Reference policy update

Create or update `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Include the expanded reference pool and domain guidance:

- memory/context: MemPalace, Mem0, Graphiti
- browser/tooling/product: Stagehand, browser-use, Playwright MCP, OpenHands
- coding-agent baseline: ClaudeCode, opencode, gemini-cli

Keep it stable and not tied to Route 88 current state.

### 2. Design and audit

Create docs/design/sidebar-state-model.md.

Include:

- Route 88 reference scan summary
- current edit/compact/memory/warmup state inventory
- visible state categories
- machine-readable state categories
- warnings/blockers model
- next-action model
- tool/MCP/skills placeholder model
- event-log vs current-state distinction
- no-UI boundary
- future sidebar UI route boundary
- next-route decision criteria

### 3. Add sidebar state model

Add packages/ts-shell/src/core/context/sidebarStateModel.ts.

Expected concepts:

- SidebarStateSnapshot
- SidebarSection:
  - task-route
  - edit
  - compact
  - memory
  - warmup
  - validation
  - tools
  - blockers
  - next-action
- SidebarSeverity:
  - info
  - success
  - warning
  - blocked
  - error
- SidebarFactKind:
  - status
  - evidence
  - warning
  - action
  - reference
- SidebarVisibility:
  - user-visible
  - developer-only
  - hidden
- SidebarSource:
  - edit-closeout
  - compact
  - memory
  - warmup
  - validation
  - command
  - tool-availability
  - route

Model must be pure and non-persistent.

Add focused tests if helpers exist.

### 4. Add tool/MCP/skills availability placeholders

Add packages/ts-shell/src/core/context/sidebarToolAvailability.ts.

This should not discover tools dynamically.

It should accept explicit inputs and normalize:

- MCP server availability if provided
- skills availability if provided
- local commands availability if provided
- browser/tooling availability if provided
- unknown/deferred state

Required behavior:

- no scanning
- no provider/MCP calls
- no package/script execution
- distinguish available / unavailable / unknown / deferred
- show concise user-facing status
- keep token-efficient summaries

Add focused tests.

### 5. Add sidebar state projection

Add packages/ts-shell/src/core/context/sidebarStateProjection.ts.

Projection should combine explicit inputs from existing state surfaces:

- current route/task
- edit closeout manifest/readiness
- mutation evidence if provided
- recovery/restore summary if provided
- compact checkpoint/injection status
- project memory review/store/recall/injection status
- warmup cache status
- validation evidence
- tool/MCP/skills placeholders
- warnings/blockers
- next action

Required behavior:

- read-only projection
- deterministic order
- no raw content/secrets
- invalidated/deleted memory records not shown as active facts
- automatic injection claims must not be implied
- warnings surface clearly
- empty/missing inputs handled gracefully

Add focused tests.

### 6. Add sidebar state surface renderer

Add packages/ts-shell/src/core/context/sidebarStateSurface.ts.

Renderer should produce compact text output for command/session preview.

Required sections:

- Task / route
- Edit
- Compact
- Memory
- Warmup
- Validation
- Tools / MCP / Skills
- Blockers / warnings
- Next action

Output should be concise, user-friendly, and not verbose.

Required wording:

- If no actual sidebar UI exists, say this is a state preview.
- If tool discovery was not run, show unknown/deferred rather than pretending.
- Do not include raw content/secrets.
- Do not imply automatic memory/startup injection.

Add focused tests.

### 7. Add `/status` or `/sidebar` preview command if clean

Preferred:

- `/status` shows the visible agent state snapshot.
- `/sidebar` can be an alias only if command UX remains clear.

If `/status` already exists, extend it narrowly.
If command integration is coupled, keep projection/surface tested and document blocker.

Required behavior:

- read-only
- no provider/model call
- no dynamic MCP discovery
- no persistence
- no raw content/secrets
- no complex flags for normal users

Add focused command tests if integrated.

### 8. Optional session surface integration

If clean, session surface can include sidebar state preview on explicit command output only.

Do not change default output heavily.
Do not add UI panel.
Do not rewrite session lifecycle.

### 9. Sidebar state tests

Required tests:

- edit closeout status appears
- compact checkpoint pending/injected/consumed status appears
- memory review/store/recall/injection status appears
- warmup cache fresh/stale/missing status appears
- validation status appears
- tool/MCP/skills unknown/deferred state appears without discovery
- blockers/warnings appear
- next action appears
- invalidated/deleted memory records not active
- raw content/secrets/hidden reasoning redacted
- renderer output is concise
- `/status` or `/sidebar` routes if implemented

### 10. Docs and roadmap update

Update:

- docs/design/sidebar-state-model.md with final notes
- docs/design/startup-warm-context-cache.md with Route 88 note
- docs/design/context-engineering-continuity-baseline.md with Route 88 note
- docs/design/edit-capability-roadmap.md with concise status and Route 89 recommendation

Recommended next route:

- Route 89: sidebar state quality / event-log bridge
  - if state model exists but event history integration is next
- or Route 89: actual sidebar UI/TUI prototype
  - if state model is stable
- or Route 89: memory retrieval ranking hardening
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

- sidebar state requires actual UI implementation
- dynamic MCP/skills discovery becomes necessary
- SessionManager schema changes become necessary
- provider/model calls become necessary
- raw content/secrets would need to appear
- command integration requires broad cli.tsx rewrite
- state projection becomes too noisy for user-facing output

## Final report

1. What changed
2. Reference scan summary, including new reference pool usage
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.

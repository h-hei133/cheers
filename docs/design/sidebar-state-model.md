# Sidebar State Model

Route 88 adds a shared visible-agent-state substrate for future sidebar or
status-panel work. It is a data contract, projection layer, compact text
renderer, and explicit `/sidebar` preview command. It is not a React, Ink, or
TUI sidebar.

## Reference Scan

Budget used: 15 files plus bounded search output. `browser-use` was not present
locally.

OpenHands:

- `frontend/src/components/features/controls/agent-status.tsx`
- `frontend/src/types/v1/core/events/acp-tool-call-event.ts`
- `frontend/src/components/features/chat/task-tracking/task-list-section.tsx`
- `frontend/src/components/features/diff-viewer/file-diff-viewer.tsx`

OpenHands separates current agent status, task list status, progressive tool
call events, and read-only diff/file-change display. Local implication: Route
88 should separate event log inputs from current state and keep file/content
views read-only and summarized.

Stagehand:

- `README.md`
- `packages/core/lib/v3/api.ts`
- `CHANGELOG.md`

Stagehand distinguishes previewable actions, execution, cache hit/miss status,
SSE lifecycle status, and action history. Local implication: sidebar state
should show cache/status facts and next actions without implying execution or
automatic use.

Playwright MCP:

- `README.md`
- `tests/capabilities.spec.ts`

Playwright MCP exposes capability-specific tool lists, read-only snapshot
tools, token-cost tradeoffs between CLI skills and MCP, and explicit secret
redaction caveats. Local implication: tools/MCP/skills availability should be
represented as explicit placeholders unless a later route actually discovers
them.

Coding-agent baselines:

- ClaudeCode `bridge/bridgeUI.ts`
- ClaudeCode `ink/hooks/use-tab-status.ts`
- gemini-cli `docs/tools/mcp-server.md`
- gemini-cli `packages/core/src/utils/tool-visibility.ts`
- opencode `packages/opencode/src/mcp/index.ts`
- opencode `packages/opencode/src/cli/cmd/tui/context/sync.tsx`

The baselines separate status lines, terminal/tab status, tool visibility,
MCP connection/tool discovery status, and session working/compacting state.
Local implication: the sidebar model should keep user-visible status, warnings,
tool availability, and next action distinct from machine-readable evidence.

## Visible State

Users should see:

- current task or route
- what changed, summarized by files/counts rather than raw content
- restore/readiness state when supplied
- compact checkpoint and future-turn injection status
- memory review, store, recall/use, and injection status
- warm cache freshness/missing/stale state
- validation evidence summary
- tool/MCP/skills availability placeholders
- warnings, blockers, and next suggested action

## Machine-Readable Only

Keep these out of normal rendered text unless a later developer/debug surface
explicitly asks for them:

- raw command output
- raw file or recovery content
- raw memory text
- provider credentials, auth data, or secret-looking values
- hidden reasoning
- full MCP schemas or dynamic discovery payloads
- implementation-specific event payloads

## Model Shape

`sidebarStateModel.ts` defines:

- `SidebarStateSnapshot`
- `SidebarSection`: task-route, edit, compact, memory, warmup, validation,
  tools, blockers, next-action
- `SidebarSeverity`: info, success, warning, blocked, error
- `SidebarFactKind`: status, evidence, warning, action, reference
- `SidebarVisibility`: user-visible, developer-only, hidden
- `SidebarSource`: edit-closeout, compact, memory, warmup, validation, command,
  tool-availability, route

The model is pure, read-only, non-persistent, and explicitly records no
provider/model call, no dynamic discovery, no automatic memory injection, no
startup auto-load, and no raw content.

## Projection

`sidebarStateProjection.ts` accepts explicit inputs from existing state
surfaces:

- current route/task
- edit closeout and mutation evidence
- Compact v2 checkpoint and injection state
- project memory review/store/injection state
- startup warm cache health/cache summary
- validation evidence
- tool/MCP/skills placeholders
- warnings, blockers, and next action

It filters invalidated memory records from active memory facts, excludes raw
memory text, redacts secret/raw/hidden-reasoning markers, and does not imply
automatic injection.

## Tool Placeholders

`sidebarToolAvailability.ts` accepts explicit availability inputs only:

- local commands
- MCP servers
- skills
- browser/tooling references

Statuses are `available`, `unavailable`, `unknown`, or `deferred`. No scan,
MCP call, provider call, or package-script execution happens in this layer.

## Surface

`sidebarStateSurface.ts` renders a compact text preview for command/session
surfaces. It includes fixed sections for task, edit, compact, memory, warmup,
validation, tools/MCP/skills, blockers/warnings, next action, and safety.

The renderer must say this is a state preview because no sidebar UI exists yet.
It must show unknown/deferred availability when discovery was not run and must
not imply automatic memory or startup injection.

## Command Preview

`/sidebar` is a local, read-only preview command. It was chosen instead of
changing `/status` because `/status` is already an alias for workflow git
status. `/sidebar` does not persist state, call providers/models, discover MCP
or skills, or change session schema.

## Route 89 Event Note

Route 89 adds a pure sidebar event model, explicit-input event bridge, recent
activity projection, and quality checks. `/sidebar` can now render a concise
`Recent activity` section when sanitized events are provided. This does not add
a real sidebar UI, dynamic discovery, provider/model calls, persistence, schema
changes, or raw event payload rendering.

## Route 90 Live Activity Note

Route 90 adds a session-scoped in-memory live event store and command event
sink. `/sidebar` reads the current session's bounded live command activity
while continuing to render the same read-only state sections. Live events are
sanitized summaries only; developer-only events are hidden by default, and no
sidebar UI, persistence, dynamic discovery, provider/model call, or session
schema change is added.

## Route 91 Panel Note

Route 91 adds a TUI-ready panel model, layout builder, ASCII renderer,
panel-specific quality checks, and explicit `/sidebar panel`, `/sidebar
compact`, and `/sidebar detail` command modes. The original `/sidebar` preview
still works. The panel consumes the same sanitized snapshot and live activity
store; it adds no always-on UI, persistence, discovery, provider/model call,
SessionManager schema change, startup/model auto-injection, or raw content
rendering.

## Route 92 Watch Note

Route 92 adds a live/watch panel frame model on top of the same
`SidebarStateSnapshot`. The model records frame number, updatedAt, event
counts, warning counts, and blocker counts while preserving the existing
snapshot sections. `/sidebar watch` remains explicit and read-only; it does not
add an actual sidebar UI, persistence, discovery, provider/model calls,
SessionManager schema changes, startup/model auto-injection, or raw content
rendering.

## Route 93 Browser Note

Route 93 adds a preview-only browser capability placeholder to the existing
Tools section. Browser status is supplied explicitly; `/sidebar` does not
discover MCP servers, launch Playwright, start browser sessions, call
providers/models, persist browser state, or render raw browser content.

## Route 94 Browser Dry-Run Note

Route 94 lets sanitized `/browser dry-run ...` command results appear as
ordinary sidebar recent activity. The sidebar may show the dry-run runtime
recommendation and sandbox decision as text from the local command output, but
it still does not discover tools, launch browser/MCP runtimes, persist browser
state, call providers/models, or render raw browser content.

## Deferred

Defer these to future routes:

- always-on sidebar UI/TUI/React panel
- live event aggregation from runtime/session internals
- dynamic MCP/skills discovery
- startup/session auto-load
- model-context injection changes
- SessionManager schema changes
- provider/model calls

## Next Route Criteria

Choose sidebar state quality / event-log bridge if the state model is stable
but needs live event history.

Choose actual sidebar UI/TUI prototype only after the projection and renderer
are stable enough to keep UI work thin.

Choose memory retrieval ranking hardening if memory recall quality becomes the
next user-visible blocker.

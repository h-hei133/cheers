# Sidebar Event Log Bridge

Route 89 upgrades the Route 88 `/sidebar` preview from current-state-only to
current visible state plus recent activity. It remains a pure data/event
substrate, not a sidebar UI.

## Reference Scan

Budget used: 18 files plus bounded search output.

OpenHands:

- `frontend/src/contexts/conversation-websocket-context.tsx`
- `frontend/src/components/v1/chat/event-content-helpers/should-render-event.ts`
- `frontend/src/components/v1/chat/hooks/use-plan-preview-events.ts`
- `frontend/src/hooks/use-agent-state.ts`

OpenHands keeps system state updates separate from chat-rendered events, hides
non-user-useful system updates, renders terminal tool events, and collapses
repeated plan observations by phase. Local implication: sidebar activity should
be a bounded, filtered projection, not a raw event stream.

Stagehand:

- `packages/core/lib/v3/v3.ts`
- `packages/core/lib/v3/flowlogger/EventSink.ts`
- `packages/core/lib/v3/api.ts`
- `CHANGELOG.md`

Stagehand keeps a frozen public action history, trims in-memory event sinks by
limit, records act/observe/extract calls, and surfaces cache hit/miss status
without exposing full internal streams. Local implication: keep a concise
activity model with budget, dedupe, and cache/status facts.

Playwright MCP:

- `README.md`
- `tests/capabilities.spec.ts`
- `config.d.ts`

Playwright MCP exposes tool capabilities, read-only flags, snapshot semantics,
and secret redaction caveats. Local implication: tool activity should preserve
status/capability facts without dynamic discovery or raw tool payloads.

Coding-agent baselines:

- ClaudeCode `bridge/bridgeUI.ts`
- ClaudeCode `ink/hooks/use-tab-status.ts`
- gemini-cli `docs/tools/mcp-server.md`
- gemini-cli `packages/core/src/utils/tool-visibility.ts`
- opencode `packages/app/src/context/global-sync/event-reducer.ts`
- opencode `packages/ui/src/components/session-turn.tsx`
- opencode `packages/ui/src/i18n/en.ts`

The baselines favor short status lines, explicit session status state,
tool-visibility filtering, and concise turn activity text. Local implication:
Route 89 should separate current state, recent activity, warnings/blockers,
and next action while keeping command output compact.

## Route 88 Baseline

Route 88 provides:

- `SidebarStateSnapshot`
- current-state projection for task/edit/compact/memory/warmup/validation/tools
- tool/MCP/skills placeholders from explicit input only
- `/sidebar` read-only text preview

Route 89 adds:

- `SidebarEvent`
- event bridge from explicit inputs
- recent activity projection
- sidebar state quality checks
- concise `Recent activity` rendering in `/sidebar`

## Current State Versus Recent Activity

Current state answers what is true now: task, edit status, checkpoint state,
memory state, warm cache state, validation state, tool availability, warnings,
blockers, and next action.

Recent activity answers what just happened: command result, edit activity,
compact event, memory action, warmup status, validation result, tool
availability change, route status, warning, or blocker.

Do not store raw event logs in sidebar state. The event bridge accepts explicit
inputs and produces a bounded, sanitized, user-facing recent activity slice.

## Visible Events

User-visible events:

- command summary
- edit file-count/failure summary
- compact checkpoint/injection summary
- memory review/save/recall/use/invalidate/delete summary
- warmup status/rebuild summary
- validation command status
- tool/MCP/skills placeholder status
- route status and next action
- warnings and blockers

Developer-only events may exist in the model, but activity projection hides
them by default. Hidden events are not rendered.

## Retention And Budget

`sidebarEventBridge.ts` applies deterministic ordering and a bridge-level max
event budget.

`sidebarActivityProjection.ts` dedupes repeated events, caps normal visible
events, preserves warning/blocker/error events over budget, hides
developer-only events by default, and carries the latest next action.

Default visible activity budget is intentionally small. Future UI routes may
add scrolling, filtering, or developer toggles, but `/sidebar` must remain
short.

## Quality Checks

`sidebarStateQuality.ts` reports:

- required current-state sections
- next-action presence
- raw/secret/hidden-reasoning leak checks
- output size status
- event budget status
- blocker visibility status

Quality checks are pure and do not call providers/models or persist state.

## Warning And Next-Action Aggregation

Warnings/blockers can come from current state notices or recent activity
events. Activity projection keeps critical warning/blocker events even when
normal events are dropped.

Next action remains a first-class current-state field. Activity can supply a
newer next action, but it should not obscure the route-level next action in the
main output.

## Deferred

Still deferred:

- actual sidebar UI/TUI/React panel
- live session event capture from runtime internals
- dynamic MCP/skills discovery
- provider/model calls
- SessionManager schema changes
- startup/model auto-injection
- raw event payload rendering

## Next Route Criteria

Choose actual sidebar UI/TUI prototype if the current state plus recent
activity substrate is stable.

Choose sidebar session integration/event capture if `/sidebar` needs live
runtime events instead of explicit bridge inputs.

Choose memory retrieval ranking hardening if the product surface is good
enough and recall quality is the next blocker.

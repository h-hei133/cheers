# Sidebar TUI Panel Prototype

Route 91 adds an explicit terminal panel rendering on top of the Route 88-90
sidebar state substrate. It is a product-like text panel, not an always-on TUI,
React UI, persistence layer, discovery path, or provider/model path.

## Reference Scan

Budget used: 18 files, within the Route 91 budget.

OpenHands:

- `frontend/src/stores/use-event-store.ts`
- `frontend/src/components/features/controls/agent-status.tsx`
- `frontend/src/components/features/chat/task-tracking/task-list-section.tsx`
- `frontend/src/components/features/chat/event-content-helpers/get-event-content.tsx`
- `frontend/src/components/features/chat/event-content-helpers/get-action-content.ts`

OpenHands keeps raw event storage separate from UI event projection, dedupes by
event id, sorts by timestamp, and renders task/status/event surfaces as
separate components. It also truncates command text in titles and only expands
raw-ish action details in the specific event content view. Local implication:
the terminal panel should consume the existing sanitized snapshot/activity
projection and keep task, status, activity, blockers, and next action as
separate sections.

opencode:

- `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/todo.tsx`
- `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/files.tsx`
- `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/lsp.tsx`
- `packages/opencode/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx`
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/toast.tsx`

opencode registers sidebar content as ordered sections, hides empty sections,
collapses larger lists, separates session sync from rendering, and keeps toast
status width-bounded. Local implication: Route 91 should add a deterministic
layout builder and explicit command output rather than an always-on lifecycle
rewrite.

gemini-cli:

- `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`
- `packages/cli/src/ui/components/messages/CompressionMessage.tsx`
- `packages/cli/src/ui/components/messages/ToolMessage.tsx`
- `packages/cli/src/ui/components/Checklist.tsx`

gemini-cli filters visible tool calls, supports compact tool output, uses
terminal width/height budgets, and summarizes compression/checklist progress in
short status lines. Local implication: panel output should be ANSI-free by
default, width-aware, line-budgeted, and should avoid raw tool output.

Stagehand:

- `packages/core/lib/v3/flowlogger/EventStore.ts`
- `packages/core/lib/v3/flowlogger/EventSink.ts`

Stagehand separates a queryable in-memory sink from file/stderr sinks, redacts
session metadata, and treats diagnostic sinks as best-effort. Local
implication: Route 91 should keep using Route 90's in-memory live event store
and should not add file-backed panel state.

Playwright MCP:

- `README.md`
- `tests/capabilities.spec.ts`

Playwright MCP documents the token tradeoff between MCP schemas and CLI/skill
commands, and tests capability sets explicitly. Local implication: the panel
should show tool/MCP/skills status only from explicit inputs; it should not
discover tools or load MCP schemas.

ClaudeCode:

- `cli/print.ts`

ClaudeCode's CLI entrypoint is broad and lifecycle-heavy. Local implication:
Route 91 should not chase parity by touching CLI lifecycle. A bounded explicit
panel command is the right prototype surface.

## Baseline

Route 88 provides `SidebarStateSnapshot`, projection, quality checks, and the
plain `/sidebar` preview. Route 89 adds sanitized event/activity projection.
Route 90 adds session-scoped live command events for `/compact`, `/memory`, and
`/warmup`, and `/sidebar` reads that bounded live activity.

## Layout Decision

The default panel is a plain ASCII box with deterministic sections:

- header
- task
- edit
- compact
- memory
- warmup
- tools
- validation
- recent activity
- blockers
- next
- boundary/footer

`/sidebar` keeps the original preview. `/sidebar panel` renders the normal
panel. `/sidebar compact` hides empty/noisy sections and uses smaller budgets.
`/sidebar detail` keeps more facts and activity.

## Budget Policy

Budgets are density-specific:

- compact: narrower width, fewer sections, fewer activity items, fewer lines
- normal: terminal-friendly default
- detail: wider and longer, still bounded

The renderer wraps short text, truncates long words with `...`, caps total
lines, and uses no ANSI by default. All output is deterministic for tests.

## Data Boundary

The panel consumes sanitized `SidebarStateSnapshot` data only. It does not:

- call providers or models
- discover MCP servers, tools, or skills
- persist panel state
- change SessionManager schema
- auto-load startup context
- auto-inject memory
- render raw file, memory, recovery, command, event, provider, or hidden
  reasoning content

Developer-only activity is hidden by default. If hidden events exist, the
panel records a warning without rendering their payload.

## Route 91 Artifacts

Code:

- `sidebarPanelModel.ts`
- `sidebarPanelLayout.ts`
- `sidebarPanelRenderer.ts`
- `sidebarPanelCommandContract.ts`
- `sidebarPanelCommandRunner.ts`
- `sidebarPanelQuality.ts`
- `/sidebar panel|compact|detail` integration in `sidebarCommandRuntime.ts`

Tests:

- panel section, budget, redaction, developer-only hiding, and quality tests
- command contract/runner tests
- slash-router tests proving `/sidebar` preview still works and panel modes
  route explicitly

## Deferred

Still deferred:

- always-on sidebar/TUI
- React/Ink UI
- broad CLI lifecycle changes
- dynamic MCP/skills discovery
- provider/model calls
- persistent UI state
- startup/model auto-injection
- richer runtime event taxonomy

## Next Route Criteria

Choose sidebar panel live/runtime polish if grouping, titles, or noise become
the next visible issue.

Choose an always-on TUI/sidebar experiment only after explicit panel output is
stable enough that UI work can stay thin.

Choose memory retrieval ranking hardening if `/sidebar panel` is good enough
and memory recall quality is the next user-visible blocker.

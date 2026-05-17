# Sidebar Live Panel Runtime Experiment

Route 92 adds a bounded `/sidebar watch` experiment on top of the Route 91
snapshot panel. It is a live-frame prototype, not a full TUI architecture.

## Reference Scan

Budget used: 19 external files.

OpenHands:

- `frontend/src/stores/use-event-store.ts`
- `frontend/src/hooks/use-filtered-events.ts`
- `frontend/src/components/features/controls/agent-status.tsx`
- `frontend/src/components/features/chat/task-tracking/task-list-section.tsx`
- `frontend/src/utils/handle-event-for-ui.ts`

opencode:

- `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx`
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx`
- `packages/opencode/src/cli/cmd/tui/context/event.ts`
- `packages/opencode/src/cli/cmd/tui/ui/toast.tsx`
- `packages/ui/src/components/tool-status-title.tsx`

gemini-cli:

- `packages/cli/src/ui/components/StatusDisplay.tsx`
- `packages/cli/src/ui/components/StatusRow.tsx`
- `packages/cli/src/ui/components/messages/ToolMessage.tsx`
- `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`

Stagehand / Playwright MCP / ClaudeCode:

- `packages/core/lib/v3/flowlogger/EventStore.ts`
- `packages/core/lib/v3/flowlogger/EventSink.ts`
- `packages/core/lib/v3/agent/tools/act.ts`
- `tests/capabilities.spec.ts`
- `cli/print.ts`

Relevant patterns:

- OpenHands keeps raw event ingestion separate from UI-filtered event arrays,
  dedupes by event id, preserves chronological order, and updates visible tool
  cards in place when later status events arrive.
- opencode separates event subscription/sync state from terminal sidebar
  rendering. Its sidebar is a view over synchronized state rather than an
  event store.
- gemini-cli keeps terminal status rows bounded by terminal width/height and
  treats tool messages as status plus optional bounded payload.
- Stagehand separates event fanout sinks from queryable in-memory history and
  redacts sensitive option keys before writing session metadata.
- Playwright MCP capability tests keep tool availability explicit and
  assertable.
- ClaudeCode's CLI print path is broad lifecycle code; Route 92 should not
  emulate that shape for a sidebar experiment.

Local implication: `/sidebar watch` should read the existing session-scoped
event store and produce bounded frames. It should not introduce an event bus,
terminal TUI loop, dynamic discovery, provider calls, persistence, or CLI
lifecycle rewrite.

## Baseline

Route 91 already provides:

- `/sidebar` compact read-only text preview
- `/sidebar panel`, `/sidebar compact`, and `/sidebar detail` snapshot panels
- deterministic ASCII panel rendering
- session-scoped in-memory live event capture from local command results
- developer-only event hiding by default

Route 92 keeps those snapshot commands stable and adds only an explicit watch
surface.

## Snapshot vs Watch

Snapshot panel:

- one render from a supplied `SidebarStateSnapshot`
- no frame metadata
- command forms: `/sidebar panel`, `/sidebar compact`, `/sidebar detail`

Watch panel:

- one or more deterministic frames from the current snapshot plus recent
  session events
- frame metadata includes frame number, updatedAt, visible event count, stored
  event count, dropped event count, warning count, and blocker count
- command form: `/sidebar watch`
- `/sidebar live` is an alias only

Because the current CLI command lifecycle is command-response oriented,
`/sidebar watch` is a bounded live snapshot with refresh-ready metadata. It is
not an indefinite terminal loop.

## Refresh Model

The route uses manual ticks:

- the pure runtime can tick deterministically in tests
- the command runner renders a bounded frame count
- events emitted before `/sidebar watch` appear in the first frame
- tests can append events between ticks and verify later frames

Event-driven streaming is deferred until a real TUI/lifecycle route. Polling is
also deferred because it would add runtime loop and cancellation concerns that
are outside this experiment.

## Event Source

The runtime consumes either:

- the existing `SidebarLiveEventStore` for a session scope, or
- explicit test events

The store remains in-memory and session-scoped. Developer-only events are
available to the live runtime only so it can show that they were hidden; their
payload is not rendered by default.

## Render Budget

The live panel reuses the Route 91 panel model, layout, and renderer. It adds a
`Live frame` section before the normal snapshot sections and keeps density
budgets from the existing panel model.

Warnings and blockers are summarized in frame metadata and visible panel
sections. Rendered output remains ASCII and ANSI-free by default.

## Safety Boundary

The live panel runtime is read-only. It does not:

- call providers or models
- discover MCP servers, tools, or skills
- persist events, frames, or UI state
- change SessionManager schema
- change edit runtime, recovery, rollback, or package gates
- auto-load startup context
- auto-inject memory
- render raw content, secrets, provider credentials, or hidden reasoning
- start an always-on UI
- create a React/Ink/OpenTUI app

## Route 92 Artifacts

Code:

- `sidebarLivePanelRuntime.ts`
- `sidebarLivePanelRenderer.ts`
- `sidebarLivePanelCommandContract.ts`
- `sidebarLivePanelCommandRunner.ts`
- `sidebarLivePanelQuality.ts`
- `/sidebar watch` integration in `sidebarCommandRuntime.ts`

Tests:

- deterministic runtime frame and bounded frame history
- live renderer frame metadata
- warning/blocker visibility under budget
- developer-only event hiding
- raw content, secret, and hidden-reasoning redaction
- watch command contract/runner
- slash-router coverage proving `/sidebar panel` snapshot remains unchanged

## Deferred

Deferred to a future TUI route:

- always-on sidebar
- React/Ink/OpenTUI app
- event-driven terminal repaint loop
- polling loop, cancellation, and teardown
- dynamic MCP/skills discovery
- persistent UI/session event history
- provider/model-backed status enrichment

## Next Route Criteria

Choose sidebar runtime polish / always-on TUI decision if users need a real
continuously refreshing terminal surface.

Choose browser capability boundary if the sidebar surface is stable enough and
browser/tool capability status becomes the next visible gap.

Choose memory retrieval ranking hardening if memory recall quality is the next
blocker.

## Route 93 Browser Note

Route 93 keeps `/sidebar watch` unchanged and adds browser capability facts as
ordinary sidebar tool availability input. Live panel frames can show browser
status and `/browser` activity from the existing sanitized event store, but no
browser execution, MCP launch/discovery, provider/model call, persistence, or
raw browser content is added.

## Route 95 Scenario Harness Note

Route 95 adds Agent Scenario Harness coverage for sidebar-visible evidence
across compact, memory, browser dry-run, and warmup flows. The harness consumes
the same session-scoped in-memory sidebar event store and does not add an
always-on UI, event persistence, dynamic discovery, provider/model calls, or raw
event rendering.

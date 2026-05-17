# Sidebar Live Event Capture

Route 90 turns the Route 89 sidebar event substrate into a live, session-scoped
command activity path. It still does not build a sidebar UI.

## Reference Scan

Files inspected, within the Route 90 budget:

- OpenHands:
  - `/home/wang/projects/OpenHands/openhands/app_server/event/event_service.py`
  - `/home/wang/projects/OpenHands/openhands/app_server/event/event_service_base.py`
  - `/home/wang/projects/OpenHands/frontend/src/stores/use-event-store.ts`
  - `/home/wang/projects/OpenHands/frontend/src/contexts/conversation-websocket-context.tsx`
- opencode:
  - `/home/wang/projects/opencode/packages/opencode/src/cli/cmd/tui/context/sync.tsx`
  - `/home/wang/projects/opencode/packages/opencode/src/cli/cmd/tui/thread.ts`
- Stagehand:
  - `/home/wang/projects/stagehand/packages/core/lib/v3/flowlogger/EventStore.ts`
  - `/home/wang/projects/stagehand/packages/core/lib/v3/flowlogger/EventSink.ts`
- ClaudeCode:
  - `/home/wang/projects/source-claudecode/cli/print.ts`
  - `/home/wang/projects/source-claudecode/services/compact/compact.ts`
- gemini-cli:
  - `/home/wang/projects/gemini-cli/packages/cli/src/ui/components/messages/CompressionMessage.tsx`
  - `/home/wang/projects/gemini-cli/packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`
- Playwright MCP:
  - `/home/wang/projects/playwright-mcp/README.md`

Relevant patterns:

- OpenHands separates event storage/search from UI event projection. The
  frontend store dedupes by event id, keeps chronological order, and derives UI
  events separately from raw event history.
- opencode updates TUI state from session, message, permission, diff, todo,
  MCP, and formatter events. Session-scoped maps keep command/session activity
  isolated.
- Stagehand owns a per-session event store, fans out to sinks, and uses a
  bounded in-memory query sink for live reads. File sinks are separate and
  best-effort.
- ClaudeCode drains pending internal events before going idle and re-emits
  compacting status during longer compaction work so status streams do not go
  stale.
- gemini-cli renders compression/tool status as concise user-facing summaries
  and filters noisy or low-value tool details.
- Playwright MCP emphasizes explicit capability/status surfaces and warns that
  secrets in tool responses must be redacted by clients.

Local implication: this project should capture live sidebar events at the
command runtime boundary, store only sanitized summaries in a session-scoped
in-memory buffer, and let `/sidebar` read that buffer as recent activity. Raw
command output, raw memory text, provider credentials, and hidden reasoning do
not belong in sidebar events.

## Route 89 Baseline

Route 89 added:

- `sidebarEventModel.ts`
- `sidebarEventBridge.ts`
- `sidebarActivityProjection.ts`
- `sidebarStateQuality.ts`
- `Recent activity` rendering in `sidebarStateSurface.ts`

That bridge consumed explicit caller-supplied inputs only. It did not capture
live command/session activity.

## Live Capture Architecture

Route 90 adds:

- `sidebarLiveEventStore.ts`: session-scoped in-memory ring buffer.
- `sidebarEventSink.ts`: minimal command-runtime sink.
- `sidebarCommandEventAdapter.ts`: local command result to sidebar event mapper.
- `sidebarCommandEvents.ts`: command-side helpers for scope, store, and sink.

Command runtimes emit after they have produced the normal local command result.
Event emission does not change command behavior. Non-safety event failures are
ignored; redaction safety failures are allowed to block because unsafe sidebar
context must not be stored or rendered.

## Session Scope And Storage

The live store uses `session:<id>` when a command context has a session id and
falls back to `cwd:<path>` for isolated command tests or preview contexts.

The store is in memory only:

- no SessionManager schema change
- no file or database persistence
- no startup auto-load
- no cross-session auto-loading
- no provider/model calls

`/sidebar` reads the current session scope from the supplied command context.
Separate sessions have separate live event buffers.

## Command Events

Initial emitters:

- `/compact` and `/handoff`
- `/memory` review, approve/reject, save, recall/search/wake, use,
  invalidate/delete
- `/warmup status` and `/warmup rebuild`

`/sidebar` reads live events and does not emit a user-visible event by default.
Developer-only sidebar-rendered events can be represented by the model and are
hidden unless explicitly requested by tests or a future developer surface.

Event summaries are derived from allowlisted result lines such as outcome,
blocker kind, checkpoint id, result count, injection status, persistence,
provider/model call, startup auto-load, and future-turn injection status. Full
command output is passed only as raw content metadata so the event model records
that it was excluded.

## Budget And Redaction

The live store enforces a per-session event cap and `listRecent` enforces a
read budget. Normal events are dropped before warning, blocker, or error events
when budgets are exceeded.

The event model sanitizes:

- secret-looking tokens
- secret labels
- raw markers and raw-content labels
- hidden-reasoning labels

The store rejects an event if sanitized output still contains forbidden
content. `/sidebar` renders only sanitized event titles and summaries.

## User-Visible Policy

User-visible events should be short and operational:

- command completed
- checkpoint created or staged
- memory reviewed/saved/recalled/staged/invalidated/deleted
- warmup status/rebuild
- warning or blocker

Developer-only events are allowed in the model for future diagnostics but are
hidden by default in `/sidebar`.

## `/sidebar` Live Read Model

`/sidebar` still renders current visible state facts from compact, memory,
warmup, validation, tool placeholders, warnings, and next action.

Recent activity now comes from the live event store for the current session
scope. Empty live activity still renders a valid current-state preview with
`Recent activity` set to `none`.

## Route 91 Panel Note

Route 91 keeps the Route 90 live event store as the only live activity source
for sidebar command output. `/sidebar panel`, `/sidebar compact`, and
`/sidebar detail` render a bounded terminal panel from the same sanitized
recent activity. The panel is explicit and read-only; it does not add an
always-on UI, persistence, dynamic discovery, provider/model calls, schema
changes, raw event payload rendering, or automatic memory/startup injection.

## Route 92 Watch Note

Route 92 lets `/sidebar watch` read the same session-scoped in-memory event
store as `/sidebar` and `/sidebar panel`. The live panel asks the store for
developer-only events only to account for hidden activity; developer payloads
remain hidden by default. The watch output is bounded to deterministic frames
and does not add persistence, provider/model calls, dynamic discovery, schema
changes, or a terminal repaint loop.

## Route 94 Browser Dry-Run Note

Route 94 extends browser command activity to include `/browser dry-run ...`.
Events are still produced by the existing command adapter, stored only in the
session-scoped in-memory live event store, and summarized through allowlisted
sanitized lines. No browser/MCP launch, dynamic discovery, persistence,
provider/model call, raw browser content, or raw event payload rendering is
added.

## Deferred

Still deferred:

- always-on sidebar UI/TUI/React panel
- persistent event store
- dynamic MCP/skills discovery
- provider/model calls
- SessionManager schema changes
- startup auto-load or model-context auto-injection
- raw event payload rendering
- broad runtime event taxonomy beyond command result summaries

## Next Route Criteria

Choose an actual sidebar UI/TUI prototype when the text preview and live event
quality are stable enough that UI work can stay thin.

Choose sidebar live event quality/polish if activity noise, event grouping, or
developer-only toggles become the next blocker.

Choose memory retrieval ranking hardening if `/sidebar` is sufficient and
memory recall quality is the more user-visible issue.

## Route 96 Browser Execution Note

Route 96 extends `/browser` sidebar activity to include `/browser execute ...`.
The event title is `Browser execution`; blocked execution remains a blocker
event and fake/test execution success remains a sanitized command summary. The
event path still uses the session-scoped in-memory live store and does not add
persistence, dynamic discovery, raw browser payloads, provider/model calls, MCP
launch, or startup/model auto-injection.

## Route 97 Browser Sandbox Note

Route 97 allows `/browser execute ...` sidebar summaries to include sanitized
preflight status, sandbox authority, network allowlist, confirmation status,
evidence requirements, and blockers/warnings. Events remain session-scoped and
in-memory, with no raw browser content, persistence, MCP launch, dynamic
discovery, provider/model call, or startup/model auto-injection.

## Route 99 Local Fixture Execution Note

Route 99 keeps `/browser execute ...` on the same sidebar event path. Local
fixture execution success is summarized as a `Browser execution` event with
sanitized command output and lifecycle lines. The event store remains
session-scoped and in-memory, with no raw browser payload, persistence, MCP
launch, dynamic discovery, provider/model call, or startup/model injection.

## Route 100 Real CLI Bridge Note

Route 100 does not add cross-process sidebar persistence. Real CLI scenarios
assert the sanitized command output and injection summary instead of forcing
in-memory sidebar events to survive separate child processes. The existing
in-process `/browser` command-result event path remains the sidebar model.

## Route 101 Playwright Local Note

Route 101 keeps the same `/browser` command-result event path. Playwright
local unavailable, blocked, or injected-success results are represented in the
sanitized command output and lifecycle evidence; no sidebar persistence,
always-on UI, dynamic discovery, raw event payload, MCP launch, provider/model
call, or startup/model injection is added.

## Route 102 Dependency Policy Note

Route 102 adds the browser runtime dependency decision to the existing browser
tool/status summary. The sidebar model remains session-scoped and sanitized:
no raw runner config, persistence, dynamic discovery, MCP launch,
provider/model call, or startup/model injection is added.

## Route 104 Evidence Receipt Note

Route 104 lets the existing `/browser` command-result event adapter summarize
receipt-safe lines such as receipt id, status, replay readiness, executed
state, and next action. Sidebar events remain sanitized, session-scoped, and
in-memory; no raw evidence, persistence, MCP launch, provider/model call, or
startup/model injection is added.

## Route 105 Skill Runner Metadata Note

Route 105 adds sanitized skill-managed metadata lines to the existing
`/browser` command-result event path. Sidebar summaries may show metadata
status, supported/blocked actions, contracts, execution disabled, and next
action. They do not expose raw metadata and do not add persistence, MCP launch,
provider/model calls, browser execution, or startup/model injection.

## Route 106 Skill Execution Bridge Note

Route 106 keeps `/browser` on the existing sanitized command-result event path.
Skill-managed local/test execution can appear as a `Browser execution` event
with skill id, binding mode, execution status, receipt status, and replay
readiness. Missing binding, invalid metadata, timeout, malformed response, and
unsafe output remain warning/blocker summaries. No sidebar persistence, raw
runner output, MCP launch, provider/model call, dynamic discovery, or
startup/model injection is added.

## Route 107 Explicit Replay Note

Route 107 labels `/browser replay ...` command output as `Browser replay` on
the existing sanitized command-result event path. Replay success and replay
blocked states summarize source receipt, cache entry, revalidation status, new
receipt id, and executed yes/no. No sidebar persistence, raw evidence, dynamic
discovery, MCP launch, provider/model call, automatic replay, or startup/model
injection is added.

## Route 108 Persistent Cache Note

Route 108 surfaces persistent browser receipt cache status through existing
sanitized command-result summaries. Browser execution/replay events may mention
cache write/read status and receipt ids, but never raw cache records, raw
runner output, raw page content, secrets, or cross-process sidebar state.

## Route 109 Persistent Cache Hardening Note

Route 109 allows browser cache status, compact, and repair outputs to appear as
safe sidebar command summaries. Integrity, lock, records-before/after, removed
records, and tombstone counts are allowed summary fields; raw corrupt lines,
unsafe records, runner output, screenshots, secrets, and hidden reasoning remain
excluded.

# Compact v2 Session Integration

Status: Route 76 implemented candidate.
Date: 2026-05-15

## Scope

Route 76 connects the Route 75 Compact v2 packet and markdown renderer to the
existing slash command surface. It adds an explicit `/compact` local command
that generates a compact-safe handoff preview. It does not compact runtime
history, call a model, persist memory, change SessionManager schema, execute
restore, add sidebar UI, add startup cache, change provider/MCP behavior, or
change edit runtime behavior.

## Bounded Reference Scan

Primary files inspected: 8.

- ClaudeCode:
  `/home/wang/projects/source-claudecode/commands/compact/index.ts`,
  `/home/wang/projects/source-claudecode/commands/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`
- opencode:
  `/home/wang/projects/opencode/packages/web/src/content/docs/tui.mdx`,
  `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/utils/commands.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/utils/sessions.ts`

Findings:

1. ClaudeCode exposes `/compact` as a local command with optional custom
   summarization instructions. The command creates a compact result, displays a
   short user-facing message, runs post-compact cleanup, and keeps compact
   boundary metadata separate from preserved post-compact messages.
2. opencode exposes `/compact` in the TUI with `/summarize` as an alias. The
   session service models compaction as a typed user part, emits start/end
   events, creates an assistant summary message in compaction mode, and can
   auto-continue with a synthetic internal marker.
3. gemini-cli uses a slash command parser that resolves command names and
   aliases separately from execution. Its compression service distinguishes
   forced/manual compression from automatic threshold compression, fires
   pre-compress hooks, summarizes older history, preserves recent history, and
   avoids repeated failed compression attempts. Session listing can generate a
   summary before displaying resumable sessions.

Reference answers:

- References expose compact/session handoff through explicit commands, typed
  session compaction parts, session summaries, and compression services.
- Compact can be triggered by command, threshold/overflow, or session listing
  summary generation, depending on the product path.
- User-visible state is a compact notice or summary label; internal state is a
  structured compaction part, boundary marker, summary message, event, or
  compression status.
- Raw tool/file/recovery content is avoided by stripping media, summarizing
  older history, preserving selected recent context, and keeping restore or
  replay authority separate from prose.
- The smallest local equivalent is a pure `/compact` local command that renders
  the existing Compact v2 packet and markdown handoff without touching runtime
  history or persistence.

## Current Command / Session Audit

The local command surface is already narrow enough for Route 76:

- `packages/ts-shell/src/core/commands/registry.ts` registers local, prompt,
  and shell-action commands.
- `packages/ts-shell/src/core/commands/slashRouter.ts` resolves command names
  and aliases, returning local string output for non-runtime commands.
- `packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts` renders local
  command output without requiring `cli.tsx` changes.
- Route 66 `/restore` uses `restoreCommandRuntime.ts` as a thin command adapter
  around a command contract/runner, and renders an explicit local result block.

No broad `cli.tsx` rewrite is needed. `/compact` can be registered as a local
command, with `/handoff` as an alias, using the existing registry and local
output bridge.

## Command Contract Decision

`packages/ts-shell/src/core/context/compactCommandContract.ts` defines the pure
command contract:

- mode: `preview`, `render`, or `json`
- source: `session`, `route`, or `manual`
- optional task, route, project, mutation, recovery, validation, unsafe input,
  and secret-value inputs
- `includeMarkdown` and `includeJson` output switches
- fixed non-mutating boundaries: preview-only, no persistence, no provider
  call, and no recovery execution

The default command is render mode, preview-only, with markdown output. The
parser rejects mutating flags such as `--execute`, `--persist`, and `--memory`,
rejects raw-content flags, and rejects incompatible mode/output combinations.
Nested raw content fields that are part of known projection inputs are allowed
only so the runner can prove they are redacted by the Compact v2 redaction
policy.

## Runner Design

`packages/ts-shell/src/core/context/compactCommandRunner.ts` normalizes the
contract input, builds a Route 75 `CompactContinuityPacket`, renders markdown
when requested, and returns JSON when requested.

The runner uses:

- `EDIT_CAPABILITY_CLOSEOUT_MANIFEST`
- `listEditCapabilityReadiness()`
- `buildRouteContinuityHandoffPacket()`
- `renderCompactHandoffMarkdown()`

It is pure. It performs no file I/O, provider/model calls, memory writes,
session persistence, restore execution, automatic recovery, atomic rollback, or
runtime history compaction.

## Session-Facing Formatter Design

`packages/ts-shell/src/core/context/compactSessionSurface.ts` formats the runner
result for local command output. The surface starts with:

- compact handoff generated
- mode/source
- preview-only
- no persistence
- no provider/model call
- no recovery execution
- packet version
- current task and route
- edit capability status
- mutation evidence summary
- recovery/restore summary
- validation summary
- redaction and warning counts
- next action

When markdown is included, the formatter appends the full Compact v2 markdown
handoff. JSON mode returns the structured packet directly through the command
adapter.

## Redaction and Safety Guarantees

The command path preserves Route 75 redaction behavior:

- raw original content is excluded
- raw recovery content is excluded
- full command output is summarized
- secret values and secret-looking strings are redacted
- provider credentials, provider config, auth headers, tokens, and hidden
  reasoning fields are removed
- recovery authority ids may survive as references
- automatic recovery and atomic rollback remain false

The command output does not imply memory write, persistence, automatic restore,
or edit rollback.

## Integration Status

Implemented:

- `compactCommandContract.ts`
- `compactCommandRunner.ts`
- `compactSessionSurface.ts`
- `compactCommandRuntime.ts`
- `/compact` local command registration
- `/handoff` alias
- focused tests for contract, runner, session surface, slash registration,
  invalid args, JSON mode, redaction, markdown sections, edit closeout facts,
  mutation evidence, recovery references, validation status, and no persistence
  side effect

Deferred:

- real transcript/history compaction
- automatic threshold compaction
- SessionManager persistence schema changes
- memory candidate extraction/storage
- sidebar UI
- startup warm cache
- command polish for richer argument parsing
- provider/model summarization
- recovery execution from compact output

Recommended next route: Project memory candidate extraction, unless command
polish becomes the immediate product need.

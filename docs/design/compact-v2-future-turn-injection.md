# Compact v2 Future-Turn Injection

Status: Route 78 implemented candidate; Route 79 quality/merge hardening added.
Date: 2026-05-16

## Scope

Route 78 makes Compact v2 operational for the next normal turn. `/compact` and
`/handoff` still render the same simple handoff surface, and now they also mark
the latest live checkpoint as pending injection. The next normal
`ShellSessionRuntime.executePrompt` call consumes that pending checkpoint and
prepends compact-safe model-facing continuity context exactly once.

This route does not add persistence, memory storage, sidebar UI, startup cache,
provider/MCP behavior, package scripts, default gates, SessionManager schema
changes, edit runtime changes, automatic recovery, atomic rollback, raw
recovery content, raw original content, secrets, provider credentials, or hidden
reasoning.

## Bounded Reference Scan

Files inspected: 4 directly relevant files.

- ClaudeCode:
  `/home/wang/projects/source-claudecode/services/compact/compact.ts`,
  `/home/wang/projects/source-claudecode/query.ts`
- opencode:
  `/home/wang/projects/opencode/packages/opencode/src/session/compaction.ts`
- gemini-cli:
  `/home/wang/projects/gemini-cli/packages/core/src/context/chatCompressionService.ts`

Findings:

1. ClaudeCode separates user-visible compact command output from model-facing
   continuation by building post-compact messages and routing them into the
   query loop, with runtime state marking the post-compaction boundary.
2. opencode models compaction as typed session parts and summary messages. The
   future context is structured session state rather than ad hoc user-visible
   command text.
3. gemini-cli compression returns a new compressed history while preserving
   recent turns and active tool/function context; large tool outputs are
   summarized or truncated to references.
4. References avoid duplicate injection by replacing or anchoring the active
   compacted context instead of appending the same summary on every turn.
5. The smallest local path is an in-memory pending/consumed state next to the
   Route 77 live checkpoint, plus a narrow runtime hook that changes only the
   prompt sent to the query path. It should not persist injected context into
   session history.

## Current Query / Session Audit

- User input reaches `buildCliCommandExecution`, which routes slash commands
  before normal prompt execution.
- Local slash commands render output and return `handled`; they do not call
  `ShellSessionRuntime.executePrompt`.
- Normal turns call `ShellSessionRuntime.executePrompt(sessionId, prompt)`.
- `executePrompt` builds session continuity, persists the original user prompt
  barrier, calls `runPrompt(prompt, signal, ...)`, appends query events, and
  stores the assistant output.
- The clean injection point is immediately before `runPrompt`. This preserves
  the original persisted user prompt and avoids changing SessionManager schema
  or rewriting history.

## Chosen Architecture

Route 78 adds three pure context helpers:

- `compactInjectionState.ts`: an in-memory session-scoped pending/injected/
  consumed/invalid state store with deterministic clocks for tests.
- `compactInjectedContextFormatter.ts`: converts the Route 77 adapter payload
  into compact-safe model-facing continuity text.
- `compactFutureTurnInjection.ts`: plans one-shot injection from a live
  checkpoint and current injection state without persistence, provider calls,
  memory writes, or edit mutation.

`compactCommandRuntime.ts` marks the checkpoint pending after `/compact` or
`/handoff` creates the latest checkpoint. A second compact command supersedes
the previous pending checkpoint by replacing the pending state with the new
checkpoint id.

`ShellSessionRuntime.executePrompt` looks up `session:<sessionId>` before
normal non-recovery prompt execution. If the latest checkpoint is pending, it
prepends the formatted compact context to the model-facing prompt and wraps the
original prompt in `<user_request>`. `persistUserPromptBarrier` still receives
the original prompt only.

## User-Visible vs Model-Facing Context

User-visible `/compact` output remains the compact handoff surface plus concise
checkpoint status. Model-facing context is generated separately from the
redacted checkpoint packet and adapter payload. The injected block includes:

- task and route objective
- edit capability closeout facts and blocked-by-design capabilities
- mutation evidence
- recovery authority references, not raw recovery content
- validation status
- constraints, forbidden scope, stop conditions, and next action
- redactions and warnings

It states that restore execution remains explicit-only, automatic recovery is
not enabled, and atomic rollback is not available.

## Injection Lifecycle

1. No checkpoint: no injection.
2. `/compact` or `/handoff`: latest checkpoint is created and injection state
   becomes pending.
3. Next normal model turn: planner formats compact-safe injected context and
   state becomes consumed.
4. Later normal turns: same checkpoint is skipped because state is consumed.
5. New `/compact` or `/handoff`: a fresh pending checkpoint supersedes the old
   checkpoint and can be injected once.
6. Unsafe adapter payload: state becomes invalid and injection is skipped.

Command-only turns do not consume injection because they are handled before
`executePrompt`.

## Safety Guarantees

Injected context excludes raw original content, raw recovery content, raw
content blobs, full command output, secrets, provider credentials, auth headers,
tokens, and hidden reasoning. It also does not grant restore execution, memory
write, persistence, automatic recovery, atomic rollback, or edit capability.

## Rollback Plan

The injection hook is isolated to `ShellSessionRuntime.executePrompt` and the
context helpers. Reverting Route 78 can leave `/compact` checkpoint creation in
place and remove only the pending-state mark plus runtime prompt wrapper. No
SessionManager migration or persisted data cleanup is required.

## Deferred Work

- session summary coherence polish beyond the focused Route 79 guards
- memory candidate extraction and storage
- sidebar UI
- startup warm cache

## Route 79 Note

Route 79 adds pure merge, quality, and budget helpers before the Route 78
planner consumes injection state. Repeated `/compact` now keeps the latest
pending checkpoint authoritative, carries only stable survivor labels from
older checkpoints, blocks stale current checkpoints, runs continuity quality
checks, dedupes/caps overlong injected context, and consumes state only after a
safe budgeted context is ready.

Recommended next route: Route 80 project memory candidate extraction.

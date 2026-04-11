# Private Coding Agents Rewrite Runbook

## Rollback

- Disable Rust execution path with `DAEMON_ENABLED=0`
- Re-run `npm test` to confirm TS-local path remains healthy

## Current runtime shape

- **TS shell is the control plane**: shell, session, orchestration, slash commands, recovery, permission UX, and MCP capability routing stay in TypeScript
- **Rust daemon is the execution plane**: command execution, timeout/cancel, and sandbox preflight are delegated when daemon routing is enabled
- **contracts are the semantic boundary**: TS↔Rust payloads remain versioned and schema-backed

## Verified runtime semantics

- `submitMessage()` and `streamMessage()` both route through the same query loop semantics
- terminal results now carry explicit `terminalReason`, `terminalClassification`, and `lastContinuationReason`
- retryable runtime failures emit `query.retrying` and retry within the same turn instead of immediately killing the whole query
- orphaned `tool.started` / `approval.requested` lifecycle events are compensated before terminal completion so transcripts do not retain half-finished lifecycles
- replay/recovery no longer resumes from a generic fresh runtime only; durable transcript state is compiled into a runtime seed carrying current role, turn, transcript, shared context, visited transitions, and pending lifecycle
- `state.json` now carries a durable lifecycle index for unresolved approvals/tools plus the latest lifecycle state per task
- interrupted-turn recovery now reconciles unresolved approval/tool lifecycle before runtime seed creation, so resumed execution starts from durable post-compensation facts rather than unresolved pending entries
- shell/session persistence treats `query.completed` as a terminal envelope, not as an automatic success signal
  - `result.status === completed` → durable completed state
  - `result.status === stopped_*` → durable error state
  - interrupted shell control flow → durable interrupted state
- terminal classification now survives into durable session state
  - `terminalReason`, `terminalClassification`, and `lastContinuationReason` are written to `state.json`
  - `RecoverySnapshot` reads them back consistently
- recovery re-entry no longer blindly reuses the fresh-run barrier semantics; resumed runs move through `markRecoveryReentry()` instead
- a prompt stream that ends without a terminal event now fails defensively with `Query runtime ended without a terminal event`

## TS / Rust role split at this checkpoint

- **TypeScript owns** replay/recovery, runtime reconstruction, terminal classification, lifecycle reconciliation, and shell/session durability
- **Rust owns** execution-plane responsibilities only: daemon-backed command execution, timeout/cancel, and sandbox preflight
- This rewrite is **not** a TypeScript-only clone of ClaudeCode; ClaudeCode is the semantic reference, while this project keeps a deliberate TS-control-plane / Rust-execution-plane split

## Known limitations

- Rust bridge currently covers the bash-style execution path only
- Rust-side escalation is surfaced as a structured denial/preflight result; richer user-interaction UX still lives in the TS shell
- Backpressure is currently enforced at the TS tool-dispatch boundary with a fixed concurrency limit
- `stopped_*` terminal outcomes are still persisted through `saveError(...)`; the system does not yet distinguish "stopped" from "errored" as separate durable classes
- `query.completed` still names both successful completion and terminal stop completion; rely on `result.status`, not the event name alone
- `sessionRuntime` still assumes every `runPrompt()` stream emits a terminal event before closing; silent end now throws explicitly, but upstream runtimes are still expected to honor the terminal-event invariant
- pending lifecycle indexing remains embedded in `state.json`; there is still no separate recovery index storage layer
- terminal classification is richer than the top-level session status; durable session status is still intentionally coarser than the terminal envelope

## Suggested reading order for runtime debugging

1. `packages/ts-shell/src/core/query/QueryEngine.ts`
2. `packages/ts-shell/src/core/query/queryLoop.ts`
3. `packages/ts-shell/src/core/shell/sessionRuntime.ts`
4. `packages/ts-shell/src/session/SessionManager.ts`
5. `packages/ts-shell/src/core/query/QueryEngine.test.ts`
6. `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`

## Verification commands

- `npm test`
- `npm run build`
- `npm run test:rust`
- `npm run workflow:status`
- `npm run doctor`

## Latest focused verification checkpoint

- `npm run build` ✅
- `npx vitest run packages/ts-shell/src/core/query/QueryEngine.test.ts packages/ts-shell/src/core/shell/sessionRuntime.test.ts packages/ts-shell/src/core/shell/recovery.test.ts packages/ts-shell/src/session/SessionManager.test.ts` ✅
- Result: **4 test files, 32 tests passed**
- `lsp_diagnostics packages/ts-shell/src` → **0 errors**

## Daily workflow checks

- Prefer working in a feature worktree instead of a dirty `main` checkout
- Use `npm run workflow:status` before and after a coding session
- If CLI shows a recovery candidate, resume it explicitly with `--session-id`

# Runtime Semantics Closure Plan

## Goal

Close the remaining gap between the current migrated core and ClaudeCode’s load-bearing runtime semantics.

## Ordered Workstreams

- [x] A1. Directory-based session substrate
  - Replace single-file session persistence with per-session directories
  - Introduce `metadata.json`, `transcript.jsonl`, and `state.json`
  - Make user input durable before query runtime proceeds

- [x] A2. Query event protocol completion
  - Expand query events beyond message deltas/completion
  - Add tool / approval / MCP / lifecycle events
  - Route shell runtime through event consumption only

- [x] B1-B3. MCP execution plane
  - Real stdio MCP connect/list/invoke
  - Stable server-scoped tool identity
  - Inject MCP tools into `core/tools`

- [x] C1-C3. Shell action layer completion
  - Expand slash actions (`/cancel`, `/sessions`, `/mcp`, `/help`)
  - Strengthen command registry semantics
  - Finalize true `/resume`

- [x] D1-D3. Shell/bootstrap/session substrate deepening
  - Pull bootstrap phases out of CLI
  - Move interrupt/close/recovery logic into `core/shell`
  - Make session/worktree/bootstrap transitions atomic

- [x] E1-E3. Tool capability prefilter
  - Filter visible tool pool before model exposure
  - Include deny rules, mode gating, env gating, MCP server rules
  - Add prefilter regression tests

## Immediate Step

Start with **A1** and do not broaden scope:

- keep current `SessionManager` API compatible where practical
- migrate storage shape first
- then adapt runtime/tests

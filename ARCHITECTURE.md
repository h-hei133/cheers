# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (CLI)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ↓
        ┌────────────────────────────────────────┐
        │  TS Shell: CLI & Orchestration         │
        │  (packages/ts-shell)                   │
        ├────────────────────────────────────────┤
        │ • Input loop + streaming renderer      │
        │ • Session state persistence            │
        │ • Agent orchestration (P→C→R)          │
        │ • Permission policy enforcement        │
        │ • Model adapter interface              │
        │ • Tool registry & dispatch             │
        └─────┬──────────────────┬───────────────┘
              │                  │
              ↓                  ↓
      ┌───────────────┐  ┌──────────────────┐
      │ Model API     │  │ Rust Daemon      │
      │ (opt-in       │  │ (optional native │
      │ provider path)│  │ executor path)   │
      │               │  │                  │
      │ Provider      │  │ • Execution      │
      │ Adapter       │  │ • Timeout/Cancel │
      │ Interface     │  │ • Sandbox        │
      └───────────────┘  └──────────────────┘
              │                  │
              ├──────────────────┴─────────────┐
              │                                 │
              ↓                                 ↓
      ┌──────────────┐            ┌─────────────────────┐
      │ Provider     │            │ Offline Research    │
      │ Capability   │            │ (python-eval)       │
      │ Negotiation  │            │                     │
      └──────────────┘            │ • Document parse    │
                                  │ • Schema validate   │
                                  │ • Utilities         │
                                  └─────────────────────┘

      Contract Boundaries (versioned schemas):
      ─────────────────────────────────────────
      • TS ↔ Model API: OpenAI streaming protocol
      • TS ↔ Rust daemon: runtime-protocol.schema.json
      • Python eval: offline-only evaluation artifacts, not product runtime
```

---

## Request Lifecycle

### Current Runtime Path

```
User Input
   ↓
[CLI Input Loop]
   ↓
[Session Persistence]
    ├─ Restore context if resuming
    └─ Create new session if fresh
   ↓
[Query Runtime Setup]
   ├─ Create QueryRuntimeState
   ├─ Or reconstruct QueryRuntimeState from durable runtime seed
   │  during replay / recovery entry
   ├─ Route both submitMessage() and streamMessage()
   │  through the same query loop
   └─ Initialize turn counters and continuation metadata
   ↓
[Turn Execution]
   ├─ Select role and build prompt context
   ├─ Call provider adapter
   ├─ Stream model/tool events
   └─ Collect output events for the active turn
   ↓
[Retry / Compensation]
   ├─ Retryable runtime errors emit query.retrying
   ├─ The same turn retries in-place instead of failing
   ├─ Orphaned tool.started / approval.requested events
   │  are compensated before terminal emission
   └─ lastContinuationReason tracks why the loop continued
   ↓
[Terminal Decision]
   ├─ terminalReason identifies completed vs stopped_* result
   ├─ terminalClassification distinguishes success / stopped / error
   ├─ query.completed carries the final OrchestrationResult
   └─ query.failed is reserved for stream-level failure
   ↓
[Session Finalization]
   ├─ Persist completed only when result.status=completed
   ├─ Persist stopped_* as session error state
   ├─ Persist interrupted separately from terminal results
   ├─ Clean up temporary files
   └─ Show completion summary
   ↓
User Output (streamed)
```

### Execution Plane Routing

When `DAEMON_ENABLED=1`:
- Execution-bound tool requests prefer the Rust daemon via IPC bridge
- Rust performs command execution, timeout/cancel handling, and sandbox preflight
- TS remains the owner of shell/session/orchestration/permission UX semantics
- TS receives execution results through the versioned contract envelope

Fallback if daemon unavailable:
- Automatically switch to TS execution path
- Seamless recovery without user intervention

---

## Sandbox Policy Model

### Default-Deny Philosophy

Every operation is **blocked by default** unless explicitly allowed or escalated.

### Policy Layers

1. **Tool Allowlist** (T8)
   - MVP tools: `read`, `edit`, `bash`, `git` (subset)
   - Non-MVP tools blocked with policy reason
   - Escalation can unlock non-MVP tools

2. **Scope Enforcement**
   - Workspace read: ALLOWED
   - Workspace write: ALLOWED
   - System write (outside workspace): DENIED
   - Network calls: DENIED (escalation required)
   - Process spawn: ALLOWED (with timeout)
   - Subprocess timeout: 30s default

3. **Escalation Workflow**
   - Agent requests forbidden action
   - User prompted: "Allow [action] on [resource]? (y/n)"
   - Decision logged to audit trail
   - Approved escalation cached for session lifetime

---

## Contract Envelope Structure

### Versioning

All cross-layer payloads follow this structure:

```json
{
  "schemaVersion": "1.0.0",
  "type": "command.request",
  "traceId": "uuid",
  "timestamp": "iso8601",
  "payload": { ... }
}
```

Schema version: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes, incompatible receivers
- **MINOR**: Additive changes, backward-compatible
- **PATCH**: Non-structural fixes

### Compatibility Rules

- Receiver MUST accept payloads with same MAJOR version
- Receiver MAY ignore unknown fields with same MAJOR version
- Receiver MUST reject different MAJOR version with clear error

---

## Error Propagation

### Happy Path Errors (Expected)

- Policy denial → show reason, prompt escalation
- Retryable provider/runtime failure → emit `query.retrying`, continue in the same turn, then surface terminal result only if retry budget is exhausted
- Tool execution error → capture stderr, show in context
- Agent handoff cycle → stop with terminal reason, explain cycle to user
- Orphaned tool / approval lifecycle → synthesize compensation events before transcript finalization

### Critical Errors (Exceptional)

- Schema mismatch → dump full context, suggest update
- Contract version incompatibility → refuse to proceed, show migration path
- Session corruption → graceful fallback to new session
- Daemon crash → automatic TS fallback, notification

---

## Agent Roles & Responsibilities

### Planner
- Analyzes user request
- Breaks into sub-tasks
- Delegates to Coder

### Coder
- Implements plan
- Calls tools to read/write/execute
- Reports completion or blocker

### Reviewer
- Checks implementation quality
- Suggests improvements
- Approves or requests revisions

### Cycle Prevention
- Maximum handoff cycles: 3 (configurable)
- Cycle detected → stop and show context
- User can manually re-prompt if needed

---

## Session State Model

### Persistence

Every session has a directory:
```
~/.cache/coding-agents/sessions/{session-id}/
├── metadata.json          # session config, timestamps, agent list
├── transcript.jsonl       # all turns (message, response, decision)
├── state.json             # current agent, turn count, context
└── temp/                  # temporary files (auto-cleaned)
```

### Recovery

On CLI startup:
1. List recent sessions: `agents resume`
2. Or create new: `agents new`
3. Load session state
4. Repair replayable transcript state if interruption left orphaned terminal events
5. Read durable recovery facts from `state.json`
6. If resuming a turn interruption, reconcile unresolved approval/tool lifecycle before runtime seed construction
7. Compile durable transcript + recovery snapshot into a `QueryRuntimeStateSeed`
8. Mark recovery re-entry without treating it as a fresh prompt barrier
9. Restore context into agent prompt
10. Continue from last unfinished turn using the seeded runtime state

### Durable Recovery Index

- `state.json` now carries a durable lifecycle index for unresolved approvals/tools
- The index tracks:
  - `pendingApprovals`
  - `pendingTools`
  - per-task latest lifecycle state in `taskStates`
- Each appended query lifecycle event updates the durable index immediately
- Recovery snapshots and runtime seeds can now resume with both transcript context and unresolved lifecycle state, instead of reconstructing pending work by transcript scan alone
- Turn-interrupted recovery now reconciles unresolved approval/tool lifecycle into compensated durable terminal events before resumed execution begins

### Terminal Persistence Semantics

- `query.completed` means the query loop reached a terminal emission point, not necessarily that the run succeeded
- Shell persistence uses `event.result.status` to decide the durable session state
  - `completed` → `saveCompleted(...)`
  - `stopped_*` → `saveError(...)`
  - interrupted shell control flow → `saveInterrupted(...)`
- `terminalReason`, `terminalClassification`, and `lastContinuationReason` are now persisted into `state.json` and exposed through `RecoverySnapshot`
- A new run clears stale terminal classification and stale pending lifecycle before replay begins
- Recovery re-entry uses a dedicated state transition instead of replaying the fresh prompt barrier semantics as if it were a new run
- If a future `runPrompt()` implementation ends silently without emitting a terminal event, shell runtime now fails explicitly with `Query runtime ended without a terminal event` instead of implicitly treating the run as completed

### Corruption Handling

If session file corrupted:
- Detect JSON parse error
- Show: "Session corrupted. Start fresh? (y/n)"
- If yes → create new session, show transcript excerpt as context
- If no → exit

---

## Testing Strategies

### Unit Tests (Layer-Internal)

**TS Shell**: Vitest
- Policy enforcement logic
- Agent orchestration decisions
- Session state transitions
- Adapter normalization (mocked providers)

**Rust Core**: `cargo test`
- Executor lifecycle
- Timeout/cancel reliability
- Sandbox enforcement
- Error type serialization

**Python Eval**: pytest
- Schema validation
- Document parsing
- Utility functions

### Integration Tests (Cross-Layer)

**E2E Scenario**: Interactive CLI
- Full happy path: prompt → handoff → tool → result → finish
- Full failure path: forbidden tool → escalation → deny → recovery

**Contract Tests**: All layers
- Valid payload acceptance
- Invalid payload rejection
- Schema version compatibility

**Functional Parity** (Phase-2):
- TS path and Rust path produce identical results
- Timeout/cancel behavior consistent
- Error messages equivalent

---

## Known Limitations & Trade-Offs

1. Terminal persistence is still coarse
   - `terminalClassification` now distinguishes `success` / `stopped` / `error`
   - but top-level session status still collapses `stopped_*` into session error persistence
   - this is operationally safe, but it does not yet distinguish "normal stop" from "error stop" as separate durable categories

2. Event naming is stricter than before, but not fully settled
   - `query.completed` currently covers both success and terminal stop outcomes
   - Durable state comes from `result.status`, not the event name alone

3. Shell runtime depends on terminal-event emission
   - `sessionRuntime` expects `runPrompt()` streams to emit a terminal event before closing
   - Missing terminal events now fail explicitly, but the invariant is still required for healthy upstream implementations

4. Pending lifecycle indexing remains intentionally lightweight
   - unresolved approvals/tools are kept inside the existing `state.json`
   - there is no separate lifecycle database or sidecar index file

5. Rust remains a native executor candidate only
   - these replay/recovery/terminal-classification semantics intentionally stay in the TS product runtime/control plane
   - Rust focuses on opt-in command execution, timeout/cancel, and sandbox preflight paths rather than shell/session ownership

6. Python not in critical path
   - This is intentional (offline only)
   - Fits local-first model

6. Single-machine only
   - No distributed agent coordination
   - Fine for solo maintainer use case

---

## References

- Plan: `.sisyphus/plans/private-coding-agents-rewrite.md`
- Workspace: `WORKSPACE.md`
- Ownership: `OWNERSHIP.md`
- Contracts: `contracts/runtime-protocol.schema.json`

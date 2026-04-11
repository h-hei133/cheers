# Migration Status Report

**Project:** private-coding-agents  
**Date:** 2026-04-10  
**Status:** active, verified, and moving from documentation-sync into source-alignment phase

## Executive Summary

The rewrite has moved beyond initial scaffolding and MVP assembly. The project now has a working TypeScript control plane, a contract-backed multi-runtime boundary, and a Rust execution path that has already been integrated and parity-tested for execution-focused workloads without taking over shell or orchestration responsibilities.

At this checkpoint, the highest-priority remaining work is no longer broad implementation. The main gap is documentation synchronization: several plan and workspace documents still lag behind the code and evidence already present in the repository.

## Current Architectural Position

### TypeScript is the control plane

TypeScript now owns the runtime surfaces that should remain control-plane concerns:

- CLI shell and entry flow
- session substrate, replay, and recovery
- query runtime and orchestration
- slash commands and shell actions
- permission prompts, audit UX, and recovery UX
- MCP capability routing and visible tool filtering

The current control-plane spine is centered in:

- `packages/ts-shell/src/core/query/`
- `packages/ts-shell/src/core/tools/`
- `packages/ts-shell/src/core/mcp/`
- `packages/ts-shell/src/core/commands/`
- `packages/ts-shell/src/core/shell/`

### Rust is the execution plane

Rust has progressed from skeleton status into the real execution path for process-oriented work:

- daemon-backed command execution exists
- timeout and cancellation behavior are covered in tests
- sandbox preflight and denial semantics exist on the Rust side
- TS↔Rust parity tests exist for execution-path behavior

Rust is positioned as the execution plane, not the control plane. Session ownership, shell semantics, recovery UX, and orchestration remain in TypeScript by design.

### Contracts are the semantic backbone

The cross-runtime contract layer is established and verified in:

- `contracts/runtime-protocol.schema.json`
- `contracts/versioning-policy.md`
- `contracts/typescript/types.ts`
- `contracts/rust/mod.rs`
- `contracts/python/types.py`

This remains the source of truth for TS↔Rust and TS↔Python boundary semantics.

## Completed Work

### Foundation phases already completed

The repository evidence and plans show that the earlier foundation phases are complete:

- Phase 1 base rewrite foundation
- Phase 2 productization improvements
- Phase 3 daily workflow hardening

This includes contracts, tri-stack workspace setup, TS shell baseline, provider/model integration, sandboxing, orchestration, session handling, observability, Rust bridge foundations, workflow support, and release/runbook documentation.

### ClaudeCode core capability migration completed through the current runtime pass

The following migration workstreams are implemented in code and supported by evidence artifacts:

- **W1** Query runtime migration
- **W2** Tool runtime and permission migration
- **W3** MCP gateway and execution-plane first pass
- **W4** Command registry and slash action layer
- **W5** Shell/bootstrap/session substrate migration

Supporting closure work reached the following checkpoint status:

- **A1** directory-based session substrate
- **A2** richer query/transcript event protocol
- **A3** append-before-model-call durability barrier
- **A4** interrupted prompt vs interrupted turn separation
- **A5** replay/recovery phase 1 helpers
- **B4** daemon-first routing work
- **B5** TS↔Rust parity coverage
- **C4/C5** expanded shell actions and stronger registry semantics
- **D4/D5** atomic session switching and deeper shell-core ownership
- **E4** visible tool pool combination coverage

### Recent task audit

The recent runtime task set has now been reworked and re-verified to closure.

**Complete at the current checkpoint**:

- **A5** transcript replay and repair helpers for partial/orphaned runtime state
- **B4** Rust daemon as the preferred execution backend for execution-plane workloads
- **B5** TS↔Rust parity coverage for success/timeout semantics
- **C4** shell action expansion (`/cancel`, `/sessions`, `/mcp`, `/help`)
- **C5** command registry semantics (`availability`, `enabled`, `bridgeSafe`)
- **D4** atomic shell substrate transitions for session/project-dir state
- **D5** remaining interrupt/close/recovery logic moved under `core/shell`
- **E4** visible-tool-pool combination coverage

### Latest closure pass: durable replay and terminal persistence tightening

The newest TS control-plane pass stayed deliberately narrow and runtime-semantic in scope. It did **not** rename events, expand shell UX, or move control-plane concerns into Rust.

This pass completed four focused changes:

1. **Replay → runtime seed re-entry**
   - durable replay state is now compiled into a `QueryRuntimeStateSeed`
   - resumed query execution can restart from seeded `currentRole`, `turn`, `transcript`, `sharedContext`, `visitedTransitions`, and `pendingLifecycle`

2. **Durable pending lifecycle index**
   - `state.json` now stores unresolved approvals, unresolved tools, and per-task latest lifecycle state
   - recovery snapshots and runtime seeds can resume using this durable lifecycle index directly

3. **Terminal envelope classification tightening**
   - terminal envelopes now carry both `terminalReason` and `terminalClassification`
   - current runtime semantics distinguish `success`, `stopped`, and `error` without renaming the existing events

4. **Recovery-first lifecycle reconciliation + terminal guard**
   - interrupted-turn recovery now reconciles unresolved approval/tool lifecycle before runtime seed construction
   - shell runtime no longer treats a silently ending prompt stream as implicit success
   - missing terminal events now fail explicitly with `Query runtime ended without a terminal event`

This remained intentionally inside the TS control plane. It did **not** move replay/recovery/orchestration concerns into Rust, and it did **not** broaden into event renaming or shell UX expansion.

Primary code surfaces updated in this pass:

- `packages/ts-shell/src/orchestration/types.ts`
- `packages/ts-shell/src/core/query/resultMapper.ts`
- `packages/ts-shell/src/core/query/runtimeState.ts`
- `packages/ts-shell/src/core/query/QueryEngine.ts`
- `packages/ts-shell/src/core/query/queryLoop.ts`
- `packages/ts-shell/src/core/tools/toolResultLifecycle.ts`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/recovery.ts`
- `packages/ts-shell/src/orchestration/MultiAgentOrchestrator.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/entrypoints/cli.tsx`

Focused verification surfaces for this pass:

- `packages/ts-shell/src/core/query/QueryEngine.test.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`
- `packages/ts-shell/src/core/shell/recovery.test.ts`
- `packages/ts-shell/src/session/SessionManager.test.ts`

Additional closure evidence:

- `.sisyphus/evidence/a5-b4-d4-final-closure.txt`

Key evidence files include:

- `.sisyphus/evidence/w1-queryengine-query-migration.txt`
- `.sisyphus/evidence/w2-tool-runtime-permissions-migration.txt`
- `.sisyphus/evidence/a1-session-substrate.txt`
- `.sisyphus/evidence/a2-durability-replay-phase-1.txt`
- `.sisyphus/evidence/a3-a5-durability-replay-closure.txt`
- `.sisyphus/evidence/b4-b5-rust-execution-mainline.txt`
- `.sisyphus/evidence/c4-c5-shell-actions-and-registry.txt`
- `.sisyphus/evidence/d4-d5-shell-substrate.txt`
- `.sisyphus/evidence/e4-visible-tool-pool.txt`

## Verified Runtime State

The current repository state was re-verified from the `private-coding-agents/` working directory on 2026-04-10.

### Build and test verification

- `npm run build` ✅
- targeted TS runtime verification ✅
  - `packages/ts-shell/src/core/query/QueryEngine.test.ts`
  - `packages/ts-shell/src/core/shell/sessionRuntime.test.ts`
  - `packages/ts-shell/src/core/shell/recovery.test.ts`
  - `packages/ts-shell/src/session/SessionManager.test.ts`
- `lsp_diagnostics` on `packages/ts-shell/src` ✅ (0 errors)

Observed passing counts for this focused checkpoint:

- TypeScript focused runtime set: **4** test files, **32** tests passed

### Manual QA note

The durable state path now demonstrates terminal classification and recovery seed data as persisted runtime state, not just in-memory query output. Representative observed values from manual QA included:

- persisted terminal classification:
  - `terminalReason: completed`
  - `terminalClassification: success`
- recovery seed shape:
  - `recoveryBoundary: mid-turn-reentry`
  - pending approvals/tools reconciled to empty before resumed execution
  - durable task lifecycle recorded as `approval.resolved` / `tool.result`

This means the TS control plane now owns a stronger durable recovery story: replay state can reconstruct runtime entry, unresolved lifecycle can be reconciled before re-entry, and terminal absence fails explicitly instead of silently completing.

## What Is Still Not Finished

The main unfinished work at this checkpoint is no longer broad productization. The next bottleneck is **source alignment against ClaudeCode's remaining load-bearing runtime semantics**.

### Still-open semantic boundaries

- top-level session status still collapses `stopped_*` into durable error persistence even though terminal envelopes now distinguish `stopped` from `error`
- `query.completed` still covers both successful completion and terminal stop completion
- pending lifecycle indexing is intentionally lightweight and remains embedded in `state.json`
- Rust remains execution-plane-only; session/orchestration/recovery semantics are intentionally not migrating there

### Remaining technical depth work

The project is not feature-complete in every dimension. The most important remaining technical work is now narrower and more strategic:

- compare current TS recovery/runtime reconstruction against ClaudeCode's original load-bearing query/session semantics
- identify which remaining ClaudeCode runtime invariants belong in TS control plane versus Rust execution plane
- continue deepening Rust only where the responsibility is truly execution-plane
- avoid moving shell, session, orchestration, or permission UX into Rust
- continue replay/durability work only if it improves real recovery semantics rather than widening surface area
- keep contract evolution test-first and parity-driven

Python also remains intentionally minimal and offline-only.

## Recommended Next Goals

The next goals should stay tightly scoped:

1. compare private-coding-agents against ClaudeCode's source runtime to identify the next load-bearing semantics gap
2. keep the TS control-plane / Rust execution-plane boundary explicit while selecting follow-up work
3. prioritize small, semantics-heavy migrations over broad product-surface expansion

## Bottom Line

This project has already crossed the line from “prototype rewrite” into “working migrated runtime with durable core paths.” The current bottleneck is no longer whether the architecture exists. It is deciding, by direct comparison with ClaudeCode source, which remaining load-bearing runtime semantics should be migrated next while preserving the private rewrite's intended architecture: **TypeScript control plane, Rust execution plane, contracts as the semantic boundary**.

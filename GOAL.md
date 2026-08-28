# Goal: Phase 3 - Reference Architecture Ingestion & Capability Modernization

## Context & Baseline
- Phase 1 (Resolved Specifiers & Broken Cycles) and Phase 2 (Monolith Decomposition under 20-function ceiling) are complete and verified (`normproof judge` shows 0 blocking obligations and acyclic dependency graph).
- The repository is an enterprise-grade autonomous coding agent framework (`packages/ts-shell`, `packages/rust-core`, `packages/python-eval`).
- Reference systems available under `/home/wang/projects/`:
  - `pi` (`/home/wang/projects/pi`): Unified `AgentSession` abstraction, event-driven state transitions, structured compaction/branching, pluggable transport modes (Interactive, Print, RPC).
  - `GitNexus` (`/home/wang/projects/GitNexus/gitnexus`): Multi-language Tree-sitter symbol resolution, workspace call graph, index-backed context discovery.
  - `mem0` / `graphiti` (`/home/wang/projects/mem0`, `/home/wang/projects/graphiti`): Multi-tier memory architecture (Episodic, Working, Semantic graph).

---

## Strategic Modernization Goals

### Wave 1: Unified Agent Lifecycle & Session Engine (Inspired by `pi`)
- **Target**: Decouple and modernize `packages/ts-shell/src/session/SessionManager.ts` (currently 52 functions) into a unified, event-driven `AgentSession` runtime.
- **Architectural Deliverables**:
  1. `session/agent/lifecycle.ts`: Clean state machine for agent turn progression, cancellation, and re-entry.
  2. `session/agent/compaction.ts`: Token-aware branch summarization and context compaction.
  3. `session/agent/persistence.ts`: Append-only event store and atomic state snapshots.
  4. `session/SessionManager.ts`: Facade wrapper retaining existing interfaces.

### Wave 2: Symbol-Aware Context Intelligence (Inspired by `GitNexus`)
- **Target**: Modernize `packages/ts-shell/src/context/discovery` from text-heuristic matching to symbol-aware graph context.
- **Architectural Deliverables**:
  1. `context/graph/symbolTable.ts`: Lightweight symbol extractor for TypeScript declarations and references.
  2. `context/graph/callGraph.ts`: Dependency and call-chain graph builder for relevant symbols in current prompt.
  3. `context/discovery/ranker.ts`: Graph-boosted candidate file ranking.

### Wave 3: Hierarchical Memory & Working State (Inspired by `mem0` / `graphiti`)
- **Target**: Decouple `packages/ts-shell/src/core/context/memory/` into episodic, working, and project-level memory layers.
- **Architectural Deliverables**:
  1. `memory/working/state.ts`: Task-scoped scratchpad and tool-execution memory.
  2. `memory/episodic/history.ts`: Cross-session historical recall and preference extraction.
  3. `memory/project/projectMemoryLocalStore.ts`: Modernized persistent storage facade.

---

## Verification & Proof Criteria
1. **Zero Type Errors**: `npm run build:ts` cleanly builds CLI binary.
2. **Deterministic Test Suite**: All existing unit and integration suites pass via `vitest`.
3. **NormProof Compliance**: `normproof judge` continues to show `0` blocking obligations and satisfies acyclicity invariants.
4. **Knowledge Base Audit**: All architectural decisions and ingestions documented in `.wiki/` and `.normproof/dispositions.md`.

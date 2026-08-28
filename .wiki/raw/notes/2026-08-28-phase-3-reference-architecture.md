# Reference Architecture Analysis: Pi, GitNexus, and Mem0/Graphiti

## Overview

In Phase 3, we ingest architectural patterns from three premier reference codebases located in `/home/wang/projects/`:
1. **pi** (`/home/wang/projects/pi/packages/coding-agent`): Unified AgentSession, event-driven turns, and structured compaction.
2. **GitNexus** (`/home/wang/projects/GitNexus/gitnexus/src/core/ingestion`): Graph-based code intelligence, Tree-sitter AST symbol resolution, and scope pipelines.
3. **mem0 / graphiti** (`/home/wang/projects/mem0`, `/home/wang/projects/graphiti`): Multi-tier episodic and working memory.

## Architectural Matrix & Mapping

| Capability | Target in `coding-agents` | Reference Pattern | Modernization Value |
| :--- | :--- | :--- | :--- |
| **Agent Turn Lifecycle** | `session/SessionManager.ts` | `pi`'s `AgentSession` & `AgentEvent` | Replaces monolithic state transitions with reactive, typed event-driven state progression. |
| **Context Compaction** | `session/agent/compaction.ts` | `pi`'s `compaction/branch-summarization.ts` | Automatic token-budget-aware compaction retaining essential context. |
| **Code Intelligence** | `context/discovery/` | `GitNexus`'s `scope-resolution/` & `symbol-table.ts` | Upgrades substring matching to semantic symbol graph matching. |
| **Working Memory** | `core/context/memory/` | `mem0` / `graphiti` temporal graph | Decouples scratchpad working memory from persistent project directives. |

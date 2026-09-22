# Deep Dive: Tool Dispatch Concurrency and Fine-Grained Permissions

## Overview
In Special Battle 1 of Phase 3, we ingest and adapt two foundational subsystem patterns from top-tier coding agent runtimes:
1. **Pi's File Mutation Queue** (`/home/wang/projects/pi/packages/coding-agent/src/core/tools/file-mutation-queue.ts`):
   - Path-level mutex serialization preventing race conditions during parallel tool calls.
2. **Claude Code's Permission Engine** (`/home/wang/projects/source-claudecode/types/permissions.ts`):
   - Structured permission behaviors (`allow`, `ask`, `deny`) with origin sources and scope evaluation.

## Mapping & Design Strategy

| Architecture Area | Current `coding-agents` | Reference Pattern | Modernized Target |
| :--- | :--- | :--- | :--- |
| **File Mutation Safety** | None (unserialized concurrent file writes) | `pi` `withFileMutationQueue` | `tools/concurrency/fileMutationQueue.ts` |
| **Approval Trust Policy** | Monolithic `approvalTrustPolicy.ts` (22 fn) | `Claude Code` Permission Rule Engine | `core/shell/approval/{types, evaluator, store}.ts` & facade |
| **Tool Dispatch Orchestrator** | Monolithic `toolBatchDispatch.ts` (29 fn) | Modular dispatch pipeline | `tools/dispatch/{types, planner, executor, projector}.ts` & facade |

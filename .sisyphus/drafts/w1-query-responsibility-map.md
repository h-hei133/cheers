# W1 QueryEngine / query Responsibility Map

## Goal

Define the first concrete source-to-target mapping for ClaudeCode core capability migration, focused on `QueryEngine.ts` and `query.ts`.

## Source -> Target Mapping

### 1. `QueryEngine.ts`

**Source responsibilities**
- Persistent wrapper around the core query loop
- Session-turn orchestration
- Prompt/context assembly before loop entry
- Transcript durability timing and final flush semantics
- SDK/headless result normalization and final result synthesis

**Rewrite targets**
- `packages/ts-shell/src/core/query/QueryEngine.ts`
  - persistent wrapper entrypoint for the migrated query core
- `packages/ts-shell/src/core/query/resultMapper.ts`
  - normalize terminal state into runtime-facing result objects

### 2. `query.ts`

**Source responsibilities**
- Core query state machine
- Turn continuation / stop reasons / recovery loop
- Tool execution phase integration
- Stop-hook and continuation decision ordering

**Rewrite targets**
- `packages/ts-shell/src/core/query/queryLoop.ts`
  - main loop / turn stepper
- `packages/ts-shell/src/core/query/runtimeState.ts`
  - state carried between turns
- `packages/ts-shell/src/core/query/transitions.ts`
  - continue/terminal transition contracts

### 3. `query/config.ts`

**Source responsibilities**
- Immutable per-query config snapshot

**Rewrite targets**
- `packages/ts-shell/src/core/query/QueryEngine.ts`
  - accepted config boundary
- `packages/ts-shell/src/core/query/runtimeState.ts`
  - immutable runtime config carried through the loop

### 4. `query/deps.ts`

**Source responsibilities**
- Dependency injection seam for model / compaction / platform helpers

**Rewrite targets**
- `packages/ts-shell/src/core/query/QueryEngine.ts`
  - runner + role prompt injection boundary for the first rewrite pass

### 5. `query/tokenBudget.ts`

**Source responsibilities**
- Continuation policy based on bounded budget and diminishing returns

**Rewrite targets**
- Deferred in spirit to `packages/ts-shell/src/core/query/runtimeState.ts`
  - explicit runtime stop/continue counters and max-turn tracking
- Full token-budget parity is postponed, but max-turn and cycle guards are migrated now

### 6. `query/stopHooks.ts`

**Source responsibilities**
- Post-turn control gate that may block continuation or inject messages

**Rewrite targets**
- Deferred hook boundary in `packages/ts-shell/src/core/query/queryLoop.ts`
  - the new loop keeps a clear terminal/continue seam where stop hooks can later plug in

### 7. `services/tools/StreamingToolExecutor.ts`

**Source responsibilities**
- Streaming-time tool execution
- Synthetic error generation on interruption/fallback
- Context mutation sequencing

**Rewrite targets**
- Not migrated fully in W1
- The W1 loop leaves explicit tool/runtime boundaries for W2 via runner output notes and tool dispatcher integration already present in ts-shell

## W1 Non-Goals

- Full parity with ClaudeCode compaction pipeline
- Full parity with streaming tool executor internals
- Full transcript durability semantics
- Hook system migration

## W1 Concrete Deliverable

Create a new core query runtime in `packages/ts-shell/src/core/query/` and route current ts-shell orchestration through it, so that:

- the turn loop no longer lives only inside `MultiAgentOrchestrator.ts`
- stop reasons are explicit transition objects
- result normalization is centralized
- future W2/W3/W4/W5 migration can plug into this core instead of the CLI/orchestration layer directly

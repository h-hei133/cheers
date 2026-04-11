# W2 Tool Runtime / Permission Model Responsibility Map

## Goal

Split the current ts-shell tool execution path into ClaudeCode-like layers:

- registry
- runtime
- permission context
- approval flow
- result lifecycle

## Source -> Target Mapping

### 1. `tools.ts`

**Source responsibilities**
- source-of-truth tool registry
- feature/environment gating

**Rewrite targets**
- `packages/ts-shell/src/core/tools/registry.ts`

### 2. `Tool.ts`

**Source responsibilities**
- shared tool runtime contracts
- permission context boundary

**Rewrite targets**
- `packages/ts-shell/src/tools/types.ts` (compat contracts)
- `packages/ts-shell/src/core/tools/permissionContext.ts`

### 3. `services/tools/toolOrchestration.ts`

**Source responsibilities**
- serial vs concurrent tool execution orchestration
- context mutation ordering

**Rewrite targets**
- `packages/ts-shell/src/core/tools/runtime.ts`

### 4. `services/tools/StreamingToolExecutor.ts`

**Source responsibilities**
- streaming-time tool execution state
- synthetic error handling and interruption semantics

**Rewrite targets**
- deferred for deeper parity, but runtime error/fallback result shaping is centralized in:
  - `packages/ts-shell/src/core/tools/toolResultLifecycle.ts`

### 5. `utils/permissions/permissions.ts`

**Source responsibilities**
- permission rule resolution
- ask/allow/deny flow
- approval request messaging

**Rewrite targets**
- `packages/ts-shell/src/core/tools/approvalFlow.ts`
- existing sandbox policy/enforcer remain the lower policy adapter in this rewrite phase

## W2 Concrete Deliverable

The existing `src/tools/dispatcher.ts` becomes a compatibility shell over the new `src/core/tools/runtime.ts`, so future migration work can extend the core layer without keeping registry/policy/runtime fused together.

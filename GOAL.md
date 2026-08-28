# Goal: Phase 3 Deepening - Special Battle 1: Tool Dispatch, Concurrency & Security Modernization

## Strategic Intent & Context
Following initial exploration of reference architectures (`/home/wang/projects/pi` and `/home/wang/projects/source-claudecode`), we are executing **Special Battle 1** to eliminate the capability gap in **Tool Dispatch, File Mutation Concurrency, and Permission Security Boundaries**.

---

## 1. Problem Statement & Reference Ingestion

### A. Current Deficiencies in `coding-agents`:
1. **Monolithic Tool Dispatcher** (`packages/ts-shell/src/tools/toolBatchDispatch.ts` - 29 functions):
   - Combines dispatch planning, security authority checking, sequential execution, and JSON receipt generation in a single monolithic file.
2. **Coarse-grained Approval Policy** (`packages/ts-shell/src/core/shell/approvalTrustPolicy.ts` - 22 functions):
   - Flat cache keys, lacks permission behavioral classification (`allow`, `deny`, `ask`), and lacks rule-based scope evaluation.
3. **No File Mutation Concurrency Lock**:
   - Multiple parallel tool calls touching the same workspace path can race and corrupt files.

### B. Reference Architecture Ingestion:
1. **Pi's `withFileMutationQueue`** (`/home/wang/projects/pi/packages/coding-agent/src/core/tools/file-mutation-queue.ts`):
   - Path-level mutex serialization for safe concurrent tool execution across different files while guaranteeing strict sequencing per path.
2. **Claude Code's Permission & Trust State Machine** (`/home/wang/projects/source-claudecode/types/permissions.ts` & `permissionsLoader.ts`):
   - Multi-tier permission evaluation: `allow` (read-only/safe), `ask` (destructive write/command), `deny` (sandbox violation).

---

## 2. Concrete Work Breakdown Structure (WBS)

### Step 1: File Mutation Concurrency & Lock Management
- **Target**: `packages/ts-shell/src/tools/concurrency/fileMutationQueue.ts`
- **Implementation**: Realpath-normalized path-keyed Promise chain mutex matching Pi's architecture.

### Step 2: Fine-grained Permission & Trust Policy Engine
- **Target**: `packages/ts-shell/src/core/shell/approval/`
- **Sub-modules**:
  1. `approval/types.ts`: Formal definitions for `PermissionBehavior` (`allow` | `ask` | `deny`), `PermissionRuleSource`, and `ApprovalEvaluation`.
  2. `approval/evaluator.ts`: Rule-matching engine against tool names, paths, and bash command patterns.
  3. `approval/store.ts`: Thread-safe persistence of user trust decisions and grant scopes.
  4. `approvalTrustPolicy.ts`: Lightweight backward-compatible facade ($\le 20$ functions).

### Step 3: Modular Tool Batch Dispatcher
- **Target**: `packages/ts-shell/src/tools/dispatch/`
- **Sub-modules**:
  1. `dispatch/types.ts`: Clean interfaces for `ToolBatchDispatchPlan`, `ToolDispatchPlanCall`, and `ToolResultDetail`.
  2. `dispatch/planner.ts`: Plan preparation, argument safety sanitization, and dependency ordering.
  3. `dispatch/executor.ts`: Execution orchestrator leveraging `fileMutationQueue` for path-safe concurrency.
  4. `dispatch/projector.ts`: Mapping tool outcomes to verifiable runtime receipts and metadata.
  5. `toolBatchDispatch.ts`: Lightweight backward-compatible facade ($\le 20$ functions).

---

## 3. Measurable Acceptance & Verification Criteria
1. **Zero Type Errors**: `npm run build:ts` cleanly builds CLI binary (`dist/cli.js`).
2. **100% Test Green**: All existing unit tests pass via `vitest run`.
3. **NormProof Compliance**:
   - `normproof judge` continues to show `0` blocking obligations.
   - Proof gap count reduces from 30 to **28** (`toolBatchDispatch.ts` and `approvalTrustPolicy.ts` both brought under 20 functions).
4. **Audit & Log**: Formal updates in `.normproof/dispositions.md` and `.wiki/log.md`.

# Goal: Phase 3 Deepening - Special Battle 2: Multi-File Mutation Graph & Per-File Patch Planning

## Strategic Intent & Context
In **Special Battle 2** of Phase 3, we modernize the code mutation subsystem:
1. **Multi-File Mutation Planning & Conflict Detection** (`packages/ts-shell/src/edit/multifile/model.ts` - 39 functions):
   - Modularize multi-target conflict detection, dependency graph construction, and settlement ordering.
2. **Per-File Patch Planning & Verification** (`packages/ts-shell/src/edit/patch/plan/perFile.ts` - 38 functions):
   - Decompose operation validation (Add, Update, Move, Delete), broad patch heuristics, and failure taxonomy.
3. **Fuzzy Diff Normalization** (Inspired by `pi`'s `edit-diff.ts`):
   - Unicode space/quote normalization, line ending resilience (`\r\n` vs `\n`), and span reanchoring.

---

## 1. Concrete Work Breakdown Structure (WBS)

### Step 1: Fuzzy Diff Normalization & Line Span Utilities (Inspired by `pi`)
- **Target**: `packages/ts-shell/src/edit/patch/normalization/diffNormalize.ts`
- **Implementation**: NFKC normalization, smart quote/dash normalization, line-ending preservation.

### Step 2: Modular Multi-File Mutation Graph
- **Target**: `packages/ts-shell/src/edit/multifile/`
- **Sub-modules**:
  1. `multifile/types.ts`: Formal interfaces for `MultiTargetMutationPlan`, `MultiTargetConflict`, `MultiTargetExecutionGroup`.
  2. `multifile/conflict.ts`: Path collision, range overlap, and stale read detection.
  3. `multifile/graph.ts`: Dependency graph builder and topological execution group scheduler.
  4. `multifile/model.ts`: Facade wrapper retaining backward compatibility ($\le 20$ functions).

### Step 3: Modular Per-File Patch Planning
- **Target**: `packages/ts-shell/src/edit/patch/plan/`
- **Sub-modules**:
  1. `patch/plan/types.ts`: Typed operations for file patch mutations (Add, Update, Delete, Move).
  2. `patch/plan/operation.ts`: Individual operation validators and path resolution.
  3. `patch/plan/validator.ts`: Broad patch detection, mixed-operation support checks, and structured failure classes.
  4. `patch/plan/perFile.ts`: Facade wrapper retaining backward compatibility ($\le 20$ functions).

---

## 2. Measurable Acceptance & Verification Criteria
1. **Zero Type Errors**: `npm run build:ts` builds CLI binary cleanly.
2. **100% Test Green**: All vitest unit tests pass.
3. **NormProof Compliance**:
   - `normproof judge` continues with 0 blocking obligations.
   - Proof gap count reduces from 28 to **26** (`multifile/model.ts` and `patch/plan/perFile.ts` brought under 20 functions).
4. **Audit & Log**: Formal updates in `.normproof/dispositions.md` and `.wiki/log.md`.

# Goal: Phase 3 Deepening - Special Battle 4: Planning Runtime, Proposal Calibration & Dynamic Retry

## Strategic Intent & Context
In **Special Battle 4** of Phase 3, we modernize the planning runtime and proposal generation subsystem:
1. **Planning Runtime Engine** (`packages/ts-shell/src/planning/runtime/engine.ts` - 27 functions):
   - Decompose task classification, target selection, verification intent summarization, and handoff facts builder.
2. **Proposal Calibration & Retry** (`packages/ts-shell/src/planning/runtime/proposal.ts` - 28 functions):
   - Decompose prompt context builder, attempt preflight classification, contract retry logic, and dry-run execution.
3. **Autonomous Task Progression Loop (Inspired by `mini-swe-agent`)**:
   - Environment-gated step progression and structured failure classification.

---

## 1. Concrete Work Breakdown Structure (WBS)

### Step 1: Modular Planning Engine
- **Target**: `packages/ts-shell/src/planning/runtime/`
- **Sub-modules**:
  1. `planning/runtime/types.ts`: Clean interfaces for `EvidenceBoundPlanStep`, `PlanningRuntimeResult`, `PlanningEditHandoffFacts`.
  2. `planning/runtime/classifier.ts`: Task kind hint classification, readonly task detection, and unsupported operation detection.
  3. `planning/runtime/handoff.ts`: Edit and verification handoff fact builders.
  4. `planning/runtime/engine.ts`: Lightweight backward-compatible facade ($\le 20$ functions).

### Step 2: Modular Proposal Calibration & Contract Retry
- **Target**: `packages/ts-shell/src/planning/runtime/proposal/`
- **Sub-modules**:
  1. `proposal/context.ts`: Prompt context preparation, workspace content bounding, and label normalization.
  2. `proposal/attempt.ts`: Live provider attempt preflight, dry-run failure classification, and contract retry heuristics.
  3. `planning/runtime/proposal.ts`: Lightweight backward-compatible facade ($\le 20$ functions).

---

## 2. Measurable Acceptance & Verification Criteria
1. **Zero Type Errors**: `npm run build:ts` cleanly builds CLI binary (`dist/cli.js`).
2. **100% Test Green**: All vitest unit tests pass.
3. **NormProof Compliance**:
   - `normproof judge` continues with 0 blocking obligations.
   - Proof gap count reduces from 28 to **26** (`planning/runtime/engine.ts` and `proposal.ts` brought under 20 functions).
4. **Audit & Log**: Formal updates in `.normproof/dispositions.md` and `.wiki/log.md`.

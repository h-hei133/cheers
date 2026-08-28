# Goal: Phase 3 Deepening - Special Battle 3: Terminal Surface & Streaming Componentization

## Strategic Intent & Context
In **Special Battle 3** of Phase 3, we modernize the terminal presentation and surface modeling subsystem:
1. **Terminal Presentation Model** (`packages/ts-shell/src/presentation/surface/model.ts` - 51 functions):
   - Modularize section formatting, event stream classification, status severity evaluation, and view model projection.
2. **Terminal Componentization (Inspired by `pi`'s `packages/tui`)**:
   - Introduce structured terminal widgets: status indicator badge, stream spinner, and box container formatting.

---

## 1. Concrete Work Breakdown Structure (WBS)

### Step 1: Terminal Component Primitives (Inspired by `pi`)
- **Target**: `packages/ts-shell/src/presentation/components/`
- **Sub-modules**:
  1. `components/statusBadge.ts`: Colored ANSI status badge with severity mapping (`info`, `success`, `warning`, `error`).
  2. `components/box.ts`: Text border frames, spacers, and structured terminal layout helpers.

### Step 2: Modular Surface Section Builders
- **Target**: `packages/ts-shell/src/presentation/surface/sections/`
- **Sub-modules**:
  1. `sections/types.ts`: Clean definitions for `ProductSurfaceSection`, `ProductSurfaceFact`, `ProductSurfaceViewModel`.
  2. `sections/events.ts`: Event section builders (tool outcome, controlled invocation, model boundary, mutation recovery).
  3. `sections/status.ts`: Severity and status evaluation helpers (repair, verdict, verification, context planning).
  4. `sections/layout.ts`: Section aggregation and view model projection pipeline.
  5. `presentation/surface/model.ts`: Lightweight backward-compatible facade ($\le 20$ functions).

---

## 2. Measurable Acceptance & Verification Criteria
1. **Zero Type Errors**: `npm run build:ts` cleanly builds CLI binary (`dist/cli.js`).
2. **100% Test Green**: All existing unit tests pass via `vitest run`.
3. **NormProof Compliance**:
   - `normproof judge` continues to show `0` blocking obligations.
   - Proof gap count reduces from 28 to **27** (`presentation/surface/model.ts` brought under 20 functions).
4. **Audit & Log**: Formal updates in `.normproof/dispositions.md` and `.wiki/log.md`.

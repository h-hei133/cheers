# Main Path Boundary Extraction Plan

## 1. Total Goal

This branch incrementally extracts stable responsibility boundaries from the three largest TypeScript control-plane files while preserving behavior:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/session/SessionManager.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`

The goal is not a rewrite. Each checkpoint must migrate one clear responsibility into a named module, keep user-visible behavior unchanged, run focused validation, and commit independently.

## 2. Current Branch

- Branch: `refactor-main-path-boundaries`
- Base direction: continue from `6ecacaf Extract continue shell action runtime`.
- Push status may depend on remote trust/approval policy; do not bypass a rejected push.

## 3. Current Stage Judgment

The project is in a usable MVP / hardening phase. The main path exists, but three files still absorb too much product semantics. The highest-value work is behavior-preserving boundary extraction around pure helpers, renderers, mappers, shell action runtimes, summary builders, and contract helpers.

This branch directly supports the main-path stage by making these user-facing paths easier to verify and change safely:

1. CLI startup/session state surface.
2. Resume/continue continuity.
3. Unified prompt execution.
4. Explicit approval UX.
5. Terminal result and persisted state.
6. Durable continuation after interruption.

## 4. Completed Checkpoints

- Done: continue/resume shell action runtime extraction.
  - Commit: `6ecacaf Extract continue shell action runtime`
  - New module: `packages/ts-shell/src/core/shell/continueShellActionRuntime.ts`
  - Behavior: `/continue`, `/resume`, stopped guidance, continuation prompt, and auto-resume paths preserved.
- Done: CLI startup surface renderer extraction.
  - Commit: reported in final status for this checkpoint.
  - New module: `packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts`
  - Modified files:
    - `packages/ts-shell/src/entrypoints/cli.tsx`
    - `packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
    - `rtk npm run verify:cli-entry`
  - Behavior: startup banner, workspace binding lines, root binding diagnostics, recovery hint, runtime line, and startup next actions preserved.
- Done: CLI print prompt handling extraction.
  - Commit: reported in final status for this checkpoint.
  - New module: `packages/ts-shell/src/core/shell/printPromptInput.ts`
  - Modified files:
    - `packages/ts-shell/src/entrypoints/cli.tsx`
    - `packages/ts-shell/src/core/shell/printPromptInput.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
    - `rtk npm run verify:cli-entry`
  - Behavior: stdin transport mode resolution, non-interactive prompt batching, transport prompt parsing, fenced prompt detection, and multiline literal detection preserved.
- Done: CLI approval prompt renderer extraction.
  - Commit: reported in final status for this checkpoint.
  - New module: `packages/ts-shell/src/core/shell/approvalPromptRenderer.ts`
  - Modified files:
    - `packages/ts-shell/src/entrypoints/cli.tsx`
    - `packages/ts-shell/src/core/shell/approvalPromptRenderer.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
    - `rtk npm run verify:cli-entry`
  - Behavior: approval header, approval facts, and approval audit evidence rendering preserved; approval policy, trust cache, readline prompt, and persistence decisions remain in `cli.tsx`.

## 5. Three-File Responsibility Map

### `cli.tsx`

Current responsibilities:

- CLI process entry, argument parsing, environment/runtime bootstrapping.
- Interactive readline lifecycle and non-interactive `--print` execution.
- stdin transport detection, prompt batching, prompt normalization.
- Slash command routing and shell action bridging.
- Startup surface rendering, session list/current/switch UI, workspace root diagnostics.
- Approval prompt rendering and non-interactive approval mode materialization.
- MCP control-plane rendering.
- Runtime/session object wiring into `ShellSessionRuntime`.

### `SessionManager.ts`

Current responsibilities:

- Session CRUD and metadata/state/transcript persistence.
- Current session pointer selection and project-root rebinding.
- Durable lifecycle reconciliation and transcript repair.
- Resume, replay plan, runtime state seed construction.
- Continuity snapshot/context construction.
- Compact summary merging and handoff summary extraction.
- Approval and permission memory extraction.
- Recovery trust-boundary evaluation.
- Atomic JSON file writes and transient IO handling.

### `runMvpIntegratedFlow.ts`

Current responsibilities:

- Main orchestration loop across planner/coder/reviewer-like roles.
- Request intent detection and workflow task planning.
- Tool lifecycle dispatch and tool result normalization.
- Read/inspect/explain delivery.
- Mutation instruction planning, edit repair, and verification continuation.
- Verification failure classification and next-action mapping.
- Result aggregation, terminal contract assembly, action result seed/evidence formatting.
- Approval authority and permission-request subject helpers.
- Provider adapter selection and synthetic response helpers.

## 6. Responsibilities That Should Stay In Place

### `cli.tsx`

Keep:

- Process-level entrypoint and command-line option parsing.
- Top-level interactive/non-interactive routing.
- Readline lifecycle, prompt refresh, and final process exit behavior.
- Runtime object construction and wiring between `SessionManager`, `ShellSessionRuntime`, renderer, logger, and gateway.

Why: these are entrypoint side effects and coordination points. Moving them early would make behavior harder to verify.

### `SessionManager.ts`

Keep:

- Actual session persistence writes.
- Current pointer mutation and durable selection state.
- Session lifecycle state transitions.
- Atomic write and transient IO handling.

Why: these are durable boundaries. They should only move after pure summary/replay helpers are isolated and covered.

### `runMvpIntegratedFlow.ts`

Keep:

- The main orchestration loop.
- Provider/model adapter wiring.
- Tool execution sequencing.
- Role transition and high-level workflow control.

Why: this is the cross-module control-flow spine. Extract pure helpers first; do not split the state machine first.

## 7. Responsibilities That Should Move Out

### CLI Candidates

- Startup surface renderer -> `packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts`
- stdin / print prompt handling -> `packages/ts-shell/src/core/shell/printPromptInput.ts`
- approval prompt rendering -> `packages/ts-shell/src/core/shell/approvalPromptRenderer.ts`
- slash action shell bridge -> `packages/ts-shell/src/core/shell/shellActionBridge.ts`

### Session Candidates

- continuity summary formatter -> `packages/ts-shell/src/session/continuityFormatter.ts`
- replay plan pure helper -> `packages/ts-shell/src/session/replayPlanBuilder.ts`
- compact summary formatter -> `packages/ts-shell/src/session/compactSummaryFormatter.ts`
- current session pointer validation helper -> `packages/ts-shell/src/session/currentSessionSelection.ts`

### Orchestration Candidates

- verification result aggregation helper -> `packages/ts-shell/src/orchestration/verificationResultAggregation.ts`
- mutation result aggregation smaller follow-up -> `packages/ts-shell/src/orchestration/mutationResultAggregation.ts`
- tool lifecycle event formatter/helper -> `packages/ts-shell/src/orchestration/toolLifecycleEvents.ts`
- action result seed/evidence formatter -> `packages/ts-shell/src/orchestration/actionResultEvidence.ts`

## 8. Responsibilities Not Suitable For Near-Term Extraction

- Provider/auth/model configuration and credential resolution.
- Real user config, key, auth, or provider home handling.
- MCP routing/auth core.
- Session persistence engine, current pointer mutation engine, and atomic IO writes.
- Full runMvp orchestration state machine.
- Full edit/patch/apply_patch/fuzzy replace/batch/rollback systems.
- QueryEngine/queryLoop, terminalClassification, and release-core sealed paths.

Reason: these are high-blast-radius boundaries or explicitly out of scope. They should not be moved as part of early refactor checkpoints.

## 9. Target Module Layout

Recommended layout:

- `packages/ts-shell/src/core/shell/`
  - shell action runtimes
  - startup renderers
  - prompt input batching
  - approval prompt renderers
- `packages/ts-shell/src/session/`
  - pure continuity formatters
  - replay plan builders
  - compact summary helpers
  - current session selection validators
- `packages/ts-shell/src/orchestration/`
  - verification aggregation helpers
  - mutation aggregation helpers
  - tool lifecycle event helpers
  - action result evidence helpers

Keep TypeScript imports ending in `.js`.

## 10. Checkpoint Backlog

### CLI Direction

- Done: continue/resume shell action runtime extraction.
- Done: startup surface renderer extraction.
- Done: stdin / print prompt handling extraction.
- Done: approval prompt rendering extraction.
- Backlog: slash action shell bridge extraction.

### SessionManager Direction

- Backlog: continuity summary formatter extraction.
- Backlog: replay plan pure helper extraction.
- Backlog: compact summary formatter extraction.
- Backlog: current session pointer validation helper extraction.

### runMvpIntegratedFlow Direction

- Backlog: verification result aggregation helper extraction.
- Backlog: mutation result aggregation smaller follow-up extraction.
- Backlog: tool lifecycle event formatter/helper extraction.
- Backlog: action result seed/evidence formatter extraction.

## 11. Allowed Files Per Checkpoint

Each checkpoint may modify only the source file being thinned, the new extracted module, and directly related focused tests if needed.

### CLI Startup Surface Renderer

Allowed:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/core/shell/startupSurfaceRenderer.ts`
- `packages/ts-shell/src/cli-baseline.test.ts` only if a focused regression is needed.

### CLI stdin / print prompt handling

Allowed:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/core/shell/printPromptInput.ts`
- `packages/ts-shell/src/cli-baseline.test.ts`

### CLI approval prompt rendering

Allowed:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/core/shell/approvalPromptRenderer.ts`
- existing approval-focused tests only if behavior is touched.

### CLI slash action shell bridge

Allowed:

- `packages/ts-shell/src/entrypoints/cli.tsx`
- `packages/ts-shell/src/core/shell/shellActionBridge.ts`
- `packages/ts-shell/src/cli-baseline.test.ts`

### Session continuity / replay / compact helpers

Allowed:

- `packages/ts-shell/src/session/SessionManager.ts`
- one new module under `packages/ts-shell/src/session/`
- `packages/ts-shell/src/session/SessionManager.test.ts` only if needed.

### runMvp helper extraction

Allowed:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- one new module under `packages/ts-shell/src/orchestration/`
- focused `runMvpIntegratedFlow.test.ts` tests only if needed.

## 12. Validation Commands Per Checkpoint

Always run:

```powershell
rtk git status --short
rtk npm run build -w packages/ts-shell
```

For CLI checkpoint:

```powershell
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"
rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
rtk npm run verify:cli-entry
```

For SessionManager checkpoint:

```powershell
rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts
```

For runMvp checkpoint:

```powershell
rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "<focused pattern>"
```

If a checkpoint touches result/failure contract:

```powershell
rtk npm run verify:result-contract
```

Do not run release-core or synthetic golden by default unless the checkpoint touches release-sensitive wiring or accumulated production-path changes require it.

## 13. Failure Handling Rules

If validation fails:

- First determine whether the failure was introduced by the checkpoint.
- If it cannot be proven pre-existing, treat it as a checkpoint regression.
- Choose exactly one:
  - Fix within the same bounded surface.
  - Shrink the extraction and keep a smaller passing checkpoint.
  - Revert the checkpoint completely.
- Do not leave uncommitted failing code for a later round.

If build fails:

- Stop expanding immediately.
- Fix type/import/circular dependency issues.
- Re-run build.
- If unresolved, revert the checkpoint.

If extraction creates circular dependencies:

- Narrow the new module API.
- Pass callbacks instead of importing entrypoint-only functions.
- Revert if the dependency boundary remains unclear.

## 14. Commit And Push Rules

- One checkpoint per commit.
- Do not mix planning, CLI extraction, SessionManager extraction, and runMvp extraction in one commit.
- Commit only after validation passes.
- Do not commit audit residue, RTK history changes, real provider config, temporary homes, or unrelated generated files.
- Suggested planning commit message: `Plan main path boundary extraction`
- Suggested extraction commit messages:
  - `Extract CLI startup surface renderer`
  - `Extract CLI print prompt handling`
  - `Extract session continuity formatter`
  - `Extract verification result aggregation helper`
- If push fails due to auth, network, permissions, or policy review, do not retry through a workaround. Record commit hash, failure reason, and current git status.

## 15. Current Recommended Next Step

Do not start a second production-code checkpoint in the same commit.

Next implementation checkpoint should be:

- `Extract CLI slash action shell bridge`

Why:

- It continues thinning `cli.tsx`.
- It targets shell-action dispatch glue after the smaller CLI render/input/continue boundaries have moved out.
- It keeps slash parsing, prompt execution, session/runtime wiring, and action implementations in their current modules unless the bridge can delegate to existing helpers.
- It can be validated by build, `cli-baseline` print focused tests, continue focused tests, and `verify:cli-entry`.

Default stop condition for the next checkpoint:

- If slash action bridge extraction requires changing slash command semantics, prompt execution, approval behavior, session selection, or MCP control-plane behavior, stop and choose a smaller bridge-only slice.

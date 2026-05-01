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
  - Commit: `0a8ecec Extract CLI startup surface renderer`
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
  - Commit: `1b065ce Extract CLI print prompt handling`
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
  - Commit: `41b83b5 Extract CLI approval prompt renderer`
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
- Done: CLI slash action shell bridge extraction.
  - Commit: `ad2b1da Extract CLI slash action shell bridge`
  - New module: `packages/ts-shell/src/core/shell/shellActionBridge.ts`
  - Modified files:
    - `packages/ts-shell/src/entrypoints/cli.tsx`
    - `packages/ts-shell/src/core/shell/shellActionBridge.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"`
    - `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"`
    - `rtk npm run verify:cli-entry`
  - Behavior: shell-action type guards and non-interactive interactive-only blocker surface preserved; sessions/workspace/MCP/help/view/agent/permission action implementations remain in `cli.tsx`.
- Done: session continuity formatter extraction.
  - Commit: `e74dfd2 Extract session continuity formatter`
  - New module: `packages/ts-shell/src/session/continuityFormatter.ts`
  - Modified files:
    - `packages/ts-shell/src/session/SessionManager.ts`
    - `packages/ts-shell/src/session/continuityFormatter.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell`
    - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
  - Behavior: prompt continuity context text formatting preserved; session persistence, current pointer mutation, replay seed construction, and durable lifecycle state remain in `SessionManager.ts`.
- Done: session replay plan helper extraction.
  - Commit: `554713c Extract session replay plan helper`
  - New module: `packages/ts-shell/src/session/replayPlanBuilder.ts`
  - Modified files:
    - `packages/ts-shell/src/session/SessionManager.ts`
    - `packages/ts-shell/src/session/replayPlanBuilder.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 52 tests)
  - Behavior: replay message mapping, continuation prompt selection, assistant sentinel requirement, and replay repair-summary merge preserved; transcript loading, transcript repair, turn pairing, runtime seed construction, persistence, and current pointer mutation remain in `SessionManager.ts`.
- Done: session compact summary formatter extraction.
  - Commit: `3fbbc93 Extract session compact summary formatter`
  - New module: `packages/ts-shell/src/session/compactSummaryFormatter.ts`
  - Modified files:
    - `packages/ts-shell/src/session/SessionManager.ts`
    - `packages/ts-shell/src/session/compactSummaryFormatter.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 52 tests)
  - Behavior: compacted continuity summary entry preservation, stale continuity key replacement, boolean approval persistence rendering, and handoff diagnostic summary lines preserved; auto-compact thresholding, working-memory mutation, approval memory extraction, handoff diagnostic construction, persistence, and durable lifecycle state remain in `SessionManager.ts`.
- Done: current session pointer validation helper extraction.
  - Commit: `3a4835e Extract current session selection helper`
  - New module: `packages/ts-shell/src/session/currentSessionSelection.ts`
  - Modified files:
    - `packages/ts-shell/src/session/SessionManager.ts`
    - `packages/ts-shell/src/session/currentSessionSelection.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 52 tests)
  - Behavior: current-session store shape parsing and resolution detail construction preserved; current pointer persistence, stale pointer cleanup, session loading, project-root normalization, project-root matching, and durable lifecycle state remain in `SessionManager.ts`.
- Done: verification result aggregation helper extraction.
  - Commit: `8a54ae9 Extract verification result aggregation helper`
  - New module: `packages/ts-shell/src/orchestration/verificationResultAggregation.ts`
  - Modified files:
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
    - `packages/ts-shell/src/orchestration/verificationResultAggregation.ts`
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "renders mutation verification delivery"` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 1 focused test)
    - Note: broad `-t "verification"` also ran and reached existing T10 old-failure coverage, with 4 unrelated status/classification failures; it was not used as this checkpoint gate because the extracted surface is the delivery helper.
  - Behavior: mutation delivery text for verification passed, blocked, failed, not-requested, skipped, no-change, and failed-file cases preserved; main orchestration loop, mutation execution, repair sequencing, actionable blocker taxonomy, terminal classification, provider/auth, and release-core wiring remain in `runMvpIntegratedFlow.ts`.
- Done: mutation result aggregation helper extraction.
  - Commit: `b8142a5 Extract mutation result aggregation helper`
  - New module: `packages/ts-shell/src/orchestration/mutationResultAggregation.ts`
  - Modified files:
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
    - `packages/ts-shell/src/orchestration/mutationResultAggregation.ts`
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "reconciles mutation summary"` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 1 focused test)
  - Behavior: mutation summary changed-file, failed-file, patch, evidence, and repair-note aggregation preserved, including duplicate suppression and partial-mutation blocker evidence; mutation execution, patch/apply behavior, repair sequencing, terminal classification, provider/auth, and release-core wiring remain in `runMvpIntegratedFlow.ts`.
- Done: tool lifecycle event helper extraction.
  - Commit: `d7a83c2 Extract tool lifecycle event helper`
  - New module: `packages/ts-shell/src/orchestration/toolLifecycleEvents.ts`
  - Modified files:
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
    - `packages/ts-shell/src/orchestration/toolLifecycleEvents.ts`
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "formats tool lifecycle events"` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 1 focused test)
  - Behavior: approval requested, tool started, approval resolved, and tool result event object construction preserved, including escalated-tool denial outcome mapping; tool dispatch ordering, permission behavior, tool execution, terminal classification, provider/auth, and release-core wiring remain in `runMvpIntegratedFlow.ts`.
- Done: action result seed/evidence helper extraction.
  - Commit: `b0822cc Extract action result evidence helper`
  - New module: `packages/ts-shell/src/orchestration/actionResultEvidence.ts`
  - Modified files:
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
    - `packages/ts-shell/src/orchestration/actionResultEvidence.ts`
    - `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
    - `PLANS.main-path-boundaries.md`
  - Validation:
    - `rtk git status --short`
    - `rtk npm run build -w packages/ts-shell` (sandboxed write hit EPERM, escalated RTK rerun passed)
    - `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "formats action result seed"` (sandboxed esbuild spawn hit EPERM, escalated RTK rerun passed: 1 focused test)
  - Behavior: attempted-file extraction from evidence markers and action result seed target/changed/verified/verification normalization preserved; actionable blocker taxonomy, result/failure taxonomy, continuation policy, mutation behavior, repair sequencing, terminal classification, provider/auth, and release-core wiring remain in `runMvpIntegratedFlow.ts`.

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
- Done: slash action shell bridge extraction.

### SessionManager Direction

- Done: continuity summary formatter extraction.
- Done: replay plan pure helper extraction.
- Done: compact summary formatter extraction.
- Done: current session pointer validation helper extraction.

### runMvpIntegratedFlow Direction

- Done: verification result aggregation helper extraction.
- Done: mutation result aggregation smaller follow-up extraction.
- Done: tool lifecycle event formatter/helper extraction.
- Done: action result seed/evidence formatter extraction.

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

Current checkpoint:

- `Post-extraction audit and backlog refresh`
- Status: completed in this planning/audit checkpoint.
- Scope: no new extraction; review current responsibility map, run regression validation, update this plan.

Do not start a second production-code checkpoint in the same commit.

Next implementation checkpoint should be:

- `Merge review or main-path blocker reassessment`

Why:

- The originally planned CLI, SessionManager, and runMvp helper backlog is now complete.
- Further extraction should start from a fresh code-map review rather than continuing opportunistically.
- This audit did not find a refactor regression or a newly obvious low-risk extraction that should be started immediately.
- The next checkpoint should either prepare this branch for merge review or pivot back to the highest current main-path blocker with fresh evidence.

Default stop condition for the next checkpoint:

- If the next candidate requires changing public behavior, provider/auth, release-core, QueryEngine/queryLoop, terminal classification, mutation/edit capability, or durable session policy, stop and update the plan before implementing.

## 16. Post-Extraction Audit Refresh

Audit checkpoint:

- Commit: recorded in final status for `Audit main path boundary refactor`.
- Modified files:
  - `PLANS.main-path-boundaries.md`
- Production code changes: none.

Current code-map assessment:

- `cli.tsx` now keeps process entry, argument parsing, runtime/session/provider/bootstrap wiring, readline lifecycle, top-level interactive and `--print` routing, session/workspace/MCP command implementations, permission policy decisions, and process exit/error behavior.
- Extracted CLI modules have clear shell-layer boundaries:
  - `continueShellActionRuntime.ts` owns resume-like shell action execution and stopped guidance rendering.
  - `startupSurfaceRenderer.ts` owns startup and workspace binding text rendering.
  - `printPromptInput.ts` owns stdin transport mode and prompt batching/parsing helpers.
  - `approvalPromptRenderer.ts` owns approval header/fact/audit rendering.
  - `shellActionBridge.ts` owns shell-action type guards and the interactive-only blocker surface.
- `SessionManager.ts` now keeps durable session lifecycle, transcript/event persistence, current pointer mutation, recovery/replay orchestration, continuity snapshot construction, compact/working-memory state mutation, approval memory extraction, and atomic JSON IO.
- Extracted session modules have clear pure-helper boundaries:
  - `continuityFormatter.ts` formats prompt continuity context text.
  - `replayPlanBuilder.ts` maps a recovery snapshot into a replay plan.
  - `compactSummaryFormatter.ts` merges compact continuity summary entries.
  - `currentSessionSelection.ts` parses and formats current-session selection resolution details.
- `runMvpIntegratedFlow.ts` now keeps the main orchestration loop, planner/coder/reviewer-like role control, tool dispatch sequencing, provider/model adapter wiring, read/inspect/explain delivery, mutation/repair/verification workflow, permission authority resolution, and terminal/action-result assembly.
- Extracted orchestration modules have clear helper boundaries:
  - `verificationResultAggregation.ts` builds verification notes and mutation task delivery text.
  - `mutationResultAggregation.ts` reconciles mutation execution summaries into the aggregate.
  - `toolLifecycleEvents.ts` appends structured tool lifecycle query events.
  - `actionResultEvidence.ts` extracts attempted-file evidence and builds action result seeds.

Effect assessment:

- The original three files are still large, but the completed checkpoints removed stable renderer, formatter, mapper, event-construction, and aggregation responsibilities from their main control flow.
- No circular dependency was found by build.
- No old-path test import failure was found in the required regression set.
- The remaining complexity is mostly real orchestration or durable state responsibility, not just leftover helper code.
- Further extraction should not continue opportunistically; it should be driven by a fresh main-path blocker or merge-review feedback.

Audit verification:

- `rtk git status --short` passed before validation.
- `rtk npm run build -w packages/ts-shell` hit sandbox EPERM writing `dist`, then passed with the same RTK command outside the sandbox.
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 4 passed.
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "print"` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 4 passed.
- `rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts` hit sandbox esbuild spawn EPERM, then passed outside the sandbox: 29 passed.
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts -t "edit patch stopped failure recovery"` passed outside the sandbox: 1 focused test passed.
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "formats action result seed"` passed outside the sandbox: 1 focused test passed.
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts -t "partial failure summary"` passed outside the sandbox: 1 focused test passed.
- `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts` passed outside the sandbox: 6 passed.
- `rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts` passed outside the sandbox: 18 passed.
- `rtk npm run verify:result-contract` hit sandbox spawn EPERM, then passed outside the sandbox.
- `rtk npm run verify:cli-entry` hit sandbox EPERM writing `D:\Test\cli-entry-gate\fixture.txt`, then passed outside the sandbox.
- `HOME=D:\Test\pca-home-synth USERPROFILE=D:\Test\pca-home-synth PRIVATE_AGENTS_PROVIDER_MODE=synthetic rtk npm run test:gate:golden-main-path` passed outside the sandbox: 1 golden test passed.

Failure attribution:

- All validation failures seen in this audit were environment/sandbox issues: `dist` write EPERM, esbuild spawn EPERM, or `D:\Test` fixture write EPERM.
- No current-refactor regression was found.
- No test-maintenance failure from moved helper paths was found.
- No existing old broad-filter runMvp failure was used as a gate in this audit.

Backlog refresh:

- No new extraction backlog is added in this audit.
- Rationale: the originally planned stable helper backlog is complete, and the remaining obvious responsibilities are either core entrypoint wiring, durable session state, main orchestration state machine, provider/auth, MCP, terminal classification, or edit/patch capability surfaces.
- Recommended next step: stop the branch for merge review or return to a fresh user-minimal main-path blocker assessment before adding more refactor work.

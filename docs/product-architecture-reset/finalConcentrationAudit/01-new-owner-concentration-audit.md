# New Owner Concentration Audit

## Summary

The cleanup produced real facades for the old `runMvpIntegratedFlow.ts` and
`cli.tsx` files. It did not fully eliminate concentration. The highest-risk new
concentration points are now:

- `planning/workflowTaskPlan.ts`
- `runtime/workflowExecutionCoordinator.ts`
- `session/SessionManager.ts`

These do not represent an unacceptable architecture state, but they are enough
to make the final verdict PARTIAL. Phase 3 should finish one more grouped
implementation route before feature work resumes as the main track.

## File Judgments

### `planning/workflowTaskPlan.ts`

Classification: partial new monolith. Blocks Phase 3 completion.

Problematic responsibilities:

- intent-to-task selection
- continuation parsing and target rebinding
- repair-continuation planning
- cross-file repair candidate scoring
- context/read fragment carryover
- verification continuation selection
- browser plan detection
- degraded reopen checks
- evidence-string parsing

Legitimate responsibilities:

- public task-plan handoff
- task-kind selection
- target facts needed before execution
- blocked planning reasons
- branch selection inputs

Proposed owner destinations:

- `planning/intent` for prompt and task-kind classification
- `session/continuation` for continuation lineage and restored state facts
- `repair` for repair replan and cross-file repair candidate rules
- `context` for read-window and fragment carryover
- `verification` for verify-after-edit planning
- `core/context` or a browser facade for browser-specific plan detection

Required validation for a future route:

- focused `workflowTaskPlan` tests
- continuation/recovery tests touched by the extracted logic
- verification planning tests if verification rules move
- build for `packages/ts-shell`

### `runtime/workflowExecutionCoordinator.ts`

Classification: partial new monolith. Blocks Phase 3 completion.

Problematic responsibilities:

- integrated runner construction
- execution of task-plan branches
- mutation execution sequencing
- workspace authority wiring
- read/repo explain projection decisions
- cross-file repair handoff decisions
- low-risk verification semantics
- final evidence/result assembly

Legitimate responsibilities:

- public runtime entrypoint compatibility
- stream/result parity
- environment setup for the runtime route
- delegation to product-owned stages

Proposed owner destinations:

- `runtime` for the public coordinator and stream/result parity
- `edit` for mutation stage sequencing
- `verification` for verification-stage semantics
- `repair` for repair-stage handoff
- `context` for read/repo explain delivery
- `result` and `evidence` for final projection and truthfulness surfaces

Required validation for a future route:

- focused `workflowExecutionCoordinator` tests
- result mapper/result contract tests if result projection changes
- edit, verification, and repair stage tests for moved branches
- build for `packages/ts-shell`

### `session/SessionManager.ts`

Classification: compatibility facade plus partial monolith. Blocks Phase 3
completion only if no session extraction route is planned. It is acceptable as
a facade, but not as a long-term implementation owner.

Problematic responsibilities:

- durable store layout and file IO
- transcript append/read/repair
- session recovery eligibility
- replay plan/read-model assembly
- runtime seed construction
- continuity projection
- approval audit memory
- presentation-adjacent summaries

Legitimate responsibilities:

- compatibility constructor and public session facade
- current session selection entrypoints
- lifecycle method compatibility
- stable type exports for existing callers

Proposed owner destinations:

- `session/store`
- `session/transcript`
- `session/recovery`
- `session/replay`
- `session/continuation`
- `session/approval`
- `session/presentation`
- `session/schema`

Required validation for a future route:

- focused `SessionManager` tests
- continuation and recovery tests
- CLI session tests if callers change
- build for `packages/ts-shell`

### `cli/bootstrap/cliProcessRunner.ts`

Classification: acceptable process coordinator. Safe to leave.

It owns process-level composition after `entrypoints/cli.tsx` became an
executable shim. At 167 lines it is not a replacement monolith. Its risk is
dependency direction: it still imports several `entrypoints/cli*` compatibility
modules through adjacent CLI modules. That is a compatibility debt, not a
current blocker.

### `cli/runtime/cliSessionRuntimeFactory.ts`

Classification: acceptable factory. Safe to leave.

It centralizes session runtime creation with low line count and clear purpose.
It still imports `CliOptions` from `entrypoints/cliArgs.ts`, which should later
move to a CLI-owned options contract.

### `cli/interactive/interactiveCommandRouter.ts`

Classification: acceptable router with compatibility debt. Safe to leave.

It is not large enough to be a monolith, but it has broad fan-out and imports
multiple `entrypoints/cli*` compatibility modules. Future CLI cleanup should
move those command surfaces behind `cli/commands` or `cli/runtime` contracts.

### `cli/interactive/interactiveLoop.ts`

Classification: acceptable loop coordinator. Safe to leave.

It owns readline loop mechanics and delegates command routing. No Phase 3
blocker found.

### `session/continuation/sessionContinuitySnapshot.ts`

Classification: acceptable projection owner, watch. Safe to leave.

At 274 lines and fan-out 19 it is a real continuation projection owner. It is
not yet a monolith, but it sits close to truthfulness-sensitive session
projection and should not absorb replay, recovery, or result mapping.

### `result/workflowRuntimeProjection.ts`

Classification: acceptable projection. Safe to leave.

It is a small result projection owner and should remain separate from execution
stage control.

### `verification/verificationStage.ts`

Classification: acceptable stage facade. Safe to leave.

It keeps verification execution behind a focused stage surface.

### `edit/mutationRuntimeStage.ts`

Classification: acceptable stage facade. Safe to leave.

It is small and has moderate fan-in, which is expected for an edit stage.

### `repair/crossFileRepairStage.ts`

Classification: acceptable repair stage, watch. Safe to leave.

It is 321 lines and should not absorb broader verification or mutation
semantics, but current size and fan-out do not make it a replacement monolith.


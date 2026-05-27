# Reset Route E: Turn Kernel Compatibility Extraction

## Goal

Introduce a product turn facade that lets the oversized integrated flow shrink safely.

This route must not attempt a full rewrite of `runMvpIntegratedFlow.ts`. It creates a compatibility extraction seam first.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- thin product turn facade
- capability execution handoff types
- evidence/result handoff adapter
- focused tests proving no behavior change
- small compatibility shims around existing integrated flow

Not allowed:

- broad rewrite of `runMvpIntegratedFlow.ts`
- route-title rename of the file as a standalone move
- provider/edit/verification feature changes
- session schema changes
- CLI UX redesign

## Required Subagents

1. Turn flow subagent
   - inspect `runMvpIntegratedFlow.ts`, flowDispatch, product runtime invocation, result handoff.
2. Capability facade subagent
   - inspect current provider/proposal/edit/verification/repair facades and identify handoff seam.
3. Result/session audit subagent
   - check terminal/result/session truthfulness after facade introduction.

## Phases

### Phase 1: Turn responsibility audit

Map responsibilities currently inside the integrated flow:

- input/task classification
- context/planning
- provider/proposal
- edit/apply
- verification
- repair
- tool/browser/MCP
- result handoff
- session output

Identify which can be delegated to facades already created by Reset Routes B-D.

### Phase 2: Product turn facade

Create or strengthen a facade that represents:

- turn input
- workspace/session context
- capability decision
- capability result/evidence
- final result handoff

This facade may wrap the existing integrated flow initially.

### Phase 3: Compatibility adapter

Use the facade from product entrypoints or tests without changing behavior.

Keep old imports working.

### Phase 4: Focused extraction

Move only small, obvious projection logic behind the facade if safe.

Do not move large branches yet.

### Phase 5: Regression tests

Run focused tests covering current product path behavior and result/session truthfulness.

## Completion Criteria

This route is `COMPLETE` only if:

- a product turn facade exists or is clearly strengthened
- product entry or tests can call through the facade
- existing behavior remains preserved
- integrated flow concentration is reduced by at least a small seam, or a clear extraction seam is established
- no broad rewrite occurred
- no result/session truthfulness regression occurred

## Validation

Run as applicable:

- focused `runMvpIntegratedFlow` tests
- product path smoke tests
- result/session tests
- result contract
- build if TS product code changed
- diff check and status

## Stop Conditions

Stop if:

- extraction requires session schema migration
- product behavior changes unexpectedly
- integrated flow rewrite becomes broad
- result/session truthfulness changes without coverage

## Final Checkpoint Report

Report:

1. Final status
2. Turn facade introduced
3. Responsibilities still inside integrated flow
4. Responsibilities delegated
5. Compatibility shims
6. Tests run
7. Remaining turn-kernel debt
8. Whether safe to continue to Reset Route F

## Next Route

Continue to:

`reset-route-f-session-cli-presentation-split.md`

# Reset Route D: Edit/Verification/Repair Facades

## Goal

Make edit, verification, and repair communicate through stable product facades.

This route does not expand edit power. It stabilizes boundaries between write authority, apply/readback, verification receipts, and repair iteration.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- edit operation facade
- verification receipt facade
- repair iteration facade
- compatibility adapters for current controlled edit, verification, and repair routes
- focused tests preserving current behavior

Not allowed:

- broad edit expansion
- fuzzy apply
- rollback
- production default write
- arbitrary shell expansion
- repair automation without confirmation
- behavior change hidden inside facade migration

## Required Subagents

1. Edit facade subagent
   - inspect controlledEditOperationRoute, patchResult, patchApplication, workspace authority.
2. Verification facade subagent
   - inspect taskRelevantVerificationRoute, verification planner/runner, receipts, classifier.
3. Repair facade subagent
   - inspect verificationRepairIterationFlow and repair-to-success evidence.
4. Safety audit subagent
   - verify authority, stale-read, verification, and repair semantics do not weaken.

## Phases

### Phase 1: Boundary audit

Map current edit/verification/repair call chains and identify deep imports or implicit coupling.

### Phase 2: Edit facade

Expose stable edit operations through a product facade:

- supported operation classification
- authority requirement
- apply status
- readback status
- changed/failed/unattempted files
- snapshot/recovery availability
- not-proven claims

### Phase 3: Verification facade

Expose stable verification through a product facade:

- verification plan
- selected command
- relevance/coverage
- authority requirement
- dispatch status
- runtime receipt
- failure class
- not-proven claims

### Phase 4: Repair facade

Expose stable repair iteration through a product facade:

- original failure
- repair proposal source
- confirmation source
- repair apply status
- post-repair verification status
- retry/stop status
- final repair verdict

### Phase 5: Compatibility adapters

Adapt current Route227D/E/F-era product modules to the facades without changing behavior.

### Phase 6: Focused regression tests

Cover:

- apply requires authority
- stale-read/readback semantics remain
- verification selected-not-run is not success
- repair proposal is not success
- repair success requires re-verification
- partial failure cannot become success

## Completion Criteria

This route is `COMPLETE` only if:

- edit, verification, and repair facades exist or are clearly strengthened
- current controlled edit/update/create/multi-file paths still pass
- current task-relevant verification behavior remains truthfully classified
- current repair-to-success behavior remains preserved
- no new writer or broad edit behavior appears
- no false-success rule is weakened

## Validation

Run as applicable:

- workspace write/edit tests
- verification tests
- repair tests
- result contract
- build if TS product code changed
- diff check and status

## Stop Conditions

Stop if:

- write authority is weakened
- stale-read or readback check is bypassed
- verification failure becomes success
- repair proposal/continuation becomes success
- facade extraction requires broad behavior change

## Final Checkpoint Report

Report:

1. Final status
2. Edit facade summary
3. Verification facade summary
4. Repair facade summary
5. Compatibility adapters
6. Safety semantics preserved
7. Tests run
8. Remaining boundary debt
9. Whether safe to continue to Reset Route E

## Next Route

Continue to:

`reset-route-e-turn-kernel-compatibility-extraction.md`

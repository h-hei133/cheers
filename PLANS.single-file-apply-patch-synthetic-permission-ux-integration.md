# single-file apply_patch synthetic permission UX integration

## Decision

Add synthetic fixture coverage for the single-file `apply_patch` explicit
permission UX real-route seam.

This step validates pending, denied, and blocked permission states through the
existing terminal/session safe surface without production write wiring.

## Boundary

The integration uses temporary synthetic fixtures only. It proves:

- `pending` remains permission-pending and stopped/no-write
- `denied` remains no-write and never becomes approved-to-write
- stale-read or blocked preview state remains blocked before writer reachability
- default production `apply_patch` and unified diff rejection remains unchanged
- fixture snapshots are unchanged before/after each route

## Explicit non-goals

- No writer invocation.
- No production write.
- No CLI, SessionManager, `runMvpIntegratedFlow`, resultMapper, or
  sessionRuntime production logic changes.
- No real provider execution in this step.
- No multi-file/add/delete/move/AST/fuzzy/rollback support.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticPermissionUxIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxRealRouteSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next pointer

Next step: real-provider permission UX no-write gate. It must run only after
this synthetic integration passes, with explicit real-provider opt-in,
isolated fixture/home, redaction checks, and repository cleanliness checks.

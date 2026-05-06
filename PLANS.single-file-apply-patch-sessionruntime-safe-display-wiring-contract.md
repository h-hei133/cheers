# single-file apply_patch sessionRuntime safe display wiring contract

## Decision

Add a contract-only sessionRuntime display seam for the single-file
`apply_patch` route.

This step does not modify `sessionRuntime.ts`, `resultMapper.ts`, CLI,
SessionManager, `runMvpIntegratedFlow`, provider/auth, release gates, or any
writer. Production `apply_patch` and unified diff rejection remains unchanged.

## Boundary

The seam accepts only `SingleFileApplyPatchResultMapperSeamContract`. It is a
display-only projection for future sessionRuntime wiring and deliberately does
not consume raw permission metadata, raw writer boundary contracts, base
content, or production write readiness objects.

## Contract

The seam emits:

- `source="single-file-apply-patch-sessionruntime-safe-seam"`
- `displaySafe=true`
- `consumesResultMapperSeam=true`
- `displayStatus="dry-run" | "blocked" | "permission-pending"`
- `changedDisplay="none"`
- `mutationSuccessDisplayed=false`
- `writeSuccessDisplayed=false`
- `approvedDisplayed=false`
- `appliedPatchDisplayed=false`
- `rawPermissionMetadataDisplayed=false`
- `rawBaseContentDisplayed=false`
- `productionWriteReadyDisplayed=false`
- `nextAction` and `doNext` preserved

## Required Proofs

- Dry-run renders as preview-only, not mutation success.
- Blocked states render as blocked before write and retain next action.
- Permission-pending renders as waiting for permission without showing a grant.
- Preview targets appear only in would-change / preview fields.
- Serialized display output does not contain base content, approved/write-success
  markers, mutation-success markers, applied patch markers, or
  production-write-ready markers.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeDisplay.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next Step

Proceed to the result/session safe wiring blocker summary. Production wiring
remains blocked until a separate review approves touching real resultMapper or
sessionRuntime production logic.

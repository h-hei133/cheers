# single-file apply_patch write decision gate contract

## Decision

Add a short-named contract helper for the single-file `apply_patch` write
decision gate.

The helper defines the only contract-level transition into
`approved-for-write`. It does not call a writer, does not wire production
`apply_patch`, and does not change default `apply_patch` / unified diff
rejection behavior.

## Boundary

The gate accepts:

- explicit permission UX output
- `explicitApprovedForWrite`
- digest-only base evidence
- stale-read precondition metadata
- optional prompt text for negative proof

It emits:

- `status="pending"|"denied"|"blocked"|"approved-for-write"`
- `finalStaleReadRequiredAfterApproval=true`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- no applied patch record
- no mutation or write success claim

## Required proofs

- Prompt text cannot infer approval.
- Approval metadata and dry-run success do not authorize write.
- Pending, denied, and blocked states cannot become write authorization.
- `approved-for-write` requires explicit input, prepared permission UX evidence,
  digest-bound base evidence, and stale-read precondition metadata.
- Final stale-read remains required after approval and before any writer call.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/writeDecisionGate.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxContract.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchFinalStaleRead.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchWriterBoundary.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next step

Proceed to a synthetic isolated write lane. Production write remains blocked
outside an explicit fixture-only gate.

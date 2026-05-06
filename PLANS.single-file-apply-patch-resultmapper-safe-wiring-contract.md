# single-file apply_patch resultMapper safe wiring contract

## Decision

Add a contract-only resultMapper production seam for the single-file
`apply_patch` route.

This step does not modify `resultMapper.ts`, `sessionRuntime.ts`, CLI,
SessionManager, `runMvpIntegratedFlow`, provider/auth, release gates, or any
writer. Production `apply_patch` and unified diff rejection remains unchanged.

## Boundary

The seam accepts only `SingleFileApplyPatchResultMapperConsumerContract`, which
is already built from the mapper-safe runtime bridge projection. It deliberately
does not accept raw approval metadata, base content, dry-run internals, writer
boundary contracts, or production writer objects.

## Contract

The seam emits:

- `source="single-file-apply-patch-resultmapper-safe-seam"`
- `inputKind="mapper-consumer-contract"`
- `seamSafe=true`
- `status="dry-run-ready" | "blocked" | "permission-pending"`
- non-success terminal classification
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `patchesApplied=false`
- `verificationPassed=false`
- `taskSatisfied=false`
- raw approval metadata / raw base content / raw writer boundary accepted flags
  set to false
- preview targets only in attempted / would-change / preview fields
- actionable `nextAction` and `doNext`

## Required Proofs

- Dry-run-ready maps through resultMapper as stopped, not success.
- Stale-read and target-missing blockers preserve actionable next action.
- Permission-pending remains non-success and does not imply a permission grant.
- No changed files, write intents, applied patch, verification pass, or task
  satisfaction leaks through the seam.
- Serialized seam output does not contain base content, approved/write-success
  markers, mutation-success markers, or production-write-ready markers.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperConsumer.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRuntimeBridge.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next Step

Proceed to the sessionRuntime display seam contract. Production wiring remains
blocked until a separate review approves touching real resultMapper or
sessionRuntime production logic.

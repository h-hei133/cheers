# single-file apply_patch synthetic opt-in dry-run integration

## Decision

Add a synthetic integration test for the production-adjacent opt-in dry-run
route.

This step remains synthetic/test-only. It does not modify CLI, SessionManager,
`runMvpIntegratedFlow`, `resultMapper.ts`, `sessionRuntime.ts`, provider/auth
core, release gates, or writer code.

## Fixture Boundary

The test creates a temporary fixture under the OS test temp directory and reads
files through the route's `readFile` callback. It does not use real provider
home, real auth, real provider config, or repository files as the mutation
target.

## Contract

The synthetic integration proves:

- explicit opt-in dry-run route can parse and verify a single Update File patch
- digest-only base evidence is captured without exposing base content
- stale-read revalidation reaches `contract-ready` for unchanged content
- requested approval remains permission-pending, not write authorization
- terminal surface, runtime bridge, resultMapper seam, and sessionRuntime seam
  all consume no-write safe projections
- fixture snapshots are identical before and after route execution
- default production apply_patch / unified diff rejection still holds outside
  the opt-in dry-run route

## Required Invariants

- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- no applied patch record
- no mutation success
- no terminal/session success claim
- no writer import or invocation

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSyntheticOptInDryRunIntegration.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchOptInDryRunRoute.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next Step

Plan and add the real provider non-mutating dry-run gate. The gate must remain
explicit opt-in and can only validate provider-facing no-write dry-run surface,
not production write.

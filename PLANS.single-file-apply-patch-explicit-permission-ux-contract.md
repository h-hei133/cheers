# single-file apply_patch explicit permission UX contract

## Decision

Add a contract-only helper at the patchResult layer for the single-file
`apply_patch` explicit permission UX path.

This step does not wire production write, does not invoke a writer, and does not
change the current production `apply_patch` / unified diff rejection behavior.

## Boundary

The helper accepts dry-run or terminal-safe preview context, digest-only
`baseEvidence`, approval metadata, a requested user decision, and the stale-read
precondition. It projects those inputs into a no-write permission contract:

- `permissionDecision="pending"|"denied"|"blocked"`
- `approvalReady=false`
- `approvalTokenPrepared=true` may indicate an explicit approval request was
  captured against digest evidence, but it is not write authorization
- `writeIntent.authorized=false`
- `writeIntent.count=0`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `doesNotClaimProductionWriteReady=true`

## Required proofs

- Approval is not inferred from prompt text or keywords.
- Requested `approved` does not create an authorized write intent.
- Missing base evidence blocks the permission path.
- Missing stale-read precondition blocks the permission path.
- Base content is never exposed; only digest evidence is surfaced.
- Pending, denied, and blocked states are not production-write-ready.

## Explicit non-goals

- No CLI, resultMapper, sessionRuntime, runMvp, or writer wiring.
- No production write decision gate.
- No multi-file/add/delete/move support.
- No change to production `apply_patch` or unified diff rejection.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxContract.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/permissionMetadataBinding.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRuntimeBridge.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next pointer

Next contract-only step: final stale-read revalidation before write. That step
must remain no-write and writer-unreachable until separately approved.

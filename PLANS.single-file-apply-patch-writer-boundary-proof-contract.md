# single-file apply_patch writer boundary proof contract

## Decision

Add a contract-only writer boundary proof helper for the single-file
`apply_patch` route.

This step defines the only writer reachability preconditions while deliberately
keeping `writerReachable=false`. It does not import or call the writer and does
not change the current production `apply_patch` / unified diff rejection
behavior.

## Boundary

The helper accepts:

- explicit permission UX contract result
- final stale-read preflight result
- optional single-file update intent candidate
- optional unsupported operation marker

It projects those inputs into:

- `writerReachable=false`
- `writerReachabilityReason`
- `blockedBy="permission"|"final-stale-read"|"unsupported-operation"|"not-production-wiring"`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`

## Required proofs

- Permission pending without prepared approval, denied, or blocked keeps writer
  unreachable.
- Final stale-read `stale-read` / `target-missing` keeps writer unreachable.
- Multi-file/add/delete/move operations keep writer unreachable.
- Even when permission and final stale-read prerequisites pass, writer remains
  unreachable because production wiring is not approved in this phase.
- No applied patch record, write success, changed file, or write intent leaks.
- Existing production `apply_patch` / unified diff rejection remains unchanged.

## Explicit non-goals

- No writer invocation.
- No `singleFileUpdateApply.ts` import/call or edit.
- No production lane wiring.
- No CLI, resultMapper, sessionRuntime, or runMvp changes.
- No multi-file/add/delete/move support.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchWriterBoundary.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchFinalStaleRead.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxContract.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Phase seal

When the validation above passes and the commit is clean, this Step 3 can be
sealed. The production write gate preconditions phase is then complete at
contract-only depth: explicit permission UX, final stale-read preflight, and
writer boundary proof are all represented without production write wiring.

Production write remains blocked until a new `$deep-interview` approves runtime
wiring or production write decision gate work.

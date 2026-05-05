# single-file apply_patch final stale-read before write contract

## Decision

Add a contract-only final stale-read preflight helper for the single-file
`apply_patch` route.

This is the step after explicit permission UX metadata is captured and before
any writer boundary. It proves the writer remains unreachable unless the final
read/digest comparison passes, and even a passing comparison is not production
write readiness in this phase.

## Boundary

The helper accepts:

- explicit permission UX contract result
- approval-bound digest-only `baseEvidence`
- `currentContent` or `currentDigest`
- `phase="final-write-preflight"`
- `writerCandidatePresent=true`

It projects those inputs into:

- `finalRevalidation="passed"|"blocked"`
- `blocker="stale-read"|"target-missing"|"permission-not-ready"|undefined`
- `writerReachable=false`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `doesNotClaimProductionWriteReady=true`

## Required proofs

- Unchanged current content passes final revalidation but is still not
  production-write-ready.
- Changed current content or digest blocks with `stale-read`.
- Missing current content blocks with `target-missing`.
- Permission pending without prepared approval, denied, or blocked cannot be
  upgraded into write readiness.
- A writer candidate being present does not make the writer reachable.
- Base content is not exposed; only digest evidence is surfaced.

## Explicit non-goals

- No writer call.
- No `singleFileUpdateApply.ts` change.
- No production lane wiring.
- No CLI, resultMapper, sessionRuntime, or runMvp changes.
- No change to production `apply_patch` / unified diff rejection.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchFinalStaleRead.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxContract.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchStaleRead.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Seal decision

This step can be sealed when all validation above passes and git status is
clean after commit. The next step remains contract-only writer boundary proof;
production write wiring still requires a separate review.

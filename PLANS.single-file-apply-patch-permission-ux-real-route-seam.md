# single-file apply_patch permission UX real-route seam

## Decision

Add a provider-facing and runtime-facing seam for the single-file `apply_patch`
permission UX path.

The seam consumes only the safe explicit opt-in dry-run route projection. It
does not consume raw provider metadata, raw approval metadata, raw base content,
or writer boundary objects.

## Boundary

The seam accepts:

- an explicit opt-in dry-run route result
- optional requested user decision: `pending`, `denied`, `blocked`, or
  `approved`

It projects those inputs into:

- `permissionStatus="pending"|"denied"|"blocked"`
- digest-bound base evidence status
- stale-read precondition status
- preview summary
- display-safe lines and actionable `nextAction` / `doNext`
- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `noWriterInvoked=true`
- `noAppliedPatchRecord=true`

Requested `approved` is still not write authorization. It may only preserve
that the permission UX has enough digest-bound evidence to request or record
approval before a later final stale-read decision.

## Required proofs

- Pending permission remains stopped/no-write and does not claim success.
- Denied permission remains stopped/no-write and preserves an actionable denial
  next step.
- Rejected or blocked route results cannot enter write readiness.
- Requested approval does not create a write intent or writer reachability.
- No raw provider metadata, approval metadata, base content, or writer boundary
  object is accepted by the seam.

## Explicit non-goals

- No CLI, SessionManager, `runMvpIntegratedFlow`, resultMapper, or
  sessionRuntime production logic changes.
- No writer import or invocation.
- No production write wiring.
- No change to default production `apply_patch` / unified diff rejection.
- No multi-file/add/delete/move/AST/fuzzy/rollback support.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxRealRouteSeam.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchPermissionUxContract.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchOptInDryRunRoute.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next pointer

Next step: synthetic permission pending/denied integration through terminal and
session safe surfaces, still no-write and no production write gate.

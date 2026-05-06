# Single-file apply_patch production opt-in no-write runtime route

## Scope

Step 1 adds an independent runtime-facing no-write seam for single-file `apply_patch`.
It does not wire production writes, does not call the writer, and does not change the
default production `apply_patch` or unified diff rejection behavior.

## Route Shape

- Input: `workspaceRoot`, `rawPatchText`, `readFile`, `runtimeSource`, optional
  `explicitRuntimeOptIn`, and optional `requestedUserDecision`.
- Non-opt-in: returns `rejected` before reads, with `willWrite=false`,
  `changedFiles=[]`, `writeIntents=[]`, `noWriterInvoked=true`, and
  `noAppliedPatchRecord=true`.
- Opt-in: composes the existing opt-in dry-run route and permission UX real-route
  seam, then returns only a safe runtime projection.

## Safety Boundary

- Output statuses are limited to `permission-pending`, `denied`, `blocked`, or
  `rejected`.
- `approved` permission metadata is not write authorization.
- The seam does not expose raw provider metadata, raw approval metadata, raw base
  content, or writer boundary objects.
- Terminal classification remains `stopped`; mutation/write success is not claimed.

## Validation

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/noWriteRuntimeRoute.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchOptInDryRunRoute.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts`
- `rtk npm run build -w packages/ts-shell`
- `rtk git status --short`

## Next

Step 2 should add a synthetic CLI/runtime no-write integration that proves the
runtime path reaches the safe no-write surface with the fixture unchanged.

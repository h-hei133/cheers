# Single-file apply_patch synthetic runtime no-write integration

## Scope

Step 2 validates the no-write runtime route with a temporary synthetic fixture.
It proves the runtime-facing path can reach permission-pending or denied output
without invoking a writer or changing fixture contents.

## Fixture

- A temporary workspace under the OS temp directory contains `src/app.ts`.
- The route receives a single-file `*** Update File` apply_patch preview.
- `readFile` is constrained to the temporary fixture.
- No write callback is provided or reachable.

## Acceptance

- Explicit runtime opt-in returns `permission-pending` with terminal
  classification `stopped`.
- Denied permission returns `denied`, also `stopped`.
- Non-opt-in returns `rejected` before reads.
- `willWrite=false`, `changedFiles=[]`, `writeIntents=[]`,
  `noWriterInvoked=true`, and `noAppliedPatchRecord=true`.
- The fixture file remains unchanged.
- Default production apply_patch and unified diff rejection stays unchanged.

## Validation

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/syntheticRuntimeNoWrite.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/noWriteRuntimeRoute.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts`
- `rtk npm run build -w packages/ts-shell`
- `rtk git status --short`

## Next

Step 3 should add a real-provider no-write runtime smoke using explicit opt-in,
isolated test home/root, readiness preflight, redaction check, and repo clean
proof.

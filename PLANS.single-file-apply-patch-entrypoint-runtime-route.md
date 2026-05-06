# Single-file apply_patch entrypoint runtime route

Status: explicit CLI / `runMvpIntegratedFlow` no-write entrypoint wired; real workspace writes remain disabled.

## Scope

This phase adds a narrow entrypoint for a raw single-file `apply_patch` Update
File payload to enter the runtime from CLI / `runMvpIntegratedFlow` only when an
explicit runtime opt-in is present.

It reads the selected workspace to build the existing no-write runtime
projection, then maps that safe projection through the normal result/session
terminal surface. It does not call the writer and does not enable default
production `apply_patch`, unified diff, multi-file, add, delete, move, AST,
fuzzy patching, rollback, release/default gates, or real-user workspace writes.

## Implemented Boundaries

- `runtimeRouteResult.ts` maps the no-write runtime route into an
  `OrchestrationResult`.
- `runMvpIntegratedFlow` accepts `applyPatchRuntimeRoute` and short-circuits to
  the no-write route only when the option is provided.
- CLI accepts `--apply-patch-runtime-route` as an explicit no-write entrypoint.
- `--non-interactive-approval allow-once|allow-always` is recorded only as a
  requested approval signal; it still does not authorize a write.
- `--non-interactive-approval deny` projects denial without writing.

## Required Evidence

- default CLI / runtime behavior is unchanged when the flag/option is absent
- explicit runtime opt-in is required
- raw prompt approval is ignored for write authorization
- requested approval stays permission-pending and no-write
- denied / blocked / rejected states stay stopped, not success-like
- `changedFiles=[]`, `writeIntents=[]`, no writer invocation, and no applied
  patch record remain preserved
- selected workspace files are unchanged by the CLI entrypoint
- result/session output consumes safe projection only

## Validation

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/runtimeRouteResult.test.ts src/orchestration/patchResult/noWriteRuntimeRoute.test.ts src/orchestration/runMvpIntegratedFlow.test.ts -t "apply_patch"`
- `rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "explicit apply_patch CLI"`
- `rtk npm run build -w packages/ts-shell`

## Next Boundary

Real-user workspace writes remain blocked. The next review must define the
explicit write UX, durable state implications, abort/rollback behavior, and
real-workspace writer boundary before any route can call a writer outside an
isolated fixture.

# single-file apply_patch resultMapper consumer contract

## Goal

Add a contract-only resultMapper consumer boundary for the single-file
`apply_patch` dry-run path.

This route proves that the existing runtime bridge projection can be converted
into mapper-safe input for `mapTerminalToOrchestrationResult()` without turning
`dry-run-ready`, `blocked`, or `permission-pending` into mutation success.

## Boundary

- Add only patchResult-layer adapter/test coverage.
- Do not modify `packages/ts-shell/src/core/query/resultMapper.ts`.
- Do not modify `packages/ts-shell/src/core/shell/sessionRuntime.ts`.
- Do not wire CLI, `runMvpIntegratedFlow`, or production writes.
- Do not call the writer.
- Keep production `apply_patch` / unified diff rejection unchanged.

## Contract

The adapter consumes `SingleFileApplyPatchRuntimeBridge` and emits a
mapper-ready contract shape with:

- `willWrite=false`
- `changedFiles=[]`
- `writeIntents=[]`
- `patches[].status !== "applied"`
- `verification.status !== "passed"`
- `taskSatisfaction.verdict !== "satisfied"`
- preview targets only in `attemptedFiles` / evidence, never `changedFiles`
- stale-read / target-missing / permission-pending `nextAction` and `doNext`
  preserved

The test intentionally feeds resultMapper a nominally completed terminal input
and verifies the truthful terminal is downgraded to a non-success stopped state.

## Open-source alignment

The route follows the boundary idea seen in Claude Code / Opencode-style
systems: internal metadata, runtime projections, and user-visible results stay
separate; preview/pending/blocked states are not mutation success.

It does not import or copy their edit engines, patch engines, rollback, AST, or
runtime/session architecture.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperConsumer.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchRuntimeBridge.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next route

If this contract passes without changing resultMapper production logic, proceed
to the sessionRuntime display contract as a separate commit.

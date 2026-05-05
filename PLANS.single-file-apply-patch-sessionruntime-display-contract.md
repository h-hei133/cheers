# single-file apply_patch sessionRuntime display contract

## Goal

Add a contract-only display boundary for the single-file `apply_patch` dry-run
path.

This route proves that future sessionRuntime/display code can consume only the
mapper-safe projection/resultMapper output and still present `dry-run-ready`,
`blocked`, and `permission-pending` states without claiming mutation success.

## Boundary

- Add only patchResult-layer display helper/test coverage.
- Do not modify `packages/ts-shell/src/core/shell/sessionRuntime.ts`.
- Do not modify `packages/ts-shell/src/core/query/resultMapper.ts`.
- Do not wire CLI, `runMvpIntegratedFlow`, or production writes.
- Do not call the writer.
- Keep production `apply_patch` / unified diff rejection unchanged.

## Contract

The display helper consumes:

- `SingleFileApplyPatchResultMapperConsumerContract`
- `OrchestrationResult` produced by `mapTerminalToOrchestrationResult()`

It emits a sessionRuntime-display-safe shape with:

- `status="preview-dry-run" | "blocked" | "pending-approval"`
- `changedFiles=[]`
- `changedFilesLabel="none"`
- preview targets only in `wouldChangeFiles` / `previewChangedFiles`
- permission decision limited to `pending | blocked | denied`
- write intent `authorized=false`, `count=0`
- stale-read / target-missing / permission-pending blocker details with
  actionable `nextAction` / `doNext`
- no base content
- no applied patch, write-success, mutation-success, or production-write-ready
  display marker

## Open-source alignment

The route follows the same boundary idea used by Claude Code / Opencode-style
systems: internal metadata, mapper/runtime projection, and user-visible display
stay separate; stopped/blocked/pending are not edit success.

It does not import or copy their edit engines, patch engines, rollback, AST, or
runtime/session architecture.

## Validation

```bash
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchSessionRuntimeDisplay.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/singleFileApplyPatchResultMapperConsumer.test.ts
rtk npm run test -w packages/ts-shell -- src/orchestration/patchMutationLane.test.ts
rtk npm run build -w packages/ts-shell
rtk git status --short
```

## Next route

If this contract passes without changing sessionRuntime production logic,
proceed to the pre-production blocker summary as a separate commit.

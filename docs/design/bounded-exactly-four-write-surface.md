# Bounded Exactly-Four Write Surface

Status: Route 64 implemented for selected-workspace exactly-four update,
mixed, delete-only, and move-only batches. This is not broad `apply_patch`,
5+ writes, automatic recovery, atomic rollback, provider/session/CLI/MCP
behavior, package-script, or default-gate readiness.

Route 65 note: the active bounded policy now supports selected-workspace
2-8 update-only, mixed, delete-only, and move-only batches through a central
cap. This document remains the Route 64 exactly-four evidence record; use
`docs/design/bounded-small-n-write-policy.md` for the current cap-8 boundary.

## Post-Route 63 Baseline

Before Route 64, the project supported selected-workspace single
update/create/delete/move, exactly-two/exactly-three update,
exactly-two/exactly-three mixed, and exactly-two/exactly-three delete-only and
move-only batches. Route 63 left exactly-four and 5+ writes blocked.

## Bounded Reference Scan

Relevant reference files used for directional comparison:

- opencode, 4 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- gemini-cli, 3 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/shell.ts`
- ClaudeCode, 3 files:
  `/home/wang/projects/source-claudecode/utils/permissions/filesystem.ts`,
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`

Directional findings:

- Larger operation sets are only safe when permission/confirmation describes
  the affected path set, not just a generic edit request.
- Recovery/rollback claims depend on durable snapshot, checkpoint, or file
  history authority. Edit-result metadata alone is not restore authority.
- Broad patch machinery is separate from narrow file-edit tools in the
  references; this project should keep exactly-four as a bounded route, not an
  arbitrary-N parser or writer generalization.
- Partial failure must distinguish verified changed prefix from failed or
  unapplied suffix, and explicit restore must inspect current content before
  writing.

## Readiness Audit

The exactly-two/exactly-three update boundary lived in
`multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`, and
`perFilePatchPlan.ts`. The mixed and destructive count boundary lived in
`mixedFileWriteRoute.ts`, `mixedOperationReadiness.ts`, and
`perFilePatchPlan.ts`.

The audit passed for exactly-four because the existing architecture already
had:

- explicit approval over the route target list
- selected-workspace source/target authority checks
- final stale-read/preflight before any writer starts
- parsed-order sequential execution
- per-file or per-operation post-write verification
- stopped partial-failure result semantics with `changedFiles`, `failedFiles`,
  and `writeIntents`
- non-default recovery-authority capture before writer start
- explicit restore primitive drills with current-content guards

No broad parser rewrite, arbitrary-N writer, provider/session/CLI/MCP change,
default persistence, automatic recovery, or rollback was required.

## Implemented Surface

Route 64 enables:

- exactly-four existing-file update-only writes
- exactly-four mixed writes from update, add/create, delete, and move
- exactly-four delete-only batches
- exactly-four move-only batches

The implementation remains selected-workspace only. It preserves explicit
runtime opt-in, explicit workspace-write opt-in, approved user decision,
workspace authority for all source and target paths, final stale-read/preflight
before writer start, parsed-order sequential execution, post-write
verification, and stopped partial-failure semantics.

Non-default recovery-authority capture now covers exactly-four update, mixed,
delete-only, and move-only routes. Mixed and move-only operations capture move
source records and move-target absence records before writer start.

## Excluded Shapes

Still blocked:

- 5+ update, mixed, delete-only, and move-only writes
- broad arbitrary `apply_patch`
- directory delete or move
- overwrite move/create targets
- reused source/target paths, swaps, and cycles
- outside-workspace paths
- move-with-content-edit
- automatic recovery
- atomic rollback
- default durable persistence

## Restore Drills

Focused tests cover explicit restore after exactly-four partial failures:

- update-only: changed prefix records restore when current-content guard
  matches; hidden edits block restore.
- mixed: update/create/delete prefix records can be explicitly restored after
  a later move failure; no automatic rollback runs.
- delete-only: deleted prefix files restore only when the file is still absent;
  hidden recreation blocks restore.
- move-only: source and target records restore only when current source/target
  state matches; hidden target edits block restore.

All restore drills are explicit calls to the recovery primitive. Route results
do not execute recovery and do not claim rollback atomicity.

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/multiFileWriteRoute.test.ts src/orchestration/patchResult/mixedFileWriteRoute.test.ts src/orchestration/patchResult/perFilePatchPlan.test.ts src/orchestration/patchResult/mixedOperationReadiness.test.ts`
- `rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts src/orchestration/patchResult/multiFileUpdatePlanning.test.ts`

Batch validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult src/orchestration/patchRecovery`

## Next Decision

Do not jump directly to broad `apply_patch`. The next route should choose
between a 5-operation/small-N bounded write policy decision and user/session
explicit restore UX. Broad arbitrary `apply_patch` should stay delayed until
the project has a settled stance on larger write surfaces, destructive
approval semantics, durable authority, and user-visible recovery language.

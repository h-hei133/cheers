# Bounded Small-N Write Policy

Status: Route 65 implemented for selected-workspace bounded small-N update,
mixed, delete-only, and move-only batches with cap 8. This is not broad
`apply_patch`, 9+ writes, automatic recovery, atomic rollback,
provider/session/CLI/MCP, package-script, default-gate, or default persistence
readiness.

Route 67 note: parser-supported `apply_patch` payloads with 1-8 operations may
now be classified as bounded candidates and routed into these same guarded
lanes. This does not change the cap, writer semantics, recovery semantics, or
the unsupported status of broad arbitrary `apply_patch`.

## Post-Route 64 Baseline

Before Route 65, the selected-workspace write surface supported single
update/create/delete/move and exactly-two/exactly-three/exactly-four update,
mixed, delete-only, and move-only batches. Continuing count-by-count expansion
would have repeated the same safety proof for exactly-five and exactly-six
without improving the underlying boundary.

Route 65 replaces that exact-count policy with one central bounded policy:

- `MIN_MULTI_WRITE_OPERATIONS = 2`
- `MAX_BOUNDED_WRITE_OPERATIONS = 8`
- count 1 remains owned by existing single-file routes
- counts 2-8 are bounded multi-operation candidates
- counts 9+ remain unsupported/no-write

## Reference Scan

Files inspected:

- opencode, 4 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- gemini-cli, 2 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`
- ClaudeCode, 2 files:
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`

Directional findings:

- References do not rely on result metadata alone for recovery. opencode has a
  snapshot/revert service; ClaudeCode has file-history hooks; gemini-cli
  exposes edit/write tool result metadata separately from any checkpoint or
  restore authority.
- Multi-file or broad patch paths keep permission understandable by listing
  affected paths or rendering diffs before execution.
- Broad patch machinery is a different risk class from narrow file-edit tools.
  A local cap is the smallest equivalent that preserves understandable approval
  and recovery capture without claiming arbitrary patch readiness.
- Failed-before-apply and applied-but-unverified states must stay distinct.
  Restore remains explicit and guarded by current-content checks.

## Implemented Surface

Supported operation families, all selected-workspace only:

- update-only batches with 2-8 distinct existing regular files
- mixed batches with 2-8 operations from existing guarded kinds:
  update, add/create, delete, move
- delete-only batches with 2-8 distinct existing regular files
- move-only batches with 2-8 distinct existing sources and absent targets

All supported lanes preserve:

- explicit runtime opt-in and workspace-write opt-in
- explicit approval naming all affected paths
- workspace authority for every source and target path
- directory delete/move rejection
- overwrite, duplicate target, source/target reuse, swap, and cycle rejection
- final stale-read or final preflight before any writer starts
- non-default recovery-authority capture before writer start when supplied
- parsed-order sequential execution
- per-file/per-operation post-write verification
- `changedFiles`, `failedFiles`, `plannedFiles`, writer flags, and stopped
  partial-failure semantics
- no automatic recovery and no atomic rollback claim

## Excluded Shapes

Still unsupported:

- 9+ writes
- broad arbitrary `apply_patch`
- directory delete/move
- overwrite moves or creates
- duplicate source/target paths
- source/target cycles or swaps
- default durable recovery-authority storage
- automatic recovery executor
- atomic transaction rollback
- provider/session/CLI/MCP behavior changes
- package scripts and default gates

## Implementation Evidence

- Central policy:
  `packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts`
- Update-only routing/application:
  `multiFileWriteRoute.ts`, `multiFileUpdateApply.ts`,
  `multiFileUpdatePlanning.ts`
- Mixed/delete/move routing:
  `mixedFileWriteRoute.ts`, `mixedOperationReadiness.ts`
- Plan/result projection:
  `perFilePatchPlan.ts`, existing route result projectors
- Recovery drills:
  `multiFileWriteRoute.test.ts`, `mixedFileWriteRoute.test.ts`

Focused tests cover 5 and 8 supported cases, 9+ blocked cases, and
representative 8-operation partial-failure restore drills for update-only,
mixed, delete-only, and move-only lanes. Restore drills call the explicit
restore primitive after partial failure; no route invokes recovery
automatically.

## Next Decision Criteria

Do not continue count-by-count expansion. The next route should choose between:

- a larger-write readiness audit only if 9+ has a specific user-facing need and
  approval/recovery/result surfaces can still stay understandable; or
- user/session explicit restore UX, since recovery authority now exists only as
  non-default explicit capture and primitive execution.

Broad `apply_patch` should remain delayed until durable authority, destructive
approval semantics, partial failure recovery boundaries, and product restore UX
are explicit enough to support a much wider blast radius.

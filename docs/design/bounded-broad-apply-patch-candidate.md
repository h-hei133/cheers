# Bounded Broad Apply Patch Candidate

Status: Route 67 implemented for parser-supported bounded `apply_patch`
candidates that normalize to existing selected-workspace small-N write lanes.
This is not broad arbitrary `apply_patch`, 9+ writes, directory operations,
overwrite, fuzzy patch, automatic recovery, atomic rollback, provider/session/
MCP, package-script, default-gate, or default persistence readiness.

## Post-Route 66 Baseline

Route 65 established the bounded small-N write cap of 8 for update-only,
mixed, delete-only, and move-only selected-workspace operations. Route 66 made
captured non-default recovery authority user-operable through explicit restore
preview/execute surfaces. Before Route 67, broad arbitrary `apply_patch`
remained blocked even though several safe parser-supported multi-operation
payloads already mapped to guarded update/create/delete/move route semantics.

Route 67 adds only a candidate classification and routing layer. Existing
route implementations still own approval, workspace authority, stale-read or
final preflight, recovery-authority capture, writer execution, and result
projection.

## Bounded Reference Scan

Files inspected:

- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- gemini-cli, 3 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- ClaudeCode, 3 files:
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`

Directional findings:

- opencode parses apply_patch input into file-level add/update/delete/move
  hunks, builds per-file diff metadata for permission/result surfaces, asks
  edit permission over affected paths, then applies the parsed changes. Its
  session revert capability is separate and depends on snapshot authority.
- gemini-cli keeps edit/write confirmation and result metadata separate from
  checkpoint-backed restore. Restore is an explicit command surface.
- ClaudeCode backs edit/write with file-history snapshots and stale-read
  checks before write. Rewind relies on file-history authority rather than
  result metadata alone.

Local implication: the smallest safe equivalent is not a broad patch engine. It
is a bounded classifier that accepts only parser-supported 1-8 operations that
can be routed into current guarded write paths.

## Current Broad Apply Patch Blocker Audit

Current broad arbitrary diff input is rejected by the target parser before any
writer is reachable. Parser-supported operations are:

- `*** Update File`
- `*** Add File`
- `*** Delete File`
- `*** Update File` plus `*** Move to`

Existing safe route owners:

- single update/create/delete/move routes own count 1
- `multiFileWriteRoute.ts` owns update-only counts 2-8
- `mixedFileWriteRoute.ts` owns mixed, delete-only, and move-only counts 2-8
- `boundedWritePolicy.ts` blocks counts 9+
- `perFilePatchPlan.ts` projects supported, unsupported, and no-write planning
  facts
- route result modules attach journal/recovery-plan/recovery-surface metadata
  without changing changed/failed/planned result semantics

Selected-workspace authority is checked in route-specific write authority
calls. Approval naming happens inside the selected route. Recovery-authority
capture happens inside the route after final preflight and before the writer
starts when a non-default `recoveryAuthority` option is provided.

## Local Normalization Strategy

Route 67 adds:

- `patchResult/boundedApplyPatchCandidate.ts`
- `patchResult/boundedApplyPatchCandidate.test.ts`
- mutation routing through `classifyBoundedApplyPatchCandidate()`

The classifier is pure. It does not read files, write files, approve writes, or
execute recovery. It returns candidate metadata:

- operation count
- operation family: single, update-only, mixed, delete-only, move-only
- normalized operations: update, create, delete, move
- affected paths and approval paths
- unsupported reason and evidence

Supported candidate families:

- single update/create/delete/move routed to existing single-file routes
- 2-8 update-only routed to `multiFileWriteRoute`
- 2-8 mixed routed to `mixedFileWriteRoute`
- 2-8 delete-only routed to `mixedFileWriteRoute`
- 2-8 move-only routed to `mixedFileWriteRoute`

Unsupported shapes remain no-write:

- 9+ operations
- unified diff / arbitrary broad patch shapes
- parser-unsupported or fuzzy/ambiguous shapes
- directory delete/move by syntactic directory path
- source/target path reuse, swaps, cycles, and duplicate targets
- outside-workspace paths
- move-with-content-edit destructive shapes
- overwrite, still enforced by existing create/move authorities

## Runtime Semantics

The classifier only chooses an existing route. The route still enforces:

- explicit runtime opt-in
- explicit selected-workspace write opt-in
- explicit approved-for-write decision
- workspace containment and realpath authority
- final stale-read or preflight before writer start
- sequential write order
- per-file/per-operation post-write verification
- no automatic recovery
- no atomic rollback

No broad apply_patch success label is introduced. The supported claim is
bounded small-N apply_patch candidate routing.

## Result, Journal, Recovery, and Restore

Route 67 preserves current result fields from the underlying route:

- `changedFiles`
- `failedFiles`
- `plannedFiles`
- writer/creator/delete-move flags
- `postWriteVerification`
- success/stopped/error semantics

When a non-default recovery authority option is supplied, bounded candidates
reuse the existing pre-write capture in `workspace*Route.ts`,
`multiFileWriteRoute.ts`, and `mixedFileWriteRoute.ts`. Result projections may
surface `recoverySurface`, but route results still report
`recoveryExecuted=false`, `atomicRollbackAvailable=false`, and no automatic
recovery. Partial-failure restore evidence is explicit: tests call the restore
primitive after the stopped result and verify the current-content guard.

## Validation Evidence

Focused Route 67 validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/boundedApplyPatchCandidate.test.ts src/orchestration/mutationRoutingProjection.test.ts`

Final validation should also include:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult src/orchestration/patchRecovery`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

## Residual Risks and Next Direction

Residual risks:

- This is still not a broad arbitrary patch parser or fuzzy patch engine.
- Overwrite and actual directory status remain route-authority/preflight
  responsibilities, not pure classifier authority.
- Cap 8 remains the supported operation-count boundary.
- Larger destructive or arbitrary-N policies still need separate approval,
  recovery, and product-surface decisions.

Recommended next route: Route 68 should harden unsupported broad-shape UX and
classification if users need clearer explanations. A 9+ / arbitrary-N policy
decision should remain separate and should not proceed without a stronger
approval/recovery stance.

# Exactly-Three Mixed Write Implementation

Route baseline: Route 62
Date: 2026-05-15
Status: implemented bounded selected-workspace exactly-three mixed writes; no
broad `apply_patch`, 4+ mixed, automatic recovery, or atomic rollback.

## Post-Route 61 Baseline

Before Route 62, the project supported selected-workspace single
update/create/move/delete, exactly-two update, exactly-three update, and
exactly-two mixed write lanes. Route 59-61 also added explicit non-default
recovery-authority capture, guarded restore primitives, restore preview,
restore execution bridge, and recovery summary projection.

That baseline was intentionally not broad edit readiness. Default runtime
behavior still had no automatic recovery, no atomic rollback, no default
persistence, no provider/session/CLI/MCP restore behavior, and no broad
`apply_patch`.

## Bounded Reference Scan

Scan count:

- opencode: 5 files inspected.
- gemini-cli: 2 files inspected.
- ClaudeCode: 1 file inspected.
- Total external files inspected: 8.

Files inspected:

- `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`
- `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`
- `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- `/home/wang/projects/gemini-cli/packages/a2a-server/src/agent/task.ts`
- `/home/wang/projects/gemini-cli/packages/a2a-server/src/commands/restore.ts`
- `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`

Directional patterns:

- opencode accepts multi-hunk `apply_patch`, builds per-file metadata for
  permission, applies parsed changes sequentially, and keeps snapshot/revert
  authority in a separate service.
- opencode scopes edit/write/patch permission as edit permission over affected
  path patterns; destructive changes are still represented in the file-change
  metadata before write.
- gemini-cli writes checkpoint files before restorable file tools when
  checkpointing is enabled, then exposes restore as an explicit command.
- ClaudeCode validates edits against prior reads and current file state, and
  captures file history before write. Stale reads block rather than become
  recovery claims.

Local implication: Route 62 should copy the bounded per-file metadata,
pre-write authority capture, and parsed-order execution pattern. It should not
copy broad patch acceptance, default checkpointing, or user/session restore UX.

## Readiness Audit

- Recognition: `mixedFileWriteRoute.ts` previously recognized exactly-two
  mixed operations through `patchIsExactlyTwoMixedWriteFiles()`.
- Routing: `mutationRoutingProjection.ts` routed that shape to
  `runMixedFileWriteRoute()` only under selected-workspace write opt-in.
- Count limit: `mixedFileWriteRoute.ts` rejected anything other than exactly
  two mixed operations; `perFilePatchPlan.ts` represented larger mixed shapes
  as unsupported/no-write.
- Per-file plans: `perFilePatchPlan.ts` generated write intents for supported
  shapes and unsupported facts for broad/invalid/mixed-out-of-route shapes.
- Result fields: `mixedFileWriteResult.ts` consumed route `changedFiles`,
  `failedFiles`, write-intent files, writer flags, post-write verification,
  and journal failure projection.
- Recovery authority: `mixedFileWriteRoute.ts` captured records before any
  writer when explicit non-default `recoveryAuthority` was supplied.
- Partial failure: route results preserved verified changed prefix, failed
  operation, stopped terminal state, journal metadata, and plan-only recovery.

Audit result: no architectural blocker was found for exactly-three mixed when
bounded to the existing update/create/delete/move lanes. The blocker remains
for 4+ mixed, broad arbitrary `apply_patch`, directory operations, overwrite,
default persistence, automatic recovery, and atomic rollback.

## Implementation Decision

Route 62 enables exactly-three mixed writes only for selected-workspace
explicit write routing. The supported operation set is still the existing
narrow lanes:

- `Update File`
- `Add File`
- `Delete File`
- pure `Move File`

Supported exactly-three mixed combinations include distinct-path combinations
from those lanes, including:

- update + add + delete
- update + add + move
- update + delete + move
- add + delete + move
- repeated-kind mixed triples such as update + update + add, when the patch is
  still mixed and all source/target paths are distinct

Excluded:

- 4+ mixed operations
- broad arbitrary or unified-diff `apply_patch`
- same-family mixed-route use that belongs to existing update routes
- directory delete/move
- move-with-content-edit
- overwrite or reused source/target paths
- outside-workspace paths

Ordering remains parsed-order sequential execution after all preflight and
final stale-read checks pass. There is no atomic rollback claim.

## Route / Result / Recovery Notes

Changed code:

- `mutationRoutingProjection.ts` now dispatches two-or-three mixed write
  shapes to the guarded mixed route.
- `mixedFileWriteRoute.ts` accepts exactly two or exactly three bounded mixed
  operations, preserves parsed-order execution, captures all records before
  writer when explicit non-default recovery authority is supplied, and keeps 4+
  mixed blocked.
- `mixedFileWriteResult.ts` uses bounded mixed wording while preserving
  changed/failed/planned surfaces, writer flags, post-write verification, and
  stopped/success semantics.
- `perFilePatchPlan.ts` represents exactly-three mixed as supported write
  intents and keeps 4+ mixed unsupported/no-write.
- `mixedOperationReadiness.ts` identifies exactly-two/exactly-three mixed as
  route-enabled while still not granting write authority by projection alone.

Recovery behavior:

- Capture happens before any writer starts when `recoveryAuthority` is
  explicitly supplied.
- update/delete/move source records capture original content.
- create records capture before-state absent plus expected created content.
- restore remains explicit through the recovery primitive/bridge.
- route results keep `recoveryExecuted: false` through journal recovery plans.
- `rollbackAtomicityClaim` remains false.
- automatic recovery remains absent.

## Partial-Failure Restore Drills

Focused tests cover:

- update + add + delete partial failure after update/create, explicit restore
  of the changed prefix, and hidden-user-edit blocking for create restore.
- update + delete + move partial failure after update/delete, explicit restore
  of deleted content, and no atomic rollback claim.
- 4+ mixed blocked before writer with no default recovery-authority capture.

## Validation

Focused validation run:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/mixedOperationReadiness.test.ts src/orchestration/patchResult/perFilePatchPlan.test.ts src/orchestration/patchResult/mixedFileWriteRoute.test.ts src/orchestration/patchResult/mixedFileWriteResult.test.ts src/orchestration/mutationRoutingProjection.test.ts`
  - 5 files, 85 tests passed.

Final validation is recorded in the final Route 62 report.

## Residual Risks

- Exactly-three mixed remains sequential and non-atomic.
- Explicit restore is per-file/non-atomic and must be invoked separately.
- There is still no user/session restore command.
- 4+ mixed and broad `apply_patch` remain blocked because they increase
  ordering, destructive-operation, failure, and recovery surface area.

## Next Recommendation

Recommended next route: destructive multi-delete/multi-move readiness if the
project wants to expand destructive lanes, or user/session explicit restore UX
if operator visibility becomes the blocker. Broad `apply_patch` should remain
delayed until larger write surfaces and restore UX have explicit authority and
approval semantics.

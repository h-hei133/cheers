# Bounded Destructive Multi-Delete / Multi-Move

Status: Route 63 implemented selected-workspace exactly-two and exactly-three
delete-only and move-only batches. Route 64 later extended the same bounded
destructive surface to exactly-four delete-only and move-only batches. This is
not broad `apply_patch`, 5+ writes, automatic recovery, atomic rollback, or
default durable persistence readiness.

## Baseline

Post-Route 62 capability already supported single update/create/delete/move,
exactly-two/exactly-three update, and exactly-two/exactly-three mixed write
lanes. The remaining destructive gap was same-family multi-delete and
multi-move: the parser and verifier could represent the operations, and the
mixed route already had the right approval, authority, preflight, parsed-order
execution, partial-failure, journal, and recovery-plan surfaces, but it
intentionally rejected same-family destructive batches.

## Reference Scan

Bounded files inspected:

- opencode, 4 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- gemini-cli, 1 file:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`
- ClaudeCode, 1 file:
  `/home/wang/projects/source-claudecode/utils/permissions/filesystem.ts`

Directional findings:

- opencode builds per-file metadata for every apply_patch hunk, asks edit
  permission over the affected relative path set, applies changes sequentially,
  and keeps revert/restore authority in a separate snapshot subsystem.
- opencode snapshot restore/revert uses git-backed checkpoint authority before
  making recovery claims; edit-result metadata alone is not recovery authority.
- gemini-cli's edit tool is narrow file-edit oriented, with confirmation and
  current-content based replacement semantics rather than broad destructive
  batch rollback.
- ClaudeCode write permission checks are path-scoped and re-derive paths in the
  same frame to avoid stale permission decisions; broad destructive permission
  is not inferred from prompt text.

Local implication: Route 63 should copy the conceptual split, not code:
explicit approval over every affected path, pre-write authority facts before
the first writer, sequential execution with no rollback claim, and restore only
through explicit non-default authority.

## Implementation Decision

The smallest safe local equivalent was to extend the existing bounded
mixed-route safety skeleton to accept same-family destructive batches:

- exactly-two delete-only
- exactly-three delete-only
- exactly-two move-only
- exactly-three move-only

The route remains selected-workspace only and requires explicit runtime opt-in,
explicit workspace-write opt-in, and an approved user decision. Route 63
rejected:

- 4+ delete-only or move-only operations
- directory delete and directory move
- move overwrite / existing target
- duplicate delete targets
- duplicate move sources
- duplicate move targets
- source/target reuse, swaps, and cycles
- outside-workspace source or target paths
- move-with-content-edit in destructive move-only batches
- broad arbitrary `apply_patch`

Route 64 later opened exactly-four delete-only and move-only batches under the
same constraints. 5+ delete-only and move-only batches remain rejected.

## Route Semantics

Recognition and routing:

- `perFilePatchPlan.ts` now projects exactly-two/three delete-only and
  move-only batches as `supported-write` intents.
- `mixedFileWriteRoute.ts` accepts those same-family destructive shapes in
  addition to existing bounded mixed shapes.
- `mutationRoutingProjection.ts` reaches the route through the existing bounded
  route predicate after single delete/move and update routes are considered.

Approval and authority:

- Approval covers every destructive target path. For moves, the target path is
  the changed/write-intent path and source paths are still checked by route
  authority and conflict guards.
- `validateWriteTarget` is required for delete targets and move sources.
- `validateCreateTarget` is required for move targets.
- `directoryExists` rejects directory delete/move before any writer starts.

Preflight and execution:

- All source/target conflict checks run before approval-bound writing.
- All final preflight and stale-read checks run before the first writer.
- Writes execute in parsed patch order.
- Post-write verification runs per operation.
- Partial failure preserves verified prefix `changedFiles`, file-level
  `failedFiles`, `writeIntents`, `deleteMoveInvoked`, stopped terminal
  semantics, and no success claim.

Recovery authority:

- Non-default recovery-authority capture happens before any destructive writer.
- Delete records capture original content and expect the target to be absent
  after delete.
- Move-only batches capture source-exists records and target-absent records.
  The target record allows explicit restore to remove a move target when its
  current content still matches the expected moved content.
- Default execution does not persist recovery authority.

Restore drills:

- Delete partial-failure tests restore a verified deleted prefix file and prove
  hidden recreation blocks restore.
- Move coverage proves source and target recovery records are captured for
  move-only batches; explicit restore remains separate, per-file, and
  non-atomic.

## Residual Boundaries

Route 63 does not add automatic recovery, transaction rollback, snapshot/git
checkpoint integration, stale-read recovery, partial failure recovery, broad
`apply_patch`, provider/session/CLI/MCP behavior, package scripts, or default
gates. Route 64 adds exactly-four destructive batches only; 5+ delete-only and
move-only batches remain blocked.

## Next Direction

If the bounded destructive evidence stays stable, the next route can evaluate
5-operation/small-N bounded write policy. If operator recovery is the stronger
product blocker, prefer user/session explicit restore UX before widening the
write surface again.

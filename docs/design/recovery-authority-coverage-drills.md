# Recovery Authority Coverage Drills

Route baseline: Route 60
Date: 2026-05-15
Status: implemented explicit non-default recovery-authority coverage and restore drills.

This note records the Route 60 coverage expansion. It is not automatic
recovery, not rollback, and not a durable restore backend claim.

## Summary

Route 60 extended the Route 59 minimum recovery-authority loop across the
remaining narrow supported write surfaces:

- single move
- exactly-three update
- exactly-two mixed lanes where clean

It also added explicit partial-failure restore drills with current-content
guards. Recovery authority remains explicit, non-default, metadata-only,
non-durable, and non-automatic.

Route 62 later extended the mixed lane from exactly-two to exactly-three where
the same selected-workspace boundaries held.

Route 63 later extended the bounded destructive surface to exactly-two and
exactly-three delete-only and move-only batches. The same explicit non-default
authority boundary applies, with no automatic recovery or rollback.

Route 64 later extended the bounded surface to exactly-four update, mixed,
delete-only, and move-only batches, with matching non-default
recovery-authority capture and explicit partial-failure restore drills.

## Implementation Notes

- `packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts`
  captures non-default recovery authority for the guarded single move surface.
- `packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts`
  now captures exactly-three update records in addition to exactly-two update.
- `packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts`
  captures the supported exactly-two/exactly-three mixed lanes and the bounded
  exactly-two/exactly-three delete-only and move-only lanes where the route
  remains clean.
- `packages/ts-shell/src/orchestration/patchRecovery/restorePrimitive.ts`
  remains the explicit guarded restore entrypoint and still enforces
  current-state/current-content checks.

## Directional Comparison

The external references continue to support the same boundary:

- durable restore claims require durable authority, not result metadata alone.
- restore execution stays separate from edit-result diagnostics.
- broad write and recovery claims should remain gated until authority and
  lifecycle are explicit.

## Restore Drills

Focused tests now prove:

- exactly-three update partial failure can be restored one file at a time.
- exactly-two mixed partial failure can be restored one file at a time.
- representative exactly-three mixed partial failures can restore changed
  prefix files one file at a time.
- bounded destructive delete-only partial failure can restore a deleted prefix
  file one file at a time.
- bounded destructive move-only capture records source-exists and target-absent
  facts before the first move writer.
- exactly-four update, mixed, delete-only, and move-only partial failures keep
  explicit restore per-file and non-atomic.
- current-content mismatch blocks hidden-user-edit overwrite.
- rollbackAtomicityClaim stays false outside the route result.

The drills are explicit calls to the restore primitive after a partial failure.
They are not automatic recovery, not session lifecycle behavior, and not a
transactional rollback surface.

## Boundary

Still absent:

- durable journal storage
- recovery executor
- rollback executor
- snapshot/revert backend
- provider/session/CLI/MCP integration
- automatic recovery claim
- atomic rollback claim

## Route 61 Note

Route 61 built the operational explicit restore surface above these drills:

- authority inspection lists captured records under an explicit ledger root.
- restore preview checks current workspace state/content before any write.
- explicit restore execution bridge runs preview first and restores only
  eligible records through the existing primitive.
- recovery surface projection can describe captured authority without claiming
  automatic recovery, rollback, or route-result recovery execution.

The drills remain explicit. No default write route invokes restore
automatically, and no session/CLI lifecycle integration was added in this
route.

## Next Direction

Route 64 implemented bounded exactly-four write support. The next likely
development batch is a 5-operation/small-N bounded write policy decision if the
evidence remains stable, or a separate CLI/session restore UX route if
user-visible restore commands become the higher product priority.

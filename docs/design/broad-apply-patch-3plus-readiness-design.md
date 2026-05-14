# Broad apply_patch / 3+ Mixed Readiness Design

Route: 50
Date: 2026-05-14
Status: docs-first design only; no product code, test, script, package, gate,
provider, session, CLI, MCP, or readiness change

This document decides the next edit-capability expansion boundary after Route
48/49. It is based on the current target implementation, current design/status
docs, and a narrow read-only comparison with opencode, Gemini CLI, and Claude
Code. It does not implement broad `apply_patch`, 3+ mixed writes, rollback,
snapshot, journal, recovery, or readiness claims.

## 1. Executive Conclusion

Do not implement broad `apply_patch` writes or 3+ mixed writes as the next
route.

The next route should be **Route 51: rollback/snapshot/journal design,
docs-first**.

Rollback/snapshot is required before any broad `apply_patch` write lane and
before any 3+ mixed write lane. It is not required retroactively for the already
implemented bounded lanes, but it is the honest prerequisite for larger or more
destructive combinations because the current runtime only supports sequential
write effects with no rollback or atomicity claim.

The project may continue to use `perFilePatchPlan` for no-write planning and
result projection, but broad writes need a separate operation-evaluation and
recovery contract before a writer can become reachable.

## 2. Current Implemented Edit Surface

The current write surface is intentionally bounded:

- Selected-workspace single-file existing `Update File`.
- Selected-workspace single-file `Add File` create.
- Selected-workspace exactly-two existing-file `Update File`.
- Selected-workspace exactly-three existing-file `Update File`.
- Selected-workspace single-file move/rename.
- Selected-workspace single-file delete.
- Selected-workspace exactly-two mixed write lanes:
  - update + add
  - update + move
  - add + move
  - update + delete
  - add + delete
  - move + delete

The current projection infrastructure includes per-file patch planning/result
projection, unsupported route/result surfaces, planned-files continuity, and
route-specific changed/failed/planned file reporting. Existing write lanes use
explicit runtime opt-in, selected-workspace authority, explicit write approval,
route-owned preflight, route-owned final preflight/stale-read checks where
applicable, sequential writes, and post-write verification. They do not claim
rollback or atomicity.

## 3. Current Unsupported Surface

These remain unsupported and must stay no-write until a later route changes
them explicitly:

- 3+ mixed writes.
- Broad arbitrary `apply_patch` writes.
- 4+ writes.
- Broad unified diff writer.
- Multi-delete and multi-move beyond current exactly-two mixed lanes.
- Directory delete or directory move.
- Overwrite and outside-workspace operations.
- Rollback, atomicity, snapshot restore, or revert.
- Stale-read recovery.
- Partial failure recovery.
- Fuzzy patch recovery.
- Broad release readiness.
- Default real-provider readiness.
- Inferring write authorization from prompt text, dry-run, preview, or
  permission-pending state.

## 4. Broad apply_patch Risk Analysis

Broad `apply_patch` is not one capability. It combines parsing, planning,
authority, ordering, write application, post-write verification, result
projection, and recovery under one name. Treating it as a single writer would
create arbitrary mutation claims that the project cannot currently support.

The smallest broad `apply_patch` subset that could ever be safe is a
planning-only lane that accepts a broad patch, parses it into per-operation
facts, reports targets and blockers, and keeps `willWrite=false`. That lane can
improve evidence without making a writer reachable.

If writes are later considered, broad `apply_patch` must be split into lanes:

- planning-only broad patch inspection
- 3+ update-only writes
- 3+ mixed writes
- delete/move-heavy writes
- unified diff import/evaluation

Broad shapes that include directory operations, overwrite, outside-workspace
targets, duplicate/conflicting targets, move-with-content ambiguity,
delete-after-update ambiguity, multi-delete/multi-move destructive chains, or
unified diff semantics must remain blocked until rollback/snapshot exists. Some
shapes, such as outside-workspace operations and directory destructive
operations, should remain blocked even after rollback unless a separate
authority model is designed.

`perFilePatchPlan` is useful as a route/result projection surface. It should not
become the writer evaluator for broad apply_patch. A future write route needs a
separate evaluator that can prove per-operation authority, dependency ordering,
pre-write snapshots, rollback eligibility, and result mapping before invoking a
writer.

Broad writes cannot be allowed while still claiming "not arbitrary mutation"
unless every accepted shape has an explicit lane name, max operation count,
operation-family restrictions, per-operation authority, recovery behavior, and
dedicated evidence.

## 5. 3+ Mixed Write Risk Analysis

3+ mixed writes compound the current exactly-two mixed risks:

- More targets can be left in a partially changed state.
- Delete and move operations can remove the original source needed by later
  repair or user inspection.
- Operation ordering becomes semantically important, not just an
  implementation detail.
- Post-write verification failure can affect one target while previous targets
  already changed.
- Result surfaces must be able to distinguish verified changed files,
  verified missing/deleted files, failed files, planned files, and operations
  that were never attempted.

Sequential/no-rollback is acceptable for the already implemented bounded
lanes because each lane is explicitly narrow and its evidence names the no
rollback risk. It should not be extended to 3+ mixed writes as the next
implementation step. Three operations are already enough to make destructive
partial failure hard to explain and hard to recover manually; four or more
operations should stay blocked.

If a future route ever permits 3+ mixed writes, the first possible writer shape
should have a hard max, likely exactly-three mixed only, and should still
exclude directory operations, overwrite, outside-workspace paths, duplicate
targets, move-with-content edits, multi-delete chains, and ambiguous
delete/move dependencies unless the rollback/journal contract covers them.

On partial failure, `changedFiles` must contain only verified changed targets,
`failedFiles` must contain each failed target with a phase-specific reason, and
`plannedFiles` must remain planning evidence for unattempted or no-write
targets. Success must remain false whenever `failedFiles` is non-empty, the
writer started but verification is incomplete, or rollback status is unknown.

## 6. Sequential/No-Rollback Tradeoff

Sequential/no-rollback has the advantage of being simple and already aligned
with the current bounded lanes. It keeps the TypeScript control plane explicit:
parse, verify, approve, write in a known order, verify, project result.

The cost is that every larger lane must explain partial failure without a
repair mechanism. This is manageable for a single file, exactly-two updates,
exactly-three updates, single delete/move, and exactly-two mixed lanes. It is
not a sound default for broad or 3+ mixed writes because the blast radius grows
faster than the result surface.

Sequential/no-rollback can remain a documented property of current lanes. It
should not be the basis for Route 51 implementation.

## 7. Rollback/Snapshot/Journal Tradeoff

Rollback/snapshot/journal adds design and implementation cost, but it is the
right next design problem before larger write lanes.

Potential ownership options:

- TypeScript control plane: owns user-visible recovery policy, route state,
  result projection, and session continuity. This is necessary but not enough
  for low-level filesystem guarantees.
- Rust execution plane: could own lower-level atomic file operation helpers in
  a later implementation, but moving control-plane semantics into Rust would
  violate the current architecture boundary.
- Filesystem journal: likely the smallest target-specific mechanism for
  recording before/after facts, operation order, and compensating actions.
- Git/shadow snapshot layer: stronger for whole-worktree recovery, but it
  requires separate design around ignored files, untracked files, user changes,
  nested repositories, large files, symlinks, and cleanup.

The minimal docs-first design before implementation should define:

- snapshot/journal scope and storage
- per-operation before-state capture
- what can be restored and what cannot
- how rollback interacts with user edits made during the route
- result states for rollback succeeded, rollback failed, rollback skipped, and
  rollback not available
- cleanup and residue rules
- evidence names and non-default gates

## 8. Per-Operation Authority Requirements

Every future accepted operation needs authority before any writer is reachable:

- Resolve source and target paths under the selected workspace.
- Reject outside-workspace paths after realpath/symlink-aware checks where the
  route claims such protection.
- Reject directory delete/move unless a dedicated directory authority exists.
- Reject overwrite unless the route explicitly allows and verifies it.
- Reject duplicate/conflicting targets.
- Require existing regular-file source for update/delete/move-source.
- Require missing target for create/move-target unless overwrite is explicitly
  designed.
- Bind approval metadata to the exact source/target set and operation kinds.
- Keep approval, dry-run, preview, and permission-pending states distinct from
  approved-for-write.

Authority must be per operation and also holistic across the ordered operation
set, because an individually valid operation can conflict with another valid
operation in the same patch.

## 9. Operation Ordering Model Options

The route has four realistic ordering models:

- Parsed-order sequential: simplest and current-like, but weak for destructive
  mixed sets.
- Normalized family ordering: run creates/updates/moves/deletes in a fixed
  order; easier to reason about but may change model intent.
- Dependency graph ordering: derives constraints such as move source before
  update target; stronger but more complex.
- Journaled transaction ordering: uses parsed order or graph order, but records
  enough before-state to recover or clearly report rollback failure.

For current design, parsed order remains acceptable for existing exactly-two
mixed evidence. Future broad/3+ writes should require a journaled ordering
model, even if the execution order itself remains parsed order.

## 10. Partial Failure Model

Current lanes can surface partial or uncertain outcomes, but they do not repair
them. Larger lanes need a more explicit state model:

- not attempted
- preflight blocked
- approved but aborted before writer
- write started
- operation verified changed
- operation failed before change
- operation failed after possible change
- rollback attempted and succeeded
- rollback attempted and failed
- rollback unavailable

Result projection must keep `changedFiles`, `plannedFiles`, and `failedFiles`
truthful. It must not hide a partially changed workspace behind a success-like
terminal state. A route with any failed operation, unknown writer effect, failed
post-write verification, or failed rollback must stop/error rather than report
mutation success.

## 11. User-Visible Result Surface Requirements

The user-visible result surface for future larger writes must show:

- operation count and operation kinds
- target/source paths
- which files were changed, planned, failed, skipped, or rolled back
- whether writer/creator/delete-move paths were invoked
- post-write verification status
- rollback status when applicable
- next action that asks the user/model to inspect or re-read the right paths

The compact result must remain answer-first and should avoid broad success
claims. Verbose output can include the detailed per-operation state and
evidence names.

## 12. Evidence/Gate Requirements

Existing gates must remain unchanged by this docs-first route.

Any future write lane should be non-default at first and should require focused
evidence before being considered for release gates. Possible future evidence
names:

- `verify:real-user-capabilities:rollback-journal-design-contract`
- `verify:real-user-capabilities:rollback-journal-synthetic`
- `verify:real-user-capabilities:three-mixed-guarded-write`
- `verify:real-user-capabilities:broad-apply-patch-planning-evidence`
- `verify:real-user-capabilities:broad-apply-patch-rollback-smoke`
- `verify:result-contract:partial-rollback-surface`

The following should remain outside default release gates until separately
approved:

- any real-provider broad apply_patch path
- any 3+ mixed writer
- rollback/snapshot recovery implementation
- unified diff import/write support
- default real-provider mutation evidence

## 13. Reference Comparison Summary

The comparison was read-only and narrow. No reference implementation was copied.

opencode:

- `packages/opencode/src/patch/index.ts` models apply_patch as typed hunks:
  add, delete, update, and update-with-move.
- `packages/opencode/src/tool/apply_patch.ts` parses all hunks, builds
  per-file metadata and diff summaries, requests edit permission with
  per-file metadata, then applies changes sequentially.
- `packages/opencode/src/session/processor.ts` captures an initial snapshot
  around session processing.
- `packages/opencode/src/snapshot/index.ts` implements a git-backed shadow
  snapshot/revert service with tracking, restore, revert, and diff surfaces.

Design lesson: broad patch support is coupled to rich metadata and mature
snapshot/revert machinery. This project should not copy the writer, but should
copy the architectural lesson: broad write readiness needs a recovery boundary
separate from result projection.

Gemini CLI:

- `docs/cli/checkpointing.md` documents checkpointing as a local shadow-git
  snapshot plus conversation/tool-call restore path, disabled by default.
- `packages/core/src/utils/checkpointUtils.ts` stores tool call data and commit
  hashes for restore.
- `packages/cli/src/acp/commands/restore.ts` exposes restore as a separate
  command and reports disabled, missing, invalid, and unexpected-error states.
- `packages/core/src/tools/edit.ts` keeps edit preparation, confirmation,
  workspace path validation, failure result, and execution distinct.
- `docs/cli/trusted-folders.md` shows that workspace trust and filesystem
  authority are product-level boundaries, not parser details.

Design lesson: checkpoint/restore should be an explicit capability and remain
opt-in/non-default until proven. Filesystem authority and restoration state are
separate from an edit parser.

Claude Code:

- `tools/FileEditTool/prompt.ts` requires reading before editing.
- `tools/FileEditTool/FileEditTool.ts` rejects edits when the file has not been
  read, when the read was partial, or when the file changed since the last read.
- The same tool performs a final read/mtime check immediately before writing
  and throws a stale modification error if content cannot be trusted.
- `tools/FileEditTool/UI.tsx` maps common edit failures to user-facing error
  surfaces instead of success-like output.

Design lesson: stale-read rejection and failed edit visibility are not optional
for larger writes. Future broad/3+ routes need failure surfaces that are at
least as explicit as the current bounded lanes.

## 14. Recommended Next Route

Pick exactly one next route:

**Route 51: rollback/snapshot/journal design, docs-first.**

This is Option A. It should define the recovery contract before any broad
`apply_patch` or 3+ mixed writer is implemented.

Route 51 should not implement rollback yet. It should produce a design that
answers:

- whether the first recovery mechanism is per-file journal, shadow snapshot, or
  a hybrid
- where the contract lives between TypeScript control plane and Rust execution
  plane
- what operation states and result states are required
- what cleanup/residue rules apply
- what focused non-default evidence would be required before implementation

## 15. Explicit Non-Goals

This route does not:

- implement broad `apply_patch`
- implement 3+ mixed writes
- implement exactly-three mixed writes
- implement 4+ writes
- implement delete/move expansion
- implement rollback, snapshot, journal, restore, or revert
- implement stale-read recovery
- implement partial failure recovery
- implement fuzzy patch recovery
- change product code
- change tests
- change scripts
- change `package.json`
- change default gates
- change provider, session, CLI, or MCP behavior
- change readiness claims
- claim parity with opencode, Gemini CLI, or Claude Code

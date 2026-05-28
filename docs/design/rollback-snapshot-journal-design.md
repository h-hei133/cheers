# Rollback / Snapshot / Journal Design

Route: 51
Date: 2026-05-14
Status: docs-first design only; no product code, test, script, package, gate,
provider, session, CLI, MCP, or readiness change

This document defines the recovery boundary required before any broad
`apply_patch` writer or 3+ mixed write lane is implemented. It is based on the
current target repository docs/code evidence and a narrow read-only comparison
with opencode, Gemini CLI, and Claude Code.

It does not implement rollback, snapshot, journal, broad `apply_patch`, 3+
mixed writes, product behavior, gates, or readiness claims.

## 1. Executive Conclusion

Rollback is required before broad `apply_patch` writes and before 3+ mixed
writes. The current sequential/no-rollback model remains acceptable only for
the already bounded lanes because their operation counts, operation kinds,
authority checks, and evidence names are explicit.

The minimum recovery mechanism for larger write expansion is a per-operation
journal owned by the TypeScript control plane. The journal must capture ordered
operation intent, pre-write file state, write attempt state, post-write
verification state, rollback attempt state, and user-visible result projection.

The first implementation should not expose a new writer. It should prototype
the journal contract in a no-product-capability route and keep broad
`apply_patch`, 3+ mixed writes, and 4+ writes blocked.

## 2. Current Write Capability Surface

The current write surface is intentionally narrow:

- Selected-workspace single-file existing `Update File`.
- Selected-workspace single-file `Add File` create.
- Selected-workspace exactly-two existing-file `Update File`.
- Selected-workspace exactly-three existing-file `Update File`.
- Selected-workspace guarded single-file move/rename.
- Selected-workspace guarded single-file delete.
- Selected-workspace exactly-two mixed write lanes:
  - update + add
  - update + move
  - add + move
  - update + delete
  - add + delete
  - move + delete

The current projection infrastructure includes `perFilePatchPlan`, route/result
projections, unsupported shape reporting, `changedFiles`, `plannedFiles`,
`failedFiles`, writer/creator/delete-move invocation flags, and post-write
verification surfaces.

Current write lanes use explicit runtime opt-in, selected-workspace authority,
explicit write approval, route-owned preflight, final stale-read or final
preflight where applicable, sequential writes, and post-write verification.
They do not claim rollback, atomicity, broad write readiness, or partial
failure recovery.

## 3. Current No-Rollback Risk

Sequential/no-rollback means a later operation can fail after an earlier
operation has already changed the workspace. The current result surface can
report verified `changedFiles` and separate `failedFiles`, but it cannot return
the workspace to the pre-route state.

That risk is bounded today because supported lanes have small operation counts
and named operation families. It becomes too broad for arbitrary
`apply_patch`, 3+ mixed writes, 4+ writes, multi-delete, multi-move, or any
operation set where ordering and destructive effects make manual inspection
unreliable.

The current model also has no answer for post-write verification failure after
multiple prior successes except to stop and ask the user/model to inspect or
re-read. That is honest, but it is not enough for a broader writer.

## 4. Recovery Options Compared

Narrow reference comparison used for this design:

- opencode: `snapshot/index.ts` uses a shadow-git service for track, restore,
  revert, and diff; `tool/apply_patch.ts` parses add/update/delete/move hunks,
  builds per-file metadata, asks permission, and applies changes sequentially;
  `session/processor.ts` captures snapshots around session steps and records
  patch parts. Lesson: broad patch writing is paired with explicit snapshot and
  session surfaces, not just parser reachability.
- Gemini CLI: checkpointing is an opt-in shadow-git snapshot plus
  conversation/tool-call restore model; `checkpointUtils.ts` stores commit hash
  and tool-call data; `/restore` reports disabled, missing, invalid, and
  unexpected-error states; `edit.ts` keeps workspace validation, confirmation,
  preparation errors, and write errors distinct. Lesson: restore must be an
  explicit capability with its own failure surface.
- Claude Code: `FileEditTool` requires prior reads, rejects partial or stale
  reads, performs a final synchronous read/mtime check before write, and maps
  common edit failures to visible tool-result surfaces. Lesson: a future
  recovery route still needs strict stale-read rejection and explicit failure
  visibility; rollback is not a substitute for authority or freshness.

| Option | Strength | Weakness | Route 51 decision |
| --- | --- | --- | --- |
| Explicit no-rollback with stronger failure surfaces | Simple and matches existing bounded lanes | Does not reduce workspace blast radius for broad or 3+ mixed writes | Keep only for current lanes |
| TS control-plane journal | Fits current ownership of route policy, approval, result projection, and session continuity | Needs careful file-state capture and rollback-result modeling | Preferred first prototype |
| Rust execution-plane journal | Can centralize lower-level filesystem effects later | Risks moving control-plane policy and result semantics into Rust too early | Not first owner |
| Git/checkpoint snapshot | Strong whole-worktree restore model and proven in references | Heavy scope: ignored files, untracked files, nested repos, large files, cleanup, user changes | Defer |
| Filesystem copy snapshot | Local and independent of git | Needs storage, symlink, binary, cleanup, and conflict policy | Possible journal storage detail, not standalone owner |

## 5. Option A: Explicit No-Rollback With Stronger Failure Surfaces

This option keeps the existing sequential model and improves only the result
surface:

- every attempted operation has a phase-specific result
- `changedFiles` includes only verified changed targets
- `failedFiles` includes phase and reason
- `plannedFiles` remains planning evidence
- success is false when any operation fails or verification is incomplete
- compact output asks for inspection/re-read without implying repair

This is enough for existing bounded lanes. It is not enough for broad
`apply_patch`, 3+ mixed writes, exactly-three mixed writes, 4+ writes, or larger
destructive combinations.

The line should remain where it is now: current bounded lanes may keep explicit
sequential/no-rollback semantics; exactly-three mixed, all 3+ mixed, and all 4+
operation sets remain blocked until the journal contract exists.

## 6. Option B: TS Control-Plane Journal

This is the preferred first recovery design.

The TypeScript control plane should own the recovery contract because it
already owns mutation routing, approval authority, workspace policy, route
result projection, session/result surfaces, and continuity wording. A journal
here can remain close to the safety semantics without changing provider,
session, CLI, MCP, or Rust behavior.

The TS journal must be route-scoped and operation-scoped:

- capture selected workspace identity and route id
- capture ordered operation descriptors
- capture source/target paths after authority resolution
- capture pre-write state before any writer invocation
- record each write attempt and post-write verification result
- record rollback eligibility and rollback attempt result
- project `changedFiles`, `failedFiles`, `recoveredFiles`, and
  `unrecoveredFiles` without claiming atomicity

The journal may use file-content snapshots for regular files as its first
storage detail. It should not use broad git checkpointing, hidden session schema
migration, or default release gates in the first prototype.

## 7. Option C: Rust Execution-Plane Journal

Rust may later provide lower-level execution helpers, such as atomic temp-file
replacement or a filesystem operation primitive that returns exact effect
metadata. That can be useful once TS has a stable contract.

Rust should not own the first recovery decision. The policy question is not
just "write these bytes"; it includes approval binding, operation eligibility,
selected-workspace authority, terminal state, session continuity, and user
guidance. Those remain TypeScript control-plane responsibilities.

## 8. Option D: Git/Checkpoint Snapshot

Git or shadow-git checkpointing is the strongest whole-worktree recovery
direction. The narrow reference comparison supports this as a mature product
feature:

- opencode has a snapshot service that tracks, restores, reverts, and diffs
  via a shadow git directory.
- Gemini CLI documents checkpointing as a local shadow-git snapshot plus
  conversation/tool-call restore, disabled by default.

This project should not start there. A checkpoint layer would need separate
decisions for ignored files, untracked files, nested repositories, binary/large
files, symlinks, cross-platform git behavior, cleanup, user edits between
snapshot and restore, and user-facing restore commands. Those are larger than
the next edit-capability blocker.

## 9. Option E: Filesystem Copy Snapshot

A filesystem copy snapshot can capture exact pre-write bytes for the route's
known regular-file targets. It is simpler than a whole-worktree checkpoint and
does not require git.

It is not enough by itself because it still needs a journal to know operation
order, whether a file existed, whether a path was deleted, whether a move
source and target are paired, and how rollback results should be projected. It
is best treated as one storage strategy inside the TS journal.

## 10. Ownership Decision

Recovery should start in the TypeScript control plane as a route-scoped
journal. Rust execution helpers and git/checkpoint restore can remain future
options behind that contract.

Ownership split:

- TS control plane owns route eligibility, approval binding, operation ordering,
  journal lifecycle, rollback policy, result projection, and continuity wording.
- Rust native executor candidate may later own lower-level atomic filesystem primitives
  only after TS defines the semantic contract.
- Git/checkpoint layer is postponed until a separate design covers project-wide
  restore behavior.
- No implementation is added by this route.

## 11. Data Model Needed

Minimum journal shape:

```text
Journal {
  routeId
  workspaceRoot
  operationLimit
  operationSetHash
  operations[]
  startedAt
  completedAt?
  terminalState
}

Operation {
  operationId
  kind: update | add | delete | move
  sourcePath?
  targetPath
  parsedOrder
  authorityState
  approvalState
  beforeState
  writeState
  verificationState
  rollbackState
}

BeforeState {
  existed
  fileKind: regular-file | missing | unsupported
  contentHash?
  contentSnapshotRef?
  mtime?
  size?
}

RollbackState {
  status: not-needed | unavailable | skipped | attempted | recovered | failed
  reason?
}
```

The model must support `changedFiles`, `plannedFiles`, `failedFiles`,
`recoveredFiles`, `unrecoveredFiles`, writer invocation flags,
post-write verification, and a clear no-atomicity statement.

## 12. Failure Lifecycle

When operation 1 succeeds and operation 2 fails:

- record operation 1 as write-started and post-write verified only if readback
  confirms it
- record operation 2 at the exact failed phase
- attempt rollback only if the route has a valid journal and rollback is in
  scope for that prototype
- report `changedFiles` for verified changes that remain changed
- report `recoveredFiles` for verified rollback successes
- report `failedFiles` and `unrecoveredFiles` for failed or uncertain effects
- stop/error; do not report mutation success

When rollback fails:

- keep original failure and rollback failure visible
- report rollback status as failed, not partial success
- keep affected paths in `unrecoveredFiles`
- ask the user/model to inspect and re-read affected paths
- avoid any atomicity or restored-state claim

When post-write verification fails:

- treat the operation as failed after possible write effect
- attempt rollback only if journal eligibility is proven
- otherwise report writer-started unknown effect
- stop/error and preserve inspection guidance

## 13. Session/Result Surface Requirements

Future recovery-aware routes must keep current result truthfulness:

- `changedFiles`: verified changed files that remain changed after any rollback
- `plannedFiles`: targets planned but not necessarily changed
- `failedFiles`: operation targets that failed, with phase and reason
- `recoveredFiles`: targets restored to pre-route state and verified
- `unrecoveredFiles`: targets with failed or uncertain recovery
- `postWriteVerification`: per-operation status
- `writerInvoked`, `creatorInvoked`, and `deleteMoveInvoked`: route-specific
  invocation facts, not success claims
- `success`: false if any failure, unknown effect, or rollback failure remains
- terminal state: stopped/error for partial failure or unrecovered effects

Session continuity should preserve enough compact context for `/continue` to
say what changed, what failed, what was recovered, what remains uncertain, and
which paths must be inspected or re-read. It should not require a broad session
schema change before the no-product prototype proves the shape.

## 14. Security/Workspace Boundary Requirements

Recovery must not weaken workspace authority:

- resolve all source and target paths under the selected workspace before
  journaling or writing
- reject outside-workspace paths after the same path containment policy used by
  the write route
- reject unsupported file kinds before snapshot capture
- reject directory delete/move until a separate directory authority exists
- reject overwrite unless a route explicitly owns overwrite semantics
- bind approval to exact operation kinds and resolved path set
- keep dry-run, preview, permission-pending, denied, and approved-for-write
  distinct
- treat rollback writes as writes requiring the same workspace boundary
- never use rollback to restore or delete paths that were not journaled

Symlink, realpath, binary-file, permission-error, ignored-file, and nested-repo
behavior must be explicit before any broad recovery claim.

## 15. Validation/Evidence Requirements

This docs-first route requires only:

- `rtk git status --short --branch`
- `rtk git diff --check`

Future implementation evidence should remain non-default at first. Focused
tests should cover:

- journal planning without writer reachability
- before-state capture for update/add/delete/move descriptors
- operation 1 success + operation 2 failure result projection
- rollback success projection
- rollback failure projection
- post-write verification failure with rollback unavailable
- `changedFiles`, `plannedFiles`, `failedFiles`, `recoveredFiles`, and
  `unrecoveredFiles` truthfulness
- no atomicity claim in compact and verbose surfaces
- unsupported broad `apply_patch`, 3+ mixed, and 4+ writes remaining no-write

Non-default evidence commands should be introduced only in the future route
that implements the no-product prototype. Default gates, real-provider gates,
package scripts, provider behavior, session behavior, CLI behavior, and MCP
behavior must remain unchanged until explicitly approved.

## 16. What Remains Unsupported

This design does not support:

- broad arbitrary `apply_patch` writes
- 3+ mixed writes
- exactly-three mixed writes
- 4+ writes
- broad unified diff writer
- multi-delete or multi-move beyond current exactly-two mixed lanes
- directory delete or directory move
- overwrite
- outside-workspace writes
- rollback implementation
- snapshot implementation
- journal implementation
- automatic stale-read recovery
- partial failure automatic repair
- fuzzy patch recovery
- AST patching
- provider/session/CLI/MCP behavior changes
- default gate changes
- broad release or readiness claims

## 17. Recommended Next Route

Recommend exactly one next route:

**Route 52: TS journal prototype, no product capability.**

This is Option C from the Route 51 plan. It should implement only a no-product
journal contract prototype and focused projection evidence. It must keep broad
`apply_patch`, 3+ mixed writes, 4+ writes, delete/move expansion, provider
behavior, session lifecycle, CLI behavior, MCP behavior, package scripts,
default gates, and readiness claims unchanged.

Direct broad `apply_patch` writes should remain blocked.

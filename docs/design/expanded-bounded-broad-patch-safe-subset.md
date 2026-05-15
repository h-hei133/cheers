# Expanded Bounded Broad Patch Safe Subset

Status: Route 70 implemented on top of the Route 69 bounded safe subset. This
is still not broad arbitrary `apply_patch` readiness.

## Post-Route 68 Baseline

Route 68 introduced a pure git-style unified-diff normalizer for update, add,
delete, and pure rename sections. It serialized safe input into existing
marker-style `apply_patch` text and reused existing guarded single-file and
bounded multi-operation routes. The cap was still 8 operations, and 9+ payloads
were stopped before writer reachability.

Route 69 lifts that artificial small-N blocker to a documented bounded cap of
32 operations. It preserves the same ownership split: parser normalization is
pure, candidate classification is projection-only, and existing routes still
own workspace authority, approval, stale-read/final preflight, recovery-authority
capture, writer execution, post-write verification, and result projection.

## Bounded Reference Scan

Files inspected:

- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- gemini-cli, 3 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`
- ClaudeCode, 2 files:
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`

Directional findings:

- opencode parses file-level patch operations separately from permission and
  application; revert/restore depends on snapshot authority, not result
  metadata.
- opencode can represent update-with-move, but its write tool computes final
  content before applying and asks permission over affected paths. This project
  does not yet have a safe move-plus-content route, so rename-with-content-edit
  remains blocked.
- gemini-cli separates edit/write results from checkpoint restore. It has fuzzy
  edit logic in its edit tool, which Route 69 deliberately does not copy.
- ClaudeCode records file-history authority before writes and performs stale
  checks near the write boundary. That supports keeping recovery authority and
  final preflight in existing routes rather than in the normalizer.
- A cap of 32 is reasonable locally because existing bounded route semantics are
  count-parametric, focused tests cover 9/16/32 representatives, and 33+ still
  proves the beyond-cap blocker.

## Cap Decision

- `MIN_MULTI_WRITE_OPERATIONS = 2`
- `MAX_BOUNDED_WRITE_OPERATIONS = 32`
- one operation remains single-file route territory
- 2-32 operations are bounded candidates
- 33+ operations are unsupported/too-many

This is not arbitrary-N support. The cap remains a product and safety boundary
for approval readability, recovery-authority capture size, partial-failure
inspection, and result surface clarity.

## Supported Parser Subset

The Route 69 normalizer supports:

- git-style update/add/delete/pure rename sections mixed in one patch
- multiple file sections up to the bounded cap after candidate classification
- multi-hunk updates when exact hunks can be serialized to the existing marker
  representation
- `a/` and `b/` path prefixes
- `/dev/null` add/delete markers
- regular `new file mode 100644/100755` and `deleted file mode 100644/100755`
  metadata when the content shape is otherwise safe

The normalizer still performs no file IO, no approval, no writes, no persistence,
no recovery execution, and no fuzzy matching.

## Blocked Parser Shapes

Still blocked:

- arbitrary broad patch input
- fuzzy patch application
- binary patches
- mode-only or chmod changes
- symlink patches (`120000`)
- submodule patches (`160000`)
- copy/copy-with-content metadata
- directory operations
- overwrite/path conflict/source-target reuse
- malformed or ambiguous hunks
- no-newline markers
- 33+ operations

## Rename-With-Content-Edit Decision

Route 70 supports only the safe git-style 100 percent similarity
rename-with-content-edit shape by decomposing it into a pure move followed
immediately by an update on the moved target.

The existing move route still requires content-preserving move semantics. The
new support is owned by the broad normalizer plus the guarded mixed route's
narrow move-target update dependency. It does not enable move-with-hunks,
arbitrary path-changing updates, lower-similarity renames, copy metadata,
overwrite, fuzzy patching, automatic recovery, or rollback.

## Multi-Hunk Update Decision

Multi-hunk updates are supported when the unified-diff section can be converted
exactly into marker hunks. The existing verifier still performs exact context
checks before any writer starts. No fuzzy context drift is accepted.

## Runtime And Recovery Semantics

Expanded 9-32 normalized candidates route through existing guarded paths:

- update-only goes to the bounded update route
- mixed goes to the bounded mixed route
- delete-only and move-only go to the bounded destructive route

Existing routes preserve:

- explicit runtime and workspace-write opt-in
- approval naming affected paths
- selected-workspace authority
- final stale-read or final preflight before writer
- non-default recovery-authority capture before writer when supplied
- parsed-order sequential execution
- per-file/per-operation post-write verification
- `changedFiles`, `failedFiles`, `plannedFiles`
- writer/creator/delete-move flags
- `recoveryExecuted=false`
- `rollbackAtomicityClaim=false`
- no automatic recovery
- no atomic rollback

## Validation Evidence

Focused evidence added or updated:

- cap policy tests cover 8, 9, 16, 32 supported and 33 blocked
- normalizer tests cover 32 git-style sections, multi-hunk update preservation,
  rename-with-content decomposition, and binary/mode/symlink/submodule/copy
  blockers
- candidate tests cover 9/16/32 supported families and 33 too-many blockers
- route/planning tests cover representative 9/16/32 update, mixed, delete-only,
  and move-only paths
- mutation routing tests keep 33 marker and normalized git-style payloads
  stopped before writer reachability
- existing partial-failure restore drills remain explicit and non-automatic

## Residual Risks And Next Direction

Residual risks:

- 32 is still a bounded cap, not arbitrary broad patch readiness.
- rename-with-content-edit is supported only as the Route 70 move plus target
  update decomposition.
- binary/mode/symlink/submodule/copy shapes remain unsupported.
- recovery remains explicit and non-default; there is no automatic rollback.

Recommended next route: broad unsupported-shape UX hardening only if blocked
patches need clearer user-facing diagnostics. Arbitrary broad `apply_patch`
should stay delayed until a separate readiness map proves permission, recovery,
and result semantics.

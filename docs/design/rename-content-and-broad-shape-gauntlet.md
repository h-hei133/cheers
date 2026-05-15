# Rename Content And Broad Shape Gauntlet

Status: Route 70 implemented.
Date: 2026-05-15

## Post-Route 69 Baseline

Route 69 expanded the safe git-style broad patch subset to 1-32 normalized
operations. It still blocked rename-with-content-edit because the guarded move
route was content-preserving and there was no safe two-step route contract for
move plus target update.

Route 70 keeps the same upper bound: no arbitrary broad `apply_patch`, no fuzzy
patch engine, no binary/mode/symlink/submodule/copy application, no 33+
operations, no automatic recovery, and no atomic rollback.

## Reference Scan

Files inspected:

- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- gemini-cli, 4 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/tool-error.ts`
- ClaudeCode, 3 files:
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`

Directional findings:

- opencode can represent move plus content in its patch/apply path, but restore
  and revert claims depend on snapshot authority.
- gemini-cli separates edit/write result calculation from checkpoint restore.
  Its fuzzy edit path is not copied into this project.
- ClaudeCode tracks original content through file history before edit/write
  paths and performs stale protection near write time.

Local implication: support only the smallest safe local equivalent: decompose a
git-style 100 percent similarity rename-with-content-edit into a pure move
followed immediately by an update on the moved target, then reuse existing
guarded mixed route authority and recovery capture.

## Safe Decomposition

`boundedBroadPatchNormalizer.ts` now normalizes this shape:

- `diff --git a/old b/new`
- `similarity index 100%`
- `rename from old`
- `rename to new`
- `--- a/old` and `+++ b/new`
- exact unified hunks

into two marker operations:

1. `Move File`: old path to new path, with no content hunks.
2. `Update File`: new path, with the exact converted hunks.

The normalized operation count increases by two. A patch with 16 such rename
sections reaches the cap of 32 operations; 17 such sections remains blocked as
33+ operations by candidate routing.

The mixed route allows only this narrow dependency: an update may reuse the
immediately previous move target. Other duplicate source/target reuse remains
blocked.

## Unsupported Shape Taxonomy

`broadPatchUnsupportedReason.ts` centralizes no-write reason metadata,
including short reason, do-next hint, evidence tag, and `safeNoWrite=true`.
The normalizer now reuses those evidence tags for blocked broad shapes where
the existing result contract allows it.

Blocked shapes remain no-write:

- arbitrary broad patch
- fuzzy/no-newline and ambiguous hunk headers
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory operation
- overwrite/path conflict
- malformed diff
- index-only metadata
- 33+ operations

## Fixture Gauntlet

The focused gauntlet covers supported groups:

- multi-file git-style update patch
- add plus delete patch
- pure rename patch
- rename-with-content-edit patch
- 32-operation bounded patch
- mixed update/add/delete/move patch
- multi-hunk exact update patch

Blocked groups cover:

- 33-operation patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata patch
- malformed diff
- ambiguous hunk header
- fuzzy-like no-newline marker
- directory operation
- duplicate/path conflict
- outside-workspace path

Assertions keep supported fixtures as bounded candidates and blocked fixtures
as no-write/no-recovery-execution projections.

## Runtime And Recovery Semantics

Existing guarded routes still own workspace authority, approval, stale-read or
final preflight, recovery-authority capture, writer execution, and post-write
verification.

For rename-with-content-edit:

- move runs before update
- affected paths and approval paths include old and new paths
- per-file plan/result projection treats the move-target update dependency as
  supported only for this immediate pair
- non-default recovery authority captures source original, target absence, and
  target pre-update content
- partial failure after move is explained as parsed-order sequential execution
- explicit restore can restore the moved target when current-content guard
  matches and blocks hidden user edits when it does not

No automatic recovery or rollback is added. `recoveryExecuted` remains false
and `rollbackAtomicityClaim` remains false.

## Validation

Focused validation:

- `rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing/broadPatchUnsupportedReason.test.ts src/orchestration/patchParsing/boundedBroadPatchNormalizer.test.ts src/orchestration/patchResult/boundedApplyPatchCandidate.test.ts src/orchestration/patchResult/perFilePatchPlan.test.ts src/orchestration/patchResult/mixedFileWriteRoute.test.ts src/orchestration/mutationRoutingProjection.test.ts`

Final Route 70 validation should also run the route-required focused batch,
result-contract verification, package build, `rtk git diff --check`, and
`rtk git status --short --branch`.

## Residual Risks

This is still a bounded decomposition, not broad arbitrary patch readiness.
Rename-with-content-edit is supported only for exact 100 percent similarity
git-style rename metadata and exact hunks. 33+ operations, fuzzy patch,
binary/mode/symlink/submodule/copy, directory operations, overwrite, automatic
recovery, and atomic rollback remain blocked.

Next recommendation: harden user-facing unsupported reason projection only if
blocked broad patches are confusing in real use. Do not move to broad arbitrary
`apply_patch` until recovery/rollback and destructive approval semantics are
separately proven.

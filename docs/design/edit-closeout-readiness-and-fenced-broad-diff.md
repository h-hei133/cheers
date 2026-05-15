# Edit Closeout Readiness And Fenced Broad Diff

Status: Route 72 implemented; Route 73 sealed the bounded edit surface as a
closeout candidate.
Date: 2026-05-15

## Post-Route 71 Baseline

Route 71 proved the bounded edit surface with a realistic compatibility
gauntlet but left fenced git-style broad diffs unsupported. Route 72 closes
that targeted parser gap without adding arbitrary broad `apply_patch`, fuzzy
patching, 33+ writes, automatic recovery, atomic rollback, provider behavior,
session behavior, CLI lifecycle behavior, or MCP behavior.

Current supported write surface remains bounded to selected-workspace
single-file operations, 2-32 update-only/mixed/delete-only/move-only batches,
and parser/normalizer-supported broad patch candidates that route through the
same guarded lanes.

## Bounded Reference Scan

Files inspected: 12 total.

- opencode, 5 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/test/tool/apply_patch.test.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`
- gemini-cli, 4 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/tool-error.ts`,
  `/home/wang/projects/gemini-cli/docs/cli/checkpointing.md`
- ClaudeCode, 3 files:
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`

Directional findings:

- opencode requires structured `patchText` for `apply_patch`; its parser looks
  for begin/end patch markers and has heredoc support, while permission and
  snapshot revert stay separate from patch-result metadata.
- gemini-cli uses structured edit/write tool parameters and computes diffs for
  confirmation/result display. Checkpoint restore is opt-in configuration and
  separate from edit-result diagnostics.
- ClaudeCode uses structured old/new edit and write inputs with stale-read
  protection and file-history capture before restore-style claims.

Implications:

- Supporting one clearly fenced patch block is consistent with common model
  output shapes, but execution must still depend on the local bounded parser.
- Multiple patch-looking fenced blocks, mixed prose candidates, and non-patch
  fences should stay blocked because choosing among them would create a broad
  model-output parser.
- Recovery/rollback claims still require durable authority. Metadata,
  normalized diffs, and result projections alone are not restore authority.

## Fenced Extraction Decision

Route 72 adds `patchParsing/fencedPatchExtractor.ts` as a pure extraction
helper. It reads no files, writes no files, asks for no approval, grants no
write authority, and executes no recovery.

Supported extraction:

- one fenced code block containing a git-style diff
- fence languages `diff` and `patch`
- `text` or unlabeled fences only when content clearly looks like a diff
- optional prose before or after the single fenced block
- exact handoff of extracted content to `boundedBroadPatchNormalizer.ts`

Blocked extraction:

- multiple fenced blocks
- incomplete fences
- non-patch code fences
- nested/ambiguous fences
- prose with another patch candidate outside the fence
- any fenced content that the existing bounded normalizer rejects, including
  33+ operations, binary, mode/chmod, symlink, submodule, copy metadata,
  malformed hunks, no-newline/fuzzy-like shapes, directory operations,
  outside-workspace paths, overwrite/path conflicts, and arbitrary broad shapes

## Closeout Readiness Model

Route 72 adds `patchResult/editCapabilityReadiness.ts` as a pure model. It does
not affect routing or writer behavior.

Default-ready candidate:

- single update/create/delete/move
- bounded 2-32 update-only
- bounded 2-32 mixed
- bounded 2-32 delete-only
- bounded 2-32 move-only
- bounded broad patch safe subset
- fenced bounded broad patch safe subset

Explicit opt-in or non-default:

- recovery-authority capture
- restore preview
- restore execute
- any future persistence-backed recovery behavior

Blocked by design:

- arbitrary broad `apply_patch`
- fuzzy patch
- binary/mode/symlink/submodule patch application
- directory delete/move
- overwrite expansion
- automatic recovery
- atomic rollback

Need more evidence before any future default claim:

- broader user/session failure wording
- durable recovery authority lifecycle
- larger write surfaces beyond the cap
- any provider-facing or MCP-facing edit behavior

## Closeout Verifier

Route 72 adds `scripts/verify-edit-capability-closeout.mjs` and package script
`verify:edit-capability-closeout`. The verifier runs only focused closeout
tests for:

- fenced patch extraction
- bounded broad patch normalization
- bounded candidate classification
- realistic edit compatibility gauntlet
- edit capability readiness model

It is not a default release gate and does not run provider, CLI, MCP, or real
provider checks.

## Recovery And Restore Boundaries

Route 72 does not change recovery behavior. Non-default recovery-authority
capture remains explicit. Restore preview and restore execution remain
explicit surfaces. Route results continue to keep `recoveryExecuted=false`.
Restore outputs continue to keep `rollbackAtomicityClaim=false`.

## Result Semantics Preserved

Fenced git-style broad diffs normalize into existing marker-style patch text
and then route through existing guarded small-N write lanes. Existing result
fields remain owned by those routes:

- `changedFiles`
- `failedFiles`
- `plannedFiles`
- `perFilePatchPlan`
- writer/creator/delete-move flags
- `postWriteVerification`
- success/stopped/error terminal semantics

No-write and dry-run states remain non-authorizing.

## Next-Route Decision Criteria

Route 73 follow-up: the bounded edit surface is now represented by
`editCapabilityCloseoutManifest.ts`, verified by
`verify:edit-capability-closeout`, and documented in
`docs/design/edit-capability-closeout-seal.md`.

Recommended next phase: context engineering kickoff, with undo/restore product
polish as the narrower alternative if restore UX becomes the product priority.

Use a targeted blocker route only if Route 72 validation reveals a concrete
regression in supported bounded behavior. Do not move to broad arbitrary
`apply_patch` until approval, workspace authority, destructive semantics,
partial failure, durable recovery authority, result contracts, and user-facing
claims are all explicitly re-audited.

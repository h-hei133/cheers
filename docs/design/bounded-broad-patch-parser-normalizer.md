# Bounded Broad Patch Parser Normalizer

Status: Route 69 expanded the Route 68 safe git-style unified-diff subset so
it can normalize larger bounded candidates into existing guarded 1-32
`apply_patch` operations. This is not broad arbitrary `apply_patch` readiness.

## Post-Route 67 Baseline

Route 67 could classify and route bounded candidates only after the existing
`*** Begin Patch` parser accepted them. Git-style unified diff payloads were
still stopped at the parser/shape layer before they could reach the bounded
small-N routing decision.

The Route 68 target is a pure parser/normalizer step. It does not read files,
write files, ask approval, persist recovery state, execute restore, or claim
rollback. Safe normalized output is marker-style patch text that existing
single-file, multi-file, mixed, delete, and move routes already understand.

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

- opencode separates patch parsing, per-file change metadata, permission, and
  application. Its apply_patch parser produces file-level add/update/delete and
  update-with-move shapes, while revert depends on snapshot authority rather
  than result metadata.
- gemini-cli keeps edit/write calculation and confirmation separate from
  checkpoint restore. It has fuzzy edit support, but Route 68 deliberately does
  not copy fuzzy matching.
- ClaudeCode uses old/new exact edit inputs, stale-read protection, and
  file-history authority before rewind/restore claims.

Local implication: normalize only syntactically safe broad patch subsets into
the already guarded local operation model. Do not add a new broad patch engine.

## Parser Blocker Audit

Before Route 68:

- `patchParsing/parser.ts` accepted only marker-style `*** Begin Patch`
  operations.
- `boundedApplyPatchCandidate.ts` could classify only parser-supported
  add/update/delete/move shapes.
- Git-style unified diff was treated as broad/unsupported and fell through to
  no-write stopped surfaces.

Route 68 changes the blocker boundary:

- `patchParsing/boundedBroadPatchNormalizer.ts` recognizes git-style
  `diff --git` sections.
- Safe sections are serialized into marker-style patch text before routing.
- Existing routes still perform workspace authority, approval, stale-read or
  final preflight, writer execution, recovery-authority capture, verification,
  and result projection.

## Supported Safe Subset

Supported parser subset:

- Git-style update:
  `diff --git a/path b/path`, matching `--- a/path` and `+++ b/path`, with
  exact unified hunks containing only context, remove, and add lines.
- Git-style add:
  `/dev/null -> b/path` with add-only hunk content.
- Git-style delete:
  `a/path -> /dev/null` with remove-only hunk content.
- Git-style pure rename:
  `similarity index 100%`, `rename from`, and `rename to`, with no content
  hunk.
- Multi-hunk updates when exact marker hunks can preserve the old/new
  expectations.
- Operation count 1-32. Count 33+ remains blocked by the existing bounded write
  policy after normalization.

The normalizer also lets the existing marker parser accept a pure move with no
content hunk. Verification already treats that as a no-content-change move and
the move route owns source/target authority and post-write verification.

## Unsupported Broad Shapes

Still blocked:

- 33+ operations.
- Binary patch.
- Mode-only or chmod-style changes.
- Symlink and submodule mode patches.
- Copy/copy-with-content metadata.
- Rename with content edits or similarity below 100%.
- `/dev/null` add hunks containing non-add lines.
- Delete hunks containing non-remove lines.
- No-newline markers and unsupported hunk syntax.
- Directory operations by syntactic directory paths.
- Path conflicts, swaps, cycles, duplicate targets, and outside-workspace
  paths.
- Overwrite, still enforced by create/move target authorities.
- Fuzzy patch, best-effort hunk application, and arbitrary broad patch input.

## Normalization Model

`normalizeBoundedBroadPatchText()` returns:

- `status`: `normalized`, `unsupported`, or `malformed`
- `sourceFormat`: `git-unified-diff`, `apply-patch-markers`, or `unknown`
- normalized marker-style patch text when supported
- normalized operations and affected paths
- operation count
- rejection reason and evidence for blocked shapes

`classifyBoundedApplyPatchCandidate()` now uses the normalizer before parsing.
When normalization succeeds, `normalizedRawPatchText` is attached to the
candidate. `mutationRoutingProjection.ts` passes that normalized text to the
existing guarded route. Unsupported shapes do not gain write authority.

## Runtime And Result Semantics

Route 68 preserves:

- explicit runtime opt-in and selected-workspace write opt-in
- explicit approved-for-write decision
- workspace authority and realpath checks in existing routes
- final stale-read/preflight before writer start
- sequential writer behavior
- post-write verification
- `changedFiles`, `failedFiles`, `plannedFiles`
- writer/creator/delete-move flags
- success/stopped/error result semantics
- `recoveryExecuted=false`
- `rollbackAtomicityClaim=false`

No-write and dry-run paths remain non-authorizing. Normalized planning can be
projected, but approval-pending or preview does not become write permission.

## Recovery And Restore Interaction

Normalized broad candidates reuse existing non-default recovery-authority
capture in the target route. Tests cover capture before writer start for a
normalized five-file git-style update and an explicit partial-failure restore
drill for a normalized mixed update/create patch.

Restore remains explicit. No automatic recovery, rollback executor, atomic
transaction, snapshot, or default persistence was added.

## Validation Evidence

Focused validation added:

- `boundedBroadPatchNormalizer.test.ts`
- `parser.test.ts`
- `boundedApplyPatchCandidate.test.ts`
- `mutationRoutingProjection.test.ts`

Representative evidence:

- single git-style update normalizes and routes to the existing update path
- git-style add/delete/pure rename route through existing guarded paths
- five-file, eight-operation, and larger 9/16/32 representative payloads route through bounded
  small-N lanes
- 33+ git-style payload remains stopped before writer invocation
- binary/mode/symlink/submodule/malformed/rename-with-content/no-newline shapes remain blocked
- non-default recovery-authority capture works for a normalized broad
  candidate
- explicit restore can repair a representative partial normalized broad
  failure without claiming automatic recovery or rollback

## Residual Risks And Next Direction

Residual risks:

- This is still a small syntactic subset, not a general patch engine.
- Exact hunk matching is still handled by the existing verifier; no fuzzy
  matching was added.
- Cap 32 remains the write boundary.
- Larger arbitrary patch and 33+ policies still require separate approval,
  recovery, result, and product-surface decisions.

Recommended next route: unsupported broad-shape UX hardening if blocked broad
patches need clearer user-facing diagnostics. Rename-with-content-edit should
remain separate unless it becomes the main user-facing blocker. Arbitrary-N
policy work should require explicit proof that approval, recovery authority,
partial failure, and result semantics remain understandable.

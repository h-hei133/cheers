# Edit Capability Closeout Seal

Status: Route 73 closeout candidate.
Date: 2026-05-15

## Post-Route 72 Baseline

The edit capability phase is now a closeout candidate for the bounded
selected-workspace edit surface. Route 73 does not add a new edit feature. It
documents the supported envelope, aligns the readiness model with a
machine-checkable manifest, strengthens the closeout verifier, and records
feature-level parity/non-parity against nearby agent implementations.

Closeout candidate means the current bounded edit surface is stable enough to
treat as a sealed phase for future planning. It does not mean arbitrary broad
`apply_patch`, fuzzy patching, provider/MCP edit readiness, default durable
recovery persistence, automatic recovery, or atomic rollback.

## Bounded Reference Scan

Files inspected: 16 total.

- opencode, 6 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/test/tool/apply_patch.test.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- gemini-cli, 5 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/tool-error.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`,
  `/home/wang/projects/gemini-cli/docs/cli/checkpointing.md`
- ClaudeCode, 5 files:
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileEditTool/utils.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`,
  `/home/wang/projects/source-claudecode/utils/diff.ts`

Directional findings:

- opencode has broader `apply_patch` execution and per-file permission/result
  metadata. Its session revert depends on snapshot authority, not patch-result
  metadata alone.
- gemini-cli has structured edit/write tools, confirmation diffs, fuzzy edit
  fallback, and opt-in checkpoint restore through a shadow Git snapshot.
- ClaudeCode focuses on structured file edit/write inputs, read-before-write
  and stale-write protection, diff display, and file-history authority before
  rewind/restore claims.

## Parity / Non-Parity Matrix

| Capability | Local closeout state | opencode | gemini-cli | ClaudeCode | Closeout implication |
| --- | --- | --- | --- | --- | --- |
| Single-file update/create/delete/move | Default-ready candidate inside selected workspace | Similar edit/write/apply surfaces | Similar edit/write surfaces | Similar file edit/write surfaces | Acceptable parity for narrow file edits |
| Bounded multi-file writes | 2-32 update/mixed/delete/move operations | Broader patch application | Tool calls are narrower; checkpoint protects broader effects | MultiEdit-style semantics exist in reference, but not copied | Local cap is acceptable closeout boundary |
| Marker apply_patch | Bounded 1-32 candidates | Native marker parser | No direct parity target | No direct parity target | Local feature is bounded and tested |
| Git-style/fenced broad diff | Safe subset only, normalized to existing routes | Not the same parser contract | Diff is mainly display/checkpoint context | Diff is mainly display/result context | Non-parity is acceptable because support is intentionally bounded |
| Fuzzy edit | Blocked by design | Has tolerance in patch tool paths | Has fuzzy/flexible/regex edit strategies | Has normalization/flexible exact-string support | Local non-parity is intentional closeout boundary |
| Recovery/restore | Non-default authority plus explicit restore path | Snapshot-backed revert | Opt-in checkpoint restore | File-history backed rewind/restore | Local is stronger than metadata-only, weaker than default checkpoint products |
| Automatic recovery | Blocked | Snapshot/revert is explicit product feature | Restore command is explicit | Rewind/restore is explicit | Blocking automatic recovery is acceptable |
| Atomic rollback | Blocked | Snapshot revert is not local atomic transaction claim | Checkpoint restore is product restore | File history restore is product restore | No atomic claim is the correct closeout stance |

## Supported Capability Envelope

Default-ready candidates:

- selected-workspace single-file update/create/delete/move
- bounded 2-32 update-only
- bounded 2-32 mixed
- bounded 2-32 delete-only
- bounded 2-32 move-only
- bounded marker-style `apply_patch` candidates
- bounded git-style broad patch safe subset
- one clear fenced bounded git-style broad diff safe subset
- 100 percent similarity rename-with-content decomposition into move plus
  immediate target update
- unsupported broad-shape taxonomy and no-write projection

These are still approval- and workspace-authority-gated runtime capabilities;
default-ready does not mean prompt text authorizes writes.

## Non-Default / Explicit-Opt-In Envelope

- recovery-authority capture
- persistent recovery authority ledger
- restore preview
- explicit restore execute
- local `/restore` execute path

These surfaces require explicit non-default authority, explicit command input,
or explicit user/session selection. They do not run automatically after write
failure and do not imply atomic rollback.

## Blocked-By-Design Envelope

- 33+ writes
- arbitrary broad `apply_patch`
- fuzzy patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory operations
- overwrite/path conflict expansion
- automatic recovery
- atomic rollback
- default durable recovery persistence
- provider/MCP edit behavior changes

## Closeout Manifest

Machine-checkable manifest:

- `packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts`
- `packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.test.ts`

The manifest is generated from `editCapabilityReadiness` rows and asserts:

- route status is `closeout-candidate`
- default persistence is absent
- automatic recovery is false
- atomic rollback is false
- arbitrary broad `apply_patch` is blocked by design
- each entry has evidence and risk notes
- blocked entries have explicit blocked reasons
- recovery/restore entries have explicit dependencies

## Closeout Verifier Scope

`verify:edit-capability-closeout` now covers focused deterministic tests for:

- marker parser
- fenced patch extractor
- bounded broad patch normalizer
- broad unsupported reason taxonomy
- bounded apply_patch candidate classifier
- bounded write cap policy
- edit compatibility gauntlet
- readiness model
- closeout manifest
- restore command contract/runner
- restore preview/execution bridge

It is not a broad package test and does not run provider, default, MCP, or real
provider gates. Result-contract remains final independent validation rather
than a nested verifier child because the CLI/tsx subprocess path is
sandbox-sensitive when run from inside the verifier.

## Result Contract / Recovery Requirements

Closeout requires current route results to preserve:

- `changedFiles`
- `failedFiles`
- `plannedFiles`
- `perFilePatchPlan`
- writer/creator/delete-move flags
- `postWriteVerification`
- success/stopped/error terminal semantics
- `recoveryExecuted=false` in route results
- `rollbackAtomicityClaim=false` in restore outputs

## Residual Risks

- The bounded parser is not a general patch engine.
- Restore UX is usable but minimal; it may warrant product polish later.
- Local recovery authority is explicit and non-default, not a default
  checkpoint system.
- Reference repositories have broader or different edit/fuzzy/checkpoint
  behavior; this project intentionally does not claim full parity.

## Next Phase Recommendation

Recommended next phase: context engineering kickoff.

Alternative next route: undo/restore product polish, only if the product needs
a richer user-facing restore picker or summaries before context work.

Do not start broad arbitrary `apply_patch` unless a future route reopens
parser scope, approval semantics, workspace authority, destructive behavior,
durable recovery authority, result contracts, and user-facing claims together.

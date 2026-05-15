# Realistic Edit Compatibility Gauntlet

Status: Route 71 implemented as a focused compatibility gauntlet; Route 72
extended it with fenced git-style broad diff coverage; Route 73 uses it as
closeout verifier evidence.
Date: 2026-05-15

## Post-Route 70 Baseline

Route 70 left the edit surface intentionally bounded:

- marker-style single update/create/delete/move
- bounded update-only, mixed, delete-only, and move-only batches up to 32
  operations
- git-style update/add/delete/pure-rename normalization
- exact multi-hunk git-style update normalization
- safe 100 percent similarity rename-with-content-edit decomposition into move
  plus immediate target update
- non-default recovery-authority capture and explicit restore drills for
  supported guarded routes

Still unsupported: 33+ operations, arbitrary broad `apply_patch`, fuzzy patch,
binary/mode/symlink/submodule/copy metadata application, directory operations,
overwrite/path conflict expansion, automatic recovery, and atomic rollback.

## Bounded Reference Scan

Files inspected: 15 total.

- opencode, 6 files:
  `/home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/patch/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/session/revert.ts`,
  `/home/wang/projects/opencode/packages/opencode/test/tool/apply_patch.test.ts`,
  `/home/wang/projects/opencode/packages/opencode/src/permission/index.ts`
- gemini-cli, 5 files:
  `/home/wang/projects/gemini-cli/packages/core/src/tools/edit.ts`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/write-file.ts`,
  `/home/wang/projects/gemini-cli/packages/cli/src/ui/commands/restoreCommand.ts`,
  `/home/wang/projects/gemini-cli/docs/cli/checkpointing.md`,
  `/home/wang/projects/gemini-cli/packages/core/src/tools/tool-error.ts`
- ClaudeCode, 4 files:
  `/home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts`,
  `/home/wang/projects/source-claudecode/tools/FileEditTool/utils.ts`,
  `/home/wang/projects/source-claudecode/tools/FileWriteTool/FileWriteTool.ts`,
  `/home/wang/projects/source-claudecode/utils/fileHistory.ts`

Directional findings:

- opencode treats patch parsing, permission metadata, application, and snapshot
  revert as separate responsibilities. Its patch tests include multi-operation
  add/update/delete/move-style cases and permission metadata, while revert
  relies on snapshot authority.
- gemini-cli separates edit/write result calculation from checkpoint restore.
  Checkpoint restore depends on a shadow-git snapshot plus stored tool-call
  metadata. Its edit path has fuzzy/flexible replacement support, which this
  project deliberately keeps unsupported.
- ClaudeCode uses narrow file edit/write tools, stale-read protections, and
  file-history capture before writes. It supports conceptual restore authority
  through file history rather than result metadata alone.

Implication for this project: copy the responsibility split conceptually, not
implementation code. The gauntlet should prove realistic patch shapes reach
existing guarded routes only when they fit the bounded contract, and prove
unsupported shapes remain no-write with precise reasons.

## Fixture Category Map

The Route 71 harness lives at
`packages/ts-shell/src/orchestration/patchResult/editCompatibilityGauntlet.test.ts`.

Each fixture records:

- source kind: marker patch, git-style diff, model output with prose,
  malformed input, or unsupported metadata
- expected status: supported or blocked
- expected family: single, update-only, mixed, delete-only, move-only, or
  unsupported
- expected operation count and affected paths
- whether routing, writer reachability, recovery-authority capture, or no-write
  behavior is expected

## Supported Fixture Categories

Covered supported shapes:

- marker-style single update
- marker-style add file
- marker-style delete file
- marker-style pure move
- marker-style 32-operation update-only batch
- marker-style bounded mixed update/add/delete/move batch
- git-style single update
- git-style exact multi-hunk update
- git-style add file
- git-style delete file
- git-style pure rename
- git-style rename-with-content-edit
- git-style mixed multi-file patch within cap
- fenced git-style single update
- fenced git-style add file
- fenced git-style delete file
- fenced git-style pure rename
- fenced git-style rename-with-content-edit
- fenced git-style mixed multi-file patch within cap
- fenced git-style 32-operation update-only batch
- model output with prose around marker patch
- fenced marker patch block

Route 72 now supports one clearly fenced git-style broad diff by extracting the
fenced payload and feeding it to the existing bounded normalizer. This does not
open arbitrary prose parsing or broad arbitrary `apply_patch`.

## Blocked Fixture Categories

Covered blocked shapes:

- 33-operation patch
- arbitrary broad unsupported shape
- fuzzy/no-newline-style patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory delete
- directory move
- overwrite/path conflict
- outside-workspace path
- malformed diff
- ambiguous hunk
- index-only metadata
- unsupported newline-sensitive shape
- rename-with-content-edit over cap
- rename-with-content-edit with unsupported metadata
- multiple fenced patch blocks
- incomplete fenced patch
- non-patch code fence
- fenced 33-operation patch
- fenced binary patch
- fenced mode/chmod patch
- fenced fuzzy/no-newline unsupported shape
- prose with two patch candidates

Blocked assertions require `no-write-authority` and `no-recovery-execution`
evidence. They do not reach writer execution, do not capture recovery
authority by default, and do not produce success-like changed files.

## Coverage Model

Parser and normalizer coverage:

- marker patches are parsed by the existing marker parser
- git-style safe-subset patches normalize to marker patches
- unsupported broad metadata maps through the existing reason taxonomy
- fenced marker patches and prose-wrapped marker patches are accepted because
  the marker parser searches for begin/end markers in order
- one clear fenced git-style broad diff is extracted and normalized through the
  same bounded broad patch normalizer
- ambiguous fenced/prose shapes remain no-write

Candidate and routing coverage:

- supported fixtures classify to the expected operation family
- affected paths and approval paths include source and target paths for moves
- 32 operations remains supported; 33 operations remains blocked
- representative supported fixtures route through existing guarded writers

No-write preservation:

- unsupported candidates return no write authority
- no-write/runtime paths keep `changedFiles=[]`
- approval-pending or dry-run style evidence does not become write
  authorization
- blocked fixtures do not create recovery surfaces

## Recovery-Authority And Restore Drill Model

The gauntlet proves non-default recovery-authority capture for two executable
fixtures:

- git-style rename-with-content-edit
- git-style mixed update/add/delete/move

It also drills explicit restore behavior for:

- rename-with-content-edit partial failure after move succeeds and target
  update fails
- current-content mismatch blocking hidden user edit overwrite
- 32-operation mixed partial failure, where the changed prefix and failed
  suffix are represented and explicit restore applies only to selected captured
  prefix records
- blocked over-cap fixture, which has no recovery surface or restore
  availability

Route result `recoveryExecuted` remains false when recovery surface exists.
Explicit restore results are separate restore outputs. `rollbackAtomicityClaim`
remains false.

## Compatibility Summary

- Supported fixture categories: 22.
- Blocked fixture categories: 26.
- Executable route representatives: 6.
- Recovery-authority capture representatives: 2.
- Restore drill representatives: 3.
- Runtime code fixes required by Route 71: none.

The existing Route 70 implementation already satisfied the bounded realistic
shapes after the Route 71 gauntlet was added. Route 72 added a targeted fenced
git-style broad diff extractor and proved the supported fenced shapes plus the
blocked ambiguous/prose shapes.

## Closeout Implications

Route 71/72 improve confidence that the bounded edit surface handles realistic
agent output categories without claiming broad edit readiness. Route 72 adds a
focused package script for closeout verification, but does not change provider,
session, CLI, MCP, default gates, default persistence, automatic recovery, or
atomic rollback.

Next-route decision criteria:

- If current bounded behavior remains stable, Route 73 should be an edit
  capability closeout map and seal. Status: implemented as closeout-candidate
  evidence.
- If blocked-shape explanations are confusing, a future route can polish user/session
  unsupported edit explanations without changing write capability.

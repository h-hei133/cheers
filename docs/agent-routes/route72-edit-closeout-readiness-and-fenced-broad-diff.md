# Route 72: edit closeout readiness and fenced broad diff extraction

## Objective

Move edit capability toward closeout without falling back to docs-only work.

Route 71 added a realistic edit compatibility gauntlet and documented one meaningful remaining gap: fenced git-style broad diff extraction remains unsupported.

Route 72 should combine:

- implement fenced git-style broad diff extraction for the existing safe bounded parser subset
- preserve unsupported arbitrary broad/fuzzy/binary/mode/symlink/submodule boundaries
- decide default vs non-default readiness for current edit capability
- add an edit closeout readiness gate or focused verifier if local conventions support it
- update the edit capability roadmap from "active expansion" toward "closeout candidate"

This route should be implementation-heavy but bounded.

It must not implement arbitrary broad apply_patch, fuzzy patch, automatic recovery, atomic rollback, default recovery persistence, provider/MCP changes, or broad CLI lifecycle rewrites.

## Current state

Build on the current working tree. Do not reset Route 57-71 changes.

Current supported edit surface:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-32 files
- bounded mixed batches with 2-32 operations
- bounded delete-only batches with 2-32 files
- bounded move-only batches with 2-32 moves
- bounded apply_patch candidates with parser-supported 1-32 operations
- safe git-style broad patch normalization for update/add/delete/pure rename
- multi-hunk exact update support
- rename-with-content-edit decomposition into move + target update
- realistic compatibility gauntlet covering supported and blocked fixtures

Still blocked:

- 33+ writes
- arbitrary broad apply_patch
- fuzzy patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory operations
- overwrite/path conflict
- automatic recovery
- atomic rollback
- default recovery persistence

Current recovery surface:

- non-default recovery authority store
- pre-write capture across supported bounded write surfaces
- guarded restore primitive
- restore preview
- explicit restore execution bridge
- recovery authority index
- session/user recovery summary
- local /restore command path
- no automatic recovery
- no atomic rollback

Known Route 71 residual risk:

- fenced git-style broad diff extraction remains unsupported
- broad arbitrary patch readiness remains unclaimed

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 5 directly relevant files
- gemini-cli: inspect at most 4 directly relevant files
- ClaudeCode: inspect at most 3 directly relevant files
- total external files: at most 12
- exceed by at most 2 files only if a direct model-output extraction or fenced patch file is clearly useful
- do not copy implementation code verbatim
- record path references, fixture ideas, and implications only

Search focus:

opencode:

- apply_patch
- fenced
- markdown
- patch parser
- tool result
- diff metadata
- permission

gemini-cli:

- edit
- write-file
- markdown
- code fence
- tool result
- patch
- diff

ClaudeCode:

- FileEditTool
- FileWriteTool
- markdown
- tool result
- old_string
- new_string
- edit failure

The scan should answer:

1. How do references handle model output with prose or fenced patches?
2. Do they extract patches from markdown fences or require tool-structured input?
3. What fenced broad diff shapes are common enough to support?
4. Which fenced/prose shapes should remain blocked?
5. What closeout/readiness evidence do they rely on for edit capability?

Record findings in docs/design/edit-closeout-readiness-and-fenced-broad-diff.md.

## Validation policy

Use focused validation. Do not run broad package tests.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After docs-only tasks:

- rtk git diff --check

After code/test tasks:

- run focused tests for touched modules only
- rtk git diff --check

Final:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing src/orchestration/patchResult src/orchestration/patchRecovery
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If a focused closeout verifier is added:

- run that verifier in final validation

Do not run broad package tests.

Do not run provider/default/MCP gates.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/realistic-edit-compatibility-gauntlet.md
- docs/design/rename-content-and-broad-shape-gauntlet.md
- docs/design/expanded-bounded-broad-patch-safe-subset.md
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/recovery-authority-coverage-drills.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/boundedBroadPatchNormalizer.ts
- packages/ts-shell/src/orchestration/patchParsing/broadPatchUnsupportedReason.ts
- packages/ts-shell/src/orchestration/patchResult/editCompatibilityGauntlet.test.ts
- packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts
- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/singleFileApplyPatchDryRun.ts

Recovery / restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Conditionally inspect scripts only if adding a closeout verifier:

- scripts/*
- package.json

Do not modify package.json unless a minimal existing verifier convention clearly supports it.

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- focused tests and fixtures for touched modules
- docs/design/edit-closeout-readiness-and-fenced-broad-diff.md
- docs/design/edit-capability-roadmap.md, Route 72 update only
- docs/design/realistic-edit-compatibility-gauntlet.md, Route 72 note only
- docs/design/bounded-broad-patch-parser-normalizer.md, Route 72 note only
- this route spec

Conditionally allowed:

- a focused closeout verifier script if local conventions support it, for example:
  - scripts/verify-edit-capability-closeout.mjs
- package.json script entry only if the repository already has capability-specific verifier script entries and the addition is minimal

Preferred implementation style:

- add a small fenced patch extraction helper rather than broad parser rewrite
- reuse existing boundedBroadPatchNormalizer and boundedApplyPatchCandidate
- keep arbitrary prose parsing conservative
- support only clearly fenced broad diff blocks
- preserve no-write behavior for ambiguous/multiple fenced blocks if unsafe

Forbidden unless a blocker is reported first:

- arbitrary broad apply_patch
- 33+ writes
- fuzzy patch recovery
- binary patch application
- mode/chmod patch application
- symlink/submodule patch application
- directory delete/move
- overwrite
- default durable persistence
- automatic recovery
- atomic transaction rollback
- provider/session/MCP behavior changes
- broad CLI lifecycle rewrite
- SessionManager persistence changes
- broad model-output parser that accepts ambiguous prose as code changes

## Batched tasks

### Task 1: closeout readiness design note

Create docs/design/edit-closeout-readiness-and-fenced-broad-diff.md.

Include:

- post-Route 71 baseline
- bounded reference scan summary
- current fenced broad diff blocker
- supported fenced extraction decision
- blocked ambiguous/prose shapes
- closeout readiness categories
- default vs non-default readiness decision model
- edit capability closeout gate design
- recovery-authority and restore UX requirements
- unsupported-shape boundaries
- residual non-goals
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: implement fenced broad diff extraction helper

Add a focused helper if current parser lacks clean ownership.

Preferred file:

- packages/ts-shell/src/orchestration/patchParsing/fencedPatchExtractor.ts

Supported extraction:

- one fenced code block containing git-style diff / unified diff
- fence languages:
  - diff
  - patch
  - text, only if content clearly starts with diff --git or ---/+++
  - no language, only if content clearly starts with diff --git or ---/+++
- optional prose before/after the single fenced block
- trim surrounding whitespace
- preserve content inside fence exactly enough for boundedBroadPatchNormalizer

Blocked extraction:

- multiple patch-looking fenced blocks unless local semantics clearly choose one safely
- mixed prose with multiple candidate patches
- non-patch fenced code
- incomplete fence
- ambiguous nested fences
- fenced content exceeding operation cap after normalization
- arbitrary prose diff not fenced unless already supported safely

Preferred output:

- status:
  - "extracted"
  - "not-needed"
  - "unsupported"
  - "malformed"
- extractedPatch
- sourceKind:
  - "fenced-git-diff"
  - "fenced-unified-diff"
  - "raw-patch"
  - "unknown"
- rejectionReason
- evidence

The helper must not:

- read files
- write files
- authorize writes
- apply patches
- perform fuzzy matching

Minimum validation:

- focused tests for fencedPatchExtractor
- rtk git diff --check

### Task 3: connect fenced extraction to normalizer/candidate pipeline

Update parser / boundedBroadPatchNormalizer / boundedApplyPatchCandidate integration where clean.

Required behavior:

- raw git-style broad patch still works
- fenced git-style broad patch now normalizes through existing boundedBroadPatchNormalizer
- supported fenced patch routes through existing guarded small-N paths
- unsupported fenced shapes return precise no-write reasons
- multiple ambiguous fenced patch blocks remain blocked
- no-write/dry-run remains non-authorizing
- approval-pending never becomes write authorization
- recoveryAuthority capture remains route-level and explicit non-default only

Minimum validation:

- focused parser / normalizer / candidate tests
- rtk git diff --check

### Task 4: update compatibility gauntlet for fenced broad diff

Extend the Route 71 gauntlet.

Required supported fixtures:

1. fenced git-style single update
2. fenced git-style add file
3. fenced git-style delete file
4. fenced git-style pure rename
5. fenced git-style rename-with-content-edit
6. fenced git-style mixed patch within cap
7. fenced git-style 32-operation patch

Required blocked fixtures:

1. multiple fenced patch blocks
2. incomplete fence
3. non-patch code fence
4. fenced 33-operation patch
5. fenced binary patch
6. fenced mode/chmod patch
7. fenced fuzzy/no-newline unsupported shape
8. prose with two patch candidates

Required assertions:

- supported fenced fixtures normalize to expected operation family/count
- executable slice reaches guarded routes for at least two cases
- blocked fixtures remain no-write
- blocked fixtures return precise reason
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused editCompatibilityGauntlet / parser / candidate tests
- rtk git diff --check

### Task 5: closeout readiness decision model

Add a small pure readiness helper if useful.

Preferred file:

- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.ts

Alternative:

- keep as documentation if code would be unnecessary.

The readiness model should classify current edit capabilities:

- default-ready candidate
- non-default-ready candidate
- explicit-opt-in only
- blocked by design
- future research

Capabilities to classify:

- single update/create/delete/move
- bounded 2-32 update-only
- bounded 2-32 mixed
- bounded 2-32 delete-only
- bounded 2-32 move-only
- bounded broad patch safe subset
- fenced bounded broad patch safe subset
- recoveryAuthority capture
- restore preview
- restore execute
- arbitrary broad apply_patch
- fuzzy patch
- automatic recovery
- atomic rollback

Readiness should be based on evidence:

- focused tests
- gauntlet coverage
- result-contract
- build
- recovery/restore coverage
- default persistence policy

The helper must not change runtime behavior.

Minimum validation:

- focused tests for readiness helper if added
- rtk git diff --check

### Task 6: add edit closeout verifier if local conventions support it

If existing scripts convention makes this clean, add a focused verifier.

Preferred file:

- scripts/verify-edit-capability-closeout.mjs

Possible package script only if local convention supports it:

- verify:edit-capability-closeout

Verifier should run a bounded, deterministic suite or inspect test availability for:

- parser / normalizer tests
- broad unsupported reason tests
- bounded apply patch candidate tests
- edit compatibility gauntlet
- patchResult / patchRecovery focused tests
- result-contract if appropriate

If adding a script/package entry is too intrusive, skip script and document why. Do not let this block the route.

Minimum validation:

- run verifier if added
- rtk git diff --check

### Task 7: default vs non-default readiness documentation

Update docs/design/edit-closeout-readiness-and-fenced-broad-diff.md and docs/design/edit-capability-roadmap.md.

Required decisions:

Default-ready candidate:

- safe parser-supported bounded edit capabilities that already match existing runtime defaults, if true

Explicit opt-in / non-default:

- recoveryAuthority capture
- restore execute
- any persistence-backed behavior

Blocked by design:

- arbitrary broad apply_patch
- fuzzy patch
- binary/mode/symlink/submodule
- directory delete/move
- overwrite
- automatic recovery
- atomic rollback

Need more evidence:

- any capability whose tests are still fixture-only and not executable
- any capability with user/session ambiguity

Be honest. Do not overclaim default readiness.

Minimum validation:

- rtk git diff --check

### Task 8: roadmap and evidence update

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 72 as implemented if completed
- update capability inventory:
  - fenced bounded broad diff safe subset supported if implemented
  - edit closeout readiness model exists
  - arbitrary broad apply_patch remains unsupported
  - fuzzy patch remains unsupported
- add evidence rows for fenced extraction and closeout verifier/readiness model
- update recommended future sequence

Update docs/design/realistic-edit-compatibility-gauntlet.md and docs/design/bounded-broad-patch-parser-normalizer.md as needed.

Recommended next route should be one of:

1. Route 73: edit capability closeout map and seal
   - if Route 72 completes fenced extraction and readiness model

2. Route 73: targeted closeout blocker fix
   - if Route 72 finds one concrete blocker

3. Route 73: context engineering kickoff
   - only if edit closeout is credible enough

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of Route 72:

- Route 71 gauntlet behavior
- Route 70 rename-with-content behavior
- bounded cap 32 behavior
- raw git-style broad patch behavior
- dry-run/no-write does not authorize writes
- arbitrary broad apply_patch blocked behavior
- fuzzy patch blocked behavior
- binary/mode/symlink/submodule blocked behavior
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- package scripts unless closeout verifier follows convention
- provider/session/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority for supported fenced fixtures under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- design note exists
- bounded reference scan is summarized
- fenced patch extractor exists and is tested, or existing parser support is clearly reused
- supported fenced git-style broad diff fixtures normalize and route through existing guarded paths
- blocked fenced/prose ambiguous shapes remain no-write
- Route 71 gauntlet includes fenced broad diff cases
- closeout readiness model exists in docs and optionally code
- closeout verifier exists if local conventions support it, or blocker is documented
- default vs non-default readiness decisions are documented
- no-write/dry-run remains non-authorizing
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- arbitrary broad apply_patch readiness is not claimed
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- fenced extraction requires arbitrary prose parser
- fenced extraction cannot distinguish single patch block safely
- closeout verifier requires broad package test stabilization
- no-write planning would become write authorization
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Fenced extractor status
5. Supported fenced fixture groups
6. Blocked fenced/prose groups
7. Closeout readiness model status
8. Closeout verifier status
9. Default vs non-default readiness decisions
10. No-write / dry-run preservation
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime behavior changed outside new fenced support? yes/no
14. Beyond-cap writes still blocked? yes/no
15. Arbitrary broad apply_patch still blocked? yes/no
16. Fuzzy/binary/mode/symlink/submodule still blocked? yes/no
17. Automatic recovery added? yes/no
18. Atomic rollback added? yes/no
19. Existing result fields preserved
20. Focused validation
21. Final validation
22. Residue cleanup
23. Residual risks
24. Next recommended route
25. Proposed commit message

Do not commit or push.

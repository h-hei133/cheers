# Route 71: realistic edit compatibility gauntlet and closeout hardening

## Objective

Build a realistic edit compatibility gauntlet after Route 70 and use it to harden the edit capability toward closeout.

Route 70 added:

- centralized unsupported broad-shape reason metadata
- safe git-style rename-with-content-edit decomposition into move + target update
- bounded cap 32 preservation
- parser/candidate/mixed-route/per-file-plan/mutation-routing coverage
- partial-failure restore evidence
- hidden-edit restore blocking

Route 71 should now validate the entire edit stack against realistic input shapes inspired by ClaudeCode, opencode, gemini-cli, and generic model outputs.

This route should not merely add unit tests. It should create a reusable compatibility gauntlet that exercises:

- patchParsing
- bounded broad patch normalization
- bounded apply_patch candidate classification
- mutation routing
- bounded write execution where safe
- no-write / unsupported surfaces
- recovery-authority capture
- recoveryPlan / recoverySurface behavior
- explicit restore drill behavior

If the gauntlet exposes small bounded gaps, fix them in this route. Do not open new broad/arbitrary edit capability.

## Current state

Build on the current working tree. Do not reset Route 57-70 changes.

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
- unsupported broad-shape reason taxonomy

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
- provider/session/MCP changes

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

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repositories:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 5 directly relevant files
- ClaudeCode: inspect at most 4 directly relevant files
- total external files: at most 15
- exceed by at most 2 files only if a direct fixture/parser/edit-output file is clearly useful
- do not copy implementation code verbatim
- record path references, fixture ideas, and implications only

Search focus:

opencode:

- apply_patch
- patch parser
- patch fixtures
- edit tool
- write tool
- diff metadata
- snapshot
- revert
- permission

gemini-cli:

- edit
- write-file
- restore
- checkpoint
- tool result
- diff
- patch
- file operation

ClaudeCode:

- FileEditTool
- FileWriteTool
- old_string
- new_string
- fileHistory
- stale
- edit failure
- tool result

The scan should answer:

1. What realistic edit output shapes should the gauntlet include?
2. Which shapes are common and should be supported?
3. Which shapes should remain blocked with precise reasons?
4. Which model-output wrinkles are likely: fenced patches, prose around patches, repeated hunks, missing newline markers, rename/content combinations?
5. What fixture categories best approximate top-tier agent edit behavior without copying source code?

Record findings in docs/design/realistic-edit-compatibility-gauntlet.md.

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

Do not run broad package tests.

Do not run provider/default/MCP gates.

If focused path tests include unrelated existing shell recovery failures, narrow to touched parser/result/recovery tests and document unrelated failures.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/rename-content-and-broad-shape-gauntlet.md
- docs/design/expanded-bounded-broad-patch-safe-subset.md
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/recovery-authority-coverage-drills.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/boundedBroadPatchNormalizer.ts
- packages/ts-shell/src/orchestration/patchParsing/broadPatchUnsupportedReason.ts
- packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts
- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/singleFileApplyPatchDryRun.ts

Recovery / restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present

Tests:

- parser tests
- boundedBroadPatchNormalizer tests
- broadPatchUnsupportedReason tests
- boundedApplyPatchCandidate tests
- mutationRoutingProjection tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- multiFileWriteRoute tests
- singleFileApplyPatchDryRun tests
- patchRecovery tests touched by recovery-authority capture

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- focused tests and fixtures for touched modules
- docs/design/realistic-edit-compatibility-gauntlet.md
- docs/design/edit-capability-roadmap.md, concise Route 71 update only
- docs/design/rename-content-and-broad-shape-gauntlet.md, Route 71 note only
- docs/design/expanded-bounded-broad-patch-safe-subset.md, Route 71 note only
- this route spec

Conditionally allowed if the repo has an existing fixture convention:

- focused fixture files under patchParsing / patchResult test fixture directories

Preferred implementation style:

- inline fixtures are acceptable if no fixture convention exists
- shared fixture runner/helper is preferred over large duplicated test code
- route should fix small bounded gaps exposed by the gauntlet
- route should not invent a new broad arbitrary patch engine

Forbidden unless a blocker is reported first:

- full arbitrary broad apply_patch support
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
- package scripts
- default gates
- git/shadow-git integration
- broad parser rewrite that bypasses existing guarded routes
- SessionManager persistence changes

## Batched tasks

### Task 1: realistic edit gauntlet design note

Create docs/design/realistic-edit-compatibility-gauntlet.md.

Include:

- post-Route 70 baseline
- bounded reference scan summary
- fixture category map
- supported fixture categories
- blocked fixture categories
- parser / normalizer / candidate / route / recovery coverage model
- no-write preservation model
- recovery-authority capture model
- restore drill model
- compatibility scoring or coverage summary
- closeout implications
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: add compatibility gauntlet harness

Add a focused test harness/helper for edit fixtures if useful.

Preferred location options:

- packages/ts-shell/src/orchestration/patchParsing/editCompatibilityGauntlet.test.ts
- packages/ts-shell/src/orchestration/patchResult/editCompatibilityGauntlet.test.ts
- shared test helper under existing local test helper conventions

The gauntlet should support fixture cases with:

- name
- sourceKind:
  - marker-apply-patch
  - git-style-diff
  - model-output-with-prose
  - malformed
  - unsupported-metadata
- expectedStatus:
  - supported
  - blocked
- expectedFamily:
  - single
  - update-only
  - mixed
  - delete-only
  - move-only
  - unsupported
- expectedOperationCount
- expectedBlockedReason
- expectedAffectedPaths
- shouldReachRouting
- shouldReachWriter, only for focused executable route tests
- shouldCaptureRecoveryAuthority
- shouldRemainNoWrite

The harness must not make unsupported fixtures write.

Minimum validation:

- focused gauntlet harness tests
- rtk git diff --check

### Task 3: supported fixture corpus

Add realistic supported fixtures.

Required supported categories:

1. marker-style single update
2. marker-style add file
3. marker-style delete file
4. marker-style move file
5. marker-style bounded 32-operation update-only
6. marker-style bounded mixed update/add/delete/move
7. git-style single update
8. git-style multi-hunk update
9. git-style add file
10. git-style delete file
11. git-style pure rename
12. git-style rename-with-content-edit
13. git-style mixed multi-file patch within cap
14. model output with prose before/after a valid patch, if current parser conventions allow extraction
15. fenced patch block, if current parser conventions allow extraction

Expected assertions:

- supported fixtures normalize/classify to expected operation family
- supported fixtures produce affected/approval paths
- supported fixtures remain within cap 32
- supported fixtures route through existing guarded paths when executable in focused tests
- no default persistence
- no automatic recovery
- no atomic rollback

If prose/fenced extraction is unsupported by current parser and adding it would be broad, keep it blocked with precise reason and document the blocker.

Minimum validation:

- focused parser/candidate/routing tests
- rtk git diff --check

### Task 4: blocked fixture corpus

Add realistic blocked fixtures.

Required blocked categories:

1. 33-operation patch
2. arbitrary broad unsupported shape
3. fuzzy-like patch / missing exact context
4. binary patch
5. mode/chmod patch
6. symlink patch
7. submodule patch
8. copy metadata
9. directory delete
10. directory move
11. overwrite/path conflict
12. outside-workspace path
13. malformed diff
14. ambiguous hunk
15. index-only change
16. no-newline / unsupported newline-sensitive shape if still blocked
17. rename-with-content-edit over cap
18. rename-with-content-edit with unsupported metadata

Expected assertions:

- blocked fixtures return precise unsupported reason
- blocked fixtures remain no-write
- blocked fixtures do not reach writer
- blocked fixtures do not capture recoveryAuthority by default
- dry-run/no-write does not authorize writes
- doNext / reason metadata is present where contract allows

Minimum validation:

- focused parser/candidate/no-write tests
- rtk git diff --check

### Task 5: end-to-end executable fixture slice

Add a small executable slice through mutationRoutingProjection / existing routes.

Do not execute every fixture. Use representative cases.

Required executable cases:

1. git-style rename-with-content-edit executes through move+update path
2. git-style mixed update/add/delete/move patch executes through bounded mixed route
3. marker-style 32-operation update-only executes through bounded update route
4. git-style delete-only or move-only batch executes through bounded destructive path
5. non-default recoveryAuthority capture works for at least two executable fixtures

Required assertions:

- changedFiles / failedFiles / plannedFiles preserved
- postWriteVerification preserved
- writer flags preserved
- recoveryPlan present where expected
- recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- no automatic recovery
- default path has no persistence

Minimum validation:

- focused mutationRoutingProjection / route tests
- rtk git diff --check

### Task 6: partial-failure restore gauntlet slice

Add representative restore drills for gauntlet fixtures.

Required drills:

1. rename-with-content-edit partial failure:
   - move succeeds
   - update fails
   - explicit restore can undo changed prefix when current-content guard matches
   - hidden user edit blocks restore

2. 32-operation mixed partial failure:
   - changed prefix and failed suffix are represented
   - restore drill covers changed prefix only
   - no atomic rollback claim

3. blocked fixture:
   - no recovery authority capture
   - no restore preview / execute availability

Required assertions:

- route result recoveryExecuted remains false
- explicit restore result may report restored files separately
- rollbackAtomicityClaim remains false
- current-content mismatch blocks restore
- no hidden user edit overwrite

Minimum validation:

- focused route / patchRecovery tests
- rtk git diff --check

### Task 7: harden no-write / unsupported output consistency

Use the gauntlet to ensure unsupported shapes have consistent no-write surfaces.

Required behavior:

- unsupported broad shape has precise reason
- too many operations reason is consistent
- fuzzy/binary/mode/symlink/submodule/copy reasons are consistent
- dry-run/no-write never authorizes writes
- approval-pending never becomes write authorization
- unsupported results preserve result contract
- doNext is actionable where existing contract allows:
  - reduce operation count to 32 or fewer
  - remove unsupported metadata
  - use marker-style patch
  - split patch
  - avoid fuzzy/binary/mode/symlink/submodule shapes

Minimum validation:

- focused dry-run / unsupported tests if touched
- verify:result-contract in final
- rtk git diff --check

### Task 8: fix small bounded gaps exposed by gauntlet

If the gauntlet exposes small bounded gaps, fix them in this route.

Allowed examples:

- inconsistent unsupported reason
- missing affected path in projection
- incorrect operation count
- route family misclassification
- safe fixture not reaching existing guarded route due to a narrow classifier bug
- no-write surface missing doNext
- recoveryAuthority not passed through for a supported bounded fixture

Forbidden examples:

- adding fuzzy patch engine
- adding arbitrary broad patch engine
- bypassing workspace/preflight/approval
- increasing cap beyond 32
- touching provider/session/MCP
- adding automatic recovery
- adding atomic rollback

Minimum validation:

- focused tests for each fix
- rtk git diff --check

### Task 9: roadmap and design evidence update

Update docs/design/realistic-edit-compatibility-gauntlet.md with final implementation notes:

- fixture categories added
- supported fixture count
- blocked fixture count
- executable slice coverage
- restore drill coverage
- small gaps fixed
- residual risks
- closeout implications
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 71 as implemented if completed
- add evidence rows for realistic edit compatibility gauntlet
- summarize supported/blocked fixture categories
- keep arbitrary broad apply_patch readiness unclaimed
- keep fuzzy patch unsupported
- update recommended future sequence

Update docs/design/rename-content-and-broad-shape-gauntlet.md and docs/design/expanded-bounded-broad-patch-safe-subset.md as needed.

Recommended next route should be one of:

1. Route 72: edit capability closeout map and default/non-default readiness decision
   - if gauntlet passes and remaining broad shapes are intentionally blocked

2. Route 72: targeted parser gap follow-up
   - if gauntlet reveals one high-value bounded parser gap

3. Route 72: user/session unsupported edit explanation polish
   - if core behavior is stable but user-facing no-write explanations are weak

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of gauntlet hardening:

- Route 70 supported behavior
- bounded cap 32 behavior
- dry-run/no-write does not authorize writes
- arbitrary broad apply_patch blocked behavior
- fuzzy patch blocked behavior
- binary/mode/symlink/submodule blocked behavior
- changedFiles semantics
- failedFiles semantics
- plannedFiles semantics
- postWriteVerification semantics
- writer flags
- package scripts
- provider/session/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority for supported gauntlet fixtures under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- realistic edit compatibility gauntlet design note exists
- bounded reference scan is summarized
- gauntlet harness exists or fixture structure is clearly implemented
- supported fixture corpus covers marker-style, git-style, rename-content, multi-hunk, mixed, and bounded cap cases
- blocked fixture corpus covers too-many, fuzzy, binary, mode, symlink, submodule, copy, directory, overwrite/conflict, malformed, and outside-workspace cases
- executable fixture slice proves representative supported fixtures reach guarded routes
- restore drill slice proves recoveryAuthority + explicit restore behavior for representative fixtures
- blocked fixtures remain no-write
- dry-run/no-write remains non-authorizing
- small bounded gaps found by the gauntlet are fixed or documented
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

- fixture compatibility requires arbitrary broad parser
- fixture compatibility requires fuzzy matching
- no-write planning would become write authorization
- recoveryAuthority capture cannot happen before writer for supported fixture
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Gauntlet harness status
5. Supported fixture categories
6. Blocked fixture categories
7. Executable fixture slice
8. Restore drill slice
9. Small bounded gaps fixed
10. No-write / dry-run preservation
11. Files changed
12. Forbidden files touched? yes/no
13. Default runtime behavior changed outside gauntlet fixes? yes/no
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

# Route 68: bounded broad patch parser and normalizer implementation

## Objective

Implement the next bounded broad apply_patch step after Route 67.

Route 67 added bounded apply_patch candidate routing for parser-supported 1-8 operations. It kept arbitrary broad apply_patch blocked because many broad patch / unified diff / git-style patch shapes are still rejected at the parser/shape layer.

Route 68 should start dismantling that parser/shape blocker by adding an opencode-style bounded broad patch parser / normalizer for a safe subset.

This route should not merely improve unsupported UX unless the parser audit finds a real blocker.

Target capability:

- parse a safe subset of broad patch / unified diff / git-style patch payloads
- normalize them into existing bounded small-N operation families
- route normalized 1-8 operation candidates through existing guarded write paths
- keep 9+ blocked
- keep unsupported arbitrary broad shapes blocked
- keep fuzzy patch blocked
- keep directory operations blocked
- keep overwrite blocked
- preserve recovery-authority capture and explicit restore UX

This route must not claim full broad arbitrary apply_patch readiness.

## Current state

Build on the current working tree. Do not reset Route 57-67 changes.

Current supported write surface:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-8 files
- bounded mixed batches with 2-8 operations
- bounded delete-only batches with 2-8 files
- bounded move-only batches with 2-8 moves
- bounded apply_patch candidates with parser-supported 1-8 operations
- 9+ writes remain blocked
- broad arbitrary apply_patch remains blocked

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

Known remaining broad blocker:

- parser/shape layer rejects many broad patch payloads before they can become bounded apply_patch candidates.
- Route 67 classifier is not a broad patch parser.
- unsupported unified diff / arbitrary patch shapes remain no-write.

## Reference scan first

Do a bounded implementation-oriented scan before code edits.

Primary reference repository:

- opencode: /home/wang/projects/opencode

Secondary references:

- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 8 directly relevant files
- gemini-cli: inspect at most 3 directly relevant files
- ClaudeCode: inspect at most 2 directly relevant files
- total external files: at most 13
- exceed by at most 2 files only if a direct parser/normalizer file is clearly useful
- do not copy implementation code verbatim
- port architecture and boundaries only
- record path references and practical implications

Search focus:

opencode:

- apply_patch
- patch parser
- patch/index
- diff parser
- update file
- add file
- delete file
- move file
- permission
- snapshot

gemini-cli:

- edit
- write-file
- apply patch
- diff
- tool result
- checkpoint

ClaudeCode:

- FileEditTool
- FileWriteTool
- old_string
- new_string
- fileHistory
- stale

The scan should answer:

1. How does opencode parse broad patch input into per-file operations?
2. What patch shapes does it reject before apply?
3. How does it represent add/update/delete/move metadata?
4. How does it separate parse / normalize / permission / apply?
5. What is the smallest local parser subset that can feed existing bounded small-N routes?

Record findings in docs/design/bounded-broad-patch-parser-normalizer.md.

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

If focused path tests include unrelated existing shell recovery failures, narrow to touched parser/result/recovery tests and document the unrelated failures.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/explicit-restore-surface.md
- docs/design/minimum-recovery-authority-loop.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts
- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts
- packages/ts-shell/src/orchestration/patchResult/singleFileApplyPatchDryRun.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileUpdatePlanning.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts

Recovery / restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts

Tests:

- patchParsing parser tests
- boundedApplyPatchCandidate tests
- mutationRoutingProjection tests
- singleFileApplyPatchDryRun tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- multiFileWriteRoute tests
- mixedFileWriteRoute tests
- patchRecovery tests touched by recovery-authority capture

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests for touched modules
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/edit-capability-roadmap.md, concise Route 68 update only
- docs/design/bounded-broad-apply-patch-candidate.md, Route 68 note only
- this route spec

Conditionally allowed if clean:

- a new parser/normalizer helper such as:
  - broadPatchNormalizer.ts
  - boundedBroadPatchParser.ts
  - unifiedDiffBoundedParser.ts
  - gitPatchSmallNNormalizer.ts

Forbidden unless a blocker is reported first:

- full arbitrary broad apply_patch support
- 9+ writes
- fuzzy patch recovery
- overwrite
- directory delete/move
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

### Task 1: bounded broad patch parser design note

Create docs/design/bounded-broad-patch-parser-normalizer.md.

Include:

- post-Route 67 baseline
- bounded reference scan summary
- current parser/shape blocker
- supported safe parser subset
- unsupported broad shapes
- normalization model
- operation-count boundary
- workspace / approval / stale-read / verification semantics
- recovery-authority capture semantics
- result / journal / recoveryPlan semantics
- restore UX interaction
- no fuzzy patch / no arbitrary broad readiness
- why 9+ remains blocked
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: parser blocker audit

Audit current parser and broad apply_patch rejection surfaces.

Document findings in the design note.

The audit should answer:

- where malformed / unsupported broad patch is detected
- what parser-supported operation shapes already exist
- what parser-supported shapes Route 67 can now route
- what unified diff / git-style patch shapes are currently rejected
- which rejected shapes can be safely normalized
- which rejected shapes require fuzzy matching or arbitrary patch engine and must remain blocked
- where no-write/dry-run surfaces explain the blocker
- what must change without authorizing writes in dry-run/no-write mode

Minimum validation:

- no tests required unless code is touched
- rtk git diff --check

### Task 3: implement bounded broad patch normalizer

Add a pure parser/normalizer helper.

Preferred location:

- packages/ts-shell/src/orchestration/patchParsing/boundedBroadPatchNormalizer.ts

Preferred supported safe subset:

1. git-style file patch headers:
   - diff --git a/path b/path
   - --- a/path
   - +++ b/path

2. update hunks that can be converted to existing update operation representation:
   - exact old/new content from unified diff hunk
   - no fuzzy matching
   - no binary files
   - no mode changes
   - no rename-with-content-edit unless existing move+update path supports it, otherwise block

3. add file:
   - /dev/null -> b/path
   - added content extracted from + lines
   - parent directory must still be validated by existing route

4. delete file:
   - a/path -> /dev/null
   - removed content may be used only as expected old content if local update/delete semantics support it
   - no directory delete

5. rename/move metadata:
   - rename from / rename to
   - similarity 100% / no content edit only
   - move-with-content-edit remains blocked unless cleanly decomposed into move+update under existing semantics

The helper should output normalized operations compatible with Route 67 boundedApplyPatchCandidate / existing route structures.

Preferred output:

- status:
  - "normalized"
  - "unsupported"
  - "malformed"
- normalizedOperations
- operationCount
- affectedPaths
- rejectionReason
- evidence
- sourceFormat:
  - "git-unified-diff"
  - "apply-patch-markers"
  - "unknown"

Rules:

- 1-8 normalized operations may become bounded candidates.
- 9+ normalized operations must be too-many/unsupported.
- unsupported shapes must remain no-write.
- helper must not read files.
- helper must not write files.
- helper must not apply hunks.
- helper must not fuzzy match.
- helper must not authorize writes.

Minimum validation:

- focused tests for boundedBroadPatchNormalizer
- supported update/add/delete/move cases
- 8-operation supported parse
- 9+ blocked parse
- malformed input blocked
- binary/mode change blocked
- rename-with-content-edit blocked unless deliberately supported
- directory/overwrite/path-conflict examples blocked or marked for later route validation
- rtk git diff --check

### Task 4: connect normalizer to bounded candidate classifier

Update boundedApplyPatchCandidate and/or mutationRoutingProjection so normalized safe broad patch payloads can feed existing bounded small-N routes.

Required behavior:

- parser-supported Route 67 candidates still work
- newly normalized broad patch safe subset can route to existing guarded routes
- unsupported broad shapes remain stopped/no-write
- 9+ normalized operations remain blocked
- no-write/dry-run can show planning information but must not authorize writes
- approval names all affected paths
- workspace authority still happens in existing route layers
- recoveryAuthority capture still happens before writer if explicit non-default option is enabled
- route result semantics come from existing guarded routes

Minimum validation:

- focused boundedApplyPatchCandidate / mutationRoutingProjection tests
- rtk git diff --check

### Task 5: implement safe update normalization without fuzzy apply

If unified diff update support needs exact hunk handling, implement only the safe version.

Acceptable local choices:

Option A, preferred if existing update operation can carry exact before/after content:
- convert unified diff hunks into exact update operation data
- existing writer/preflight verifies current content or stale-read before write
- no fuzzy context search

Option B, preferred if existing writer cannot represent hunk updates safely:
- normalize add/delete/move only
- keep unified diff update hunks blocked with actionable unsupported reason
- document blocker and tests
- still complete route if add/delete/move safe subset works

Option C, if a minimal exact-hunk update writer already exists:
- reuse it through existing guarded routes
- do not add a new arbitrary patch engine

Forbidden:

- fuzzy matching
- best-effort hunk application
- silent context drift
- overwrite without exact verification
- broad arbitrary diff application

Minimum validation:

- focused parser/route tests for chosen option
- rtk git diff --check

### Task 6: end-to-end bounded broad patch tests

Add focused tests that simulate broad patch input and prove only safe bounded cases execute.

Required supported tests if implemented:

1. git-style unified diff single update normalizes and routes to existing update path, if safe update normalization is supported
2. git-style add file normalizes and routes to create path
3. git-style delete file normalizes and routes to delete path
4. git-style pure rename normalizes and routes to move path
5. 5-file git-style patch normalizes and routes to bounded small-N path
6. 8-operation git-style patch normalizes and routes to bounded small-N path
7. non-default recoveryAuthority capture works for at least one normalized broad patch candidate
8. partial-failure restore drill works for one normalized bounded broad patch candidate

Required blocked tests:

1. 9+ git-style patch blocked
2. binary patch blocked
3. file mode change blocked
4. directory delete/move blocked
5. rename-with-content-edit blocked unless deliberately decomposed safely
6. unsupported hunk/fuzzy shape blocked
7. outside-workspace blocked
8. path conflict / overwrite blocked
9. malformed broad patch blocked
10. broad arbitrary unsupported shape remains no-write

Required assertions:

- no automatic recovery
- no atomic rollback
- default path has no persistence
- changedFiles / failedFiles / plannedFiles are preserved
- blocked results remain no-write
- no-write/dry-run remains non-authorizing

Minimum validation:

- focused parser / routing / result / recovery tests
- rtk git diff --check

### Task 7: no-write and unsupported broad-shape surface

Improve no-write/unsupported broad shape surfaces only where directly related to the new parser.

Required behavior:

- safe normalized candidates can appear as planned bounded operations in no-write mode if local conventions allow
- unsupported broad shapes should report actionable blocker:
  - unsupported-broad-shape
  - unsupported-unified-diff
  - unsupported-fuzzy-patch
  - unsupported-binary-patch
  - unsupported-mode-change
  - too-many-operations
- dry-run/no-write must not authorize writes
- approval-pending must not become write authorization
- result contract remains stable

Minimum validation:

- focused dry-run / unsupported tests if touched
- verify:result-contract in final
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/bounded-broad-patch-parser-normalizer.md with final implementation notes:

- supported parser subset
- blocked parser shapes
- route/result files changed
- recovery-authority capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 68 as implemented if completed
- update capability inventory:
  - bounded broad patch parser safe subset is supported
  - arbitrary broad apply_patch remains unsupported
  - 9+ remains unsupported
  - fuzzy patch remains unsupported
- add evidence rows for parser normalization / bounded routing / recovery coverage
- update recommended future sequence

Update docs/design/bounded-broad-apply-patch-candidate.md only if needed.

Recommended next route should be one of:

1. Route 69: unsupported broad-shape UX hardening
   - if parser subset works and the remaining problem is explaining blocked shapes

2. Route 69: broaden exact unified-diff update support
   - if add/delete/move are supported but update hunks remain blocked

3. Route 69: 9+ / arbitrary-N policy decision
   - if parser subset works and cap 8 is now the main blocker

4. Route 69: broad arbitrary apply_patch readiness map
   - only if parser subset is stable and remaining blockers are clearly enumerated

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of bounded parser/normalizer support:

- Route 67 parser-supported bounded candidate behavior
- bounded small-N update/mixed/delete/move behavior
- 9+ blocked behavior
- arbitrary broad apply_patch blocked behavior
- dry-run/no-write does not authorize writes
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

- capture recovery authority for normalized bounded broad patch candidates
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- bounded broad patch parser design note exists
- bounded reference scan is summarized
- parser blocker audit is documented
- bounded broad patch normalizer exists and is tested
- at least add/delete/move safe broad patch subset is normalized if update hunks are not safely representable
- safe normalized 1-8 candidates route to existing guarded paths
- 9+ normalized patches remain blocked
- unsupported arbitrary broad shapes remain blocked
- fuzzy patch remains blocked
- no-write/dry-run remains non-authorizing
- recovery-authority capture works for representative normalized candidates
- partial-failure restore evidence exists for representative normalized candidate if route integration reaches writer path
- changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags are preserved
- recoveryExecuted remains false in route results
- rollbackAtomicityClaim remains false
- automatic recovery remains absent
- broad arbitrary apply_patch readiness is not claimed
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- safe parser subset requires a broad parser rewrite
- update hunk support requires fuzzy matching
- normalization cannot distinguish safe candidates from arbitrary broad shapes
- no-write planning would become write authorization
- recoveryAuthority capture cannot happen before writer
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Parser blocker audit result
5. Normalizer status
6. Supported broad patch parser subset
7. Blocked parser shapes
8. Routing changes
9. Result projection changes
10. Recovery-authority capture changes
11. Partial-failure restore evidence
12. No-write planning / dry-run preservation
13. Files changed
14. Forbidden files touched? yes/no
15. Default runtime behavior changed outside new capability? yes/no
16. 9+ writes still blocked? yes/no
17. Arbitrary broad apply_patch still blocked? yes/no
18. Fuzzy patch still blocked? yes/no
19. Automatic recovery added? yes/no
20. Atomic rollback added? yes/no
21. Existing result fields preserved
22. Focused validation
23. Final validation
24. Residue cleanup
25. Residual risks
26. Next recommended route
27. Proposed commit message

Do not commit or push.

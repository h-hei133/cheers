# Route 70: rename-with-content decomposition and broad-shape contract gauntlet

## Objective

Close the main Route 69 parser/readiness gaps without claiming arbitrary broad apply_patch support.

Route 69 lifted the bounded cap to 32 and expanded git-style patch normalization. It kept rename-with-content-edit blocked because the current move route is content-preserving and safe decomposition needed a separate route.

Route 70 should now implement that separate safe decomposition and harden unsupported broad-shape contracts.

This route should be a thick edit-capability hardening route:

- support safe git-style rename-with-content-edit by decomposing it into existing guarded operations
- preserve recovery-authority capture and explicit restore behavior
- create/centralize a broad unsupported-shape reason taxonomy
- harden no-write surfaces for unsupported broad patch shapes
- add realistic broad patch fixture gauntlet
- keep arbitrary broad apply_patch, fuzzy patch, 33+ operations, binary/mode/symlink/submodule/copy, directories, overwrite, automatic recovery, and atomic rollback blocked

This route must not become a full arbitrary patch engine.

## Current state

Build on the current working tree. Do not reset Route 57-69 changes.

Current supported write surface:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-32 files
- bounded mixed batches with 2-32 operations
- bounded delete-only batches with 2-32 files
- bounded move-only batches with 2-32 moves
- bounded apply_patch candidates with parser-supported 1-32 operations
- safe git-style broad patch normalization for update/add/delete/pure rename
- multi-hunk update supported when exactly representable as marker hunks

Still blocked before this route:

- rename-with-content-edit
- arbitrary broad apply_patch
- fuzzy patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory operations
- overwrite/path conflict
- 33+ operations
- automatic recovery
- atomic rollback

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
- exceed by at most 2 files only if a direct rename/diff parser file is clearly useful
- do not copy implementation code verbatim
- port architecture and boundaries only
- record path references and practical implications

Search focus:

opencode:

- apply_patch
- patch parser
- rename
- rename from
- rename to
- copy
- mode change
- binary
- diff metadata
- permission

gemini-cli:

- edit
- write-file
- diff
- patch
- rename
- restore
- checkpoint

ClaudeCode:

- FileEditTool
- FileWriteTool
- old_string
- new_string
- fileHistory
- stale

The scan should answer:

1. How do references represent rename-with-content-edit?
2. Do they decompose rename+edit or treat it as a single patch operation?
3. Which metadata-only patch shapes are blocked or separated?
4. How do they report unsupported patch shapes?
5. What is the smallest safe local equivalent?

Record findings in docs/design/rename-content-and-broad-shape-gauntlet.md.

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

If focused path tests include unrelated existing shell recovery failures, narrow to touched parser/result/recovery tests and document them.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/expanded-bounded-broad-patch-safe-subset.md
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/boundedBroadPatchNormalizer.ts
- packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts
- packages/ts-shell/src/orchestration/patchResult/boundedWritePolicy.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/mixedOperationReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/singleFileApplyPatchDryRun.ts

Recovery / restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present

Tests:

- boundedBroadPatchNormalizer tests
- boundedApplyPatchCandidate tests
- mutationRoutingProjection tests
- mixedOperationReadiness tests
- perFilePatchPlan tests
- mixedFileWriteRoute tests
- mixedFileWriteResult tests
- singleFileApplyPatchDryRun tests
- patchRecovery tests touched by recovery-authority capture

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- focused tests and fixtures for touched modules
- docs/design/rename-content-and-broad-shape-gauntlet.md
- docs/design/edit-capability-roadmap.md, concise Route 70 update only
- docs/design/expanded-bounded-broad-patch-safe-subset.md, Route 70 note only
- docs/design/bounded-broad-patch-parser-normalizer.md, Route 70 note only
- this route spec

Conditionally allowed if clean:

- a shared unsupported broad patch reason helper, for example:
  - broadPatchUnsupportedReason.ts
  - boundedBroadPatchUnsupported.ts
  - patchUnsupportedShape.ts
- focused fixture files under the existing test fixture convention, if one exists

Forbidden unless a blocker is reported first:

- full arbitrary broad apply_patch support
- 33+ writes
- fuzzy patch recovery
- binary patch application
- mode/chmod patch application
- symlink/submodule patch application
- directory delete/move
- overwrite
- copy-with-content support unless proven safe and small
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

### Task 1: design note and readiness audit

Create docs/design/rename-content-and-broad-shape-gauntlet.md.

Include:

- post-Route 69 baseline
- bounded reference scan summary
- current rename-with-content blocker
- safe decomposition design
- unsupported broad-shape taxonomy
- fixture gauntlet design
- operation-count boundary
- workspace / approval / stale-read / verification semantics
- recovery-authority capture semantics
- restore UX interaction
- no fuzzy patch / no arbitrary broad readiness
- why 33+ remains blocked
- next-route decision criteria

Audit current Route 69 normalizer and document:

- how pure rename currently works
- where rename-with-content-edit is blocked
- whether move+update decomposition can use existing mixed route
- what exact operation count impact decomposition has
- how recoveryAuthority capture would work
- what unsupported shape reasons are currently scattered or duplicated

Minimum validation:

- rtk git diff --check

### Task 2: centralize unsupported broad-shape taxonomy

Add or evolve a shared reason taxonomy if current reasons are scattered.

Preferred file:

- packages/ts-shell/src/orchestration/patchParsing/broadPatchUnsupportedReason.ts

Preferred reason literals:

- unsupported-arbitrary-broad-patch
- unsupported-fuzzy-patch
- unsupported-binary-patch
- unsupported-mode-change
- unsupported-symlink-patch
- unsupported-submodule-patch
- unsupported-copy-patch
- unsupported-directory-operation
- unsupported-overwrite
- unsupported-path-conflict
- unsupported-rename-with-content-edit
- unsupported-malformed-diff
- unsupported-ambiguous-hunk
- unsupported-index-only-change
- too-many-operations

The helper may expose:

- reason metadata
- user-facing short reason
- doNext hint
- evidence tag
- safe no-write classification

Required behavior:

- no result shape churn unless existing contract safely allows it
- no-write/dry-run must remain non-authorizing
- reasons should be reused by parser/normalizer/candidate tests where clean

Minimum validation:

- focused tests for reason helper
- rtk git diff --check

### Task 3: implement safe rename-with-content-edit decomposition

Update boundedBroadPatchNormalizer.ts.

Supported shape:

- git-style rename from old path to new path
- no binary/mode/symlink/submodule metadata
- no directory operation
- no overwrite/path conflict
- content hunk applies to the renamed target
- normalized operation count remains <= 32

Preferred normalization:

1. move operation:
   - old path -> new path
2. update operation:
   - target path is new path
   - exact marker-hunk update representation
   - no fuzzy matching
   - no silent context drift

Required semantics:

- move should happen before update
- decomposition should preserve deterministic order
- affectedPaths and approvalPaths include old and new paths
- recoveryAuthority capture can capture source exists, target absent, and update before-state through existing route semantics
- partial failure is explainable as parsed-order sequential operations
- current mixed route handles the normalized operations

If safe decomposition is not possible with existing operation representation, keep blocked and strengthen reason/tests. But attempt implementation first.

Minimum validation:

- focused boundedBroadPatchNormalizer tests
- focused boundedApplyPatchCandidate tests
- focused mutationRoutingProjection / mixed route tests
- rtk git diff --check

### Task 4: route and result tests for rename-with-content-edit

Add focused route/result/recovery tests.

Required supported tests if decomposition is implemented:

1. single rename-with-content-edit normalizes to move + update
2. rename-with-content-edit plus additional operations routes as bounded mixed when total normalized count <= 32
3. approval paths include old path, new path, and updated target
4. non-default recoveryAuthority capture works before writer
5. route result changedFiles / failedFiles / plannedFiles are preserved
6. postWriteVerification and writer flags are preserved
7. recoveryPlan remains explicit and non-automatic
8. partial-failure restore drill covers changed prefix
9. current-content mismatch blocks explicit restore

Required blocked tests:

1. rename-with-content-edit over cap blocked
2. rename-with-content-edit with mode change blocked
3. rename-with-content-edit with binary patch blocked
4. rename-with-content-edit with target overwrite/path conflict blocked
5. rename-with-content-edit with unsupported fuzzy hunk blocked

Minimum validation:

- focused route/result/recovery tests
- rtk git diff --check

### Task 5: realistic broad patch fixture gauntlet

Add a focused fixture gauntlet for broad patch parser/candidate behavior.

Use inline fixtures in tests unless the repo already has a fixture-file convention.

Required supported fixture groups:

- multi-file update patch
- add + delete patch
- pure rename patch
- rename-with-content-edit patch if implemented
- 32-operation bounded patch
- mixed update/add/delete/move patch within cap
- multi-hunk exact update patch

Required blocked fixture groups:

- 33-operation patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata patch
- malformed diff
- ambiguous hunk header
- fuzzy-like unsupported hunk
- directory operation
- overwrite/path conflict
- outside-workspace path

Required assertions:

- supported fixtures normalize to expected operation count/family
- blocked fixtures return precise reason
- blocked fixtures remain no-write
- no fixture authorizes writes in dry-run/no-write mode
- no automatic recovery
- no atomic rollback

Minimum validation:

- focused parser/candidate tests
- rtk git diff --check

### Task 6: no-write / unsupported surface hardening

Update no-write or unsupported surfaces only where directly related to parser reasons.

Required behavior:

- unsupported broad shapes carry precise blocker reason where existing result contract allows
- doNext should be actionable:
  - split patch
  - remove unsupported metadata
  - provide marker-style patch
  - keep operation count <= 32
  - avoid fuzzy/binary/mode/symlink/submodule shapes
- no-write/dry-run can show normalized bounded plan for supported shapes
- no-write/dry-run never authorizes writes
- approval-pending never becomes write authorization
- result-contract remains stable

Minimum validation:

- focused dry-run / unsupported tests if touched
- verify:result-contract in final
- rtk git diff --check

### Task 7: recovery evidence for rename-content and gauntlet cases

Add recovery evidence for the new supported case.

Required if rename-with-content-edit is implemented:

- non-default recoveryAuthority capture for decomposed move + update
- partial-failure restore drill after move succeeds and update fails
- restore can restore moved file when current-content guard matches
- restore blocks hidden user edit
- route result recoveryExecuted remains false
- rollbackAtomicityClaim remains false
- automatic recovery remains absent

Required for gauntlet:

- at least one large supported fixture with recoveryAuthority capture
- default path has no persistence
- blocked fixtures do not capture authority

Minimum validation:

- focused route/recovery tests
- rtk git diff --check

### Task 8: roadmap and design evidence update

Update docs/design/rename-content-and-broad-shape-gauntlet.md with final implementation notes:

- rename-with-content decision
- taxonomy added
- supported fixtures
- blocked fixtures
- route/result files changed
- recovery-authority capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 70 as implemented if completed
- update capability inventory:
  - rename-with-content-edit supported if implemented
  - unsupported broad shape taxonomy exists
  - fixture gauntlet exists
  - arbitrary broad apply_patch remains unsupported
  - fuzzy patch remains unsupported
- add evidence rows
- update recommended future sequence

Update docs/design/expanded-bounded-broad-patch-safe-subset.md and docs/design/bounded-broad-patch-parser-normalizer.md as needed.

Recommended next route should be one of:

1. Route 71: edit fixture gauntlet expansion across ClaudeCode/opencode/gemini/generic model outputs
   - if parser support is strong but compatibility evidence should be broadened

2. Route 71: arbitrary broad apply_patch readiness closeout
   - if remaining unsupported shapes are explicitly documented and intentional

3. Route 71: user/session unsupported patch explanation polish
   - if core contract is done but output needs product polish

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of Route 70:

- Route 69 expanded safe subset behavior
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

- capture recovery authority for rename-with-content and supported gauntlet cases under explicit ledgerRoot
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
- unsupported broad-shape taxonomy exists and is tested, or existing taxonomy is clearly reused
- rename-with-content-edit is safely supported or stronger blocker reason/tests are added
- realistic broad patch fixture gauntlet exists
- supported fixtures normalize and route through existing guarded paths
- blocked fixtures return precise no-write reasons
- no-write/dry-run remains non-authorizing
- recovery-authority capture works for the new supported rename-content path if implemented
- partial-failure restore evidence exists for the new supported rename-content path if implemented
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

- rename-with-content support requires fuzzy matching
- rename-with-content support requires broad parser rewrite
- decomposition cannot preserve move-before-update semantics
- recoveryAuthority capture cannot represent decomposed operations safely
- no-write planning would become write authorization
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Unsupported taxonomy status
5. Rename-with-content-edit decision
6. Supported fixture groups
7. Blocked fixture groups
8. No-write / dry-run preservation
9. Routing changes
10. Result projection changes
11. Recovery-authority capture changes
12. Partial-failure restore evidence
13. Files changed
14. Forbidden files touched? yes/no
15. Default runtime behavior changed outside new capability? yes/no
16. Beyond-cap writes still blocked? yes/no
17. Arbitrary broad apply_patch still blocked? yes/no
18. Fuzzy/binary/mode/symlink/submodule still blocked? yes/no
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

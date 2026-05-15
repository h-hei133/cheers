# Route 69: expanded bounded broad patch safe subset and cap lift

## Objective

Expand the bounded broad patch safe subset after Route 68.

Route 68 added a bounded broad patch normalizer for safe git-style unified diff subsets and routed normalized 1-8 operation candidates through existing guarded write paths.

Route 69 should continue aggressively by widening the safe bounded subset and lifting the operation cap.

Target changes:

- lift bounded write cap from 8 to a larger explicit cap
- recommended cap: 32 operations
- support more safe git-style patch forms
- support multi-file / multi-hunk normalized patches where exact normalization is possible
- support rename-with-content-edit by decomposing to move + update only when safe
- keep unsupported arbitrary broad patch shapes blocked
- keep fuzzy patch blocked
- keep binary/mode/symlink/submodule patches blocked
- keep directory operations blocked
- keep overwrite/path conflict blocked
- preserve recovery-authority capture and explicit restore UX
- preserve no automatic recovery and no atomic rollback

This route should be audit-plus-implementation, not docs-only and not UX-only.

## Current state

Build on the current working tree. Do not reset Route 57-68 changes.

Current supported write surface:

- selected-workspace single-file update/create/move/delete
- bounded update-only batches with 2-8 files
- bounded mixed batches with 2-8 operations
- bounded delete-only batches with 2-8 files
- bounded move-only batches with 2-8 moves
- bounded apply_patch candidates with parser-supported 1-8 operations
- bounded git-style broad patch normalization for safe update/add/delete/pure rename subset
- 9+ writes remain blocked before this route
- arbitrary broad apply_patch remains blocked

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

Known remaining gaps:

- cap 8 is now the main artificial small-N blocker
- parser support is still a safe subset
- rename-with-content-edit is blocked
- complex multi-hunk updates may be incomplete
- metadata-only git patch sections such as mode changes, binary, symlink, submodule should remain blocked
- broad arbitrary apply_patch is still not a readiness claim

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
- exceed by at most 2 files only if a direct parser/patch normalizer file is clearly useful
- do not copy implementation code verbatim
- port architecture and boundaries only
- record path references and practical implications

Search focus:

opencode:

- apply_patch
- patch parser
- patch/index
- diff parser
- rename
- mode change
- binary
- permission
- snapshot
- revert

gemini-cli:

- edit
- write-file
- diff
- patch
- checkpoint
- restore

ClaudeCode:

- FileEditTool
- FileWriteTool
- fileHistory
- stale
- edit failure

The scan should answer:

1. How does opencode normalize larger multi-file patches?
2. How does it represent rename-with-content-edit, if supported?
3. Which metadata patch shapes are rejected or separated from content edits?
4. How does it avoid fuzzy patch semantics?
5. What local cap is reasonable now: 16, 32, or another bounded value?

Record findings in docs/design/expanded-bounded-broad-patch-safe-subset.md.

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
- docs/design/bounded-small-n-write-policy.md
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/explicit-restore-surface.md

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/boundedBroadPatchNormalizer.ts
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

Recovery / restore:

- packages/ts-shell/src/orchestration/patchRecovery/recoveryAuthorityStore.ts
- packages/ts-shell/src/orchestration/patchRecovery/restorePreview.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreExecutionBridge.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoverySurfaceProjection.ts
- packages/ts-shell/src/orchestration/patchRecovery/recoveryPreWriteCapture.ts if present

Tests:

- boundedWritePolicy tests
- boundedBroadPatchNormalizer tests
- boundedApplyPatchCandidate tests
- mutationRoutingProjection tests
- multiFileUpdatePlanning tests
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
- docs/design/expanded-bounded-broad-patch-safe-subset.md
- docs/design/edit-capability-roadmap.md, concise Route 69 update only
- docs/design/bounded-small-n-write-policy.md, Route 69 note only
- docs/design/bounded-broad-patch-parser-normalizer.md, Route 69 note only
- this route spec

Preferred implementation approach:

- lift bounded policy cap through boundedWritePolicy.ts
- recommended cap: 32
- if audit finds 32 too risky, choose 16 and document why
- reuse existing guarded write routes
- do not introduce arbitrary-N support
- do not introduce fuzzy patch engine
- do not bypass route-level workspace/preflight/approval checks

Forbidden unless a blocker is reported first:

- full arbitrary broad apply_patch support
- unbounded operation counts
- fuzzy patch recovery
- binary patch application
- mode-only patch application
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

### Task 1: expanded bounded broad patch design note

Create docs/design/expanded-bounded-broad-patch-safe-subset.md.

Include:

- post-Route 68 baseline
- bounded reference scan summary
- cap lift decision
- current parser safe subset
- expanded parser safe subset
- unsupported parser shapes
- rename-with-content-edit decision
- multi-hunk update decision
- operation-count boundary
- workspace / approval / stale-read / verification semantics
- recovery-authority capture semantics
- restore UX interaction
- no fuzzy patch / no arbitrary broad readiness
- why beyond-cap and arbitrary broad remain blocked
- next-route decision criteria

Minimum validation:

- rtk git diff --check

### Task 2: cap lift audit and bounded policy update

Audit current cap-8 assumptions.

Document findings in the design note.

Then update boundedWritePolicy.ts if safe.

Preferred behavior:

- MAX_BOUNDED_WRITE_OPERATIONS = 32
- MIN_MULTI_WRITE_OPERATIONS remains 2
- 1 operation remains single-file route territory
- 2-32 operations are bounded candidates
- 33+ operations are unsupported/too-many
- broad arbitrary apply_patch remains unsupported
- helper names should avoid implying arbitrary-N support

Required tests:

- 8 remains supported
- 9 becomes supported if cap is lifted
- 16 supported
- 32 supported
- 33 blocked
- invalid negative/zero counts blocked as before

Minimum validation:

- focused boundedWritePolicy tests
- rtk git diff --check

### Task 3: migrate update/mixed/destructive route tests to cap policy

Update route/planning/readiness tests so they verify cap behavior without hardcoding cap 8 assumptions.

Required behavior:

- update-only supports representative 9, 16, 32
- mixed supports representative 9, 16, 32
- delete-only supports representative 9, 16, 32
- move-only supports representative 9, 16, 32
- 33+ remains blocked
- exactly-two/three/four/eight regressions remain passing
- result projection remains stable
- recoveryAuthority capture still happens before writer for representative larger bounded cases

Do not add enormous test matrices. Use representative cases and shared helpers.

Minimum validation:

- focused multiFileUpdatePlanning / mixedOperationReadiness / perFilePatchPlan / route tests
- rtk git diff --check

### Task 4: expand bounded broad patch normalizer for multi-file and multi-hunk safe cases

Update boundedBroadPatchNormalizer.ts.

Required support:

- multiple file sections in one git-style patch up to cap
- add/update/delete/pure rename sections mixed in one patch
- multi-hunk updates for one file if exact old/new operation representation can safely express them
- path prefix handling for a/ and b/
- /dev/null add/delete handling remains supported
- no file IO
- no fuzzy matching
- no write authorization

For update hunks:

- support only if the local representation can preserve exact old/new expectations safely
- if multiple hunks cannot be safely represented as one existing update operation, either:
  - combine into one exact old/new representation only if correctness is proven by tests, or
  - emit multiple update operations for the same file only if route semantics explicitly allow repeated updates to the same file safely, or
  - keep multi-hunk update blocked with a precise reason
- never silently accept unsafe context drift

Minimum validation:

- focused boundedBroadPatchNormalizer tests
- rtk git diff --check

### Task 5: support rename-with-content-edit only if decomposable safely

Audit rename-with-content-edit.

If safe, normalize it into existing operations:

- pure rename/move
- followed by update on the renamed target

Required safety:

- total normalized operation count stays within cap
- move source/target preconditions are preserved
- update target preconditions are preserved
- no overwrite
- no path reuse/collision
- recoveryAuthority capture can represent source/target and update original state safely
- writer order is deterministic
- partial failure is explainable
- restore drill can cover changed prefix

If not safe, keep blocked with a precise rejection reason:

- unsupported-rename-with-content-edit

Minimum validation:

- supported tests if implemented
- blocked tests if not implemented
- rtk git diff --check

### Task 6: keep metadata-only patch shapes blocked

Add or preserve explicit blockers for unsupported patch metadata shapes:

- binary patch
- file mode change
- chmod-only patch
- symlink patch
- submodule patch
- copy file / copy-with-content unless deliberately supported
- deleted/new file mode metadata that cannot be safely ignored
- index-only change
- ambiguous hunk header
- malformed diff section

Required behavior:

- blocked result remains no-write
- rejection reason is precise enough for user/session surfaces
- no-write/dry-run does not authorize writes

Minimum validation:

- focused parser / candidate tests
- rtk git diff --check

### Task 7: route larger normalized safe candidates through guarded paths

Ensure normalized 9-32 operation candidates route through existing guarded paths.

Required behavior:

- safe normalized 9-32 update-only routes to bounded update route
- safe normalized 9-32 mixed routes to bounded mixed route
- safe normalized 9-32 delete-only routes to bounded delete path
- safe normalized 9-32 move-only routes to bounded move path
- 33+ remains blocked
- unsupported arbitrary broad remains blocked
- approval names all affected paths
- workspace authority remains in existing route layers
- final stale-read / preflight before writer
- recoveryAuthority capture before writer under explicit non-default option
- sequential execution and verification preserved

Minimum validation:

- focused mutationRoutingProjection / boundedApplyPatchCandidate / route tests
- rtk git diff --check

### Task 8: expanded broad patch recovery and restore evidence

Add focused recovery evidence for expanded bounded broad patch cases.

Required tests:

1. 16-operation normalized broad patch with non-default recoveryAuthority capture
2. 32-operation normalized broad patch with no default persistence
3. partial failure restore drill for a representative 16-operation mixed broad patch
4. hidden user edit blocks restore
5. route result recoveryExecuted remains false
6. rollbackAtomicityClaim remains false
7. automatic recovery absent
8. changedFiles/failedFiles/plannedFiles/postWriteVerification/writer flags preserved

Do not create slow exhaustive tests. Use shared helpers.

Minimum validation:

- focused route/recovery tests
- rtk git diff --check

### Task 9: no-write and unsupported broad-shape preservation

Update no-write/unsupported surfaces only if needed.

Required behavior:

- safe normalized bounded candidates can appear as planned bounded operations in no-write mode if local conventions allow
- unsupported broad shapes report precise blockers
- 33+ reports too-many operations
- dry-run/no-write must not authorize writes
- approval-pending must not become write authorization
- result contract remains stable

Minimum validation:

- focused dry-run / unsupported tests if touched
- verify:result-contract in final
- rtk git diff --check

### Task 10: roadmap and design evidence update

Update docs/design/expanded-bounded-broad-patch-safe-subset.md with final implementation notes:

- cap selected
- supported parser subset
- blocked parser shapes
- rename-with-content-edit decision
- multi-hunk update decision
- route/result files changed
- recovery-authority capture behavior
- restore drill behavior
- validation
- residual risks
- next recommendation

Update docs/design/edit-capability-roadmap.md lightly:

- mark Route/Batch 69 as implemented if completed
- update capability inventory:
  - bounded operation cap is now 32, or the selected cap if different
  - bounded broad patch safe subset expanded
  - arbitrary broad apply_patch remains unsupported
  - fuzzy patch remains unsupported
- add evidence rows for cap lift, parser expansion, and recovery coverage
- update recommended future sequence

Update docs/design/bounded-small-n-write-policy.md and docs/design/bounded-broad-patch-parser-normalizer.md as needed.

Recommended next route should be one of:

1. Route 70: broad unsupported-shape hardening and user-facing explanations
   - if expanded safe subset works and remaining shapes are intentionally blocked

2. Route 70: rename-with-content-edit / multi-hunk follow-up
   - if either was blocked and is now the main remaining parser gap

3. Route 70: arbitrary broad apply_patch readiness map
   - only if parser safe subset and cap expansion are stable

4. Route 70: cap policy / arbitrary-N decision
   - if cap 32 becomes the main remaining blocker

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of Route 69:

- existing Route 68 normalized safe subset behavior
- bounded small-N route semantics
- dry-run/no-write does not authorize writes
- arbitrary broad apply_patch blocked behavior
- fuzzy patch blocked behavior
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

- capture recovery authority for normalized bounded broad patch candidates under explicit ledgerRoot
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- expanded bounded broad patch design note exists
- bounded reference scan is summarized
- cap lift is implemented or a clear lower-cap decision is documented
- bounded write policy tests cover new cap
- update/mixed/delete/move routes support representative operations up to the new cap
- 33+ or beyond selected cap remains blocked
- broad patch normalizer supports larger safe multi-file cases
- rename-with-content-edit is either safely supported or precisely blocked
- multi-hunk update is either safely supported or precisely blocked
- metadata-only/binary/mode/symlink/submodule shapes remain blocked
- no-write/dry-run remains non-authorizing
- recovery-authority capture works for representative expanded candidates
- partial-failure restore evidence exists for representative expanded candidate
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

- cap lift requires arbitrary-N route rewrites
- expanded parser support requires fuzzy matching
- expanded normalizer cannot distinguish safe subset from arbitrary broad shape
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
4. Cap selected and rationale
5. Bounded write policy changes
6. Supported expanded parser subset
7. Rename-with-content-edit decision
8. Multi-hunk update decision
9. Blocked parser shapes
10. Routing changes
11. Result projection changes
12. Recovery-authority capture changes
13. Partial-failure restore evidence
14. No-write planning / dry-run preservation
15. Files changed
16. Forbidden files touched? yes/no
17. Default runtime behavior changed outside new capability? yes/no
18. Beyond-cap writes still blocked? yes/no
19. Arbitrary broad apply_patch still blocked? yes/no
20. Fuzzy patch still blocked? yes/no
21. Automatic recovery added? yes/no
22. Atomic rollback added? yes/no
23. Existing result fields preserved
24. Focused validation
25. Final validation
26. Residue cleanup
27. Residual risks
28. Next recommended route
29. Proposed commit message

Do not commit or push.

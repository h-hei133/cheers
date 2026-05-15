# Route 73: edit capability closeout map and seal

## Objective

Seal the current edit capability phase after Route 72.

Route 72 added safe fenced git-style broad diff extraction, a closeout readiness model, and a focused verify:edit-capability-closeout script.

Route 73 should turn the current edit implementation into a closeout candidate by producing durable documentation, machine-checkable readiness evidence, parity/non-parity mapping, and final focused hardening.

This route should not add a new major edit feature unless the closeout verifier or parity map exposes a small bounded gap that is clearly within the already-supported capability envelope.

Primary goal:

- define exactly what edit capability is now supported
- define what is default-ready, non-default-ready, explicit-opt-in only, and blocked by design
- extend / stabilize the edit closeout verifier
- add a closeout manifest or machine-readable readiness artifact if useful
- compare current capability against ClaudeCode / opencode / gemini-cli at a practical feature level
- harden any small bounded gaps found during closeout
- update roadmap so edit capability can be treated as closeout-candidate

This route must not claim arbitrary broad apply_patch readiness, fuzzy patch support, automatic recovery, atomic rollback, provider/MCP edit readiness, or default durable persistence.

## Current state

Build on the current working tree. Do not reset Route 57-72 changes.

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
- fenced git-style broad diff extraction for safe bounded parser subset
- realistic compatibility gauntlet
- unsupported broad-shape taxonomy
- edit capability readiness classifier
- verify:edit-capability-closeout script

Current recovery/undo surface:

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
- default persistence absent

Still blocked by design:

- 33+ writes
- arbitrary broad apply_patch
- fuzzy patch
- binary patch
- mode/chmod patch
- symlink patch
- submodule patch
- copy metadata
- directory delete/move
- overwrite/path conflict
- automatic recovery
- atomic rollback
- default durable recovery persistence
- provider/MCP edit behavior changes

## Reference scan first

Do a bounded closeout-oriented reference scan.

Primary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- opencode: inspect at most 6 directly relevant files
- gemini-cli: inspect at most 5 directly relevant files
- ClaudeCode: inspect at most 5 directly relevant files
- total external files: at most 16
- exceed by at most 2 files only if a direct edit capability / restore / parser closeout file is clearly useful
- do not copy implementation code verbatim
- record feature-level comparison only

Search focus:

opencode:

- apply_patch
- edit
- write
- snapshot
- revert
- permission
- diff parser
- tool result

gemini-cli:

- edit
- write-file
- checkpoint
- restore
- tool result
- diff
- patch

ClaudeCode:

- FileEditTool
- FileWriteTool
- fileHistory
- stale
- read-before-write
- tool result

The scan should answer:

1. Which edit capabilities are roughly at parity?
2. Which capabilities are intentionally different?
3. Which capabilities remain weaker or explicitly unsupported?
4. Which recovery/restore semantics are stronger locally?
5. Which unsupported boundaries are acceptable for closeout?
6. Which boundaries should block edit closeout?

Record findings in docs/design/edit-capability-closeout-seal.md.

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

- rtk npm run verify:edit-capability-closeout
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchParsing src/orchestration/patchResult src/orchestration/patchRecovery
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.

Do not run provider/default/MCP gates.

If focused closeout verifier exposes unrelated existing failures, narrow the verifier or document the unrelated failure. Do not expand scope into unrelated shell/session failures unless directly caused by Route 57-73 edit work.

## Read first

Design/roadmap:

- docs/design/edit-capability-roadmap.md
- docs/design/edit-closeout-readiness-and-fenced-broad-diff.md
- docs/design/realistic-edit-compatibility-gauntlet.md
- docs/design/rename-content-and-broad-shape-gauntlet.md
- docs/design/expanded-bounded-broad-patch-safe-subset.md
- docs/design/bounded-broad-patch-parser-normalizer.md
- docs/design/bounded-broad-apply-patch-candidate.md
- docs/design/bounded-small-n-write-policy.md
- docs/design/explicit-restore-ux-cli-surface.md
- docs/design/recovery-authority-coverage-drills.md
- docs/design/minimum-recovery-authority-loop.md
- docs/design/durable-authority-decision.md

Readiness / verifier:

- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.ts
- packages/ts-shell/src/orchestration/patchResult/editCapabilityReadiness.test.ts
- scripts/verify-edit-capability-closeout.mjs
- package.json

Parsing / routing / planning:

- packages/ts-shell/src/orchestration/patchParsing/parser.ts
- packages/ts-shell/src/orchestration/patchParsing/fencedPatchExtractor.ts
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
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandRunner.ts
- packages/ts-shell/src/orchestration/patchRecovery/restoreCommandContract.ts

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchParsing/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchRecovery/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- scripts/verify-edit-capability-closeout.mjs
- package.json only to update the existing verify:edit-capability-closeout command if needed
- focused tests and fixtures for touched modules
- docs/design/edit-capability-closeout-seal.md
- docs/design/edit-capability-roadmap.md, Route 73 closeout update only
- docs/design/edit-closeout-readiness-and-fenced-broad-diff.md, Route 73 note only
- docs/design/realistic-edit-compatibility-gauntlet.md, Route 73 note only
- this route spec

Conditionally allowed:

- a machine-readable closeout manifest if useful, for example:
  - docs/design/edit-capability-closeout.manifest.json
  - packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts

Preferred implementation style:

- closeout should be evidence-driven
- code changes should be small and focused
- closeout verifier should run deterministic focused suites
- do not make unsupported features look supported
- do not overclaim default readiness

Forbidden unless a blocker is reported first:

- new broad arbitrary apply_patch support
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
- package script churn unrelated to existing closeout verifier

## Batched tasks

### Task 1: edit closeout seal design document

Create docs/design/edit-capability-closeout-seal.md.

Include:

- post-Route 72 baseline
- bounded reference scan summary
- capability parity matrix against ClaudeCode / opencode / gemini-cli
- local supported capability envelope
- local blocked-by-design envelope
- default-ready candidates
- non-default / explicit-opt-in candidates
- closeout verifier scope
- result contract / recovery authority requirements
- restore UX readiness
- unsupported shape readiness
- known residual risks
- what edit closeout means and does not mean
- next phase recommendation

Minimum validation:

- rtk git diff --check

### Task 2: define closeout capability manifest

Add a closeout manifest if useful.

Acceptable forms:

Option A, docs-only JSON manifest:

- docs/design/edit-capability-closeout.manifest.json

Option B, typed code manifest:

- packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts

Preferred contents:

- capability id
- status:
  - default-ready-candidate
  - non-default-ready-candidate
  - explicit-opt-in-only
  - blocked-by-design
  - future-research
- evidence:
  - tests
  - verifier
  - result-contract
  - build
  - gauntlet
- risk notes
- blocked reason if blocked
- recovery/restore dependency if any

Capabilities to include:

- single update/create/delete/move
- bounded 2-32 update-only
- bounded 2-32 mixed
- bounded 2-32 delete-only
- bounded 2-32 move-only
- bounded marker-style apply_patch candidates
- bounded git-style broad patch safe subset
- fenced bounded git-style broad diff safe subset
- rename-with-content decomposition
- unsupported broad-shape taxonomy
- recoveryAuthority capture
- restore preview
- explicit restore execute
- local /restore command
- arbitrary broad apply_patch
- fuzzy patch
- binary/mode/symlink/submodule/copy
- directory operations
- overwrite
- automatic recovery
- atomic rollback
- default durable persistence

Minimum validation:

- if code manifest: focused tests
- if docs manifest: rtk git diff --check

### Task 3: harden editCapabilityReadiness

Update editCapabilityReadiness.ts if needed so it aligns with the closeout manifest.

Required behavior:

- readiness classification must not overclaim default readiness
- recoveryAuthority capture should remain non-default / explicit opt-in
- restore execute should remain explicit opt-in
- arbitrary broad apply_patch should remain blocked-by-design
- fuzzy patch should remain blocked-by-design
- automatic recovery and atomic rollback remain blocked-by-design
- capabilities with only fixture evidence should not be over-promoted

Add tests for:

- default-ready candidates
- non-default candidates
- explicit opt-in candidates
- blocked-by-design candidates
- future-research candidates if any
- evidence-driven status preservation

Minimum validation:

- focused editCapabilityReadiness tests
- rtk git diff --check

### Task 4: strengthen closeout verifier

Update scripts/verify-edit-capability-closeout.mjs.

Verifier should cover, directly or by invoking focused tests:

- patchParsing parser/fenced/normalizer tests
- broadPatchUnsupportedReason tests
- boundedApplyPatchCandidate tests
- boundedWritePolicy tests
- editCompatibilityGauntlet
- editCapabilityReadiness tests
- patchRecovery restore command / restore execution tests
- result-contract, if current verifier convention includes it or if it remains fast enough

Verifier should also check, if practical:

- cap 32 policy exists
- 33+ blocked tests exist
- arbitrary broad / fuzzy / binary / mode / symlink / submodule blocked tests exist
- restore execute requires explicit command path
- no automatic recovery claim appears in closeout manifest/readiness if such static check is easy

Do not make verifier brittle by string-searching too much unless stable.

Minimum validation:

- rtk npm run verify:edit-capability-closeout
- rtk git diff --check

### Task 5: final closeout gauntlet hardening

Use the closeout verifier and gauntlet to identify small bounded gaps.

Allowed fixes:

- missing fixture category
- missing unsupported reason test
- readiness classification mismatch
- closeout manifest mismatch
- verifier missing a critical focused test
- inconsistent docs claim
- a supported fixture not included in verifier
- a blocked feature accidentally marked ready

Forbidden fixes:

- arbitrary broad apply_patch
- fuzzy patch engine
- automatic recovery
- atomic rollback
- broad package test stabilization
- provider/session/MCP changes

Minimum validation:

- focused tests for each fix
- rtk npm run verify:edit-capability-closeout
- rtk git diff --check

### Task 6: default vs non-default readiness decision

Update docs/design/edit-capability-closeout-seal.md and docs/design/edit-capability-roadmap.md.

Make explicit decisions.

Likely default-ready candidates, only if evidence supports them:

- selected-workspace single-file update/create/delete/move
- bounded 2-32 update-only
- bounded 2-32 mixed/delete/move route support if current product gating already requires explicit approval
- bounded marker-style apply_patch candidate support
- bounded git-style safe subset support
- fenced bounded git-style safe subset support

Likely non-default / explicit-opt-in:

- recoveryAuthority capture
- persistent recovery authority ledger
- restore execute
- local /restore command execute path
- any persistence-backed behavior

Blocked by design:

- arbitrary broad apply_patch
- fuzzy patch
- binary/mode/symlink/submodule/copy
- directory operations
- overwrite
- automatic recovery
- atomic rollback
- 33+ writes unless future cap policy changes

Be honest and conservative. Do not promote anything solely because tests pass if product semantics are not ready.

Minimum validation:

- rtk git diff --check

### Task 7: closeout roadmap update

Update docs/design/edit-capability-roadmap.md.

Required updates:

- mark Routes 57-73 edit closeout phase as complete or closeout-candidate
- update capability inventory to current state
- update unsupported/non-claim section
- add closeout manifest/verifier evidence rows
- add parity/non-parity summary
- define what remains outside edit closeout
- recommend next phase

Recommended next phase should be one of:

1. Context engineering kickoff
   - if edit capability is closeout-candidate

2. Undo/restore product polish
   - if edit is technically closeout-ready but user-facing restore still needs refinement

3. Targeted edit blocker route
   - only if Route 73 finds a concrete closeout blocker

4. Sandbox/runtime hardening kickoff
   - if edit capability is closeout-candidate and execution safety is next

Do not write the next route file in this task.

Minimum validation:

- rtk git diff --check

## Required preservation

Must remain unchanged unless explicitly part of closeout hardening:

- Route 72 fenced extraction behavior
- Route 71 gauntlet behavior
- Route 70 rename-with-content behavior
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
- provider/session/MCP behavior
- default runtime persistence absence
- automatic recovery absence
- atomic rollback absence

Non-default explicit test paths may:

- capture recovery authority
- run explicit restore drills
- inspect workspace current content for guarded restore

Non-default explicit test paths must not:

- run automatically after write failure
- claim atomic rollback
- alter provider/session/MCP behavior
- create default persistent storage

## Success criteria

Route is complete if:

- edit closeout seal design doc exists
- bounded reference scan is summarized
- parity/non-parity matrix exists
- closeout capability manifest exists or is explicitly documented as unnecessary
- editCapabilityReadiness aligns with closeout decisions
- verify:edit-capability-closeout is strengthened and passes
- closeout verifier covers parser, candidate, gauntlet, readiness, and restore core surfaces
- default vs non-default readiness decisions are documented
- roadmap is updated to edit closeout-candidate state
- arbitrary broad apply_patch readiness is not claimed
- fuzzy/binary/mode/symlink/submodule remain blocked
- recoveryAuthority capture remains non-default/explicit
- restore execute remains explicit
- automatic recovery remains absent
- atomic rollback remains absent
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- closeout verifier exposes a real edit capability blocker that cannot be fixed narrowly
- readiness classification conflicts with runtime behavior
- docs imply support that tests cannot prove
- result-contract requires broad public shape churn
- provider/session/MCP changes become necessary
- automatic recovery or atomic rollback becomes necessary
- arbitrary broad apply_patch support becomes necessary

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Design document added/updated
4. Parity/non-parity summary
5. Closeout manifest status
6. Readiness model changes
7. Closeout verifier changes
8. Default-ready candidates
9. Non-default / explicit-opt-in candidates
10. Blocked-by-design capabilities
11. Small bounded gaps fixed
12. Files changed
13. Forbidden files touched? yes/no
14. Default runtime behavior changed? yes/no
15. Arbitrary broad apply_patch still blocked? yes/no
16. Fuzzy/binary/mode/symlink/submodule still blocked? yes/no
17. Automatic recovery added? yes/no
18. Atomic rollback added? yes/no
19. Existing result fields preserved
20. Focused validation
21. Closeout verifier validation
22. Final validation
23. Residue cleanup
24. Residual risks
25. Next recommended phase / route
26. Proposed commit message

Do not commit or push.

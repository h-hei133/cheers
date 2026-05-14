# Route 40: exactly-three existing-file update guarded write lane

This is a development-only Codex goal spec for bounded implementation work.
It is not a broad edit readiness claim.

## Objective

Continue the edit capability roadmap after Route 35-39.

Route 35 added the per-file patch plan contract.
Route 36 wired it into edit route/result projection.
Route 37 hardened malformed/unsupported patch-shape fixtures.
Route 38 added/hardened stale-read and partial/post-write failure surfaces.
Route 39 hardened broad/delete/move/mixed no-write planning.

Route 40 may implement the first carefully guarded write-capability expansion:

- exactly-three existing-file Update File only

This route must either:

1. implement a guarded exactly-three existing-file update write lane safely, or
2. stop and report why it is not safe yet, preserving the existing planning/no-write behavior.

## Current behavior

Currently:

- single-file selected-workspace update writes
- single-file create writes
- exactly-two existing-file update writes
- exactly-three existing-file update is planning/no-write
- 4+ update remains unsupported/no-write
- delete remains unsupported/no-write
- move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed/mixed unsupported remains stopped/error/no-write

## Target behavior if implemented

Only this new case may become writable:

- exactly-three existing-file update
- selected workspace only
- all three files must already exist
- all three operations must be update operations
- no create/delete/move/broad apply_patch
- all files must pass read-before-write / stale guard
- all writes must be represented in perFilePatchPlan
- post-write verification must run for all three files
- changedFiles / failedFiles / plannedFiles must remain accurate
- writerInvoked must be true only when the existing writer path actually starts
- partial/post-write failure must surface without rollback or atomicity claim

All other unsupported cases must remain no-write.

## Non-goals

Do not add or change:

- 4+ file writes
- broad apply_patch writes
- delete/move writes
- create+update mixed writes
- create+delete/move mixed writes
- rollback/atomicity
- snapshot/revert
- automatic recovery/retry/merge
- fuzzy patch
- provider behavior
- model prompting behavior
- CLI behavior
- session persistence behavior
- MCP behavior
- package scripts
- default gates
- broad readiness claims

Do not claim atomicity.
Do not claim rollback.
Do not weaken unsupported/no-write boundaries.

## Validation policy

Use fast preflight, focused validation while editing, and one final route-level validation.

Do not run broad gates before coding unless focused preflight fails or the working tree is suspicious.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline active.
- Use rtk for reads, search, git status/diff, tests, build, verification, and large-output commands.
- Do not read or print anything under `/home/wang/.private-agents-real`.
- Do not run full opt-in real-provider execution.
- Do not commit or push.
- Preserve existing supported lanes.
- Preserve existing unsupported/no-write lanes.
- Preserve result contract and deterministic release claims.

## Required first step

Read:

- docs/design/edit-capability-roadmap.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- exactly-two update write lane
- exactly-three planning/no-write lane
- existing writer invocation
- read-before-write / stale-read guard
- post-write verification
- perFilePatchPlan operations
- partial failure surface
- changedFiles / failedFiles / plannedFiles
- Route11 exactly-three planning/no-write verifier
- Route12 planned-files continuity verifier
- Route08 unsupported patch E2E verifier

Final report must include a short implementation inventory.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

If Route 38/39 changes are still uncommitted, proceed only if they are expected edit-capability files and do not conflict with this route.

## Implementation target

If safe, implement a guarded exactly-three existing-file update write lane.

Likely target files:

- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*

Prefer reusing the existing exactly-two update writer path if it can safely generalize to exactly three existing-file updates.

Do not create a broad arbitrary multi-file writer.

## Required guard conditions

The exactly-three write lane may execute only if all are true:

1. There are exactly 3 file operations.
2. All operations are update operations.
3. All target paths are inside selected workspace.
4. All target files already exist.
5. There are no create/delete/move/broad/unknown operations.
6. No duplicate target path.
7. Read-before-write / stale-read guard passes for all files.
8. Writer path can verify all writes.
9. postWriteVerification can report all files.
10. perFilePatchPlan can represent all three operations.

If any guard fails, outcome must remain stopped/error/no-write according to existing taxonomy.

## Required preservation

These must remain unchanged:

- single-file update behavior
- single-file create behavior
- exactly-two update behavior
- 4+ update unsupported/no-write
- delete unsupported/no-write
- move unsupported/no-write
- broad apply_patch unsupported/no-write
- malformed/mixed unsupported no-write
- result contract
- release deterministic claims

Exactly-three success, if implemented, must not imply 3+ support.

## Required tests

Add or update focused tests for:

### Positive guarded lane

- exactly-three existing-file update routes to write only when all guards pass
- changedFiles includes exactly the three updated files
- plannedFiles is not used as a substitute for changedFiles on success
- perFilePatchPlan has three supported-write update operations
- postWriteVerification=pass on success

### Guard rejection

- exactly-three with one create remains no-write
- exactly-three with delete remains no-write
- exactly-three with move remains no-write
- exactly-three with missing existing file remains no-write
- exactly-three with duplicate target remains no-write
- exactly-three stale/mismatch remains no-write before writer invocation
- four-file update remains unsupported/no-write

### Failure surface

- partial writer or verification failure reports changedFiles/failedFiles distinctly
- no rollback/atomicity claim appears
- writer flags reflect actual writer start

## Focused validation during edits

Run touched focused tests only, then build:

- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationExecution.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/multiFileWriteResult.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Run only tests for files actually touched.

## Required route validation

Run one final validation pass:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Important: if exactly-three write is implemented, update the route-specific verifier semantics carefully. The route may need a new non-default verifier for exactly-three write evidence rather than silently changing an existing "three-file planning/no-write" gate. Do not break old no-write evidence without intentionally replacing it with explicit new evidence and clear naming.

Do not run full opt-in real-provider execution unless explicitly approved.

## Gate naming rule

If exactly-three update becomes writable, do not leave stale gate names claiming "three-file-planning-no-write" as the source of truth for that path.

Either:

- keep existing three-file planning/no-write verifier for a separate no-write fixture that still exists, and add a new non-default exactly-three write verifier, or
- rename/update the verifier only if all dependent release gates and docs remain accurate.

Prefer adding a new non-default verifier rather than changing default gate semantics.

Do not change package scripts unless strictly necessary. If a new verifier is added, it must be non-default.

## Residue cleanup

Clean generated residue when safe:

- permissions.jsonl changes
- history.db changes
- undefined/
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

Report anything that cannot be cleaned.

## Success criteria

Route 40 is complete only if one of these is true:

### Success path A: guarded write implemented

- exactly-three existing-file update write lane exists
- all guard conditions are enforced
- 4+ update remains unsupported/no-write
- delete/move/broad remain unsupported/no-write
- create/mixed operation remains unsupported/no-write
- stale-read guard blocks before writer invocation
- partial/post-write failure surface is accurate
- no rollback/atomicity claim added
- focused tests and final validation pass
- no broad readiness claim added

### Success path B: implementation blocked safely

- route proves exactly-three write is not safe yet
- no behavior change is made except optional focused tests or no-write clarity
- existing planning/no-write behavior remains
- final validation passes
- report explains the blocker and next bounded route

## Stop conditions

Stop and report if:

- implementation requires broad arbitrary multi-file writer
- implementation requires rollback/atomicity to be honest
- implementation requires changing CLI/session/provider behavior
- implementation requires default gate changes
- exactly-three support cannot be separated from 4+ support
- result contract cannot be preserved
- unsupported/no-write gates fail
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding exactly-three inventory
5. Implemented guarded write? yes/no
6. If yes: guard conditions enforced
7. If no: blocker and retained behavior
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. New write capability added? yes/no, and exact scope
12. 4+ update still unsupported? yes/no
13. Delete/move/broad still unsupported? yes/no
14. Mixed create/delete/move still no-write? yes/no
15. Stale-read guard evidence
16. changedFiles/plannedFiles/failedFiles evidence
17. writer flag evidence
18. post-write verification evidence
19. rollback/atomicity claim added? yes/no
20. Focused tests added/reused
21. Focused validation results
22. Final validation results
23. Residue cleanup status
24. Claim/readiness changes
25. Residual risks
26. Recommended next route
27. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

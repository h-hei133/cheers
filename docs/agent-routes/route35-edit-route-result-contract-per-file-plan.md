# Route 35: Edit route/result contract hardening and per-file patch plan, no-write

This is a development-only Codex goal spec for bounded implementation work.
It is not a product readiness claim.

## Objective

Implement the first edit-capability roadmap route from:

- docs/design/edit-capability-roadmap.md

Route 35 must harden the edit route/result contract and introduce a per-file patch plan representation, without adding new write capability.

This route must not implement broad apply_patch writes, 3-file writes, delete/move writes, rollback, atomicity, stale-read recovery, or partial failure recovery.

The goal is to make the existing bounded edit system more explicit and extensible by representing per-file patch intent/plan/results in a typed structure that can support future routes, while preserving all current behavior:

- single-file selected-workspace update remains supported
- single-file create remains supported
- exactly-two update remains supported
- exactly-three update remains planning/no-write only
- 3+ update remains unsupported/no-write
- delete/move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed patch remains model-output/error
- mixed supported/unsupported remains stopped/error/no-write
- changedFiles / failedFiles / plannedFiles semantics remain unchanged

## Current context

Route 34 created:

- docs/design/edit-capability-roadmap.md

The roadmap recommends Route 35 as the first implementation route:

- Edit Route/Result Contract Hardening And Per-File Patch Plan, No-Write

Current known edit capabilities:

- MVP selected-workspace single-file update
- candidate single-file create
- candidate exactly-two update
- exactly-three existing-file planning/no-write
- unsupported patch E2E coverage for malformed, 3+ update, delete, move, broad apply_patch, mixed supported/unsupported
- plannedFiles vs changedFiles continuity
- stopped/error/success taxonomy

Current explicit non-claims:

- no broad apply_patch writes
- no 3-file writes
- no delete/move writes
- no rollback/atomicity
- no arbitrary mutation
- no stale-read recovery
- no partial failure recovery

## Non-goals

Do not add or change:

- broad apply_patch write capability
- 3-file write capability
- 3+ write capability
- delete/move write capability
- rollback/atomicity
- snapshot/revert
- stale-read recovery
- partial failure recovery
- provider behavior
- model prompting behavior
- CLI behavior
- session persistence behavior
- MCP behavior
- package scripts
- default gates
- readiness claims

Do not rewrite mutation execution.
Do not change selected-workspace writer behavior.
Do not change provider output parsing semantics except to project into the new no-write plan structure.
Do not change post-write verification behavior.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve existing capability boundaries.
- Preserve success/stopped/error semantics.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for unsupported and planning-only cases.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 35 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Required first step

Before editing, read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- PROJECT_STATE.md
- RUNBOOK.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Then locate current structures and flows for:

- mutation route selection
- patch shape classification
- supported single-file update
- supported single-file create
- supported exactly-two update
- exactly-three planning/no-write
- unsupported 3+ update
- unsupported delete/move
- unsupported broad apply_patch
- malformed model output
- mixed supported/unsupported patch
- changedFiles / failedFiles / plannedFiles production
- postWriteVerification
- workspaceWriterInvoked
- creatorInvoked
- deleteMoveInvoked
- successLike flags
- terminal outcome mapping
- session continuity mapping

Produce an internal implementation inventory for the final report:

1. Current route/result contract shape.
2. Current implicit per-file intent fields.
3. Existing supported per-file operations.
4. Existing unsupported per-file operations.
5. Existing no-write planning-only cases.
6. Where changedFiles / failedFiles / plannedFiles are produced.
7. Where the new per-file patch plan can be introduced without behavior change.
8. Which files/functions must remain unchanged.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -160
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 34 docs are uncommitted, proceed only if they are exactly the expected roadmap doc and do not conflict with this route. Report stacked status.
If baseline gates fail for unrelated reasons, stop and report.

## Implementation target

Introduce a typed per-file patch plan/result contract.

Possible target module:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts

or, if existing patchResult ownership suggests a better home:

- packages/ts-shell/src/orchestration/patchResult/patchPlanContract.ts
- packages/ts-shell/src/orchestration/patchResult/editRouteResultContract.ts

Choose based on current code shape.

The new structure should be able to represent, without enabling new writes:

- update file intent
- create file intent
- delete file intent, unsupported/no-write
- move file intent, unsupported/no-write
- broad apply_patch intent, unsupported/no-write
- malformed / unknown patch shape
- per-file target path
- optional source path for move
- operation kind
- support status
- planned/no-write status
- failure class
- verification expectation
- changed/planned/failed file projection
- user-visible reason

Suggested types may include:

- `PerFilePatchPlan`
- `PerFilePatchOperation`
- `PerFilePatchOperationKind`
- `PerFilePatchSupportStatus`
- `PerFilePatchPlanSummary`
- `PerFilePatchPlanProjection`

The exact names should fit existing code.

## Required behavior

Route 35 must preserve current behavior.

Supported cases must remain supported:

- selected-workspace single-file update writes exactly as before
- single-file create writes exactly as before
- exactly-two update writes exactly as before

Planning-only / unsupported cases must remain no-write:

- exactly-three update remains planning/no-write
- 3+ update remains unsupported/no-write
- delete remains unsupported/no-write
- move remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- malformed remains model-output/error/no-write
- mixed supported/unsupported remains unsupported/error/no-write

The per-file plan may be produced for unsupported cases, but must not make them writable.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/* only if necessary for type import/use, not behavior changes
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts only for minimal wiring to consume the new contract, not new behavior
- focused tests under packages/ts-shell/src/orchestration/**

Prefer adding/changing focused modules and tests under:

- packages/ts-shell/src/orchestration/patchResult/
- packages/ts-shell/src/orchestration/

## Conditional allowed scope

Only if strictly necessary for type projection:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

Do not change user-visible behavior unless preserving existing output requires adapting to the new typed structure.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- package.json
- scripts/*
- docs/*, except this route spec if already created

If completing this route requires forbidden files, stop and report.

## Specific contract requirements

The new per-file patch plan/result contract must satisfy:

1. It can represent current supported write lanes without changing them.
2. It can represent unsupported per-file operations without writing.
3. It can distinguish:
   - plannedFiles
   - changedFiles
   - failedFiles
4. It can represent operation kind:
   - update
   - create
   - delete unsupported
   - move unsupported
   - broad unsupported
   - malformed / unknown
5. It can represent support status:
   - supported-write
   - supported-planning-no-write
   - unsupported-no-write
   - invalid-model-output
6. It can preserve Route 08 unsupported patch E2E semantics.
7. It can preserve Route 11 exactly-three planning/no-write semantics.
8. It can preserve Route 12 plannedFiles continuity semantics.
9. It must not change writer invocation conditions.
10. It must not create rollback or partial failure behavior.

## Focused tests required

Add focused tests for the new contract.

At minimum, cover:

- single-file update plan projects to supported write intent
- single-file create plan projects to supported write intent
- exactly-two update plan projects to supported write intent
- exactly-three update plan projects to planning/no-write with plannedFiles
- 3+ update plan projects to unsupported/no-write
- delete plan projects to unsupported/no-write
- move plan projects to unsupported/no-write
- broad apply_patch plan projects to unsupported/no-write
- malformed patch projects to invalid-model-output
- mixed supported/unsupported plan projects to unsupported/no-write
- changedFiles / plannedFiles / failedFiles are not conflated
- writer invocation remains false for unsupported/no-write cases

Tests should be placed near the new contract module, for example:

- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.test.ts

or a similarly named focused test.

## Local validation after implementation

Run:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

If the file name differs, run the actual focused test.

Then run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Batch validation

Run:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional comparison

If feasible, compare before/after outputs for:

- unsupported patch E2E
- three-file planning/no-write
- planned-files continuity
- release deterministic

Check:

- outcome unchanged
- Route08Class / Route02Class unchanged where applicable
- plannedFiles unchanged
- changedFiles unchanged
- writerInvoked unchanged
- successLike unchanged
- no new readiness claims

Do not store large logs in repo.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary comparison logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

If residue cannot be cleaned, report why.

## Success criteria

Route 35 is complete only if:

- a typed per-file patch plan/result contract exists
- current supported write lanes still pass
- current unsupported/no-write lanes still pass
- no new write capability was added
- delete/move/broad apply_patch remain unsupported/no-write
- exactly-three update remains planning/no-write
- changedFiles / failedFiles / plannedFiles are preserved
- writer invocation conditions are unchanged
- post-write verification behavior is unchanged
- result contract passes
- deterministic release passes
- no product readiness claims changed
- no provider/session/CLI/MCP behavior changed
- no package scripts or default gates changed
- no secret/provider config is printed

## Stop conditions

Stop and report if:

- implementing the contract requires changing write capability
- implementing the contract requires enabling broad apply_patch
- implementing the contract requires enabling delete/move
- implementing the contract requires changing mutation execution
- implementing the contract requires changing post-write verification
- implementing the contract requires changing SessionManager or cli.tsx
- result contract cannot be preserved
- unsupported/no-write gates fail
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Pre-coding edit route/result inventory
5. Contract/module added
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. New write capability added? yes/no
10. Unsupported capability changed? yes/no
11. Delete/move/broad apply_patch still unsupported? yes/no
12. Three-file write still no-write? yes/no
13. changedFiles/plannedFiles/failedFiles preservation evidence
14. writer invocation preservation evidence
15. post-write verification preservation evidence
16. Focused tests added/reused
17. Local validation results
18. Batch validation results
19. Full validation results
20. Residue cleanup status
21. Claim/readiness changes
22. Residual risks
23. Recommended next route
24. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

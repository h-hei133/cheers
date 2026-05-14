# Route 41: exactly-three guarded write CLI evidence gate

This is a development-only Codex goal spec for bounded evidence work.
It is not a broad edit readiness claim.

## Objective

Add non-default CLI/verifier evidence for the Route 40 guarded exactly-three existing-file update write lane.

Route 40 added exactly one new write capability:

- exactly-three existing selected-workspace Update File

Route 41 must prove that capability through a realistic user/CLI/verifier path without expanding capability, changing default gates, or making broad readiness claims.

The goal is to add a non-default verification path that demonstrates:

- exactly-three existing-file update succeeds only in the guarded lane
- writerInvoked=true only for the guarded success case
- changedFiles contains exactly the three updated files on success
- postWriteVerification=pass on success
- perFilePatchPlan has exactly three supported-write update operations
- 4+ update remains unsupported/no-write
- delete/move/broad/mixed remain unsupported/no-write
- stale-read guard still blocks before writer invocation
- no rollback/atomicity claim is made

## Current context

Route 40 already added a deterministic/local script:

- scripts/verify-three-file-guarded-write.mjs

But residual risk remains:

- exactly-three real-provider/CLI evidence is not yet exposed as a non-default package script.
- current evidence is deterministic/local and focused, not clearly integrated into the same real-user capability evidence family.

Route 41 should add or wire non-default evidence only.

## Non-goals

Do not add or change:

- 4+ file writes
- broad apply_patch writes
- delete/move writes
- create+update mixed writes
- rollback/atomicity
- snapshot/revert
- automatic recovery/retry/merge
- stale-read recovery
- partial failure recovery
- provider behavior
- model prompting behavior
- CLI behavior
- session persistence behavior
- MCP behavior
- default gates
- broad readiness claims

Do not change the Route 40 write lane itself except for evidence/reporting integration if strictly necessary.

## Validation policy

Use fast preflight, focused validation while editing, and one final route-level validation.

Do not run broad gates before coding unless focused preflight fails or the working tree is suspicious.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline active.
- Use rtk for reads, search, git status/diff, tests, build, verification, and large-output commands.
- Do not read or print anything under `/home/wang/.private-agents-real`.
- Do not run full opt-in real-provider execution unless explicitly approved.
- Do not commit or push.
- Preserve supported write behavior.
- Preserve unsupported/no-write behavior.
- Preserve result contract and deterministic release claims.
- Preserve default gate membership.

## Required first step

Read:

- docs/design/edit-capability-roadmap.md
- scripts/verify-three-file-guarded-write.mjs
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts

Locate:

- Route 40 exactly-three guarded write evidence
- existing real-user capability verifier patterns
- existing non-default package script patterns
- Route03 two-file CLI evidence pattern
- Route08 unsupported patch E2E pattern
- Route11/12 three-file planning/no-write evidence pattern
- deterministic release checks that must remain unchanged

Final report must include a short evidence inventory.

## Fast preflight

Run only:

- rtk git status --short --branch
- rtk git diff --check
- rtk node scripts/verify-three-file-guarded-write.mjs

If Route 40 changes are still uncommitted, proceed only if they are expected Route 40 files and do not conflict with this route.

## Implementation target

Add non-default evidence for exactly-three guarded write.

Possible acceptable implementations:

### Option A: package script for existing verifier

Add a non-default package script such as:

- verify:real-user-capabilities:three-file-guarded-write

that runs:

- scripts/verify-three-file-guarded-write.mjs

### Option B: integrate as opt-in mode in verify-real-user-capabilities.mjs

Add a non-default flag such as:

- --three-file-guarded-write
- --route41-three-file-guarded-write

and optionally expose it through a non-default package script.

### Option C: add CLI-path evidence wrapper

If existing verifier is not CLI-like enough, add a bounded deterministic CLI-path evidence wrapper that uses the real CLI entry mode but synthetic/deterministic provider path.

Prefer the smallest implementation that gives clear non-default user-facing evidence.

## Evidence requirements

The new non-default evidence must report and/or assert:

- scenario name
- outcome success for exactly-three existing-file update
- changedFiles exactly 3 files
- failedFiles empty
- plannedFiles not used as changedFiles on success
- writerInvoked=true
- creatorInvoked=false
- deleteMoveInvoked=false
- postWriteVerification=pass
- perFilePatchPlan support status supported-write for all 3 update operations
- stale-read guard scenario stopped/no-write
- 4+ update remains unsupported/no-write
- delete/move/broad/mixed remain unsupported/no-write
- no rollback/atomicity claim
- no full real-provider execution unless explicitly approved

Output should be safe and must not print secrets.

## Allowed modification scope

Allowed:

- package.json, only to add a non-default script
- scripts/verify-three-file-guarded-write.mjs
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- focused tests if a new support module is added

Avoid product code changes unless a bug in Route 40 evidence is discovered. If product code changes are required, stop and report before modifying.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core
- MCP core
- docs/* except this route spec if already created
- default release gate membership

Do not change default scripts beyond adding a non-default script.

## Focused validation during edits

Run only the relevant focused evidence commands:

- rtk node scripts/verify-three-file-guarded-write.mjs
- rtk npm run verify:real-user-capabilities:three-file-guarded-write, if package script is added
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk node --check scripts/verify-three-file-guarded-write.mjs
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Final route-level validation

Run one final validation pass:

- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

If no package script is added, run the exact non-default command that was added and explain why.

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional validation

Run only if touched code suggests it is needed:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run

## Residue cleanup

Clean generated residue when safe:

- permissions.jsonl changes
- history.db changes
- undefined/
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

Report anything that cannot be cleaned.

## Success criteria

Route 41 is complete only if:

- exactly-three guarded write has a non-default evidence command
- evidence command passes
- package script is non-default if added
- default gates are unchanged
- no new write capability was added
- 4+ update remains unsupported/no-write
- delete/move/broad/mixed remain unsupported/no-write
- stale-read guard evidence remains present
- changedFiles / plannedFiles / failedFiles are preserved
- writer/deleteMove/creator flags are preserved
- result contract passes
- deterministic release passes
- no broad readiness claim is added
- no provider/session/CLI/MCP behavior changed
- no secrets/provider config are printed

## Stop conditions

Stop and report if:

- evidence requires changing product behavior
- evidence requires changing default release gate membership
- evidence requires full real-provider execution without explicit approval
- evidence requires touching SessionManager.ts or cli.tsx
- exactly-three evidence cannot be separated from broad 3+ support
- result contract cannot be preserved
- deterministic release fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Roadmap alignment
4. Evidence inventory
5. Evidence command added
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. New write capability added? yes/no
10. Default gates changed? yes/no
11. Broad readiness claim added? yes/no
12. Exactly-three evidence result
13. 4+ / delete / move / broad preservation evidence
14. Stale-read preservation evidence
15. changedFiles/plannedFiles/failedFiles evidence
16. writer/deleteMove/creator flag evidence
17. Focused validation results
18. Final validation results
19. Optional validation results, if any
20. Residue cleanup status
21. Claim/readiness changes
22. Residual risks
23. Recommended next route
24. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

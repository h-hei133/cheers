# Route 45: guarded single-file delete writer

## Objective

Implement one narrowly bounded new edit capability:

- exactly one Delete File operation
- selected workspace only
- target is an existing regular file
- no directory delete
- no missing target success
- no mixed operation list
- no broad apply_patch writer
- no rollback / snapshot / atomicity claim

If any guard fails, result remains stopped/no-write.

## Why this route is narrower than broad delete support

This is not broad delete readiness.

It only opens a guarded single-file delete lane after Route 44 proved the move writer pattern. It must not add multi-delete, mixed patch, broad apply_patch, recursive directory delete, rollback, recovery, or destructive-operation UI.

## Validation policy

Use light validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts

During edits:

- run focused tests for touched modules
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

If a new non-default delete evidence command is added, run it in final validation.

Run three-file guarded write only if shared mutation/write routing code is touched.

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.

## Boundary check

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- docs/design/edit-capability-roadmap.md

Use them only to confirm:

- this route belongs to edit capability work
- SessionManager.ts and cli.tsx remain out of scope
- broad apply_patch writes remain out of scope
- mixed writes remain out of scope
- rollback/atomicity remain out of scope
- default gates remain unchanged

Do not restate the full history in the final report.

## Narrow reference comparison

Because this route adds a destructive file-operation writer, do a narrow read-only comparison before coding.

Reference only:

- opencode:
  - apply_patch / patch / snapshot areas
  - focus: delete safety, failure/revert boundary, no rollback assumptions
- gemini-cli:
  - file tools / checkpoint / sandbox / trusted-folder areas
  - focus: workspace-safe destructive operation boundary
- source-claudecode:
  - FileEditTool areas
  - focus: read-first / failure surface ideas

Use references only for safety lessons.
Do not copy code.
Do not produce a long audit.

Final report should summarize:

1. useful safety ideas adopted
2. ideas deferred
3. why this route remains narrower than references

## Read first

Target files:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileMoveApply.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- single Delete File recognition
- delete unsupported/no-write result
- target workspace checks
- missing target
- directory target
- mixed update+delete
- broad apply_patch
- perFilePatchPlan delete operation projection
- changedFiles / failedFiles / plannedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- unsupported-patch E2E delete-like fixtures

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- focused orchestration tests
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json only for a new non-default script

Forbidden:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core
- MCP core
- docs/* except this route spec
- default gate membership

## Implementation requirements

Implement a delete writer or delete application helper only for the guarded lane.

The writer must:

1. accept exactly one Delete File operation
2. verify target is inside selected workspace
3. verify target exists immediately before delete
4. verify target is a regular file
5. refuse directory delete
6. refuse missing target as success
7. refuse mixed operation lists
8. refuse broad apply_patch
9. refuse move/create/update in the delete route
10. delete/unlink only one regular file
11. verify after delete:
    - target no longer exists
12. project perFilePatchPlan as supported-write delete on success
13. set changedFiles according to the route/result contract for deletion
14. set failedFiles=[] on success
15. set deleteMoveInvoked=true only when delete writer actually starts
16. keep writerInvoked semantics consistent with existing result contract

No rollback/atomicity claim.

If post-delete verification fails, surface stopped/error with changed/failed facts. Do not hide partial state.

## Evidence / verifier requirements

Because this changes delete from unsupported to narrowly supported, update evidence intentionally.

Add a non-default evidence command for successful guarded delete, preferably:

- verify:real-user-capabilities:single-file-delete-evidence

The evidence should assert:

- successful single-file delete inside selected workspace
- target no longer exists
- changedFiles accurate according to delete semantics
- failedFiles empty
- perFilePatchPlan supported-write delete
- deleteMoveInvoked=true only on actual delete
- writerInvoked semantics consistent with result contract
- no rollback/atomicity claim

Keep unsupported-patch E2E covering delete-like failures, but use invalid delete cases:

- outside workspace
- missing target
- directory target
- mixed update+delete
- broad patch delete
- duplicate delete target, if applicable

Do not leave stale evidence that treats a valid guarded delete as globally unsupported.

## Tests required

Add/update focused tests for:

Success:

- guarded single-file delete succeeds
- target no longer exists
- changedFiles accurate
- failedFiles empty
- plannedFiles not used as changedFiles on success
- perFilePatchPlan supported-write delete
- deleteMoveInvoked true only when actual delete writer starts
- post-delete verification passes

Blocked:

- missing target no-write
- outside target no-write
- directory target no-write
- mixed update+delete no-write
- move remains supported only by Route 44 lane
- broad apply_patch remains unsupported/no-write
- duplicate delete target no-write, if represented

Failure surface:

- post-delete verification failure projects failedFiles and no rollback/atomicity claim, if it can be simulated safely in focused tests

## Required preservation

Must remain unchanged:

- single-file update
- single-file create
- exactly-two update
- exactly-three guarded update
- single-file move
- 4+ unsupported/no-write
- broad apply_patch unsupported/no-write
- mixed operation unsupported/no-write
- malformed model-output/error/no-write
- result contract
- default gates

## Focused validation during edits

Run only tests for touched modules, plus build/diff.

Likely commands:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchApplication/<new-delete-test>.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/<delete-route-or-result-test>.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Final validation

Run:

- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence, if added
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Run three-file guarded write only if shared mutation/write routing code is touched.

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.
Do not run full opt-in real-provider execution.

## Residue cleanup

Clean generated residue when safe:

- permissions.jsonl changes
- history.db changes
- undefined/
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

Report anything that cannot be cleaned.

## Success criteria

Route 45 is complete if:

- guarded single-file delete writer exists
- no broad apply_patch write added
- no mixed write added
- no directory delete allowed
- no missing target success allowed
- invalid delete-like cases remain no-write
- unsupported patch E2E is updated intentionally and passes
- non-default delete evidence exists and passes
- result contract passes
- build passes
- no default gate changed
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- delete support requires broad patch writer
- delete support requires rollback/atomicity to be honest
- delete support cannot be separated from mixed operations
- result contract cannot preserve file-list/writer flag semantics
- unsupported-patch E2E cannot be updated without weakening unsupported evidence
- implementation requires touching SessionManager.ts or cli.tsx
- implementation requires changing default gates

## Final report

Report:

1. Route
2. Delete writer implemented? yes/no
3. Exact capability scope
4. Boundary/map check result
5. Narrow reference comparison summary
6. Guard evidence
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. New write capability exact scope
11. Broad/mixed still unsupported
12. Invalid delete-like cases still no-write
13. Move lane preserved
14. New non-default delete evidence
15. File list / writer flag / post-verification evidence
16. Focused validation
17. Final validation
18. Residue cleanup
19. Claim/readiness changes
20. Residual risks
21. Next recommended route
22. Proposed commit message

Do not commit or push.

# Route 44: guarded single-file move writer

## Objective

Implement the real writer for the Route 43 guarded single-file move/rename lane.

Allowed new capability:

- exactly one Move File / rename operation
- selected workspace only
- source is an existing regular file
- target is inside selected workspace
- target does not exist
- source and target are distinct
- no directory move
- no overwrite
- no delete
- no mixed operation list
- no broad apply_patch
- no rollback / atomicity claim

If any guard fails, result remains stopped/no-write.

## Validation policy

Use light validation.

Preflight:

- rtk git status --short --branch
- rtk git diff --check
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceMoveRoute.test.ts

During edits:

- run focused tests for touched modules
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

Final:

- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

If a new non-default move evidence command is added, run it in final validation.

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.

## Boundary check

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- docs/design/edit-capability-roadmap.md

Use them only to confirm:

- this route belongs to edit capability work, not architecture extraction
- SessionManager.ts and cli.tsx remain out of scope
- broad apply_patch writes remain out of scope
- delete writes remain out of scope
- mixed writes remain out of scope
- rollback/atomicity remain out of scope
- default gates remain unchanged

Do not restate the full history in the final report.

## Narrow reference comparison

Because this route adds a real file-operation writer, do a narrow read-only comparison before coding.

Reference only:

- opencode:
  - apply_patch / patch / snapshot areas
  - focus: move/delete safety, no-overwrite boundary, failure/revert boundaries
- gemini-cli:
  - file tools / sandbox / checkpoint / trusted-folder areas
  - focus: workspace-safe file operation boundary
- source-claudecode:
  - FileEditTool areas
  - focus: read-first, stale/failure surface, user-visible file-operation failure

Use the references only for safety lessons.

Do not copy code.
Do not produce a long audit.
In the final report, summarize only:

1. useful safety ideas adopted
2. ideas explicitly deferred
3. why this route remains narrower than the references

## Read first

Target files:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- single Move File recognition
- move guards from Route 43
- move-writer-not-enabled safe-block result
- source / target workspace checks
- missing source
- existing target
- same source / target
- directory source
- mixed update+move
- delete unsupported
- broad apply_patch unsupported
- perFilePatchPlan move operation projection
- changedFiles / failedFiles / plannedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- unsupported-patch E2E move-like fixtures

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

Implement a move writer or move application helper only for the guarded lane.

The writer must:

1. verify source still exists immediately before moving
2. verify source is a regular file
3. verify target still does not exist immediately before moving
4. verify source and target are distinct
5. verify source and target are inside selected workspace
6. preserve file contents exactly
7. move/rename only one regular file
8. refuse directories
9. refuse overwrite
10. refuse outside-workspace source or target
11. refuse mixed operation lists
12. refuse broad apply_patch
13. refuse delete
14. verify after move:
    - source path no longer exists
    - target path exists
    - target content equals original source content
15. project perFilePatchPlan as supported-write move on success
16. set changedFiles to the target path, unless existing result contract requires a different explicit moved-file convention
17. set failedFiles=[] on success
18. set deleteMoveInvoked=true only when the move writer actually starts
19. keep writerInvoked semantics consistent with existing route result contract

No rollback/atomicity claim.

If post-verification fails, surface stopped/error with changed/failed facts. Do not hide partial state.

## Evidence / verifier requirements

Because this changes move from unsupported to narrowly supported, update evidence intentionally.

Add a non-default evidence command for successful guarded move, preferably:

- verify:real-user-capabilities:single-file-move-evidence

The evidence should assert:

- successful single-file move inside selected workspace
- source removed
- target exists
- target content preserved
- changedFiles accurate
- failedFiles empty
- perFilePatchPlan supported-write move
- deleteMoveInvoked=true only on actual move
- writerInvoked semantics consistent with result contract
- no rollback/atomicity claim

Keep unsupported-patch E2E covering move-like failures, but use invalid move cases:

- outside workspace
- missing source
- target exists
- same source/target
- directory source if supported by test fixture
- mixed update+move
- broad patch move

Do not leave stale evidence that treats a valid guarded move as globally unsupported.

## Tests required

Add/update focused tests for:

Success:

- guarded single-file move succeeds
- source removed
- target exists
- target content preserved
- changedFiles accurate
- failedFiles empty
- plannedFiles not used as changedFiles on success
- perFilePatchPlan supported-write move
- deleteMoveInvoked true only when actual move writer starts
- post-write verification passes

Blocked:

- missing source no-write
- existing target no-write
- outside source no-write
- outside target no-write
- same source/target no-write
- directory source no-write, if applicable
- mixed update+move no-write
- delete remains unsupported/no-write
- broad apply_patch remains unsupported/no-write

Failure surface:

- post-move verification failure projects failedFiles and no rollback/atomicity claim, if it can be simulated safely in focused tests

## Required preservation

Must remain unchanged:

- single-file update
- single-file create
- exactly-two update
- exactly-three guarded update
- 4+ unsupported/no-write
- delete unsupported/no-write
- broad apply_patch unsupported/no-write
- mixed operation unsupported/no-write
- malformed model-output/error/no-write
- result contract
- default gates
- broadReleaseReady=false in deterministic release, if release validation is run later

## Focused validation during edits

Run only tests for touched modules, plus build/diff.

Likely commands:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceMoveRoute.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/workspaceMoveResult.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/patchApplication/<new-move-test>.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk node --check scripts/verify-real-user-capabilities.mjs, if touched
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Final validation

Run:

- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence, if added
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

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

Route 44 is complete if:

- guarded single-file move writer exists
- no delete write added
- no broad apply_patch write added
- no mixed write added
- no overwrite allowed
- no directory move allowed
- invalid move-like cases remain no-write
- unsupported patch E2E is updated intentionally and passes
- non-default move evidence exists and passes
- result contract passes
- build passes
- no default gate changed
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- move support requires broad patch writer
- move support requires rollback/atomicity to be honest
- move support cannot be separated from delete support
- result contract cannot preserve file-list/writer flag semantics
- unsupported-patch E2E cannot be updated without weakening unsupported evidence
- implementation requires touching SessionManager.ts or cli.tsx
- implementation requires changing default gates

## Final report

Report:

1. Route
2. Move writer implemented? yes/no
3. Exact capability scope
4. Boundary/map check result
5. Narrow reference comparison summary
6. Guard evidence
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. New write capability exact scope
11. Delete/broad/mixed still unsupported
12. Unsupported move-like cases still no-write
13. New non-default move evidence
14. File list / writer flag / post-verification evidence
15. Focused validation
16. Final validation
17. Residue cleanup
18. Claim/readiness changes
19. Residual risks
20. Next recommended route
21. Proposed commit message

Do not commit or push.

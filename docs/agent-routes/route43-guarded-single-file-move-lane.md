# Route 43: guarded single-file move/rename write lane

## Objective

Implement one narrowly bounded new edit capability:

- single-file move/rename inside selected workspace

This route must not add delete writes, broad apply_patch writes, 4+ writes, mixed writes, rollback, recovery, or default gate changes.

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
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Do not run release deterministic or broad session/MCP/CLI gates unless touched files or failures justify it.
A full validation/audit will run after a few edit-capability routes.

## Read first

Target repo:
- docs/design/edit-capability-roadmap.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*

References, read narrowly:
- source-claudecode: FileEditTool files, for workspace/read-first/failure surface ideas
- opencode: tool/apply_patch.ts, patch/patch.ts, snapshot/index.ts, for parse/verify/apply layering
- gemini-cli: file tools/checkpoint/sandbox/trusted-folder areas, for source/target safety boundary ideas

Use reference repos only for ownership and safety patterns. Do not copy code.

## Allowed scope

Allowed:
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- focused orchestration tests
- scripts/verify-real-user-capabilities.mjs or scripts/real-user-capabilities/* only for non-default evidence

Forbidden:
- SessionManager.ts
- cli.tsx
- package.json unless adding a non-default script is explicitly needed
- docs/* except this route spec
- provider/auth core
- MCP core
- default gates

## Capability boundary

The move lane may execute only if all are true:

1. exactly one operation
2. operation kind is move/rename
3. source path is inside selected workspace
4. target path is inside selected workspace
5. source file exists
6. target path does not already exist
7. source and target are distinct
8. no directory move
9. no delete operation
10. no mixed operation list
11. no broad apply_patch write
12. stale/read-before-write guard passes if applicable
13. post-write verification confirms:
    - source no longer exists, or existing project semantics say moved
    - target exists
    - target content matches expected source content
14. perFilePatchPlan records supported-write move operation

If any guard fails, the result must be stopped/no-write.

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

No rollback or atomicity claim may be added.

## Tests required

Add focused tests for:

- successful single-file move inside selected workspace
- move outside workspace blocked before writer
- move to existing target blocked before writer
- missing source blocked before writer
- same source/target blocked
- directory move blocked, if applicable
- mixed update+move remains no-write
- delete remains unsupported/no-write
- broad apply_patch remains unsupported/no-write
- perFilePatchPlan records move supported-write only on success
- changedFiles / failedFiles / plannedFiles remain accurate
- writer/deleteMove flags accurately reflect whether move writer ran
- no rollback/atomicity claim

## Success criteria

Route is complete if:

- guarded single-file move lane exists, or implementation is safely blocked with a clear reason
- no delete write added
- no broad apply_patch write added
- no 4+ write added
- no default gate changed
- focused and final validation pass
- residue cleaned
- no commit/push

## Final report

Report:

1. Route
2. Implemented move lane? yes/no
3. Guard conditions enforced
4. Files changed
5. New write capability exact scope
6. Delete/broad/mixed still unsupported
7. File list and writer flag evidence
8. Focused validation
9. Final validation
10. Residue cleanup
11. Residual risks
12. Next recommended route
13. Proposed commit message

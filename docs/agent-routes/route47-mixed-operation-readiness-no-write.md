# Route 47: mixed operation readiness evaluation and no-write contract hardening

## Objective

Evaluate mixed operation write readiness and harden no-write contract.

Mixed operation examples:

- update + create
- update + delete
- update + move
- create + delete
- create + move
- delete + move
- update + create + delete/move

This route must not enable mixed writes.

The goal is to make mixed-operation detection, per-file plan projection, failure reasons, readiness blockers, and no-write evidence explicit enough to decide a future implementation route.

## Capability boundary

Allowed:

- clearer mixed-operation classification
- richer perFilePatchPlan operation projection
- readiness blocker metadata
- no-write result hardening
- focused tests / non-default evidence if useful

Forbidden:

- mixed writes
- broad apply_patch writes
- 4+ writes
- multi-delete / multi-move writes
- rollback / atomicity
- recovery / retry / merge
- provider/session/CLI/MCP changes
- default gate changes
- broad readiness claims

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
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git status --short --branch

Run these only if shared routing/write code was touched:

- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence

Do not run broad session/MCP/CLI gates unless touched files or failures justify it.

## Boundary check

Before editing, read:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md

Use them only to confirm:

- this is edit capability work
- mixed writes remain out of scope
- broad apply_patch remains out of scope
- SessionManager.ts and cli.tsx remain out of scope
- rollback/atomicity remain out of scope
- default gates remain unchanged

Do not restate the full history.

## Narrow reference comparison

Because this route evaluates mixed operation readiness, do a narrow read-only comparison.

Reference only:

- opencode:
  - apply_patch / patch parser / permission metadata
  - focus: per-file operation model and mixed operation handling
- Gemini CLI:
  - file tools / checkpoint / sandbox areas
  - focus: destructive/mixed operation safety boundaries
- Claude Code:
  - FileEditTool result/failure surfaces
  - focus: how failed edit results stay user-visible

Use references only for safety and planning lessons.
Do not copy code.
Keep final report summary short.

## Read first

Target files:

- docs/design/edit-capability-roadmap.md
- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Locate current handling for:

- mixed update+create
- mixed update+delete
- mixed update+move
- mixed create+delete
- mixed create+move
- mixed delete+move
- broad apply_patch mixed operations
- changedFiles / failedFiles / plannedFiles
- writerInvoked / creatorInvoked / deleteMoveInvoked
- perFilePatchPlan operation kinds and failure classes
- unsupported-patch E2E mixed fixtures

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- focused orchestration tests
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/* only if non-default mixed no-write evidence is needed

Forbidden:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- provider/auth core
- MCP core
- package.json unless adding a non-default script is explicitly needed
- docs/* except this route spec
- default gate membership

## Implementation requirements

Add or harden mixed-operation no-write contract.

The system should clearly represent:

1. operation list contains mixed kinds
2. all per-file operation kinds are preserved where parseable
3. supported individual operations do not become writable when mixed with unsupported operations
4. changedFiles=[]
5. plannedFiles=[] unless current semantics intentionally use planning
6. failedFiles or failure classes identify mixed-operation blockers
7. writerInvoked=false
8. creatorInvoked=false
9. deleteMoveInvoked=false
10. postWriteVerification=not-run
11. perFilePatchPlan records each operation and the route-level mixed blocker
12. no rollback/atomicity claim

## Readiness evaluation output

Add a small focused helper or test-visible projection if useful, for example:

- mixedOperationReadiness.ts
- mixedOperationPlanProjection.ts

It should answer:

- which operation kinds are present
- whether every individual operation has an existing single-operation lane
- which combinations are blocked because they are mixed
- which additional prerequisites are needed before mixed writes:
  - transaction/rollback decision
  - operation ordering
  - destructive-operation confirmation
  - partial failure semantics
  - post-write verification semantics
  - per-operation authority

Do not make this projection a write authority.

## Tests required

Add/update focused tests for:

- update + create remains no-write
- update + delete remains no-write
- update + move remains no-write
- create + delete remains no-write
- create + move remains no-write
- delete + move remains no-write
- mixed supported-only operations still no-write
- mixed operation plan preserves per-file operation kinds
- changedFiles=[]
- writer/creator/deleteMove flags false
- postWriteVerification not-run
- no rollback/atomicity claim
- existing single update/create/move/delete lanes remain unaffected

## Focused validation

Run touched tests only, likely:

- rtk npm run test -w packages/ts-shell -- src/orchestration/patchResult/perFilePatchPlan.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If scripts are touched:

- rtk node --check scripts/verify-real-user-capabilities.mjs

## Success criteria

Route is complete if:

- mixed-operation readiness/no-write contract is clearer
- no mixed write capability added
- broad apply_patch remains no-write
- 4+ remains unsupported/no-write
- single update/create/move/delete lanes remain intact
- changedFiles/plannedFiles/failedFiles are accurate
- writer flags remain false for mixed no-write
- unsupported-patch E2E passes
- result contract passes
- build passes
- no default gate changed
- no provider/session/CLI/MCP behavior changed
- residue cleaned
- no commit/push

## Stop conditions

Stop and report if:

- clearer mixed classification requires enabling mixed writes
- mixed support cannot be separated from broad apply_patch writes
- result contract cannot preserve file-list/writer flag semantics
- unsupported-patch E2E cannot be preserved
- implementation requires touching SessionManager.ts or cli.tsx
- implementation requires default gate changes

## Final report

Report:

1. Route
2. Mixed writes enabled? yes/no
3. Readiness/no-write contract changes
4. Boundary/map check result
5. Narrow reference comparison summary
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. Single-operation lanes preserved
10. Broad/4+ still unsupported
11. Mixed operation evidence
12. File list / writer flag evidence
13. Focused validation
14. Final validation
15. Residue cleanup
16. Claim/readiness changes
17. Residual risks
18. Next recommended route
19. Proposed commit message

Do not commit or push.

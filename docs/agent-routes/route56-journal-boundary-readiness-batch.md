# Route 56: batched journal boundary and readiness hardening

## Objective

Move faster than the previous single-purpose routes by completing a small batch of tightly related journal-readiness tasks in one route.

Route 55 attached route-scoped journal metadata to mixed, multi-file, and single-file failure consumers. Route 56 should now harden the metadata-only boundary, compare nearby agent implementations, add focused cross-consumer invariants, and produce a practical recommendation for the next edit-capability route.

This route is still a readiness/boundary route, not a rollback or durable recovery implementation route.

## Current state

Route 52 added routeScopedEditJournal as a prototype model.

Route 53 added journalResultProjection.

Route 54 attached journal metadata to mixed/multi partial failure paths.

Route 55 evolved journalFailureConsumer.ts into a shared failure projection entrypoint and attached journal metadata to write/create/move/delete single-file failure consumers.

Known guarantees that must remain true:

- journal writeCapability is "metadata-only"
- rollbackAtomicityClaim is false
- recoveryExecuted is false
- journal data is non-durable
- journal data is result metadata, not writer authority
- recoveryCandidateFiles do not imply recovery was attempted
- unrecoveredFiles do not imply recovery was attempted
- no rollback/recovery/snapshot/persistence capability exists

## External reference scan first

Before editing project files, briefly compare how nearby agent repositories model edit failure, recovery, rollback, checkpoints, or patch application boundaries.

Reference repositories:

- ClaudeCode: /home/wang/projects/source-claudecode
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli

Do not do a broad research pass. Keep this bounded.

Maximum scan budget:

- inspect at most 6 relevant files per repository
- inspect at most 18 external files total
- only exceed this by up to 2 files if a direct match is clearly useful
- do not copy implementation code from these repositories
- summarize only the useful patterns and path references

Suggested keyword groups:

ClaudeCode:

- edit tool
- multi edit
- patch
- checkpoint
- undo
- rollback
- file write
- verification

opencode:

- patch
- diff
- edit
- session
- revert
- snapshot
- rollback
- write file

gemini-cli:

- edit
- replace
- patch
- checkpoint
- restore
- file operation
- write file
- tool result

The scan should answer:

1. Do they separate edit-result metadata from actual recovery authority?
2. Do they expose rollback/checkpoint claims only when durable state exists?
3. Do they guard broad edits differently from narrow file edits?
4. Is there a small pattern worth copying conceptually into our boundary docs/tests?

Write the findings into docs/design/journal-boundary-readiness.md.

## Validation policy

Use minimal validation between tasks.

Preflight:

- rtk git status --short --branch
- rtk git diff --check

After code/test edits:

- run focused tests for touched patchResult modules only
- run no broad/default gates between tasks

Final:

- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Run optional real-user capability gates only if the related consumer files were materially changed:

- rtk npm run verify:real-user-capabilities:mixed-operation-evidence
- rtk npm run verify:real-user-capabilities:three-file-guarded-write
- rtk npm run verify:real-user-capabilities:single-file-move-evidence
- rtk npm run verify:real-user-capabilities:single-file-delete-evidence

Do not run broad session, MCP, CLI, or default gates unless a touched file or failure directly justifies it.

## Read first

Project files:

- packages/ts-shell/src/orchestration/patchResult/routeScopedEditJournal.ts
- packages/ts-shell/src/orchestration/patchResult/journalResultProjection.ts
- packages/ts-shell/src/orchestration/patchResult/journalFailureConsumer.ts
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/multiFileWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceWriteResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceCreateResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceMoveResult.ts
- packages/ts-shell/src/orchestration/patchResult/workspaceDeleteResult.ts
- focused tests for the files above

Route history if useful:

- docs/agent-routes/route55-journal-lifecycle-single-file-consumers.md

External repos:

- use the bounded reference scan above

## Allowed scope

Allowed:

- packages/ts-shell/src/orchestration/patchResult/*
- focused patchResult tests
- docs/design/journal-boundary-readiness.md
- this route spec

Forbidden unless a clear blocker is reported first:

- runtime writer behavior changes
- rollback implementation
- recovery implementation
- snapshot implementation
- durable journal persistence
- new storage backend
- new write capability
- broad arbitrary apply_patch support
- 3+ mixed write support
- SessionManager.ts
- cli.tsx
- package.json
- scripts/*
- provider/session/CLI/MCP behavior
- default gate changes

## Batched tasks

### Task 1: external implementation comparison

Perform the bounded reference scan before editing project code.

Add docs/design/journal-boundary-readiness.md with a concise section:

- External comparison
- Useful patterns
- Non-transferable patterns
- Implications for this project

Keep the comparison practical. The output should help decide whether the next route should be durable journal storage, recovery planning, or broader edit capability.

Minimum validation after this task:

- no test required
- rtk git diff --check if only docs changed

### Task 2: current journal boundary statement

In docs/design/journal-boundary-readiness.md, document the current boundary:

- current journal is route-scoped result metadata
- current journal is non-durable
- current journal is not recovery authority
- current journal is not rollback authority
- current journal does not decide whether writes run
- current journal does not invoke writers
- current journal does not change write ordering
- current journal does not guarantee atomicity
- recoveryCandidateFiles are planning/diagnostic facts only
- unrecoveredFiles are failure facts only
- recoveryExecuted must remain false until a real recovery executor exists
- rollbackAtomicityClaim must remain false until real rollback/snapshot authority exists

Minimum validation after this task:

- no test required
- rtk git diff --check if only docs changed

### Task 3: centralize metadata-only invariant if low churn

Inspect current journalFailureConsumer.ts and journalResultProjection.ts.

If there is already a clear central point for metadata-only facts, strengthen it with comments/types/tests rather than adding another helper.

If the facts are still scattered, add a small helper with a focused name such as:

- journalBoundaryFacts.ts
- journalCapabilityBoundary.ts
- journalMetadataBoundary.ts

The helper may centralize facts like:

- writeCapability: "metadata-only"
- rollbackAtomicityClaim: false
- recoveryExecuted: false
- no durable persistence claim
- no recovery execution claim

Prefer no result-shape churn.

Do not add new public result fields unless the existing contract already has a natural field for them.

Minimum validation after this task:

- focused tests for journalResultProjection / journalFailureConsumer / new helper only
- rtk git diff --check

### Task 4: add cross-consumer boundary tests

Add or consolidate focused tests that prove metadata-only invariants across journal-enabled failure consumers.

Cover as many as cleanly possible without heavy duplication:

- mixedFileWriteResult partial/stopped failure
- multiFileWriteResult partial/stopped failure
- workspaceWriteResult stale-read or post-write verification failure
- workspaceCreateResult verification failure
- workspaceMoveResult verification failure
- workspaceDeleteResult verification failure

Tests should prove:

- journal projection exists on selected failure paths
- writeCapability remains "metadata-only"
- rollbackAtomicityClaim remains false
- recoveryExecuted remains false
- changedFiles are preserved
- failedFiles are preserved
- writer flags are preserved
- postWriteVerification is preserved where applicable
- stopped/success/error semantics are preserved
- recoveryCandidateFiles do not imply recoveryExecuted
- unrecoveredFiles do not imply attempted recovery

Use shared assertion helpers if that reduces repeated test code.

Minimum validation after this task:

- focused tests for touched patchResult tests only
- rtk git diff --check

### Task 5: next-route readiness decision

At the end of docs/design/journal-boundary-readiness.md, add a short decision section.

Compare these possible next routes:

1. durable journal storage prototype
2. recovery plan projection without execution
3. rollback/snapshot design only
4. 3+ mixed-write readiness audit
5. broad arbitrary apply_patch readiness audit

For each, list:

- minimum missing preconditions
- why it is or is not safe as the next route
- expected validation level

End with one recommended next route.

The recommendation should be based on the current code and the external comparison, not only on prior assumptions.

Minimum validation after this task:

- no test required if only docs changed
- rtk git diff --check

## Required preservation

Must remain unchanged:

- runtime writer behavior
- write execution order
- changedFiles semantics
- failedFiles semantics
- postWriteVerification semantics
- writer flags
- single update/create/move/delete success behavior
- exactly-two update behavior
- exactly-three update behavior
- exactly-two mixed write behavior
- unsupported/no-write behavior
- result contract semantics
- package scripts
- provider/session/CLI/MCP behavior
- durable persistence absence
- rollback/recovery/snapshot absence

## Success criteria

Route is complete if:

- bounded external comparison is documented
- current metadata-only boundary is documented
- metadata-only invariants are centralized or clearly justified as already centralized
- cross-consumer tests prove key no-recovery/no-rollback facts
- existing result fields are preserved
- no runtime writer behavior changes
- no durable storage is added
- no rollback/recovery/snapshot is added
- no new write capability is added
- next route recommendation is documented
- result-contract passes
- package build passes
- residue is cleaned
- no commit or push

## Stop conditions

Stop and report if:

- external comparison reveals a strong reason to change route direction
- boundary hardening requires writer behavior changes
- tests require changing existing result semantics
- durable storage becomes necessary
- recovery execution becomes necessary
- rollback/snapshot becomes necessary
- implementation requires SessionManager.ts, cli.tsx, package scripts, or default gate changes

## Final report

Report:

1. Route
2. External repos scanned and file-count summary
3. Useful external patterns found
4. Boundary document added/updated
5. Boundary helper added/evolved or why not needed
6. Consumers covered by tests
7. Files changed
8. Forbidden files touched? yes/no
9. Runtime writer behavior changed? yes/no
10. Durable persistence added? yes/no
11. Rollback/recovery/snapshot still absent? yes/no
12. Metadata-only facts preserved
13. Focused validation
14. Final validation
15. Residue cleanup
16. Residual risks
17. Next recommended route
18. Proposed commit message

Do not commit or push.

# Route 11: exactly-three existing-file Update File planning/no-write

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Implement the smallest deterministic, non-default exactly-three existing-file Update File planning/no-write surface.

Route 10 recommended this as the next bounded surface, with strict no-write constraints.

Route 11 may recognize that a request or candidate patch intends to update exactly three existing files, and may return a structured planning/stopped result. It must not write files.

The desired result is:

- terminal outcome: stopped, not success
- no file writes
- no writer invocation
- no creator invocation
- no delete/move operation
- changedFiles=[]
- writeIntents=[]
- plannedFiles may list the three files if an existing result shape supports it safely
- failure/classification explains that exactly-three writes are not supported
- user-facing result explains this is planning/no-write only
- workspace snapshot unchanged

## Current context

Routes 01-10 established:

- bounded candidate mutation evidence
- opt-in real happy path evidence for single update/create/two-file update
- failure taxonomy
- deterministic CLI two-file evidence
- unsupported patch E2E verifier
- MCP taxonomy
- compact/session extraction
- release claims audit
- Route 10 evaluation recommending exactly-three planning/no-write only

Route 11 must not reinterpret this as 3-file write readiness.

## Non-goals

Do not add:

- 3-file write support
- 3+ mutation support
- broad apply_patch support
- delete/move support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external/user-configured MCP readiness
- real-provider default gate
- broad/general release readiness

Do not change user-facing claims to say 3-file mutation is supported.

Do not make exactly-three planning/no-write part of default release gates unless a later route explicitly decides that.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This route must preserve the no-write invariant.
- Do not weaken existing unsupported guards.
- Do not change default gate membership.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 11 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

If real-provider execution appears necessary, stop and report. Do not run it by default.

## Preflight state check

Before coding, verify that Routes 01-10 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -28
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:release:deterministic

If Route 10 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 11.

## Reference comparison before coding

Before making changes, perform a narrow read-only comparison against the two reference repositories.

Reference repositories, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume specific file paths exist.
Do not copy architecture wholesale.
Do not perform a broad audit.
Do not modify either reference repository.

Use rtk for searching and reading.

### Claude Code comparison

Search /home/wang/projects/source-claudecode using keywords related to:

- plan mode
- edit plan
- file edit
- multi file edit
- no write
- dry run
- unsupported edit
- failed edit
- read first
- changed files
- failed files
- tool result
- user-visible error

Focus only on how planning or unsupported edit surfaces are separated from writing.

Read at most 3-5 relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- plan
- multiedit
- apply_patch
- dry run
- no write
- unsupported patch
- patch parse
- changed files
- failed files
- snapshot
- revert
- permission

Focus only on how multi-file patch planning, permission, failure, or no-write/dry-run boundaries are represented.

Read at most 3-5 relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to exactly-three planning/no-write
- ideas not applicable
- confirmation that no reference architecture was copied wholesale

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/design/three-file-planning-no-write-evaluation.md
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-release-deterministic.mjs
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

## Allowed modification scope

Prefer the narrowest possible implementation.

Allowed:

- existing planning/projection files if present
- files near multi-file update planning if present
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- scripts/verify-real-user-capabilities.mjs
- a new non-default verifier script if necessary
- package.json only to add a clearly named non-default verification script
- docs only to keep claims accurate

If the repo has an existing `multiFileUpdatePlanning.ts` or equivalent, prefer that area.

Allowed behavior:

- recognize exactly-three existing-file Update File intent
- return stopped/no-write planning result
- surface planned file names if an existing result schema supports it
- keep changedFiles empty
- keep writeIntents empty
- classify as unsupported or planning-no-write using existing terminology if available
- ensure writer is unreachable

## Conditional allowed scope

Only if strictly necessary for result surface correctness, a narrow change may be made in:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts

If touching these files, explain why projection-level planning/no-write was insufficient.

Do not use this to enable 3-file writes.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If completing this route requires touching forbidden files, stop and report.

## No-write invariant

Route 11 must prove:

- terminal outcome is stopped, not success
- no writer invoked
- no creator invoked
- no delete/move invoked
- no patch applied
- changedFiles=[]
- writeIntents=[]
- workspace snapshot unchanged
- no rollback/atomicity claim
- result clearly says exactly-three writes are unsupported
- result is user-understandable and preserved by existing result surface

If any file changes during a three-file planning/no-write scenario, the route fails.

## Required scenarios

At minimum, cover:

1. exactly-three existing-file Update File intent
   - stopped/no-write
   - planned files visible if supported
   - changedFiles=[]
   - writer unreachable
   - workspace unchanged

2. exactly-two existing-file Update File remains supported
   - existing Route 03 two-file CLI evidence still passes
   - no wording drift that makes exactly-two look unsupported

3. four-file or 3+ request remains unsupported
   - stopped/error
   - no writes
   - not success

4. delete/move remains unsupported
   - no delete/move
   - not success

5. malformed patch-like output remains stopped/error
   - not success

6. supported single-file update/create and exactly-two update remain green through existing candidate suite

## Verification strategy

Prefer deterministic tests and non-default verifier.

A good verifier name would be:

- verify:real-user-capabilities:three-file-planning-no-write

The verifier must be non-default and must not join release deterministic or release core by default in this route.

It should report:

- scenario name
- outcome
- classification
- plannedFiles, if available
- changedFiles
- failedFiles
- writerInvoked
- creatorInvoked
- deleteMoveInvoked
- workspaceUnchanged
- successLike=false
- no rollback/atomicity claim

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- run any new Route 11 three-file planning/no-write verifier
- run any focused tests added
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Documentation requirements

If docs are updated, allowed wording is:

- exactly-three existing-file Update File planning/no-write has deterministic evidence
- exactly-three write remains unsupported
- 3+ mutation readiness is not claimed
- broad apply_patch remains unsupported
- delete/move remains unsupported
- rollback/atomicity remains unsupported
- this is not broad/general release readiness

Forbidden wording:

- 3-file writes supported
- 3+ mutation ready
- broad apply_patch ready
- arbitrary mutation ready
- rollback ready
- broad release ready

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary planning workspaces
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 11 is complete only if:

- exactly-three existing-file Update File planning/no-write has deterministic evidence
- no file writes occur in the three-file planning/no-write scenario
- writer is unreachable in the three-file planning/no-write scenario
- terminal outcome is stopped, not success
- changedFiles=[]
- writeIntents=[]
- workspace unchanged
- exactly-two supported path remains green
- 3+ / delete / move / malformed unsupported paths remain stopped/error
- no mutation write capability was added
- no broad apply_patch was added
- no default gates changed
- no real-provider default dependency was added
- all required validation passes
- no forbidden product files were modified
- no secret or provider config is printed

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01-10 baseline is missing
- completing this route requires changing cli.tsx, SessionManager.ts, runMvpIntegratedFlow.ts, patchMutationLane.ts, or patchApplication/*
- completing this route requires adding 3-file writes
- completing this route requires broad apply_patch
- completing this route requires delete/move/rollback
- completing this route requires changing default gates
- completing this route requires real-provider execution
- no safe projection/planning seam exists
- the only way to pass is to mislabel write support as planning/no-write

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Planning/no-write seam chosen
5. Files changed
6. Forbidden files touched? yes/no
7. Capability expanded? yes/no
8. 3-file write implemented? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. Secret exposure risk? yes/no
12. Three-file planning/no-write evidence
13. No-write invariant evidence
14. Exactly-two regression evidence
15. 3+ / delete / move / malformed unsupported evidence
16. Validation commands and results
17. Residue cleanup status
18. Claim/readiness changes
19. Residual risks
20. Recommended next route
21. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

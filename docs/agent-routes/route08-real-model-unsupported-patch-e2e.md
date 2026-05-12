# Route 08: real-model unsupported patch E2E evidence

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Add or validate end-to-end evidence that unsupported mutation output from a real model path, or a real-model-output-equivalent path, is surfaced as stopped/error and never reported as success.

Routes 01-07 established:

- Route 01: opt-in real candidate mutation happy path passed.
- Route 02: deterministic candidate mutation failure taxonomy exists.
- Route 03: deterministic CLI/user-entry two-file evidence exists.
- Route 04: mutation routing projection extracted.
- Route 05: compact continuity summary builder extracted.
- Route 06: MCP error taxonomy improved without claiming external MCP readiness.
- Route 07: live TTY manual checklist created, manual-only and not a default gate.

Route 08 focuses on unsupported mutation result surface.

The goal is not to support unsupported patch forms. The goal is to prove they fail safely and visibly.

## Target unsupported cases

At minimum, Route 08 should cover or explicitly justify why it cannot cover:

- 3+ file update request
- delete file request
- move/rename file request
- broad apply_patch request
- malformed or unparseable patch-like model output
- mixed supported + unsupported patch, if the existing harness can express it safely

Each covered case must produce:

- outcome: stopped or error, not success
- no unsupported writes
- changedFiles empty or limited to verified supported writes only
- failedFiles or failure reason visible when applicable
- classification such as unsupported, model-output, route, or post-write
- terminal/user-facing evidence that the operation did not succeed
- no rollback or atomicity claim unless the product actually provides it

## Non-goals

Do not add:

- broad apply_patch support
- 3+ file mutation support
- delete/move support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external/user-configured MCP readiness
- default real-provider release gate membership
- broad/general release readiness

Do not make unsupported mutation succeed.

Do not weaken existing stopped/error behavior to make a test pass.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not weaken existing deterministic, candidate, CLI evidence, session, MCP, provider-readiness, result-contract, or release gates.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.
- Do not claim unsupported mutation support.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

A real provider may be used only through explicit opt-in commands.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

If real-provider execution would require inspecting private config, stop and classify as config/environment blocked.

If real-provider execution is used, it must:

- remain explicit opt-in
- not be added to default gates
- use selected temporary workspace fixtures
- clean residue
- report realProviderTouched=true/false
- report whether model execution actually occurred
- not print secret-bearing diagnostics

## Preflight state check

Before coding, verify that Routes 01-07 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -16
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:release:deterministic

If Route 07 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 08.

## Reference comparison before coding

Before making project changes, perform a narrow read-only comparison against the two reference repositories.

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

- unsupported edit
- malformed edit
- file edit failure
- failed tool result
- tool result missing
- patch parse
- stale edit
- delete file
- move file
- user-visible error
- changed files
- failed files
- result surface

Focus only on how unsupported or malformed edit/tool results are surfaced to users and preserved in loop/session context.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- apply_patch failure
- patch parse
- patch apply
- unsupported patch
- delete
- move
- edit failure
- multiedit failure
- tool error
- output metadata
- user-visible error
- changed files
- failed files

Focus only on how patch/edit failures are classified, surfaced, and prevented from becoming success.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to Route 08 unsupported patch E2E evidence
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with search terms used.

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-release-deterministic.mjs
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.test.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileCreateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts

## Allowed modification scope

Prefer the narrowest possible changes.

Allowed:

- scripts/verify-real-user-capabilities.mjs
- existing real-user-capabilities verification helpers or fixtures
- a new narrowly scoped verifier script for unsupported patch E2E evidence
- package.json only to add a clearly named non-default verification script
- focused tests for unsupported patch result surface
- docs only if existing claims become inaccurate

A new script is acceptable only if it:

- is non-default
- does not join release deterministic or release core gates
- uses temporary selected-workspace fixtures
- does not add mutation capability
- reports changedFiles, failedFiles, outcome, classification, and postWriteVerification when applicable
- distinguishes deterministic evidence from opt-in real-provider evidence

## Conditional allowed scope

Only if strictly necessary for result surface correctness, a narrow change may be made in:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts

If touching these files, explain why verifier-level evidence was insufficient.

Do not use this permission to expand mutation behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If completing Route 08 requires touching these files, stop and report.

## Evidence strategy

Prefer a layered approach:

1. Deterministic E2E unsupported-output fixture:
   - simulate or route a real-model-output-like unsupported patch through the same result surface used by candidate mutation
   - verify stopped/error, not success
   - verify no unsupported writes
   - verify visible changedFiles/failedFiles/failure reason

2. CLI/user-entry evidence if feasible:
   - use the existing non-default CLI evidence path or a narrow new non-default command
   - verify unsupported request is stopped/no-write from user-facing path

3. Optional opt-in real-provider unsupported smoke:
   - only if the repo has a safe way to request a real model unsupported mutation without reading private config
   - must remain non-default
   - must not require model determinism for route completion
   - if the model refuses or emits supported output instead of unsupported output, classify honestly and do not force capability expansion

Route 08 can complete with deterministic real-model-output-equivalent E2E evidence plus a clearly documented optional real-provider limitation, if true real-provider unsupported output cannot be reliably induced without brittle prompting.

However, if a safe opt-in real-provider unsupported smoke is added and run successfully, report it separately from deterministic evidence.

## Required Route 08 scenarios

At minimum, implement or verify deterministic E2E evidence for:

1. 3+ file update request:
   - outcome stopped/error
   - no writer invocation or no unsupported writes
   - classification unsupported or route
   - not success

2. delete file request:
   - outcome stopped/error
   - no delete performed
   - classification unsupported
   - not success

3. malformed patch-like model output:
   - outcome stopped/error
   - classification model-output or unsupported
   - not success

4. post-write mismatch remains stopped:
   - use existing Route 02 evidence if appropriate
   - must not successify

5. existing supported paths remain green:
   - candidate mutation suite
   - two-file CLI evidence
   - release deterministic

Optional if feasible:

6. move/rename request:
   - stopped/error
   - no move performed
   - classification unsupported

7. broad apply_patch request:
   - stopped/error
   - no broad application
   - classification unsupported

8. opt-in real-provider unsupported request:
   - if run, report whether model execution occurred and what output class occurred

## Result surface requirements

For each covered scenario, final evidence must include:

- scenario name
- command used
- mode: deterministic / CLI / opt-in real-provider
- whether model execution was real or simulated
- whether workspace writer was invoked
- terminal outcome: success / stopped / error
- classification
- changedFiles
- failedFiles
- postWriteVerification when applicable
- whether any unsupported write occurred
- whether any rollback/atomicity claim appeared
- whether a user can understand why it did not succeed

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
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

- run any new Route 08 unsupported patch E2E verifier
- run any focused Route 08 tests added
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
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

Optional opt-in real-provider unsupported check:

Only if safe and explicitly supported by the repo, run the new opt-in real-provider unsupported smoke or an existing equivalent command.

Do not add it to default release gates.

If the repo is dirty due to Route 08 changes and the real smoke requires clean tree, defer the opt-in real-provider unsupported smoke until after commit, and say so in the final report.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary unsupported-patch workspaces
- temporary CLI workspaces
- temporary real-provider logs
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 08 is complete only if:

- unsupported patch E2E evidence is stronger than Route 02/03 baseline
- 3+ file update request is stopped/error and not success
- delete request is stopped/error and not success
- malformed patch-like model output is stopped/error and not success
- post-write mismatch remains stopped/error and not success
- supported candidate mutation paths remain green
- two-file CLI evidence remains green
- session durability long remains green
- MCP local/error taxonomy remains green
- result contract remains green
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- build passes
- deterministic release gate still passes
- no mutation capability was added
- no unsupported write was performed
- no default gate requires real provider
- no forbidden files were modified
- no secret or provider config is printed
- final report states whether real provider was touched and whether true real model unsupported output was observed

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01/02/03/04/05/06/07 baseline is missing
- completing this route requires changing cli.tsx, SessionManager.ts, or runMvpIntegratedFlow.ts
- completing this route requires broad apply_patch, 3+ files, delete/move, rollback, or atomicity
- completing this route requires weakening unsupported guards
- completing this route requires reading private provider config
- deterministic release gate breaks for reasons unrelated to this route
- true real-provider unsupported output cannot be induced safely and the deterministic equivalent already covers the surface
- the only way to pass is to mislabel deterministic evidence as real-provider evidence

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Evidence strategy used
5. Files changed
6. Forbidden files touched? yes/no
7. Capability expanded? yes/no
8. Unsupported writes performed? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. True real model unsupported output observed? yes/no
12. Secret exposure risk? yes/no
13. Covered unsupported scenarios
14. Scenario classification table
15. Success vs stopped/error evidence
16. changedFiles / failedFiles evidence
17. postWriteVerification evidence
18. User-visible explanation evidence
19. Validation commands and results
20. Residue cleanup status
21. Claim/readiness changes
22. Residual risks
23. Recommended next route
24. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

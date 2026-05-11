# Route 04: mutation routing projection extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Extract the smallest useful mutation-routing projection/wiring logic from `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` without changing runtime behavior or expanding mutation capability.

Routes 01-03 established evidence for the bounded selected-workspace candidate mutation surface:

- Route 01: opt-in real candidate mutation happy path passed for selected-workspace single-file update, single-file create, and exactly-two-file update.
- Route 02: deterministic failure taxonomy guards unsupported, malformed, route, post-write, product-regression, and unknown surfaces.
- Route 03: deterministic CLI/user-entry evidence exists for exactly-two-file selected-workspace candidate mutation.

Route 04 should use that safety net to reduce the risk inside `runMvpIntegratedFlow.ts` by extracting a narrow, testable routing projection/helper.

This route must preserve behavior.

## Non-goals

Do not add new product capability.

Specifically, do not add:

- broad apply_patch support
- 3+ file mutation support
- delete/move support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external/user-configured MCP readiness
- default real-provider release gate membership
- broad/general release readiness

Do not rewrite the query loop.
Do not rewrite provider calling.
Do not rewrite session persistence.
Do not rewrite tool execution.
Do not rewrite CLI entry behavior.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This is a behavior-preserving extraction.
- Do not weaken existing deterministic, candidate, CLI evidence, provider-readiness, result-contract, or release gates.
- Do not silently convert unsupported mutation into success.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

A real provider may be used only through explicit opt-in commands.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, or private config contents.

Route 04 should not require real-provider execution. Real-provider checks are optional post-change regression only.

## Preflight state check

Before coding, verify that Routes 01-03 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -8
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:release:deterministic

If Route 03's CLI evidence script is missing, inspect package.json and scripts/verify-real-user-capabilities.mjs to determine whether Route 03 was committed under a different name. Do not guess success.

If Routes 01-03 are missing or the baseline gates fail for unrelated reasons, stop and report instead of starting extraction.

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

- query loop
- orchestration
- route tool result
- file edit routing
- mutation routing
- tool result projection
- edit result projection
- failed edit routing
- session result
- compact result

Focus only on how routing decisions or result projections are separated from the main query/orchestration loop.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- tool execution
- apply_patch routing
- edit routing
- patch result
- tool result metadata
- output projection
- result surface
- failure classification
- session output

Focus only on how patch/edit result metadata is separated from execution flow or user-visible output.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to this route
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
- scripts/verify-release-core.mjs
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileCreateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

## Allowed modification scope

This route intentionally allows a narrow edit to `runMvpIntegratedFlow.ts`.

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
  - only to replace inline mutation routing/projection logic with a call to a new helper
  - no behavior rewrite
  - no provider/query/session/tool execution rewrite
- a new narrowly scoped helper/module under:
  - packages/ts-shell/src/orchestration/
- focused tests for the new helper/projection
- existing test fixture updates only if required by behavior-preserving extraction
- package.json only if adding a narrow non-default verification script is truly necessary
- documentation only if claims become inaccurate

Recommended helper shape:

- pure or mostly pure helper
- accepts explicit inputs
- returns explicit routing/projection result
- no filesystem writes
- no provider calls
- no session persistence
- no CLI side effects
- no mutation capability expansion

Possible helper names include, but are not limited to:

- mutationRoutingProjection.ts
- candidateMutationRoutingProjection.ts
- mutationRouteProjection.ts

Choose the smallest name that matches the actual extracted responsibility.

## Conditional allowed scope

Only if strictly necessary for type boundaries or tests, a narrow change may be made in:

- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

If touching any conditional file, explain why the extraction could not stay inside `runMvpIntegratedFlow.ts` plus the new helper.

Do not use this permission to alter product behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

Do not expand the selected-workspace mutation envelope.

## Extraction target

Look inside `runMvpIntegratedFlow.ts` for the smallest mutation-routing or mutation-result projection region that:

- is currently inline
- mixes decision/projection with surrounding orchestration
- can be extracted without changing behavior
- can be unit/focused tested
- is relevant to selected-workspace candidate mutation routing/result surface

Good candidates may include logic that decides or projects:

- whether mutation routing is eligible
- what mutation route/result metadata should be surfaced
- how unsupported or stopped mutation results are represented
- how changedFiles / failedFiles / postWriteVerification are passed forward
- how candidate mutation route evidence is normalized

Bad candidates for this route:

- provider call flow
- query loop control flow
- session persistence
- approval lifecycle
- MCP execution
- CLI parsing
- mutation application implementation
- adding new mutation lanes

If no safe extraction candidate exists, stop and report rather than forcing a refactor.

## Behavior preservation requirements

Before and after the extraction, these behaviors must remain equivalent:

- selected-workspace single-file update candidate
- selected-workspace single-file create candidate
- selected-workspace exactly-two-file update candidate
- unsupported 3+ file request remains stopped/no-write
- unsupported delete/move remains stopped/no-write
- post-write verification failure remains stopped
- candidate mutation failure taxonomy remains intact
- CLI two-file evidence remains intact
- deterministic release gate remains green

Do not change user-visible wording unless the new helper requires a harmless, justified normalization. If wording changes, document it explicitly.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Also run any focused tests added for the new helper.

Optional opt-in real regression:

Only after the repo is clean or after an approved commit, and only if explicitly safe, run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real

Do not add this to default gates.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
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

Route 04 is complete only if:

- a narrow mutation-routing/projection helper was extracted, or a clear evidence-based stop report explains why no safe extraction exists
- `runMvpIntegratedFlow.ts` no longer owns that exact inline routing/projection detail directly
- behavior is preserved
- no mutation capability was added
- no default gate requires real-provider access
- candidate mutation suite still passes
- Route 02 taxonomy self-test still passes
- Route 03 CLI evidence gate still passes
- MVP suite still passes
- result contract still passes
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- build passes
- deterministic release gate still passes
- no forbidden files were modified
- no secret or provider config is printed
- final report states whether real provider was touched

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01/02/03 baseline is missing
- completing this route requires changing cli.tsx or SessionManager.ts
- completing this route requires provider/query/session/tool/MCP rewrite
- completing this route requires broad apply_patch, 3+ files, delete/move, rollback, or atomicity
- no extractable mutation-routing/projection seam exists
- deterministic release gate breaks for reasons unrelated to this route
- the only way to pass is to weaken existing guards or claims

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Extraction seam chosen
5. Files changed
6. Forbidden files touched? yes/no
7. Capability expanded? yes/no
8. Default gates changed? yes/no
9. Real provider touched? yes/no
10. Secret exposure risk? yes/no
11. Behavior preserved? yes/no, with evidence
12. New helper/module and responsibility
13. Focused tests added or reused
14. Validation commands and results
15. Residue cleanup status
16. Claim/readiness changes
17. Residual risks
18. Recommended next route
19. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

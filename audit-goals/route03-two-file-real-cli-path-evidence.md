# Route 03: two-file candidate mutation real CLI path evidence

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Add or validate minimal real CLI-path evidence for the existing exactly-two-file selected-workspace candidate mutation route, without adding new mutation capability.

Route 01 proved clean-tree opt-in real candidate mutation happy paths through the verification harness.
Route 02 stabilized deterministic failure taxonomy and confirmed clean-tree real regression still passes.

Route 03 must prove that the bounded exactly-two-file candidate mutation route can be exercised through a real user-facing CLI entry path, not only through verification harness internals.

The target path is:

User input / CLI
→ session/runtime
→ provider readiness
→ selected-workspace two-file candidate route
→ mutation execution
→ post-write verification
→ result surface
→ changedFiles / failedFiles / terminal-visible output

This route should produce minimal evidence only. It must not broaden mutation capability.

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
- default real-provider CLI gate membership
- broad/general release readiness

Do not turn this into a CLI rewrite or a runMvpIntegratedFlow refactor.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not weaken existing release, candidate, provider-readiness, result-contract, or deterministic gates.
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

The intended provider shape is:

- provider: openai-compatible
- baseUrl: https://api.siliconflow.cn/v1
- model: deepseek-ai/DeepSeek-V4-Flash

Use only the repo's existing documented opt-in real-provider mechanism.

If real-provider CLI execution would require inspecting private config, stop and classify as config/environment blocked.

## Preflight state check

Before coding, verify that Route 01 and Route 02 work is present or intentionally committed.

Run:

- rtk git status --short --branch
- rtk git log --oneline -5
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test

If the taxonomy self-test command does not exist, inspect package.json and scripts/verify-real-user-capabilities.mjs to find the correct Route 02 self-test entry. Do not guess success.

If Route 01/02 changes are missing, stop and report instead of building Route 03 on an unknown baseline.

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

- CLI print
- stdin
- query loop
- session runtime
- tool result
- file edit result
- changed files
- failed files
- terminal output
- edit summary
- two file edit
- user-visible result

Focus only on how CLI/user-facing execution surfaces file-edit results and failures.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- CLI
- TUI
- tool output
- apply_patch result
- changed files
- failed files
- permission result
- edit summary
- user-visible error
- session output

Focus only on how user-facing command/runtime paths surface edit/apply results and failures.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to Route 03 CLI result evidence
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
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- existing CLI baseline / CLI entry tests or verification scripts found in the repo

Reading a forbidden file is allowed. Modifying it is not, unless explicitly allowed below.

## Allowed modification scope

Prefer the narrowest possible changes.

Allowed:

- scripts/verify-real-user-capabilities.mjs, only if Route 03 naturally belongs there
- a new narrowly scoped verification script for opt-in CLI two-file candidate evidence
- existing CLI verification helper or fixture files
- package.json only to add a clearly named opt-in verification script, not a default release gate
- documentation only if existing claims become inaccurate
- small test fixture files under existing test/verification fixture directories

A new script is acceptable only if it:
- uses existing CLI entry points
- exercises the real user-facing CLI path as much as practical
- is opt-in for real-provider execution
- does not join default deterministic/release gates
- reports changedFiles, failedFiles, postWriteVerification, and success/stopped/error outcome

## Conditional allowed scope

Only if strictly necessary for CLI result evidence, a narrow change may be made in:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts

If touching these files, explain why script-level CLI evidence was insufficient.

Do not use this permission to rewrite product flow.

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

If completing Route 03 requires touching these files, stop and report.

## Required Route 03 evidence

Route 03 should produce evidence for an exactly-two-file selected-workspace mutation through a CLI/user entry path.

At minimum, the evidence should show:

- the command used
- whether stdin, --print, or another real CLI mode was used
- whether the selected workspace was isolated
- whether real provider execution was attempted
- whether workspace writer was invoked
- changedFiles
- failedFiles
- postWriteVerification result
- terminal-visible success/stopped/error outcome
- whether session/runtime result surface included enough information for a user to understand what happened

The preferred route is a deterministic CLI smoke if possible.

If true real-provider CLI execution is safe and already supported, it may be run as an explicit opt-in regression check.

If real-provider CLI execution is not safe or not supported, Route 03 may still complete with deterministic/synthetic CLI-path evidence plus a clear explanation of the remaining real-provider CLI gap. However, do not mislabel synthetic CLI evidence as real-provider evidence.

## Required negative guard

Route 03 must also ensure that the CLI/user-facing route does not misreport unsupported two-file-adjacent failures as success.

At minimum, cover or explain why not covered:

- unsupported 3+ file request is not reported as success
- unsupported delete/move request is not reported as success
- post-write verification failure is not reported as success

Prefer using existing Route 02 taxonomy fixtures if possible. Do not add broad capability to make these pass.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Also run the new or existing Route 03 CLI evidence command.

Optional opt-in real regression:

Only if safe and explicitly opt-in, run the real-provider candidate mutation suite:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real

If a dedicated opt-in real CLI evidence command is added, run that too.

Do not add either command to default release gates.

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

Route 03 is complete only if:

- exactly-two-file candidate mutation has minimal CLI/user-entry evidence
- the evidence clearly distinguishes deterministic/synthetic CLI evidence from opt-in real-provider evidence
- changedFiles and failedFiles are visible in the evidence
- postWriteVerification is visible in the evidence
- CLI/user-facing outcome is success/stopped/error, not ambiguous
- unsupported adjacent cases are not reported as success, or the remaining gap is explicitly documented
- candidate synthetic suite still passes
- Route 02 failure taxonomy self-test still passes
- MVP suite still passes
- result contract still passes
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- build passes
- deterministic release gate still passes
- no default gate requires real-provider access
- no forbidden core files were modified
- no broad mutation capability was added
- no secret or provider config is printed
- final report states whether real provider was actually touched

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01/02 baseline is missing
- completing this route requires changing cli.tsx, SessionManager.ts, or runMvpIntegratedFlow.ts
- completing this route requires broad apply_patch, 3+ files, delete/move, rollback, or atomicity
- real-provider CLI execution requires inspecting private config
- CLI evidence requires invasive product-flow rewrites
- deterministic release gate breaks for reasons unrelated to this route
- the only way to pass is to weaken existing guards or claims

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Files changed
5. Forbidden files touched? yes/no
6. Capability expanded? yes/no
7. Default gates changed? yes/no
8. Real provider touched? yes/no
9. Secret exposure risk? yes/no
10. CLI path evidence command
11. CLI path mode used: stdin / --print / interactive / other
12. Two-file scenario result
13. changedFiles
14. failedFiles
15. postWriteVerification
16. user-visible outcome evidence
17. Unsupported adjacent failure evidence
18. Validation commands and results
19. Residue cleanup status
20. Claim/readiness changes
21. Residual risks
22. Recommended next route
23. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

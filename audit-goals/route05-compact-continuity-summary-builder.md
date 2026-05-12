# Route 05: compact continuity summary builder extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Extract the smallest behavior-preserving compact continuity summary builder from `packages/ts-shell/src/session/SessionManager.ts`.

Routes 01-04 established a safety net around candidate mutation, failure taxonomy, CLI evidence, and mutation routing projection. Route 05 now reduces session/compact risk by extracting a narrow helper for compact continuity summary construction.

The goal is not to redesign session management. The goal is to make the compact/continuity summary construction easier to reason about and test without changing runtime behavior.

## Non-goals

Do not add or change:

- session schema
- compact trigger policy
- resume semantics
- replay semantics
- current-session selection
- project binding
- approval lifecycle
- CLI behavior
- provider behavior
- MCP behavior
- mutation capability
- release gate membership
- broad/general release readiness

Do not rewrite `SessionManager.ts`.
Do not introduce a new session architecture.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This is a behavior-preserving extraction.
- Do not weaken existing deterministic, session, mutation, CLI evidence, provider-readiness, result-contract, or release gates.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 05 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, or private config contents.

If a real-provider run is considered, it must remain explicit opt-in and must not be added to default gates.

## Preflight state check

Before coding, verify that Routes 01-04 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -10
- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationRoutingProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:release:deterministic

If Route 04 is not committed or the baseline gates fail for unrelated reasons, stop and report instead of starting Route 05.

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

- compact
- resume
- session summary
- conversation summary
- transcript
- tool result persistence
- failed result persistence
- continue session
- session continuation
- context compaction

Focus only on how compact/resume summaries preserve user-visible failure/tool/mutation context.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- session
- snapshot
- revert
- summarize
- compact
- transcript
- tool result
- failed tool
- user-visible error
- session output
- continuation

Focus only on how session state or summaries preserve tool/edit/provider failure context.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to compact continuity summary construction
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with search terms used.

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchResult/*
- scripts/verify-session-durability-long.mjs
- scripts/verify-release-core.mjs
- scripts/verify-release-deterministic.mjs

## Allowed modification scope

This route intentionally allows a narrow edit to `SessionManager.ts`.

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
  - only to replace inline compact continuity summary construction with a call to a new helper
  - no behavior rewrite
  - no session schema rewrite
  - no replay/resume/current-session/project-binding rewrite
- a new narrowly scoped helper/module under:
  - packages/ts-shell/src/session/
- focused tests for the new helper
- existing compact/continuity tests if they need minor import or expectation updates due to behavior-preserving extraction
- documentation only if claims become inaccurate

Recommended helper shape:

- pure or mostly pure helper
- accepts explicit inputs
- returns an explicit summary/projection object or string matching current behavior
- no filesystem writes
- no provider calls
- no session persistence side effects
- no CLI side effects
- no mutation capability expansion

Possible helper names include:

- compactContinuitySummary.ts
- sessionContinuitySummary.ts
- compactSummaryBuilder.ts

Choose the smallest name that matches the actual extracted responsibility.

## Conditional allowed scope

Only if strictly necessary for type boundaries or tests, a narrow change may be made in:

- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts

If touching any conditional file, explain why the extraction could not stay inside `SessionManager.ts` plus the new helper.

Do not use this permission to alter product behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

Do not change session schema, compact trigger policy, resume/replay semantics, or project binding.

## Extraction target

Look inside `SessionManager.ts` for the smallest compact continuity summary construction region that:

- is currently inline
- mixes summary construction with session management
- can be extracted without changing behavior
- can be tested with focused inputs
- preserves stopped/error/success context
- preserves mutation failure context
- preserves changedFiles / failedFiles / post-write verification context when currently present
- preserves next-turn / compact / resume continuity evidence

Good candidates may include logic that builds or projects:

- compact continuity summary text
- stopped-session continuity summary
- mutation compact continuity summary
- failure context summary
- next-turn continuation context
- tool/mutation result summary included in compact state

Bad candidates for this route:

- session file storage
- DB/history persistence
- current session selection
- replay implementation
- slash /continue implementation
- approval lifecycle
- provider call flow
- query loop
- CLI display
- mutation execution

If no safe extraction candidate exists, stop and report rather than forcing a refactor.

## Behavior preservation requirements

Before and after extraction, these behaviors must remain equivalent:

- stopped-session continuity
- mutation compact continuity
- long-session durability
- selected-workspace mutation continuity
- failed mutation context remains visible after compact/resume
- changedFiles / failedFiles context is not dropped
- partial/unsupported mutation failure is not successified
- session runtime still surfaces terminal success/stopped/error correctly
- deterministic release gate remains green

Do not change user-visible wording unless the extraction exposes a pre-existing inconsistency that can be fixed without semantic risk. If wording changes, document it explicitly.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:session-durability:long
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

- rtk npm run verify:session-durability:long
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

Optional additional tests if relevant and affordable:

- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/longSessionDurability.test.ts

Do not add real-provider checks to default gates.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary session history fixtures
- temporary compact workspaces
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 05 is complete only if:

- a narrow compact continuity summary builder/helper was extracted, or a clear evidence-based stop report explains why no safe extraction exists
- `SessionManager.ts` no longer owns that exact inline summary construction detail directly
- behavior is preserved
- no session schema changed
- no compact trigger changed
- no resume/replay semantics changed
- no mutation capability was added
- no default gate requires real-provider access
- session durability long still passes
- mutation compact/continuity evidence still passes
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

- Route 01/02/03/04 baseline is missing
- completing this route requires changing cli.tsx or runMvpIntegratedFlow.ts
- completing this route requires session architecture rewrite
- completing this route requires changing session schema, replay, resume, project binding, or compact trigger policy
- completing this route requires provider/query/tool/MCP rewrite
- no extractable compact continuity summary seam exists
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
8. Session schema changed? yes/no
9. Compact trigger changed? yes/no
10. Resume/replay semantics changed? yes/no
11. Default gates changed? yes/no
12. Real provider touched? yes/no
13. Secret exposure risk? yes/no
14. Behavior preserved? yes/no, with evidence
15. New helper/module and responsibility
16. Focused tests added or reused
17. Validation commands and results
18. Residue cleanup status
19. Claim/readiness changes
20. Residual risks
21. Recommended next route
22. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

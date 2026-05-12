# Route 02: real candidate failure taxonomy stabilization

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Stabilize and verify failure classification for the opt-in real candidate mutation path, without adding new mutation capability.

Route 01 proved that clean-tree opt-in real candidate mutation happy paths can execute through a real provider for:

- selected-workspace single-file update
- selected-workspace single-file create
- selected-workspace exactly-two-file update

Route 02 must focus on negative and failure surfaces.

The goal is to ensure that candidate mutation failures are classified clearly and are never reported as product success when they are unsupported, malformed, blocked, partially failed, or unverified.

## Non-goals

Do not expand mutation capability.

Specifically, do not add:

- broad apply_patch support
- 3+ file mutation support
- delete/move support
- rollback
- atomic multi-file recovery
- arbitrary project mutation
- external/user-configured MCP readiness
- default real-provider release gate membership

This route is about classification and result surface, not capability expansion.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not modify target repo behavior outside the allowed Route 02 surface.
- Do not silently convert unsupported mutation into success.
- Do not weaken existing synthetic, deterministic, or provider-readiness gates.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.

## Real provider constraints

A real provider may be used only through explicit opt-in real-provider commands.

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

If a real-provider run would require inspecting private config, stop and classify the issue as config/environment blocked.

## Reference comparison before coding

Before making project changes, perform a narrow read-only comparison against the two reference repositories.

Reference repositories, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume any specific file path exists.
Do not copy architecture wholesale.
Do not perform a broad audit.
Do not modify either reference repository.

Use rtk for all searching and reading.

### Claude Code comparison

Search /home/wang/projects/source-claudecode using keywords related to:

- failed tool result
- tool error
- edit failure
- provider failure
- result persistence
- query loop
- session transcript
- compact
- resume
- file edit
- stale edit
- unsupported edit
- tool result missing

Focus only on how failed tool/edit/provider results are surfaced back into the loop, transcript, compact/resume context, or user-visible state.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- tool failure
- permission denied
- apply_patch failure
- patch parse
- patch apply
- edit failure
- multiedit failure
- snapshot
- revert
- provider failure
- user-visible error
- failure classification
- output metadata

Focus only on how tool execution failures, permission failures, provider failures, and patch/apply failures are classified and surfaced.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Before coding, keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to Route 02 failure classification
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with the search terms used.

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-real-provider-readiness-smoke.mjs
- scripts/verify-release-deterministic.mjs
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/singleFileCreateApply.ts
- packages/ts-shell/src/orchestration/patchApplication/twoFileUpdateApply.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts

## Allowed modification scope

Prefer the narrowest possible changes.

Allowed:

- scripts/verify-real-user-capabilities.mjs
- existing verification helpers or fixtures used by real-user-capabilities
- narrow candidate mutation failure fixture code, if needed
- narrow focused tests for failure classification or result surface, if existing structure supports it
- documentation only if existing claims become inaccurate

If a small helper extraction inside the verification area reduces risk, it is allowed.

## Conditional allowed scope

Only if strictly necessary for classification correctness, a narrow change may be made in:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

If touching these files, explain why script-level classification was insufficient.

Do not use this permission to rewrite product flow.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- provider/auth core behavior
- MCP core behavior
- default release gate membership
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior

## Failure taxonomy

Candidate mutation failure classifications are:

- config
- network-auth
- model-output
- route
- post-write
- unsupported
- product-regression
- unknown

Route 02 should reduce ambiguous unknown classifications where possible.

Each classification should have a clear meaning:

- config: environment, repo cleanliness, missing opt-in setup, unsafe provider setup, or preflight guard
- network-auth: provider request attempted but failed due to network, auth, rate limit, or provider availability
- model-output: provider responded, but output was missing, malformed, unsupported, or not parseable as the expected candidate mutation shape
- route: model output was valid enough to interpret, but routed to the wrong mutation lane or no eligible lane
- post-write: write was attempted but verification, stale-read check, workspace boundary, changed-files check, or post-write validation failed
- unsupported: request or patch requires unsupported capability such as 3+ files, delete/move, broad apply_patch, rollback, or arbitrary project mutation
- product-regression: previously supported bounded scenario fails for a reason that indicates product code regression
- unknown: insufficient safe evidence to classify

Unknown is allowed only if the final report includes:

- scenario name
- command that produced it
- last safe non-secret evidence
- missing evidence needed to classify it later

## Required Route 02 scenarios

At minimum, Route 02 should cover or explicitly justify why it cannot cover:

1. dirty repo / preflight guard classification as config
2. dry-run real candidate behavior remains safe
3. unsupported mutation shape does not success
4. malformed or unparseable model-output-like candidate does not success
5. post-write or verification failure is not reported as success
6. existing real happy path remains green when explicitly opt-in
7. synthetic candidate suite remains green
8. deterministic release gate remains green

Prefer deterministic negative fixtures over expensive real-provider negative calls when possible.

Real provider should be used to confirm happy-path regression only when safe and explicitly opt-in.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Optional opt-in real regression check:

Only if safe and explicitly opt-in, run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real

If run, confirm whether these still pass or classify failures:

- real-selected-workspace-single-file-update
- real-selected-workspace-single-file-create
- real-selected-workspace-two-file-update

Do not add this real run to default deterministic release gates.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary real-provider logs
- temporary workspaces outside expected fixture paths
- temporary negative-test directories

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 02 is complete only if:

- failure taxonomy is clearer than Route 01
- unsupported or malformed candidate mutation cannot be reported as product success
- post-write or verification failure cannot be reported as success
- unknown classifications are reduced or justified with missing evidence
- candidate synthetic suite still passes
- MVP suite still passes
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- result contract still passes
- deterministic release gate still passes
- no default gate requires real-provider access
- no forbidden core files were modified
- no broad mutation capability was added
- no secret or provider config is printed
- final report states whether real provider was actually touched

## Stop conditions

Stop and report instead of forcing progress if:

- completing the route requires changing cli.tsx, SessionManager.ts, or runMvpIntegratedFlow.ts
- completing the route requires broad apply_patch, 3+ files, delete/move, rollback, or atomicity
- real-provider execution requires inspecting private config
- failures cannot be classified without product-direction input
- deterministic release gate breaks for reasons unrelated to this route
- a negative fixture requires invasive product-flow rewrites

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
10. Negative scenarios covered
11. Failure classifications verified
12. Unsupported success-prevention evidence
13. Post-write / verification failure evidence
14. Unknowns remaining
15. Validation commands and results
16. Residue cleanup status
17. Claim/readiness changes
18. Residual risks
19. Recommended next route
20. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

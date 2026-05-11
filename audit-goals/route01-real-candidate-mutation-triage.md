# Route 01: opt-in real candidate mutation suite triage

## Objective

Triage the opt-in real candidate mutation suite without adding new mutation capability.

The project is currently limited dogfood ready and deterministic release-candidate green, but not broad/general release ready. Candidate mutation is synthetic green; real candidate mutation remains opt-in and not trusted as a default release claim.

This route should determine whether the existing real candidate mutation path can safely classify or execute these scenarios:

- single-file update
- single-file create
- exactly-two-file update

The goal is not to make everything pass at all costs. The goal is to make real candidate behavior observable, safe, and clearly classified.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not add broad/general release readiness.
- Do not add arbitrary project mutation.
- Do not add broad apply_patch.
- Do not add 3+ file mutation.
- Do not add delete/move.
- Do not add rollback or atomicity.
- Do not convert unsupported mutation into success.
- Do not make real-provider tests part of default release gates.
- Do not claim external/user-configured MCP readiness.

## Real provider constraints

A real provider may be used only through explicit opt-in real-provider commands.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, or private config contents.

The intended provider shape is:

- provider: openai-compatible
- baseUrl: https://api.siliconflow.cn/v1
- model: deepseek-ai/DeepSeek-V4-Flash

Use only the repo's existing documented opt-in real-provider mechanism. If real-provider execution would require inspecting private config, stop and classify as config/environment blocked.

## Reference comparison before coding

Before making project changes, do a narrow read-only comparison.

Claude Code, read-only, at most 3 relevant files:

- /home/wang/projects/source-claudecode/query.ts
- /home/wang/projects/source-claudecode/QueryEngine.ts
- /home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts

Focus: how failed tool/edit/provider results are surfaced into the loop/session.

opencode, read-only, at most 3 relevant files:

- /home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts
- /home/wang/projects/opencode/packages/opencode/src/tool/tool.ts
- /home/wang/projects/opencode/packages/opencode/src/permission/permission.ts

Focus: failure classification, tool execution failure shape, apply_patch failure shape.

Do not copy architecture. Only extract small applicable lessons.

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

## Allowed modification scope

Prefer the narrowest possible change.

Allowed:

- scripts/verify-real-user-capabilities.mjs
- existing real-provider candidate mutation smoke helpers or fixtures, if any
- narrowly scoped verification helper files in the real-user-capabilities / real-provider smoke area
- documentation only if existing claims become inaccurate

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
- release scripts in a way that turns real-provider tests into default gates

## Failure taxonomy

Classify each opt-in real candidate mutation failure as one of:

- config
- network-auth
- model-output
- route
- post-write
- unsupported
- product-regression
- unknown

Unknown is allowed only if the final report includes:

- scenario name
- command that produced it
- last safe non-secret evidence
- missing evidence needed to classify it later

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

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Optional real execution:

Only run the opt-in real candidate mutation suite if the repo exposes a safe opt-in command and doing so does not require reading or printing private provider config.

If run, classify:

- single-file update
- single-file create
- exactly-two-file update

Do not add this real run to default deterministic release gates.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary real-provider logs
- temporary workspaces outside expected fixture paths

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 01 is complete only if:

- candidate mutation synthetic suite still passes
- real candidate dry-run still passes or reports a safe dry-run result
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- deterministic release gate still passes
- no default gate requires real-provider access
- no forbidden core files were modified
- no broad mutation capability was added
- no unsupported patch is reported as product success
- no secret or provider config is printed
- scenario-level real candidate triage is clearer than before
- final report states whether real provider was actually touched

## Stop conditions

Stop and report if:

- completing this route requires changing cli.tsx, SessionManager.ts, or runMvpIntegratedFlow.ts
- completing this route requires broad apply_patch, 3+ files, delete/move, rollback, or atomicity
- real-provider execution requires inspecting private config
- the existing scripts do not expose a safe opt-in path
- failures cannot be classified without product-direction input
- deterministic release gate breaks for reasons unrelated to this route

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
10. Candidate scenarios
11. Failure classifications
12. Unknowns remaining
13. Validation commands and results
14. Residue cleanup status
15. Claim/readiness changes
16. Residual risks
17. Recommended next route
18. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

# Route 17: shell result assembly extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Execute the first implementation route from `docs/design/runtime-architecture-extraction-plan.md`:

Extract shell result assembly from `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` into a focused module:

- `packages/ts-shell/src/orchestration/shellResultAssembly.ts`

This must be a behavior-preserving runtime architecture extraction.

The goal is to reduce `runMvpIntegratedFlow.ts` responsibility by moving final shell/result/session-facing assembly logic into a named module, without changing provider calls, query loop behavior, tool execution, mutation capability, session persistence, CLI behavior, or default gates.

## Current context

Route 16 produced the runtime architecture extraction plan and recommended this route as the first implementation step.

Existing runtime evidence includes:

- candidate mutation suite
- failure taxonomy self-test
- two-file CLI evidence
- unsupported patch E2E
- three-file planning/no-write
- planned-files continuity
- session durability
- MCP local execution/error taxonomy
- result contract
- deterministic release gate

Route 17 should use these gates to preserve behavior while reducing runtime coupling.

## Non-goals

Do not add or change:

- provider call behavior
- provider readiness behavior
- query loop control flow
- tool execution behavior
- MCP behavior
- mutation capability
- patch application behavior
- 3-file write support
- broad apply_patch support
- delete/move support
- rollback/atomicity
- session persistence
- compact/replay/resume semantics
- CLI behavior
- default gate membership
- readiness claims

Do not rewrite `runMvpIntegratedFlow.ts`.
Do not extract provider orchestration in this route.
Do not extract session persistence in this route.
Do not extract CLI mode dispatch in this route.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve terminal outcome semantics: success / stopped / error.
- Preserve resultMapper/sessionRuntime/sessionStateSurface expectations.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for exactly-three planning/no-write.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 17 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- classification self-test
- dry-run/listing checks

Do not run full opt-in real-provider execution unless explicitly approved.

## Required first step

Before editing, read:

- docs/design/runtime-architecture-extraction-plan.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/orchestration/patchResult/*
- package.json

If the plan does not recommend shell result assembly as the first runtime extraction, stop and report the mismatch.

## Preflight state check

Before coding, verify Route 16 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -50
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 16 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Reference comparison

Do not do another broad reference audit.

If needed, do a narrow read-only reference check for result assembly / terminal result projection only.

Reference repos:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Search terms:

- tool result
- failed tool result
- user-visible error
- changed files
- failed files
- result projection
- session output
- terminal output
- error metadata

Read at most 2 relevant snippets per repo.

Do not copy code or architecture.

## Extraction target

Look inside `runMvpIntegratedFlow.ts` for logic that assembles final shell/runtime-facing result values, such as:

- terminal outcome assembly
- success/stopped/error result shape construction
- user-visible result summary construction
- result metadata projection before returning to shell/session runtime
- changedFiles / failedFiles / plannedFiles forwarding
- mutation/tool/provider result final normalization
- DoNext / next-action projection if it is tightly coupled to shell result assembly
- handoff shape passed to resultMapper/sessionRuntime/sessionStateSurface

The new module should own only assembly/projection of result shapes.

It must not own:

- provider calls
- provider readiness
- tool execution
- MCP execution
- mutation execution
- patch application
- session persistence
- CLI behavior
- compact/replay
- permission lifecycle
- real-provider config handling

## Desired module

Create:

- `packages/ts-shell/src/orchestration/shellResultAssembly.ts`

Possible exported functions may include:

- `assembleShellResult`
- `assembleStoppedShellResult`
- `assembleMutationShellResult`
- `buildShellResultMetadata`
- `projectShellOutcome`

Choose names based on actual seam found.

The module should be pure or mostly pure.

Preferred properties:

- explicit inputs
- explicit outputs
- no filesystem writes
- no provider calls
- no session persistence
- no CLI side effects
- no mutation writes
- no access to process.env
- no real-provider behavior

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
  - only to delegate shell result assembly to the new module
  - no query loop rewrite
  - no provider/tool/mutation/session behavior change
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.test.ts
- existing tests only if import paths or behavior-preserving expectations require narrow updates

Allowed test additions:

- focused tests for success/stopped/error assembly
- plannedFiles vs changedFiles preservation
- mutation stopped/no-write assembly
- failure reason forwarding
- DoNext / next action preservation if included in the seam

## Conditional allowed scope

Only if strictly necessary for type boundaries:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts

If touching these files, explain why the extraction could not stay within `runMvpIntegratedFlow.ts` plus `shellResultAssembly.ts`.

Do not use this permission to change behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership
- package.json
- scripts/*

If completing this route requires touching forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- selected-workspace single-file update
- single-file create candidate
- exactly-two update candidate
- exactly-three planning/no-write stopped result
- plannedFiles continuity
- unsupported patch E2E
- malformed patch result
- post-write stopped result
- result contract
- sessionRuntime terminal display
- deterministic release meta gate

Preserve:

- terminal outcome names
- failure reason wording unless explicitly justified
- changedFiles / failedFiles / plannedFiles fields
- no-write invariant
- realProviderTouched and candidateMutationRealExecuted reporting
- broadReleaseReady=false in deterministic release
- externalMcpServerUsed=false / userMcpConfigUsed=false
- exit codes

## Extraction quality bar

This route should be meaningful, not thin.

A successful extraction should:

- remove a coherent result assembly responsibility from `runMvpIntegratedFlow.ts`
- create a named module with clear ownership
- add focused tests or reuse strong tests with a clear focused test
- make future result/failure changes possible without editing the giant query loop
- preserve behavior through all gates

Do not move only one or two trivial helper functions.
Do not use line-count reduction as the main success metric.
Do not broaden the module into provider/tool/mutation/session orchestration.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

After changes:

- rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
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

If the focused test file is not added because no safe focused unit seam exists, explain why and rely on existing integration gates. But prefer adding the focused test.

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- candidate mutation suite
- planned-files continuity
- unsupported patch E2E
- release deterministic summary

Compare:

- outcome names unchanged
- changedFiles / failedFiles / plannedFiles unchanged
- success/stopped/error unchanged
- no new secret output
- release deterministic false claims unchanged

Do not store large logs in repo.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary comparison logs
- temporary /tmp/private-agents-test files created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 17 is complete only if:

- `shellResultAssembly.ts` exists and owns a coherent shell/result assembly responsibility
- `runMvpIntegratedFlow.ts` delegates that responsibility to the new module
- behavior is preserved
- focused test exists or a clear reason is given why integration evidence is the only safe validation
- success/stopped/error semantics are preserved
- changedFiles / failedFiles / plannedFiles semantics are preserved
- exactly-three planning/no-write remains stopped/no-write
- no provider/tool/mutation/session/CLI behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- all required validation passes
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- Route 16 baseline is missing
- extraction requires touching cli.tsx or SessionManager.ts
- extraction requires changing provider call behavior
- extraction requires changing mutation execution or patch application
- extraction requires changing session persistence
- extraction risks changing output markers or exit codes
- extraction risks changing changedFiles/failedFiles/plannedFiles semantics
- release deterministic fails for unrelated reasons
- the only safe extraction is too small to justify the route

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Plan alignment
4. Extraction seam chosen
5. Files changed
6. Forbidden files touched? yes/no
7. Product behavior changed? yes/no
8. Capability expanded? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. Secret exposure risk? yes/no
12. New module and responsibility
13. runMvpIntegratedFlow responsibility reduced
14. Focused tests added/reused
15. success/stopped/error preservation evidence
16. changedFiles/failedFiles/plannedFiles preservation evidence
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

# Route 19: runtime outcome projection extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Execute the first recommended migration from `docs/design/runtime-module-ownership-map.md`:

Extract runtime outcome projection from:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

into:

- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts

This must be a behavior-preserving runtime architecture extraction.

The goal is to migrate a complete responsibility block: normalize provider/tool/mutation/stopped/error intermediate outcomes into runtime-facing outcome data consumed by shell result assembly and session handoff.

Do not change provider calls, tool execution, mutation execution, session persistence, CLI behavior, package scripts, default gates, or capabilities.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- docs/design/runtime-architecture-extraction-plan.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- package.json

If the ownership map does not recommend `runtimeOutcomeProjection.ts` as the first migration, stop and report the mismatch.

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
- package scripts
- default gate membership
- readiness claims

Do not rewrite `runMvpIntegratedFlow.ts`.
Do not extract provider call execution in this route.
Do not extract session persistence in this route.
Do not extract CLI mode dispatch in this route.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve terminal outcome semantics: success / stopped / error.
- Preserve runtime outcome data consumed by `shellResultAssembly.ts`.
- Preserve resultMapper/sessionRuntime/sessionStateSurface expectations.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve no-write invariant for exactly-three planning/no-write.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 19 should not require full real-provider execution.

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

## Preflight state check

Before coding, verify Route 18 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -55
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 18 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `runMvpIntegratedFlow.ts`, identify logic that projects intermediate runtime outcomes into a normalized outcome shape, including some or all of:

- provider result outcome projection
- tool result outcome projection
- mutation result outcome projection
- stopped/error outcome projection
- blocker outcome projection
- next-action / DoNext outcome projection, if tightly tied to runtime outcome
- action-result seed data consumed by shell assembly or session state
- metadata needed for changedFiles / failedFiles / plannedFiles forwarding
- no-write / stopped classification projection

The new module should own projection/normalization of runtime outcomes, not execution.

The new module must not own:

- provider calls
- provider readiness checks
- tool execution
- MCP execution
- mutation execution
- patch application
- session persistence
- CLI behavior
- compact/replay
- permission lifecycle
- process.env / provider config

## Desired module

Create:

- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts

Possible exported functions may include:

- `projectRuntimeOutcome`
- `projectProviderRuntimeOutcome`
- `projectToolRuntimeOutcome`
- `projectMutationRuntimeOutcome`
- `projectStoppedRuntimeOutcome`
- `buildRuntimeActionResultSeed`

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

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
  - only to delegate runtime outcome projection to the new module
  - no query loop rewrite
  - no provider/tool/mutation/session behavior change
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.test.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
  - only if necessary to consume a cleaner projected outcome shape
- packages/ts-shell/src/orchestration/shellResultAssembly.test.ts
  - only if behavior-preserving test updates are needed

Allowed test additions:

- focused tests for success/stopped/error runtime outcome projection
- plannedFiles vs changedFiles preservation
- mutation stopped/no-write projection
- provider/readiness blocker projection
- tool failure outcome projection if covered by existing data shapes
- action result seed / session handoff data if part of the seam

## Conditional allowed scope

Only if strictly necessary for type boundaries:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts

If touching these files, explain why the extraction could not stay within `runMvpIntegratedFlow.ts`, `runtimeOutcomeProjection.ts`, and `shellResultAssembly.ts`.

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
- action-result seed semantics
- DoNext / next-action semantics if touched
- realProviderTouched and candidateMutationRealExecuted reporting
- broadReleaseReady=false in deterministic release
- externalMcpServerUsed=false / userMcpConfigUsed=false
- exit codes

## Migration quality bar

This route should migrate a complete responsibility block.

A successful migration should:

- move runtime outcome normalization/projection out of `runMvpIntegratedFlow.ts`
- make `shellResultAssembly.ts` consume a clearer projected outcome or leave it unchanged with cleaner inputs
- create focused tests for the projection module
- reduce future result/failure behavior changes inside `runMvpIntegratedFlow.ts`
- preserve behavior through all gates

Do not move only one or two trivial helper functions.
Do not move execution behavior.
Do not use line-count reduction as the main success metric.

## Validation strategy

Use local validation first, then batch/full validation.

### Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

### Batch validation

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run verify:session-durability:long

### Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

If a focused test file cannot be added because no safe focused unit seam exists, explain why and rely on integration gates. But prefer adding focused tests.

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
- action-result seed semantics unchanged
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

Route 19 is complete only if:

- `runtimeOutcomeProjection.ts` exists and owns a coherent runtime outcome projection responsibility
- `runMvpIntegratedFlow.ts` delegates that responsibility to the new module
- behavior is preserved
- focused tests exist or a clear reason is given why integration evidence is the only safe validation
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

- Route 18 baseline is missing
- extraction requires touching cli.tsx or SessionManager.ts
- extraction requires changing provider call behavior
- extraction requires changing mutation execution or patch application
- extraction requires changing session persistence
- extraction risks changing output markers or exit codes
- extraction risks changing changedFiles/failedFiles/plannedFiles semantics
- release deterministic fails for unrelated reasons
- the only safe extraction is too small to justify the route
- the projection seam is not distinguishable from already extracted shellResultAssembly responsibility

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
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
17. Action-result/session handoff preservation evidence
18. Local validation results
19. Batch validation results
20. Full validation results
21. Residue cleanup status
22. Claim/readiness changes
23. Residual risks
24. Recommended next route
25. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

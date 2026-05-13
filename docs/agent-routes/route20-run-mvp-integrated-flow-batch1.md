# Route 20: runMvpIntegratedFlow Batch 1 outcome/handoff migration

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Execute Batch 1 from the runtime module ownership map for:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Batch 1 goal:

Move remaining result/outcome/session-handoff projection responsibilities out of `runMvpIntegratedFlow.ts`, while preserving execution behavior.

This route must not stop after a single tiny helper extraction if more Batch 1 projection/handoff responsibilities can be safely migrated.

Route 17 already extracted:

- shellResultAssembly.ts

Route 19 already extracted:

- runtimeOutcomeProjection.ts

Route 20 should inspect what remains in `runMvpIntegratedFlow.ts` and migrate the remaining Batch 1 responsibilities that belong outside the main query/orchestration file.

Possible target modules include, depending on current code:

- packages/ts-shell/src/orchestration/mutationSessionHandoff.ts
- packages/ts-shell/src/orchestration/runtimeFailureProjection.ts
- packages/ts-shell/src/orchestration/doNextProjection.ts
- packages/ts-shell/src/orchestration/actionableBlockerProjection.ts
- packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts

Do not create all of these unless the responsibilities actually exist and can be safely separated.

The intended final shape after Batch 1:

- `runMvpIntegratedFlow.ts` keeps high-level control flow and execution ordering.
- Projection / handoff / result shaping logic moves into named modules.
- Execution behavior remains unchanged.

## Non-goals

Do not add or change:

- provider call behavior
- provider readiness behavior
- query loop control flow
- tool execution behavior
- MCP behavior
- mutation execution behavior
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
Do not refactor provider call execution.
Do not refactor tool execution.
Do not refactor mutation execution.
Do not refactor SessionManager.
Do not refactor CLI.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve terminal outcome semantics: success / stopped / error.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve action-result / session-handoff semantics.
- Preserve DoNext / next-action semantics.
- Preserve no-write invariant for exactly-three planning/no-write.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 20 should not require full real-provider execution.

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

- docs/design/runtime-module-ownership-map.md
- docs/design/runtime-architecture-extraction-plan.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.test.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.test.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- package.json

Then produce a short internal migration list before coding:

- Batch 1 responsibilities already migrated by Route 17/19
- Batch 1 responsibilities still inside `runMvpIntegratedFlow.ts`
- responsibilities that are too risky and should remain for later
- modules that will be created in this route
- local validation after each migration

If the ownership map does not identify Batch 1 outcome/handoff work, stop and report the mismatch.

## Preflight state check

Before coding, verify Route 19 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -60
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 19 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Batch 1 migration targets

Inspect current `runMvpIntegratedFlow.ts` and migrate all safely separable responsibilities from this list.

### A. Mutation session handoff projection

Migrate if present:

- lastActionResultSeed construction for mutation outcomes
- mutation target handoff data
- changedFiles / failedFiles / plannedFiles handoff shape
- stopped/no-write handoff metadata
- mutation failure handoff summary

Suggested module:

- packages/ts-shell/src/orchestration/mutationSessionHandoff.ts

Must not own:

- mutation execution
- patch application
- session persistence
- compact implementation

### B. Runtime failure / stopped projection

Migrate if present:

- stopped/error runtime result shaping
- failure reason projection
- product-regression / unsupported / model-output / post-write surface projection
- no-write stopped explanation projection
- safe blocker metadata projection

Suggested module:

- packages/ts-shell/src/orchestration/runtimeFailureProjection.ts

Must not own:

- provider execution
- tool execution
- mutation execution
- result rendering side effects

### C. DoNext / next-action projection

Migrate if present and safely separable:

- DoNext / next action construction
- retry/continue/user-action suggestion projection
- blocked workflow next-step summary
- terminal next-action metadata

Suggested module:

- packages/ts-shell/src/orchestration/doNextProjection.ts

Must not own:

- query loop control flow
- actual retry execution
- session resume behavior

### D. Actionable blocker projection

Migrate if not already covered by shellResultAssembly/runtimeOutcomeProjection:

- user-visible blocker classification
- blocker summary metadata
- safe diagnostic projection for blocked runs

Suggested module:

- packages/ts-shell/src/orchestration/actionableBlockerProjection.ts

Must not own:

- provider readiness checks
- provider config reading
- environment access

### E. Runtime handoff projection

If A-D overlap heavily, prefer a single coherent module:

- packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts

Use this only if it prevents tiny module sprawl.

## Important batching rule

Do not stop after extracting only one very small function if other Batch 1 migration targets are clearly safe.

However, do not force extraction when:

- a seam is indistinguishable from query loop control
- extraction would change behavior
- extraction would require touching forbidden files
- focused tests cannot reasonably cover it
- local validation fails and fixing requires behavior changes

If some Batch 1 responsibilities remain, list them explicitly with reasons.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts
- new Batch 1 modules under packages/ts-shell/src/orchestration/
- corresponding focused tests under packages/ts-shell/src/orchestration/

Allowed test additions:

- mutationSessionHandoff.test.ts
- runtimeFailureProjection.test.ts
- doNextProjection.test.ts
- actionableBlockerProjection.test.ts
- runtimeHandoffProjection.test.ts

Only add tests for modules actually created.

## Conditional allowed scope

Only if strictly necessary for type boundaries:

- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts

If touching these files, explain why the extraction could not stay within orchestration modules.

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

If completing this batch requires touching forbidden files, stop and report.

## Behavior preservation requirements

After migration, these must remain equivalent:

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
- DoNext / next-action semantics
- session handoff metadata
- realProviderTouched and candidateMutationRealExecuted reporting
- broadReleaseReady=false in deterministic release
- externalMcpServerUsed=false / userMcpConfigUsed=false
- exit codes

## Local validation after each migration

After each module migration, run the smallest relevant subset.

For mutation session handoff:

- rtk npm run test -w packages/ts-shell -- src/orchestration/mutationSessionHandoff.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

For runtime failure/stopped projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeFailureProjection.test.ts
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

For DoNext / next-action projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/doNextProjection.test.ts
- rtk npm run verify:result-contract
- rtk npm run verify:session-durability:long
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

For blocker projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/actionableBlockerProjection.test.ts
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a listed test file is not created because that module is not created, do not run that missing test.
Run equivalent focused/module tests for actual modules.

## Batch validation

After completing all safe Batch 1 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Full validation before final report

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

## Migration quality bar

A successful Batch 1 migration should:

- move multiple remaining projection/handoff responsibilities if safe
- leave `runMvpIntegratedFlow.ts` closer to high-level orchestration wiring
- avoid tiny module sprawl
- use named modules with clear ownership
- include focused tests for new modules
- preserve all behavior through local, batch, and full validation

Do not use line-count reduction as the only success metric.

## Stop conditions

Stop and report if:

- Route 19 baseline is missing
- extraction requires touching cli.tsx or SessionManager.ts
- extraction requires changing provider call behavior
- extraction requires changing tool execution
- extraction requires changing mutation execution or patch application
- extraction requires changing session persistence
- extraction risks changing output markers or exit codes
- extraction risks changing changedFiles/failedFiles/plannedFiles semantics
- extraction creates module sprawl without ownership clarity
- release deterministic fails for unrelated reasons
- all remaining Batch 1 seams are too entangled with query loop control

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

Route 20 is complete only if:

- Batch 1 migration status is explicitly reported
- at least one meaningful remaining Batch 1 responsibility is migrated, unless all are proven already migrated/unsafe
- no safe obvious Batch 1 responsibility is left unaddressed without explanation
- new module ownership is clear
- focused tests exist for created modules
- runMvpIntegratedFlow.ts delegates migrated responsibilities
- behavior is preserved
- success/stopped/error semantics are preserved
- changedFiles / failedFiles / plannedFiles semantics are preserved
- action-result/session handoff semantics are preserved
- exactly-three planning/no-write remains stopped/no-write
- no provider/tool/mutation/session/CLI behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Batch 1 migration inventory before coding
5. Migrations completed
6. Migrations intentionally left in runMvpIntegratedFlow.ts and why
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. Capability expanded? yes/no
11. Default gates changed? yes/no
12. Real provider touched? yes/no
13. Secret exposure risk? yes/no
14. New modules and responsibilities
15. runMvpIntegratedFlow responsibilities now retained
16. runMvpIntegratedFlow responsibilities now migrated
17. Focused tests added/reused
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

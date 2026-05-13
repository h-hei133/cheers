# Route 30: runMvp workflow / continuation planning migration batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue maintainability extraction from:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Route 29 extracted provider / approval / capability projection helpers. Route 30 should now migrate workflow / continuation planning seams where safe.

Target modules:

- packages/ts-shell/src/orchestration/workflowTaskPlanner.ts
- packages/ts-shell/src/orchestration/continuationPlanning.ts

Optional third module only if a clearly pure seam exists:

- packages/ts-shell/src/orchestration/workflowIntentProjection.ts

This is not a read-only audit route. Do not stop after inventory. First identify seams, then migrate every safe pure planning/projection seam in this route.

The goal is to reduce `runMvpIntegratedFlow.ts` ownership of workflow task planning, continuation diagnostics planning, and workflow intent projection while preserving query sequencing, provider calls, dispatcher calls, mutation execution, verification read/write sequencing, approval semantics, session/CLI behavior, package scripts, and default gates.

## Current context

Completed runMvp extraction modules include:

- shellResultAssembly.ts
- runtimeOutcomeProjection.ts
- runtimeHandoffProjection.ts
- toolExecutionOutcomeProjection.ts
- doNextProjection.ts
- mutationRoutingProjection.ts
- providerOutcomeProjection.ts
- approvalAuthorityProjection.ts
- capabilityBoundaryProjection.ts

Route 30 should continue the runMvp extraction series by handling workflow and continuation planning. These seams are more risky than pure result projection, so this route must distinguish pure planning/projection from execution/control flow.

## Non-goals

Do not add or change:

- query loop sequencing
- provider call execution
- provider adapter setup
- provider auth/config/network behavior
- model selection behavior
- dispatcher calls
- mutation execution
- patch application
- verification read/write sequencing
- approval authorization semantics
- session persistence
- CLI behavior
- MCP behavior
- package scripts
- default gates
- readiness claims
- 3-file writes
- broad apply_patch
- delete/move
- rollback/atomicity

Do not rewrite `runMvpIntegratedFlow.ts`.
Do not touch `SessionManager.ts`.
Do not touch `cli.tsx`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve success/stopped/error semantics.
- Preserve changedFiles / failedFiles / plannedFiles semantics.
- Preserve provider redaction.
- Preserve approval semantics.
- Preserve mutation capability limits.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 30 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Reference comparison

Do a narrow read-only comparison if useful, not a broad audit.

Reference repos, if present:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli

Search terms:

- workflow plan
- task plan
- continuation
- resume
- retry
- tool result
- model output
- query loop
- orchestrator
- planner

Read at most 2 relevant snippets per reference repo.

Use comparison only to calibrate boundaries:

- planning/projection can be separate from execution
- query loop sequencing should remain in the orchestrator
- continuation context should not change session persistence
- retry/next-step wording should not alter runtime behavior

Do not copy code or architecture.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts
- packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts
- packages/ts-shell/src/orchestration/toolExecutionOutcomeProjection.ts
- packages/ts-shell/src/orchestration/doNextProjection.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- package.json

Then locate inside `runMvpIntegratedFlow.ts`:

- workflow task planning
- workflow intent classification
- continuation diagnostics
- follow-up planning
- next-turn planning
- prior result interpretation
- stopped/error continuation shaping
- task plan construction
- target/intent projection
- any pure planning helpers still inline

This is seam inventory inside the migration task, not a separate audit artifact.

Before coding, write a short internal migration inventory in the final report later:

1. Which workflow planning responsibilities are currently inline.
2. Which continuation planning responsibilities are currently inline.
3. Which seams are pure and migrated.
4. Which seams are execution/control-flow-adjacent and retained.
5. Local validation after each migrated module.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -130
- rtk npm run test -w packages/ts-shell -- src/orchestration/providerOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/approvalAuthorityProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 29 changes are still uncommitted, proceed only if they are exactly the expected Route 29 files and do not conflict with this route. Report that Route 30 is stacked on top of Route 29 changes.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. workflowTaskPlanner.ts

Extract workflow task planning if safe.

Possible responsibilities:

- project user/runtime facts into workflow task plan
- classify workflow task intent from already-computed inputs
- normalize task plan metadata
- shape planning facts used by runMvp
- preserve existing task plan outcomes and wording

Suggested exports:

- `buildWorkflowTaskPlan`
- `projectWorkflowTaskPlan`
- `WorkflowTaskPlan`
- `WorkflowTaskPlanningInput`

The module must not:

- call provider
- dispatch tools
- execute mutation
- read/write files
- change query sequencing
- change approval semantics
- change route decisions
- change session persistence

### B. continuationPlanning.ts

Extract continuation planning if safe.

Possible responsibilities:

- project prior stopped/error/success context into continuation facts
- normalize continuation diagnostics
- build next-turn continuation hints
- preserve follow-up planning wording
- preserve plannedFiles / changedFiles / failedFiles distinctions
- preserve last-action/result handoff semantics

Suggested exports:

- `buildContinuationPlan`
- `projectContinuationDiagnostics`
- `ContinuationPlan`
- `ContinuationPlanningInput`

The module must not:

- load sessions
- persist sessions
- change /continue behavior
- change replay ordering
- call provider
- execute tools
- change query sequencing
- mutate runtime state

### C. workflowIntentProjection.ts

Create only if a distinct pure seam exists.

Possible responsibilities:

- workflow intent projection from already-parsed facts
- target/intent normalization
- pure intent labels for planning

Suggested exports:

- `projectWorkflowIntent`
- `WorkflowIntentProjection`

Do not create this module if it would be only a tiny wrapper or if intent logic is better owned by `workflowTaskPlanner.ts`.

## Important batching rule

Do not stop after only one tiny helper if both workflow and continuation seams are safely extractable.

However, do not force extraction when:

- it would change query loop control flow
- it would change provider call timing
- it would change mutation routing or execution
- it would change session/replay behavior
- it would change approval semantics
- it would require touching forbidden files
- focused tests cannot reasonably cover it

If only one module can safely move, extract it and explain why the other seam remains.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/workflowTaskPlanner.ts
- packages/ts-shell/src/orchestration/workflowTaskPlanner.test.ts
- packages/ts-shell/src/orchestration/continuationPlanning.ts
- packages/ts-shell/src/orchestration/continuationPlanning.test.ts
- packages/ts-shell/src/orchestration/workflowIntentProjection.ts
- packages/ts-shell/src/orchestration/workflowIntentProjection.test.ts
- existing orchestration projection tests only if behavior-preserving import updates are needed

Only add modules that are actually extracted.

## Conditional allowed scope

Only if strictly necessary for type exports:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

If touching these files, explain why type reuse could not stay inside orchestration modules.

Do not change behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- package.json
- scripts/*
- docs/*

If completing this route requires forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- workflow task plan results
- continuation/follow-up diagnostics
- candidate mutation synthetic suite
- candidate mutation real dry-run
- candidate mutation taxonomy self-test
- two-file CLI evidence
- unsupported patch E2E
- three-file planning/no-write
- plannedFiles continuity
- session durability
- result contract
- deterministic release meta gate

Preserve:

- terminal outcome names
- failure reason wording unless explicitly justified
- changedFiles / failedFiles / plannedFiles fields
- no-write invariant
- provider redaction
- realProviderTouched reporting
- candidateMutationRealExecuted reporting
- broadReleaseReady=false
- externalMcpServerUsed=false / userMcpConfigUsed=false
- exit codes

## Local validation after each migration

After workflow task planner migration:

- rtk npm run test -w packages/ts-shell -- src/orchestration/workflowTaskPlanner.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After continuation planning migration:

- rtk npm run test -w packages/ts-shell -- src/orchestration/continuationPlanning.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After workflow intent projection, if created:

- rtk npm run test -w packages/ts-shell -- src/orchestration/workflowIntentProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe Route 30 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeHandoffProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/toolExecutionOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/doNextProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/providerOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/approvalAuthorityProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If any listed test does not exist, inspect package.json/filesystem, report it, and run the closest equivalent.

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- candidate mutation suite
- planned-files continuity
- session durability long
- release deterministic summary

Compare:

- workflow outcomes unchanged
- continuation hints unchanged
- changedFiles / failedFiles / plannedFiles unchanged
- redaction unchanged
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

If residue cannot be cleaned, report why.

## Success criteria

Route 30 is complete only if:

- seam inventory is explicitly reported
- at least one meaningful workflow/continuation planning responsibility is migrated
- both workflow and continuation modules are migrated if safe, or deferred module is clearly justified
- `runMvpIntegratedFlow.ts` delegates migrated responsibilities
- query loop control flow is unchanged
- provider call execution is unchanged
- mutation execution is unchanged
- verification sequencing is unchanged
- approval semantics are unchanged
- no provider/session/CLI/MCP behavior changed
- no package scripts changed
- no default gates changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing query loop control flow
- extraction requires changing provider call timing
- extraction requires changing mutation route decisions
- extraction requires changing mutation execution or verification sequencing
- extraction requires changing session/replay behavior
- extraction requires changing approval semantics
- extraction requires touching SessionManager.ts or cli.tsx
- extraction requires touching package.json or scripts
- all workflow/continuation seams are too entangled with execution/control flow
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding workflow/continuation seam inventory
6. Migrations completed
7. Migrations intentionally left in runMvpIntegratedFlow.ts and why
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. Query/control flow changed? yes/no
12. Provider behavior changed? yes/no
13. Mutation/verification behavior changed? yes/no
14. Approval semantics changed? yes/no
15. Capability expanded? yes/no
16. Default gates changed? yes/no
17. Real provider touched? yes/no
18. Secret exposure risk? yes/no
19. New modules and responsibilities
20. runMvpIntegratedFlow responsibilities retained
21. runMvpIntegratedFlow responsibilities migrated
22. Focused tests added/reused
23. Workflow/continuation preservation evidence
24. plannedFiles/changedFiles preservation evidence
25. Local validation results
26. Batch validation results
27. Full validation results
28. Residue cleanup status
29. Claim/readiness changes
30. Residual risks
31. Recommended next route
32. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

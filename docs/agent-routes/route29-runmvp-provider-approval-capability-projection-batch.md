# Route 29: runMvp provider / approval / capability projection batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue maintainability extraction by returning to:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Execute a Batch 2 extraction focused on remaining pure projection/reasoning responsibilities, not execution behavior.

Target candidate modules, if safe:

- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts

This route should migrate 2-3 related modules if safe.

The goal is to reduce `runMvpIntegratedFlow.ts` ownership of provider outcome/safe diagnostics, approval authority/provenance reasoning, and capability boundary projection while preserving provider calls, provider adapter setup, auth/config handling, mutation execution, verification sequencing, CLI/session behavior, package scripts, and default gates.

Do not migrate provider call execution.
Do not change provider readiness/auth/config behavior.
Do not expand mutation capability.

## Current context

Completed runMvp extractions:

- shellResultAssembly.ts
- runtimeOutcomeProjection.ts
- runtimeHandoffProjection.ts
- toolExecutionOutcomeProjection.ts
- doNextProjection.ts

The current ownership map says `runMvpIntegratedFlow.ts` should retain:

- query/control flow sequencing
- provider calls / adapter setup
- dispatcher calls
- mutation execution / verification read-write sequencing
- high-level orchestration wiring
- dependency wiring

Remaining candidates include:

- provider outcome / safe provider diagnostic projection
- capability boundary projection

Recent reassessment also identified approval authority/provenance reasoning and workflow/continuation planning as remaining pressure areas. Route 29 may inventory workflow/continuation planning, but should only migrate it if a clearly pure projection seam exists. Otherwise defer it.

## Path convention

Route/task specs belong under:

- docs/agent-routes/

Design and ownership documents belong under:

- docs/design/

Do not create or update design docs in this route.

## Non-goals

Do not add or change:

- provider call execution
- provider adapter setup
- provider auth/config/network behavior
- real-provider opt-in behavior
- provider readiness behavior
- model selection behavior
- query loop control flow
- dispatcher calls
- mutation execution
- patch application
- verification read/write sequencing
- 3-file writes
- broad apply_patch
- delete/move
- rollback/atomicity
- session persistence
- CLI behavior
- MCP behavior
- package scripts
- default gates
- readiness claims

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
- Preserve provider readiness redaction.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 29 should not require full real-provider execution.

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

- provider error
- model output
- safe diagnostic
- tool result
- permission
- approval
- capability
- unsupported
- stopped
- workflow plan
- continuation

Read at most 2 relevant snippets per reference repo.

Use comparison only to calibrate ownership boundaries:

- provider execution should stay separate from provider outcome projection
- approval prompt/permission provenance should not change authorization
- capability boundary projection should not expand capability
- workflow planning should not be extracted if it is entangled with query control flow

Do not copy code or architecture.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts
- packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts
- packages/ts-shell/src/orchestration/toolExecutionOutcomeProjection.ts
- packages/ts-shell/src/orchestration/doNextProjection.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- package.json

Then inspect `runMvpIntegratedFlow.ts` for:

- provider outcome projection
- provider safe diagnostic formatting
- provider/model-output stopped/error surface
- redacted provider facts
- approval authority/provenance reasoning
- approval authority summary or terminal surface facts
- capability boundary / unsupported route projection
- workflow intent / continuation planning
- any pure projection helpers still inline

Produce an internal migration inventory before coding:

1. Provider outcome/safe diagnostic responsibilities currently inside `runMvpIntegratedFlow.ts`.
2. Approval authority/provenance reasoning currently inside `runMvpIntegratedFlow.ts`.
3. Capability boundary projection currently inside `runMvpIntegratedFlow.ts`.
4. Workflow/continuation planning responsibilities that are still inline.
5. Which items are pure and safe to migrate in Route 29.
6. Which items are execution/control-flow-adjacent and must remain.
7. Local validation after each migrated module.

If the ownership map does not support this direction, stop and report the mismatch.

## Preflight state check

Before coding, verify the current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -120
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. providerOutcomeProjection.ts

Extract provider outcome / safe diagnostic projection if safe.

Possible responsibilities:

- map provider/model failure evidence into safe user-visible outcome facts
- project redacted provider diagnostics
- normalize provider stopped/error facts consumed by result/session surfaces
- preserve existing provider outcome wording/markers
- keep realProviderTouched / candidateMutationRealExecuted reporting unchanged

Suggested exports:

- `projectProviderOutcome`
- `projectProviderSafeDiagnostics`
- `formatProviderOutcomeFacts`
- `ProviderOutcomeProjection`

The module must not:

- call provider
- read provider config
- read environment secrets
- choose model
- change auth/config/network classification
- change readiness behavior
- change real-provider opt-in behavior

### B. approvalAuthorityProjection.ts

Extract approval authority/provenance reasoning if safe.

Possible responsibilities:

- project approval authority facts from already-computed inputs
- format approval provenance facts for runtime/session handoff
- normalize approval authority stopped/blocked metadata
- keep authorization semantics unchanged

Suggested exports:

- `projectApprovalAuthority`
- `projectApprovalProvenance`
- `formatApprovalAuthorityFacts`

The module must not:

- decide allow/deny
- change approval policy
- mutate allow-once cache
- persist approval decisions
- call tools
- call runtime
- change authorization semantics

### C. capabilityBoundaryProjection.ts

Extract capability boundary / unsupported-route projection if safe.

Possible responsibilities:

- project unsupported capability facts
- preserve stopped/no-write classification
- preserve unsupported route / product-regression / capability boundary wording
- normalize safe capability diagnostic facts

Suggested exports:

- `projectCapabilityBoundary`
- `projectUnsupportedCapability`
- `formatCapabilityBoundaryFacts`

The module must not:

- expand capability
- change mutation lane limits
- add 3-file writes
- add broad apply_patch
- add delete/move
- change route decisions
- change taxonomy semantics

### D. workflow/continuation planning inventory only

Inspect workflow intent / continuation planning.

Do not migrate it unless a clearly pure, testable projection seam exists.

If it is entangled with query control flow, leave it in `runMvpIntegratedFlow.ts` and report why.

## Important batching rule

Do not stop after only one tiny helper if other Route 29 seams are clearly safe.

However, do not force extraction when:

- it would change provider call execution
- it would weaken redaction
- it would change approval authorization semantics
- it would expand capability
- it would change query loop control flow
- it would require touching forbidden files
- focused tests cannot cover it

If only one or two modules are safe, extract those and explicitly explain why the others were deferred.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.test.ts
- packages/ts-shell/src/orchestration/approvalAuthorityProjection.ts
- packages/ts-shell/src/orchestration/approvalAuthorityProjection.test.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.test.ts
- existing orchestration projection tests only if behavior-preserving import updates are needed

Only add modules that are actually extracted.

## Conditional allowed scope

Only if strictly necessary for type exports:

- packages/ts-shell/src/core/shell/providerReadiness.ts
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

- provider readiness default skip
- provider readiness classification self-test
- candidate mutation synthetic suite
- candidate mutation real dry-run
- provider/model-output failure classification
- unsupported patch E2E
- three-file planning/no-write
- plannedFiles continuity
- result contract
- sessionRuntime terminal display
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

After provider outcome projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/providerOutcomeProjection.test.ts
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After approval authority projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/approvalAuthorityProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After capability boundary projection:

- rtk npm run test -w packages/ts-shell -- src/orchestration/capabilityBoundaryProjection.test.ts
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe Route 29 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/orchestration/shellResultAssembly.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/runtimeHandoffProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/toolExecutionOutcomeProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/orchestration/doNextProjection.test.ts
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
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
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- provider readiness default skip
- candidate mutation dry-run
- unsupported patch E2E
- three-file planning/no-write
- release deterministic summary

Compare:

- outcome names unchanged
- changedFiles / failedFiles / plannedFiles unchanged
- redaction unchanged
- realProviderTouched unchanged
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

Route 29 is complete only if:

- migration inventory is explicitly reported
- at least one meaningful remaining runMvp projection/reasoning responsibility is migrated
- 2-3 modules are migrated if safe, or deferred modules are clearly justified
- `runMvpIntegratedFlow.ts` delegates migrated responsibilities
- provider call execution is unchanged
- provider redaction is unchanged
- approval authorization semantics are unchanged
- mutation capability is unchanged
- no provider/session/CLI/MCP behavior changed
- no package scripts changed
- no default gates changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing provider call execution
- extraction requires changing provider auth/config/network behavior
- extraction requires weakening redaction
- extraction requires changing approval allow/deny semantics
- extraction requires expanding mutation capability
- extraction requires changing query loop control flow
- extraction requires touching SessionManager.ts or cli.tsx
- extraction requires touching package.json or scripts
- all remaining seams are too entangled with execution/control flow
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding runMvp Batch 2 inventory
6. Migrations completed
7. Migrations intentionally left in runMvpIntegratedFlow.ts and why
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. Provider behavior changed? yes/no
12. Approval authorization changed? yes/no
13. Capability expanded? yes/no
14. Default gates changed? yes/no
15. Real provider touched? yes/no
16. Secret exposure risk? yes/no
17. New modules and responsibilities
18. runMvpIntegratedFlow responsibilities retained
19. runMvpIntegratedFlow responsibilities migrated
20. Focused tests added/reused
21. Provider redaction preservation evidence
22. Approval/capability preservation evidence
23. Local validation results
24. Batch validation results
25. Full validation results
26. Residue cleanup status
27. Claim/readiness changes
28. Residual risks
29. Recommended next route
30. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

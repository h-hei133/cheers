# Route 33: CLI runtime invocation / command execution bridge batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue maintainability extraction from:

- packages/ts-shell/src/entrypoints/cli.tsx

Route 24-28 extracted CLI args, mode dispatch, print/stdin runners, provider/workspace/MCP surfaces, slash registry, and approval prompt surface.

Route 33 should migrate the next safe CLI execution-adjacent seams where possible:

- packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts
- packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts
- packages/ts-shell/src/entrypoints/cliInteractiveLoopState.ts only if a clearly pure state/projection seam exists

This is not a read-only audit route. First identify seams, then migrate all safe pure wrapper/bridge/projection seams in this route.

The goal is to reduce `cli.tsx` ownership of runtime invocation packaging, command execution bridge plumbing, and pure interactive loop state projection while preserving CLI grammar, mode precedence, command semantics, runtime invocation behavior, approval behavior, provider behavior, session behavior, MCP behavior, package scripts, and default gates.

Do not change interactive/readline lifecycle behavior.
Do not change actual command execution semantics.
Do not change runtime behavior.

## Current context

Completed CLI extraction modules include:

- cliArgs.ts
- cliModeDispatch.ts
- cliPrintModeRunner.ts
- cliStdinModeRunner.ts
- providerReadinessCliSurface.ts
- slashCommandRegistry.ts
- cliWorkspaceSurface.ts
- mcpControlCliSurface.ts
- approvalPromptBridge.ts

The current ownership map says `cli.tsx` should retain:

- process bootstrap
- high-level runtime/session/provider wiring
- interactive loop and readline lifecycle
- actual command execution
- trust policy evaluation
- allow-once cache and allow-always persistence
- runtime handler wiring
- terminal lifecycle and process exit boundary

Route 33 should only move pure wrapper/bridge/state projection seams. If a seam is actual execution semantics, leave it in `cli.tsx`.

## Non-goals

Do not add or change:

- CLI grammar
- option names / aliases / defaults
- slash-command fallback semantics
- mode precedence
- print/stdin behavior
- interactive/readline behavior
- actual slash command semantics
- workspace command semantics
- MCP command semantics
- approval authorization semantics
- allow/deny behavior
- provider readiness behavior
- provider config handling
- session behavior
- runtime orchestration behavior
- mutation/tool behavior
- package scripts
- default gates
- readiness claims

Do not extract provider readiness core.
Do not extract MCP core.
Do not extract SessionManager behavior.
Do not touch runMvpIntegratedFlow.ts.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve CLI grammar and mode precedence.
- Preserve command semantics.
- Preserve runtime invocation semantics.
- Preserve approval semantics.
- Preserve provider readiness redaction.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 33 should not require full real-provider execution.

Never read, print, copy, grep, parse, modify, or summarize anything under:

- /home/wang/.private-agents-real

Allowed real-provider-related checks:

- default skip/readiness checks
- dry-run/listing checks
- classification self-test

Do not run full opt-in real-provider execution unless explicitly approved.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliArgs.ts
- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts
- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts
- packages/ts-shell/src/entrypoints/slashCommandRegistry.ts
- packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts
- packages/ts-shell/src/entrypoints/mcpControlCliSurface.ts
- packages/ts-shell/src/entrypoints/approvalPromptBridge.ts
- packages/ts-shell/src/cli-baseline.test.ts
- package.json

Then locate inside `cli.tsx`:

- runtime invocation input assembly
- runtime handler dependency packaging
- command execution bridge plumbing
- command execution result handoff
- interactive loop state facts
- readline lifecycle boundary
- prompt lifecycle wrapper
- terminal/process-exit boundary
- approval/runtime handler wiring
- any pure wrapper/projection helper still inline

This is seam inventory inside the migration task, not a separate audit artifact.

Prepare an internal inventory for the final report:

1. Runtime invocation responsibilities currently inline.
2. Command execution bridge responsibilities currently inline.
3. Interactive loop state/projection responsibilities currently inline.
4. Which seams are pure and migrated.
5. Which seams are execution/readline/process-lifecycle-adjacent and retained.
6. Local validation after each migrated module.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -160
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/providerReadinessCliSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/slashCommandRegistry.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliWorkspaceSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/mcpControlCliSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/approvalPromptBridge.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 32 changes are still uncommitted, proceed only if they are exactly expected Route 32 files and do not conflict with this route. Report that Route 33 is stacked on top of Route 32 changes.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. cliRuntimeInvocation.ts

Extract runtime invocation packaging/wrapper if safe.

Possible responsibilities:

- package runtime invocation inputs from already-computed CLI/session/provider facts
- create runtime invocation request object
- normalize runtime invocation result handoff facts
- centralize safe wrapper around existing runtime call without changing behavior

Suggested exports:

- `buildCliRuntimeInvocation`
- `runCliRuntimeInvocation`
- `CliRuntimeInvocationInput`
- `CliRuntimeInvocationResult`

The module must not:

- change runtime behavior
- change provider/session wiring semantics
- change approval semantics
- change command behavior
- call process.exit
- change output markers
- change mode precedence

### B. cliCommandExecutionBridge.ts

Extract command execution bridge plumbing if safe.

Possible responsibilities:

- bridge command metadata to existing execution branch
- project command execution inputs
- normalize command result handoff
- preserve existing command behavior and output

Suggested exports:

- `buildCliCommandExecution`
- `projectCliCommandExecution`
- `CliCommandExecutionBridge`

The module must not:

- change slash command semantics
- change workspace mutation semantics
- change MCP gateway behavior
- change approval authorization
- change session mutation semantics
- change command ordering
- call process.exit

### C. cliInteractiveLoopState.ts

Create only if a distinct pure state/projection seam exists.

Possible responsibilities:

- project interactive loop state facts
- normalize prompt lifecycle state
- build safe loop diagnostics
- represent readline state facts without owning readline lifecycle

Suggested exports:

- `projectInteractiveLoopState`
- `CliInteractiveLoopState`

The module must not:

- own readline lifecycle
- change prompt timing
- change terminal lifecycle
- change process exit
- change interactive command execution
- change event ordering

Do not create this module if it would be only a tiny wrapper or if it would require moving actual readline behavior.

## Important batching rule

Do not stop after one tiny helper if multiple safe CLI seams are extractable.

However, do not force extraction when:

- it would change command semantics
- it would change runtime invocation behavior
- it would change interactive/readline lifecycle
- it would change process-exit behavior
- it would require touching forbidden files
- focused tests cannot reasonably cover it

If only one or two modules are safe, extract those and explicitly explain why the others were deferred.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliRuntimeInvocation.ts
- packages/ts-shell/src/entrypoints/cliRuntimeInvocation.test.ts
- packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.ts
- packages/ts-shell/src/entrypoints/cliCommandExecutionBridge.test.ts
- packages/ts-shell/src/entrypoints/cliInteractiveLoopState.ts
- packages/ts-shell/src/entrypoints/cliInteractiveLoopState.test.ts
- existing CLI tests only if behavior-preserving import updates or focused coverage are needed

Only add modules that are actually extracted.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/*
- packages/ts-shell/src/session/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation behavior
- tool execution behavior
- package.json
- scripts/*
- docs/*

If completing this route requires forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- CLI grammar
- mode precedence
- slash-command fallback fix
- print/stdin behavior
- interactive behavior
- slash command behavior
- workspace command behavior
- MCP command behavior
- approval behavior
- provider readiness behavior
- runtime invocation behavior
- output markers
- exit codes
- result contract
- deterministic release meta gate

Preserve:

- no authorization semantics change
- no provider secret output
- no real-provider default execution
- broadReleaseReady=false in deterministic release

## Local validation after each migration

After runtime invocation migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliRuntimeInvocation.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After command execution bridge migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliCommandExecutionBridge.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After interactive loop state migration, if created:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliInteractiveLoopState.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe Route 33 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/providerReadinessCliSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/slashCommandRegistry.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliWorkspaceSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/mcpControlCliSurface.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/approvalPromptBridge.test.ts
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:cli-entry
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
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

Route 33 is complete only if:

- seam inventory is explicitly reported
- at least one meaningful CLI runtime/command wrapper responsibility is migrated
- 2-3 modules are migrated if safe, or deferred modules are clearly justified
- `cli.tsx` delegates migrated responsibilities
- CLI grammar is unchanged
- mode precedence is unchanged
- command semantics are unchanged
- runtime invocation behavior is unchanged
- interactive/readline behavior is unchanged
- approval semantics are unchanged
- no provider/session/orchestration/MCP behavior changed
- no package scripts changed
- no default gates changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing command semantics
- extraction requires changing runtime invocation behavior
- extraction requires changing interactive/readline lifecycle
- extraction requires changing process-exit behavior
- extraction requires changing approval semantics
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires touching package.json or scripts
- all remaining CLI seams are too entangled with execution/lifecycle
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding CLI runtime/command seam inventory
5. Migrations completed
6. Migrations intentionally left in cli.tsx and why
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. CLI grammar changed? yes/no
11. Mode precedence changed? yes/no
12. Command semantics changed? yes/no
13. Runtime invocation changed? yes/no
14. Interactive/readline behavior changed? yes/no
15. Approval semantics changed? yes/no
16. Capability expanded? yes/no
17. Default gates changed? yes/no
18. Real provider touched? yes/no
19. Secret exposure risk? yes/no
20. New modules and responsibilities
21. cli.tsx responsibilities retained
22. cli.tsx responsibilities migrated
23. Focused tests added/reused
24. Runtime/command preservation evidence
25. CLI baseline preservation evidence
26. Local validation results
27. Batch validation results
28. Full validation results
29. Residue cleanup status
30. Claim/readiness changes
31. Residual risks
32. Recommended next route
33. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

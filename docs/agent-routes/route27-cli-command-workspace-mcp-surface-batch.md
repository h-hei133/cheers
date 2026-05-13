# Route 27: CLI command / workspace / MCP surface batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the CLI ownership batch by extracting command / workspace / MCP surface responsibilities from:

- packages/ts-shell/src/entrypoints/cli.tsx

into focused entrypoint modules, if safe:

- packages/ts-shell/src/entrypoints/slashCommandRegistry.ts
- packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts
- packages/ts-shell/src/entrypoints/mcpControlCliSurface.ts

This route should migrate 2-3 related CLI surface modules in one task.

The goal is to reduce `cli.tsx` ownership of command metadata, command lookup, workspace/status output shaping, and MCP control-plane display shaping, while preserving CLI grammar, interactive loop behavior, slash command behavior, workspace behavior, MCP behavior, approval behavior, provider readiness behavior, runtime invocation, package scripts, and default gates.

## Current context

Recent CLI work completed or expected:

- `cliArgs.ts`
- CLI slash-command positional fallback fix
- `cliModeDispatch.ts`
- `cliPrintModeRunner.ts`
- `cliStdinModeRunner.ts`
- `providerReadinessCliSurface.ts`

The runtime ownership map says CLI extraction should move `cli.tsx` toward bootstrap, mode dispatch, and wiring, while command/slash/approval/provider-readiness display should not continue accumulating in the entrypoint.

This route continues that direction, but it must not extract interactive/TUI control flow or approval authorization behavior.

## Path convention

Route/task specs belong under:

- docs/agent-routes/

Design and ownership documents belong under:

- docs/design/

Do not create or update design docs in this route.

## Non-goals

Do not add or change:

- CLI grammar
- option names
- aliases
- defaults
- slash-command fallback semantics
- mode precedence
- print/stdin/interactive behavior
- slash command execution semantics
- workspace attach/status semantics
- MCP execution semantics
- MCP server behavior
- approval prompt behavior
- approval authorization behavior
- provider readiness behavior
- session selection behavior
- runtime invocation behavior
- provider config or credential handling
- tool/MCP core behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not extract:

- interactive/TUI loop
- approvalPromptBridge
- provider readiness core
- MCP core
- runtime orchestration
- session management

Do not touch `runMvpIntegratedFlow.ts` or `SessionManager.ts`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve CLI grammar.
- Preserve mode precedence.
- Preserve slash-command fallback fix.
- Preserve exit codes.
- Preserve provider readiness redaction.
- Preserve MCP local/error taxonomy behavior.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 27 should not require full real-provider execution.

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

Do a very narrow read-only comparison if useful, not a broad audit.

Reference repos, if present:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli

Search terms:

- slash command
- command registry
- workspace status
- MCP command
- mcp
- cli command
- command output
- session output

Read at most 2 relevant snippets per reference repo.

Use the comparison only to calibrate ownership boundaries:

- command metadata / registry can move out of the entrypoint
- actual interactive execution should remain stable
- MCP control-plane rendering can be separated from MCP core
- workspace/status display can be separated from workspace semantics

Do not copy code or architecture.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliArgs.ts
- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts
- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts, if present
- packages/ts-shell/src/cli-baseline.test.ts
- packages/ts-shell/src/core/mcp/*
- package.json

Then inspect `cli.tsx` for:

- slash command metadata / command list
- slash command lookup / classification
- command help text
- workspace attach/status display
- workspace status rendering
- MCP status/list/add/remove/control display
- MCP command output formatting
- interactive command execution branches
- approval-related command branches
- terminal rendering helpers shared by command surfaces

Produce an internal migration inventory before coding:

1. Current command/workspace/MCP surface responsibilities inside `cli.tsx`.
2. Which command metadata / lookup logic is pure and safe for `slashCommandRegistry.ts`.
3. Which workspace/status display logic is pure and safe for `cliWorkspaceSurface.ts`.
4. Which MCP control-plane display logic is pure and safe for `mcpControlCliSurface.ts`.
5. Which command execution or interactive loop logic must stay in `cli.tsx`.
6. Local validation after each module migration.

If the ownership map does not support this CLI surface batch direction, stop and report the mismatch.

## Preflight state check

Before coding, verify current CLI batch baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -100
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

If there are uncommitted Route 26 changes, proceed only if they are exactly the expected Route 26 CLI provider-readiness surface files and do not conflict with this route. Report that the route is stacked on top of Route 26 changes.

## Batch migration targets

### A. `slashCommandRegistry.ts`

Extract slash command metadata and lookup if safe.

Possible responsibilities:

- known slash command names
- aliases, if any
- command labels/help descriptions
- registry lookup
- command classification metadata
- command list used by help output
- helpers such as `isKnownSlashCommand`

Suggested exports:

- `SLASH_COMMANDS`
- `getSlashCommand`
- `isKnownSlashCommand`
- `listSlashCommands`
- `SlashCommandName`
- `SlashCommandSpec`

The module must not:

- execute commands
- mutate session state
- call runtime
- call provider readiness
- call MCP gateway
- prompt approval
- render interactive UI directly
- call process.exit

### B. `cliWorkspaceSurface.ts`

Extract workspace/status display shaping if safe.

Possible responsibilities:

- format workspace attached/detached status lines
- format workspace selection/status messages
- format safe workspace summary text
- format project/workspace command output
- helpers for user-visible workspace command surface

Suggested exports:

- `formatWorkspaceStatus`
- `formatWorkspaceAttachResult`
- `formatWorkspaceSummary`
- `WorkspaceCliLine`

The module must not:

- attach/detach workspace
- read/write workspace state
- change project binding
- change session selection
- access filesystem except through data passed in
- call process.exit

### C. `mcpControlCliSurface.ts`

Extract MCP control-plane display shaping if safe.

Possible responsibilities:

- format MCP server list/status output
- format MCP add/remove/enable/disable result surface
- format MCP unavailable/error surface for CLI commands
- preserve existing user-visible MCP command wording

Suggested exports:

- `formatMcpServerList`
- `formatMcpStatus`
- `formatMcpCommandResult`
- `McpCliLine`

The module must not:

- execute MCP tools
- start/stop MCP servers
- read MCP config
- change MCP gateway behavior
- change MCP error taxonomy
- call process.exit

## Important batching rule

Do not stop after only `slashCommandRegistry.ts` if workspace/MCP surface seams are clearly safe.

However, do not force workspace/MCP extraction when:

- it would change command execution semantics
- it would require touching MCP core
- it would require touching session/project binding
- it would require changing output markers
- it would require changing interactive/TUI control flow
- focused validation cannot cover it

If only 1-2 modules can safely move, explain why the others were deferred.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/slashCommandRegistry.ts
- packages/ts-shell/src/entrypoints/slashCommandRegistry.test.ts
- packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts
- packages/ts-shell/src/entrypoints/cliWorkspaceSurface.test.ts
- packages/ts-shell/src/entrypoints/mcpControlCliSurface.ts
- packages/ts-shell/src/entrypoints/mcpControlCliSurface.test.ts
- packages/ts-shell/src/entrypoints/cliArgs.ts only if sharing `isKnownSlashCommand` with the fallback fix is clearly needed; do not change parse behavior
- packages/ts-shell/src/cli-baseline.test.ts only if adding focused surface coverage is necessary

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

- CLI arg parse behavior
- slash-command fallback fix
- mode precedence
- slash command list/help/lookup behavior
- workspace/status command output
- MCP command output
- interactive default behavior
- continue/resume behavior
- provider readiness behavior
- approval behavior
- runtime invocation behavior
- output markers
- exit codes
- MCP local execution/error taxonomy
- deterministic release meta gate

Preserve:

- no new external MCP readiness claim
- no broad MCP capability claim
- no provider secret output
- real-provider default skip behavior
- broadReleaseReady=false in deterministic release

## Local validation after each migration

After `slashCommandRegistry.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/slashCommandRegistry.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After `cliWorkspaceSurface.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliWorkspaceSurface.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After `mcpControlCliSurface.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/mcpControlCliSurface.test.ts
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe CLI command/surface migrations, run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:cli-entry
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
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
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- slash command help/list behavior
- workspace/status output
- MCP status/list output
- CLI baseline
- release deterministic summary

Compare:

- command output unchanged
- exit codes unchanged
- MCP taxonomy unchanged
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

If residue cannot be cleaned, report why.

## Success criteria

Route 27 is complete only if:

- batch inventory is explicitly reported
- at least one command/surface module is extracted
- 2-3 modules are extracted if safe, or deferred modules are clearly justified
- `cli.tsx` delegates migrated responsibilities
- command execution behavior is unchanged
- workspace behavior is unchanged
- MCP behavior is unchanged
- CLI grammar is unchanged
- mode precedence is unchanged
- slash fallback fix is preserved
- no provider/session/runtime/orchestration behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing CLI grammar
- extraction requires changing command execution semantics
- extraction requires changing workspace/session/project binding semantics
- extraction requires changing MCP core behavior
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires touching package.json or scripts
- workspace/MCP surface is too entangled with interactive/TUI control flow
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding CLI command/surface inventory
6. Migrations completed
7. Migrations intentionally left in cli.tsx and why
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. Capability expanded? yes/no
12. Default gates changed? yes/no
13. Real provider touched? yes/no
14. Secret exposure risk? yes/no
15. New modules and responsibilities
16. cli.tsx responsibilities retained
17. cli.tsx responsibilities migrated
18. Focused tests added/reused
19. CLI grammar / slash fallback preservation evidence
20. Workspace/MCP behavior preservation evidence
21. Local validation results
22. Batch validation results
23. Full validation results
24. Residue cleanup status
25. Claim/readiness changes
26. Residual risks
27. Recommended next route
28. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

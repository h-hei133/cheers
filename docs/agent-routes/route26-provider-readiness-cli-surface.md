# Route 26: provider readiness CLI surface extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the CLI ownership batch by extracting provider readiness CLI display / surface logic from:

- packages/ts-shell/src/entrypoints/cli.tsx

into:

- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts

This must be a behavior-preserving extraction.

The goal is to move CLI-facing provider readiness rendering, safe diagnostic formatting, default-skip wording, and user-visible readiness surface construction out of `cli.tsx`, while preserving provider readiness semantics, redaction, real-provider opt-in behavior, CLI grammar, mode precedence, runtime invocation, package scripts, default gates, and readiness claims.

Do not change provider readiness logic itself.
Do not change provider auth/config/network classification.
Do not touch provider core.

## Current context

Recent CLI work completed:

- cliArgs.ts
- slash-command positional fallback fix
- cliModeDispatch.ts
- cliPrintModeRunner.ts
- cliStdinModeRunner.ts

The runtime ownership map lists `providerReadinessCliSurface.ts` as a remaining CLI candidate. CLI interactive/TUI extraction should remain later.

This route should extract provider readiness CLI surface only.

## Non-goals

Do not add or change:

- provider readiness semantics
- provider auth/config/network classification
- provider core behavior
- provider config handling
- real-provider opt-in behavior
- default real-provider gate behavior
- CLI grammar
- mode precedence
- print/stdin/interactive behavior
- slash command behavior
- approval behavior
- session selection behavior
- runtime invocation behavior
- mutation/tool/MCP behavior
- package scripts
- default gates
- readiness claims

Do not extract approvalPromptBridge.
Do not extract slashCommandRegistry.
Do not extract interactive/TUI code.
Do not touch runMvpIntegratedFlow.ts or SessionManager.ts.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve provider readiness redaction.
- Preserve real-provider default skip behavior.
- Preserve real-provider opt-in boundaries.
- Preserve exit codes.
- Preserve output markers relied on by gates.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 26 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize anything under:

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
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliArgs.ts
- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts
- packages/ts-shell/src/cli-baseline.test.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- scripts/verify-provider-readiness.mjs
- package.json

Then inspect `cli.tsx` for:

- provider readiness display branch
- provider readiness CLI output formatting
- default skip / opt-in messages
- safe diagnostic formatting
- provider model/host/protocol safe output
- missing-key/auth/config/network user-visible messages
- output markers used by provider readiness gates
- exit handling around readiness commands

Produce an internal inventory before coding:

1. Provider readiness CLI surface currently inside `cli.tsx`.
2. Which parts are pure display/surface and safe to move.
3. Which parts are provider readiness logic/core and must stay elsewhere.
4. Which output markers / text must be preserved.
5. Which tests/gates prove behavior preservation.

## Preflight state check

Before coding, verify current CLI batch baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -95
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If repo has unrelated dirty changes, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `cli.tsx`, identify and migrate provider readiness CLI display / surface responsibilities, including some or all of:

- readiness result formatting for terminal display
- safe provider diagnostic formatting
- default skip wording
- classification self-test wording, only if CLI surface owns it
- redacted provider metadata display
- user-facing readiness outcome messages
- provider readiness command output construction
- provider readiness error/success/stopped surface formatting

The new module should own CLI surface only.

It must not own:

- provider config reading
- provider env reading
- provider auth/network calls
- provider readiness classification logic
- real-provider opt-in execution
- command parsing
- mode dispatch
- process bootstrap
- process exit
- runtime invocation
- session loading
- mutation/tool/MCP execution

## Desired module

Create:

- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts

Possible exported items may include:

- `formatProviderReadinessCliResult`
- `formatProviderReadinessCliDiagnostics`
- `renderProviderReadinessSummary`
- `ProviderReadinessCliSurface`
- `ProviderReadinessCliLine`

Choose names based on actual code shape.

The module should be pure or mostly pure.

Preferred properties:

- explicit inputs
- explicit string/line output
- no provider calls
- no config/env reading
- no filesystem writes
- no process.exit
- no mutation/tool/MCP execution
- no real-provider config access

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
  - only to delegate provider readiness display/surface construction to the new module
  - no mode behavior change
  - no provider behavior change
- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.ts
- packages/ts-shell/src/entrypoints/providerReadinessCliSurface.test.ts
- packages/ts-shell/src/cli-baseline.test.ts only if adding focused provider readiness coverage is necessary

Allowed test additions:

- provider readiness default skip surface
- classification self-test surface if applicable
- missing config / missing key / auth / network classification text if available as safe fixtures
- safe metadata redaction
- no secret-bearing output
- output marker preservation

## Conditional allowed scope

Only if strictly necessary for type imports:

- packages/ts-shell/src/core/shell/providerReadiness.ts

Do not change provider readiness behavior. Type export only if necessary.

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

- provider readiness default skip output
- provider readiness classification self-test output
- provider readiness CLI baseline behavior
- real-provider opt-in boundaries
- redacted safe diagnostics
- CLI grammar
- mode precedence
- provider readiness mode dispatch
- exit codes
- output markers
- deterministic release meta gate

Preserve:

- realProviderTouched=false for default/deterministic checks
- real-provider-home-read=false for default readiness
- candidateMutationRealExecuted=false in deterministic release
- broadReleaseReady=false
- no secret/provider config output

## Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/providerReadinessCliSurface.test.ts
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"
- rtk npm run verify:cli-entry
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a focused test file is not created because the surface cannot be isolated safely, explain why. Prefer adding the test.

## Batch validation

Run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
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
- rtk npm run verify:release:deterministic
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- provider readiness default skip
- provider readiness classification self-test
- provider readiness CLI baseline
- release deterministic summary

Compare:

- output markers unchanged
- redaction unchanged
- no secret output
- realProviderTouched remains false for default checks
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

Route 26 is complete only if:

- `providerReadinessCliSurface.ts` exists and owns coherent provider readiness CLI surface/display responsibility
- `cli.tsx` delegates that responsibility to the new module
- provider readiness semantics are unchanged
- provider readiness redaction is unchanged
- default real-provider skip behavior is unchanged
- classification self-test behavior is unchanged
- CLI grammar and mode precedence are unchanged
- no provider/session/runtime/orchestration behavior changed
- no package scripts changed
- no default gates changed
- no capability expanded
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing provider readiness logic
- extraction requires changing real-provider opt-in behavior
- extraction requires reading private provider config
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires changing mode precedence
- extraction requires changing package.json or scripts
- output markers would change
- redaction would weaken
- release deterministic fails for unrelated reasons
- provider readiness surface is too entangled with provider core behavior

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding provider readiness CLI inventory
5. Extraction seam chosen
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. Capability expanded? yes/no
10. Default gates changed? yes/no
11. Real provider touched? yes/no
12. Secret exposure risk? yes/no
13. New module and responsibility
14. cli.tsx responsibilities retained
15. cli.tsx responsibilities migrated
16. Focused tests added/reused
17. provider readiness redaction preservation evidence
18. default skip / classification self-test preservation evidence
19. CLI grammar / mode precedence preservation evidence
20. Local validation results
21. Batch validation results
22. Full validation results
23. Residue cleanup status
24. Claim/readiness changes
25. Residual risks
26. Recommended next route
27. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

# Route 24: CLI args extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Start the CLI ownership batch by extracting CLI argument parsing and argument normalization from:

- packages/ts-shell/src/entrypoints/cli.tsx

into:

- packages/ts-shell/src/entrypoints/cliArgs.ts

This must be a behavior-preserving extraction.

The goal is to move typed CLI argument parsing, defaulting, and mode-relevant flag classification out of the large CLI entrypoint while preserving CLI grammar, mode precedence, runtime invocation behavior, provider readiness behavior, session behavior, approval behavior, and default gates.

This route must be more meaningful than moving a few constants. It should establish `cliArgs.ts` as the clear owner of parsed CLI option shape and raw-argument normalization, while leaving actual mode dispatch and mode execution in `cli.tsx` for later routes.

## Path convention

Route/task specifications belong under:

- docs/agent-routes/

Design and ownership documents belong under:

- docs/design/

Do not create new design docs in this route unless explicitly needed. This route spec itself belongs in `docs/agent-routes/`.

## Current context

The current ownership map says:

- `runMvpIntegratedFlow.ts` Batch 1 outcome/result/handoff projection is mostly complete.
- `SessionManager.ts` context/compact/continuity/replay batch is mostly complete.
- `cli.tsx` has no completed runtime extraction yet.
- The recommended next migration is `packages/ts-shell/src/entrypoints/cliArgs.ts`.

Relevant completed runtime/session modules include:

- shellResultAssembly.ts
- runtimeOutcomeProjection.ts
- runtimeHandoffProjection.ts
- toolExecutionOutcomeProjection.ts
- doNextProjection.ts
- sessionResumeContextBuilder.ts
- sessionContinuityTypes.ts
- compactRetentionPlanner.ts
- mutationContinuityState.ts
- sessionReplayBuilder.ts

This route should start the CLI batch without touching those runtime/session modules.

## Non-goals

Do not add or change:

- CLI grammar
- option names
- option aliases
- default option behavior
- mode precedence
- print/stdin/interactive behavior
- slash command behavior
- approval prompt behavior
- provider readiness behavior
- session selection behavior
- runtime invocation behavior
- provider config or credential handling
- tool/MCP behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not extract full mode dispatch in this route.
Do not extract print mode runner in this route.
Do not extract stdin mode runner in this route.
Do not extract slash command registry in this route.
Do not extract approval bridge in this route.
Do not redesign CLI/TUI behavior.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve CLI grammar.
- Preserve mode precedence.
- Preserve exit codes.
- Preserve provider readiness redaction.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 24 should not require full real-provider execution.

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
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/cli-baseline.test.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- package.json

Then inspect `cli.tsx` for:

- raw argv parsing
- option declarations
- boolean flags
- string flags
- repeated flags
- default values
- aliases
- mode-relevant flags
- provider readiness flags
- session/resume/continue flags
- print/stdin/interactive flags
- approval-related flags
- MCP-related flags
- workspace/project flags
- debug/dry-run/test flags
- output formatting flags
- error handling around invalid args

Produce a short internal inventory before coding:

1. CLI args responsibilities currently inside `cli.tsx`.
2. Which responsibilities are pure parse/normalize and safe to move to `cliArgs.ts`.
3. Which responsibilities are mode dispatch/execution and must remain in `cli.tsx`.
4. Which flags are especially sensitive because they affect provider readiness, session selection, approval, or mode precedence.
5. Which focused tests should prove behavior preservation.

If the ownership map does not recommend `cliArgs.ts` as the next migration, stop and report the mismatch.

## Preflight state check

Before coding, verify the repo is clean and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -80
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If `verify:cli-entry` does not exist, inspect package.json and run the closest existing CLI entry verification.
If the repo is dirty with unrelated changes, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `cli.tsx`, identify and migrate pure argument parsing / normalization responsibilities, including some or all of:

- parsing raw argv into a typed argument object
- default values
- flag aliases
- mode-relevant flag classification
- boolean/string/repeated flag normalization
- safe parse error representation
- typed output consumed by `cli.tsx`
- helpers that answer questions such as:
  - is print mode requested?
  - is stdin input expected?
  - is interactive mode allowed?
  - is provider readiness check requested?
  - is continue/resume requested?
  - is approval mode configured?
  - are MCP flags configured?
  - are workspace/session flags present?

The new module should own parsing and normalization only.

It must not own:

- actual mode dispatch
- print mode execution
- stdin mode execution
- interactive bootstrap
- slash command execution
- approval prompt execution
- provider readiness execution
- session loading
- runtime invocation
- terminal rendering
- process exit
- provider config reading
- secret handling
- MCP execution

## Desired module

Create:

- packages/ts-shell/src/entrypoints/cliArgs.ts

Possible exported items may include:

- `parseCliArgs`
- `normalizeCliArgs`
- `CliArgs`
- `CliModeHint`
- `CliArgParseError`
- `isPrintModeRequested`
- `isStdinModeRequested`
- `isContinueRequested`
- `isProviderReadinessRequested`
- `getApprovalMode`
- `getWorkspaceSelection`

Choose names based on actual code shape.

The module should be pure or mostly pure.

Preferred properties:

- explicit `argv` input
- explicit typed output
- no filesystem writes
- no provider calls
- no session loading
- no CLI rendering
- no process.exit
- no mutation/tool/MCP execution
- no access to real provider config
- minimal or no `process.env` access; if current behavior requires env-derived defaults, keep env reads in `cli.tsx` unless safe and explicit

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
  - only to delegate arg parsing/normalization to `cliArgs.ts`
  - no mode dispatch behavior change
  - no execution behavior change
- packages/ts-shell/src/entrypoints/cliArgs.ts
- packages/ts-shell/src/entrypoints/cliArgs.test.ts
- existing CLI tests only if behavior-preserving imports or assertions need narrow updates

Allowed test additions:

- typed parse of existing flags
- alias preservation
- default preservation
- print/stdin/interactive mode hints
- provider readiness flag preservation
- continue/resume flag preservation
- approval flag preservation
- invalid arg error shape if current behavior exposes one
- no mode dispatch behavior in `cliArgs.ts`

## Conditional allowed scope

Only if strictly necessary for existing test organization:

- packages/ts-shell/src/cli-baseline.test.ts

If modifying `cli-baseline.test.ts`, explain why focused `cliArgs.test.ts` was insufficient.

Do not update expected behavior unless proving the old test was coupled to implementation location rather than behavior.

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
- default release gate membership
- package.json
- scripts/*
- docs/*

If completing this route requires touching forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- CLI help/arg parse behavior
- print mode selection
- stdin mode selection
- interactive default behavior
- continue/resume request behavior
- provider readiness request behavior
- approval mode parsing
- workspace/session selection flags
- MCP-related flag parsing
- invalid flag behavior
- exit codes
- provider readiness redaction
- deterministic release meta gate

Preserve:

- option names
- aliases
- defaults
- precedence
- output markers
- terminal outcome behavior
- real-provider default skip behavior
- real-provider opt-in behavior
- broadReleaseReady=false in deterministic release

## Migration quality bar

This route should be meaningful.

A successful migration should:

- move the CLI argument parsing/normalization ownership out of `cli.tsx`
- leave `cli.tsx` as bootstrap/mode dispatch/wiring
- create a typed parse result that future `cliModeDispatch.ts` can consume
- include focused tests for the new parse module
- preserve all existing CLI behavior through CLI baseline or entry verification
- avoid extracting execution behavior

Do not move only one or two constants.
Do not redesign the CLI grammar.
Do not combine this with mode runner extraction.
Do not use line-count reduction as the main success metric.

## Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If `verify:cli-entry` or filtered tests do not exist/match, inspect package.json/test output, report it, and run the closest existing equivalent.

## Batch validation

Run:

- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:result-contract
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

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

- CLI help / parse behavior
- continue baseline
- provider readiness baseline
- release deterministic summary

Compare:

- option names unchanged
- defaults unchanged
- mode precedence unchanged
- exit codes unchanged
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

Route 24 is complete only if:

- `cliArgs.ts` exists and owns coherent CLI argument parsing/normalization responsibility
- `cli.tsx` delegates that responsibility to the new module
- behavior is preserved
- focused tests exist for the new args parser
- CLI grammar is unchanged
- option aliases/defaults are unchanged
- mode precedence is unchanged
- provider readiness parsing/redaction boundaries are unchanged
- continue/resume behavior is unchanged
- approval parsing behavior is unchanged
- no provider/tool/mutation/session behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- ownership map baseline is missing
- extraction requires changing CLI grammar
- extraction requires changing mode precedence
- extraction requires changing runtime invocation behavior
- extraction requires changing provider config or credential handling
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires touching package.json or scripts
- focused tests cannot reasonably cover the parse module
- release deterministic fails for unrelated reasons
- the only safe extraction is too small to justify the route

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding CLI args inventory
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
17. option/default/alias preservation evidence
18. mode precedence preservation evidence
19. provider readiness / continue / approval preservation evidence
20. Local validation results
21. Batch validation results
22. Full validation results
23. Residue cleanup status
24. Claim/readiness changes
25. Residual risks
26. Recommended next route
27. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

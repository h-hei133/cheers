# Route 25: CLI mode / print / stdin batch extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the CLI ownership batch by extracting a coherent non-interactive CLI batch from:

- packages/ts-shell/src/entrypoints/cli.tsx

into focused entrypoint modules:

- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts

This route should migrate 2-3 related modules in one task.

Batch goal:

1. Extract mode decision / dispatch planning into `cliModeDispatch.ts`.
2. Extract print mode execution wrapper into `cliPrintModeRunner.ts`, if safe.
3. Extract stdin mode execution wrapper into `cliStdinModeRunner.ts`, if safe.

Do not extract interactive/TUI mode, slash command registry, approval bridge, or provider readiness CLI surface in this route.

## Current context

Recent CLI work:

- Route 24 extracted CLI argument parsing into:
  - packages/ts-shell/src/entrypoints/cliArgs.ts

- A follow-up cleanup fixed CLI slash-command positional fallback:
  - known slash commands such as `/continue`, `/sessions`, `/mcp`, `/resume`, `/workspace`, `/help`, and `/pwd` are no longer treated as positional project fallback.
  - real path-like project fallback such as `nested/project` and `/tmp/project` remains supported.

The runtime ownership map says `cli.tsx` has no completed runtime extraction before the CLI batch and recommends `cliArgs.ts`, then `cliModeDispatch.ts`, then print/stdin runners. This route starts after `cliArgs.ts` and the fallback cleanup are committed.

## Path convention

Route/task specs belong under:

- docs/agent-routes/

Design and ownership documents belong under:

- docs/design/

Do not create or update design docs in this route unless explicitly necessary.

## Non-goals

Do not add or change:

- CLI grammar
- option names
- aliases
- defaults
- slash-command fallback semantics
- mode precedence
- print behavior
- stdin behavior
- interactive/TUI behavior
- slash command behavior
- approval prompt behavior
- provider readiness behavior
- session selection behavior
- runtime invocation semantics
- provider config or credential handling
- tool/MCP behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not extract:

- interactive mode runner
- slash command registry
- approval prompt bridge
- provider readiness CLI surface
- runtime orchestration
- session management

Do not touch `runMvpIntegratedFlow.ts` or `SessionManager.ts`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly except for no changes expected in this route.
- Preserve CLI grammar.
- Preserve mode precedence.
- Preserve slash-command fallback fix from the previous cleanup.
- Preserve exit codes.
- Preserve provider readiness redaction.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 25 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

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
- packages/ts-shell/src/entrypoints/cliArgs.test.ts
- packages/ts-shell/src/cli-baseline.test.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- package.json

Then inspect `cli.tsx` for:

- mode branching
- print mode branch
- stdin mode branch
- interactive fallback branch
- continue/resume branch interactions
- provider readiness branch interactions
- approval branch interactions
- slash command handling
- runtime invocation call sites
- exit handling
- terminal rendering
- shared helpers used by print/stdin paths

Produce an internal migration inventory before coding:

1. Current mode decision logic inside `cli.tsx`.
2. Which mode decision logic is pure and safe for `cliModeDispatch.ts`.
3. Which print mode execution code can safely move to `cliPrintModeRunner.ts`.
4. Which stdin mode execution code can safely move to `cliStdinModeRunner.ts`.
5. Which code must stay in `cli.tsx` because it is interactive/TUI, slash, approval, provider readiness, process bootstrap, or exit boundary.
6. Local validation after each module migration.

If the ownership map does not support this CLI batch direction, stop and report the mismatch.

## Preflight state check

Before coding, verify the previous CLI args/fallback work is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -90
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If the CLI args extraction or slash fallback fix is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. `cliModeDispatch.ts`

Extract mode decision / mode plan construction.

Possible responsibilities:

- Decide which high-level CLI mode is requested from parsed args.
- Preserve mode precedence.
- Return a typed mode plan consumed by `cli.tsx`.
- Keep known slash-command fallback behavior as already fixed in `cliArgs.ts`.
- Keep print/stdin/interactive/continue/provider-readiness distinctions stable.

Suggested exports:

- `resolveCliMode`
- `CliModePlan`
- `CliModeKind`

The module must not:

- execute modes
- call runtime
- call provider readiness
- load sessions
- print terminal output
- call process.exit
- execute slash commands
- ask approval prompts

### B. `cliPrintModeRunner.ts`

Extract print mode execution wrapper if safe.

Possible responsibilities:

- Own the current print-mode branch body as a function.
- Accept already parsed args, runtime dependencies, and callbacks explicitly.
- Preserve all output, exit, provider readiness, session, and runtime behavior.
- Keep rendering/exits at the same boundary if moving them would change semantics.

Suggested exports:

- `runCliPrintMode`

The module must not:

- change print semantics
- change provider config handling
- change approval behavior
- change session persistence
- change runtime orchestration
- change output markers

If print mode is too entangled with broader CLI bootstrap, leave it and explain why.

### C. `cliStdinModeRunner.ts`

Extract stdin mode execution wrapper if safe.

Possible responsibilities:

- Own the current stdin-mode branch body as a function.
- Accept stdin input / parsed args / runtime dependencies explicitly.
- Preserve stdin prompt derivation, runtime invocation, output, and exit behavior.

Suggested exports:

- `runCliStdinMode`

The module must not:

- change stdin semantics
- change prompt parsing
- change runtime invocation
- change interactive fallback
- change output markers

If stdin mode is too entangled, leave it and explain why.

## Important batching rule

Do not stop after only `cliModeDispatch.ts` if print/stdin runner seams are clearly safe.

However, do not force print/stdin extraction when:

- it would require changing output behavior
- it would require changing exit behavior
- it would require touching runtime/session/orchestration
- it would require changing provider credential handling
- focused validation cannot cover it
- the seam is indistinguishable from interactive/TUI bootstrap

If only 1 module can safely move, explain why the other batch items were left.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/cliArgs.ts
  - only if tiny type export/import adjustment is needed
  - do not change parse behavior
- packages/ts-shell/src/entrypoints/cliModeDispatch.ts
- packages/ts-shell/src/entrypoints/cliModeDispatch.test.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.ts
- packages/ts-shell/src/entrypoints/cliPrintModeRunner.test.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.ts
- packages/ts-shell/src/entrypoints/cliStdinModeRunner.test.ts
- packages/ts-shell/src/cli-baseline.test.ts only if adding focused coverage is necessary

Only add runner modules that are actually extracted.

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
- mode precedence
- slash-command fallback fix
- print mode behavior
- stdin mode behavior
- interactive default behavior
- continue/resume behavior
- provider readiness behavior
- approval parsing/behavior
- workspace/session flags
- MCP-related flags
- runtime invocation behavior
- output markers
- exit codes
- provider readiness redaction
- deterministic release meta gate

## Local validation after each migration

After `cliModeDispatch.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "continue"
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "provider readiness"
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After `cliPrintModeRunner.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After `cliStdinModeRunner.ts` migration:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe CLI batch migrations, run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:cli-entry
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

- CLI baseline
- print mode
- stdin mode
- continue baseline
- provider readiness baseline
- release deterministic summary

Compare:

- mode selection unchanged
- print/stdin behavior unchanged
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

If residue cannot be cleaned, report why.

## Success criteria

Route 25 is complete only if:

- batch inventory is explicitly reported
- `cliModeDispatch.ts` exists and owns CLI mode decision if safe
- at least one of `cliPrintModeRunner.ts` or `cliStdinModeRunner.ts` is extracted if safe, or there is a clear reason why both are deferred
- `cli.tsx` delegates migrated responsibilities
- CLI grammar is unchanged
- option aliases/defaults are unchanged
- slash-command fallback fix is preserved
- mode precedence is unchanged
- print/stdin behavior is unchanged
- continue/provider readiness/approval behavior is unchanged
- no provider/session/runtime/orchestration behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- CLI args/fallback baseline is missing
- extraction requires changing CLI grammar
- extraction requires changing mode precedence
- extraction requires changing print/stdin behavior
- extraction requires changing runtime invocation behavior
- extraction requires changing provider config or credential handling
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires touching package.json or scripts
- runner extraction is too entangled with interactive/TUI bootstrap
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding CLI batch inventory
5. Migrations completed
6. Migrations intentionally left in cli.tsx and why
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. Capability expanded? yes/no
11. Default gates changed? yes/no
12. Real provider touched? yes/no
13. Secret exposure risk? yes/no
14. New modules and responsibilities
15. cli.tsx responsibilities retained
16. cli.tsx responsibilities migrated
17. Focused tests added/reused
18. CLI grammar / option/default/alias preservation evidence
19. Mode precedence preservation evidence
20. Print/stdin preservation evidence
21. Continue/provider readiness/approval preservation evidence
22. Local validation results
23. Batch validation results
24. Full validation results
25. Residue cleanup status
26. Claim/readiness changes
27. Residual risks
28. Recommended next route
29. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

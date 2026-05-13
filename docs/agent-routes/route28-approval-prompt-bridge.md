# Route 28: approval prompt bridge extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the CLI ownership batch by extracting approval prompt bridge / approval surface responsibilities from:

- packages/ts-shell/src/entrypoints/cli.tsx

into:

- packages/ts-shell/src/entrypoints/approvalPromptBridge.ts

This must be a behavior-preserving extraction.

The goal is to move approval prompt display, approval request/response surface shaping, user-facing approval wording, and safe approval provenance formatting out of `cli.tsx`, while preserving authorization semantics, approval mode behavior, allow/deny decisions, runtime invocation, tool execution, provider behavior, session behavior, CLI grammar, package scripts, and default gates.

Do not change approval authorization behavior.
Do not change tool execution behavior.
Do not change permission policy.

## Current context

Recent CLI batch extractions completed or expected:

- cliArgs.ts
- CLI slash-command positional fallback fix
- cliModeDispatch.ts
- cliPrintModeRunner.ts
- cliStdinModeRunner.ts
- providerReadinessCliSurface.ts
- slashCommandRegistry.ts
- cliWorkspaceSurface.ts
- mcpControlCliSurface.ts

`cli.tsx` should keep process bootstrap, high-level wiring, actual runtime/session/provider invocation, and interactive loop boundaries. This route should extract only the approval prompt bridge/surface if it can be done without semantic change.

## Path convention

Route/task specs belong under:

- docs/agent-routes/

Design and ownership documents belong under:

- docs/design/

Do not create or update design docs in this route.

## Non-goals

Do not add or change:

- approval authorization semantics
- allow/deny behavior
- approval mode behavior
- approval storage or persistence
- permission policy
- tool execution behavior
- runtime invocation behavior
- provider behavior
- session behavior
- MCP behavior
- mutation behavior
- CLI grammar
- option names / aliases / defaults
- mode precedence
- slash-command fallback semantics
- print/stdin/interactive behavior
- package scripts
- default gates
- readiness claims

Do not extract:

- interactive/TUI loop
- runtime orchestration
- session management
- tool execution
- permission policy engine
- provider readiness core
- MCP core

Do not touch `runMvpIntegratedFlow.ts` or `SessionManager.ts`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve approval allow/deny semantics.
- Preserve approval mode aliases/defaults.
- Preserve exit codes.
- Preserve CLI grammar and mode precedence.
- Preserve provider readiness redaction.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 28 should not require full real-provider execution.

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

- approval prompt
- permission prompt
- permission denied
- allow once
- allowlist
- tool approval
- ask permission
- prompt bridge
- cli approval

Read at most 2 relevant snippets per reference repo.

Use the comparison only to calibrate ownership boundaries:

- approval prompt/surface can move out of CLI entrypoint
- approval authorization policy must not be changed during extraction
- request/reply/provenance can be represented separately from execution
- interactive/TUI prompt transport should remain stable

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
- packages/ts-shell/src/entrypoints/slashCommandRegistry.ts, if present
- packages/ts-shell/src/entrypoints/cliWorkspaceSurface.ts, if present
- packages/ts-shell/src/entrypoints/mcpControlCliSurface.ts, if present
- packages/ts-shell/src/cli-baseline.test.ts
- package.json

Then inspect `cli.tsx` for:

- approval prompt display
- approval request wording
- approval response wording
- approval mode parsing consumption
- allow-once / deny / prompt behavior
- approval provenance formatting
- tool approval request rendering
- approval-related terminal messages
- interactive prompt transport
- approval-related exit/error behavior
- approval wiring into runtime invocation

Produce an internal migration inventory before coding:

1. Approval prompt/surface responsibilities currently inside `cli.tsx`.
2. Which approval prompt/display logic is pure and safe for `approvalPromptBridge.ts`.
3. Which approval authorization / policy / runtime behavior must stay out of this module.
4. Which approval behavior is covered by existing tests.
5. Which focused tests should prove preservation.
6. Which seams are too entangled with interactive/TUI transport and should remain in `cli.tsx`.

If the ownership map or current code does not support approval prompt bridge extraction, stop and report.

## Preflight state check

Before coding, verify current CLI batch baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -110
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If there are uncommitted Route 27 changes, proceed only if they are exactly the expected Route 27 CLI surface files and do not conflict with this route. Report that this route is stacked on top of Route 27 changes.

If repo has unrelated dirty changes, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `cli.tsx`, identify and migrate approval prompt bridge/surface responsibilities, including some or all of:

- approval request display lines
- approval prompt wording
- approval response display lines
- approval denial / cancellation surface
- safe approval provenance formatting
- approval prompt metadata projection
- user-facing action labels for approval requests
- terminal output around approval prompts
- small pure helpers that shape approval prompt data

The new module should own CLI approval surface only.

It must not own:

- approval authorization decision
- allow/deny policy
- allowlist persistence
- tool execution
- runtime invocation
- session persistence
- provider behavior
- MCP behavior
- mutation behavior
- interactive/TUI loop
- process exit
- provider config reading
- secret handling

## Desired module

Create:

- packages/ts-shell/src/entrypoints/approvalPromptBridge.ts

Possible exported items may include:

- `formatApprovalPrompt`
- `formatApprovalRequest`
- `formatApprovalResponse`
- `projectApprovalPrompt`
- `ApprovalPromptSurface`
- `ApprovalPromptLine`

Choose names based on actual code shape.

The module should be pure or mostly pure.

Preferred properties:

- explicit inputs
- explicit string/line output or prompt surface object
- no tool execution
- no provider calls
- no session loading
- no filesystem writes
- no process.exit
- no mutation/MCP execution
- no real provider config access

## Allowed modification scope

Allowed:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/entrypoints/approvalPromptBridge.ts
- packages/ts-shell/src/entrypoints/approvalPromptBridge.test.ts
- packages/ts-shell/src/cli-baseline.test.ts only if adding focused approval coverage is necessary
- packages/ts-shell/src/entrypoints/cliArgs.ts only if type imports are needed; do not change parse behavior

Only add tests for modules actually created.

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

- approval prompt display
- approval request/response behavior
- allow-once behavior
- deny behavior
- non-interactive approval behavior
- approval mode parsing behavior
- approval provenance/user-facing wording
- CLI grammar
- mode precedence
- slash fallback fix
- print/stdin/interactive behavior
- provider readiness behavior
- runtime invocation behavior
- output markers
- exit codes
- deterministic release meta gate

Preserve:

- no authorization semantics change
- no new approval capability
- no provider secret output
- real-provider default skip behavior
- broadReleaseReady=false in deterministic release

## Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/approvalPromptBridge.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run verify:cli-entry
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts -t "approval"
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If the filtered approval test does not exist/match, inspect test output, report it, and run the closest existing CLI baseline equivalent.

## Batch validation

After completing the approval bridge extraction, run:

- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliArgs.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliModeDispatch.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliPrintModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/entrypoints/cliStdinModeRunner.test.ts
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run verify:cli-entry
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If Route 26/27 modules exist, also run their focused tests.

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

## Optional behavior comparison

If feasible, capture safe before/after summaries for:

- approval prompt baseline
- CLI baseline
- release deterministic summary

Compare:

- approval prompt text unchanged
- allow/deny behavior unchanged
- non-interactive approval behavior unchanged
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

Route 28 is complete only if:

- `approvalPromptBridge.ts` exists and owns coherent approval prompt/surface responsibility, or a clear stop report explains why extraction is unsafe
- `cli.tsx` delegates migrated approval surface responsibilities
- approval authorization semantics are unchanged
- allow/deny behavior is unchanged
- approval mode behavior is unchanged
- runtime/tool execution behavior is unchanged
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

- extraction requires changing approval authorization semantics
- extraction requires changing allow/deny behavior
- extraction requires changing runtime/tool execution
- extraction requires touching runMvpIntegratedFlow.ts or SessionManager.ts
- extraction requires touching package.json or scripts
- approval prompt bridge is too entangled with interactive/TUI control flow
- focused tests cannot cover the extracted surface
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding approval inventory
6. Extraction seam chosen
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. Approval authorization changed? yes/no
11. Capability expanded? yes/no
12. Default gates changed? yes/no
13. Real provider touched? yes/no
14. Secret exposure risk? yes/no
15. New module and responsibility
16. cli.tsx responsibilities retained
17. cli.tsx responsibilities migrated
18. Focused tests added/reused
19. Approval allow/deny preservation evidence
20. CLI grammar / mode precedence preservation evidence
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

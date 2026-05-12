# Route 07: live TTY manual checklist and runbook

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Create a bounded live TTY manual checklist/runbook for limited dogfood validation of the CLI user experience.

Routes 01-06 established bounded evidence for real candidate mutation, failure taxonomy, CLI evidence, mutation routing extraction, compact continuity extraction, and MCP error taxonomy.

Route 07 must not add product capability. It should standardize how a human validates the live interactive CLI path and records results.

The goal is to make live TTY validation repeatable and honest, not to turn it into a default release gate.

## Current context

The project has deterministic and focused evidence for:

- candidate mutation
- opt-in real candidate mutation happy path
- candidate failure taxonomy
- two-file CLI evidence
- session durability
- compact continuity
- local MCP execution
- MCP error taxonomy
- deterministic release gate

However, pipe-spawn or deterministic CLI checks are not the same as a human-observed live TTY session.

Route 07 should close this process gap by producing a clear manual checklist and runbook.

## Non-goals

Do not add:

- broad/general release readiness
- live TTY default release gate
- automated full TTY product gate
- external MCP readiness
- new mutation capability
- broad apply_patch support
- 3+ file mutation support
- delete/move support
- rollback or atomicity
- provider expansion
- CLI rewrite
- session architecture rewrite

Do not turn manual checklist evidence into product readiness claims.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not weaken existing deterministic, CLI, candidate, session, MCP, provider-readiness, result-contract, or release gates.
- Do not make live TTY manual validation part of default release verification.
- Do not make real-provider tests part of default release verification.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

A real provider may be used only through explicit opt-in commands or explicit manual steps.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Live TTY checklist may include an optional real-provider section, but it must remain explicit opt-in and must not be required for deterministic release readiness.

## MCP safety constraints

Do not connect to arbitrary external MCP servers.

Do not run untrusted external commands.

Do not read private MCP credentials or secret-bearing MCP config.

If the checklist includes MCP cases, they must use existing deterministic/local MCP fixtures unless explicitly marked as unsupported/manual future work.

## Preflight state check

Before coding, verify that Routes 01-06 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -14
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:release:deterministic

If Route 06 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 07.

## Reference comparison before writing

Before making project changes, perform a narrow read-only comparison against the two reference repositories.

Reference repositories, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume specific file paths exist.
Do not copy architecture wholesale.
Do not perform a broad audit.
Do not modify either reference repository.

Use rtk for searching and reading.

### Claude Code comparison

Search /home/wang/projects/source-claudecode using keywords related to:

- CLI interactive
- TTY
- slash command
- approval
- permission prompt
- tool result display
- edit result display
- stopped
- error display
- user-visible output
- resume
- continue
- compact
- manual test
- runbook

Focus only on how user-facing interactive flows, permission prompts, tool/edit results, stopped/error states, and resume/continue UX are surfaced.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- TUI
- CLI
- interactive
- permission
- approval
- tool output
- edit summary
- apply_patch result
- session output
- error display
- revert
- snapshot
- manual test
- runbook

Focus only on how user-facing terminal flows surface approval, edit/tool results, failures, and session state.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to Route 07 manual TTY checklist
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with search terms used.

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-mcp-local-execution.mjs
- scripts/verify-mcp-error-taxonomy.mjs
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/core/mcp/errorTaxonomy.ts

Reading these files is allowed. Modifying most of them is not allowed.

## Allowed modification scope

Prefer documentation-only changes.

Allowed:

- a new live TTY manual checklist document, preferably under:
  - docs/agent-routes/
  - docs/runbooks/
  - docs/manual-checks/
- RUNBOOK.md, only to link to or briefly summarize the manual checklist
- PROJECT_STATE.md, only if existing claims become inaccurate or need a narrow note
- package.json only if adding a non-default documentation/checklist helper is truly necessary
- a tiny deterministic checklist helper script only if it does not alter product behavior and does not become a default gate

Recommended primary output:

- docs/manual-checks/live-tty-limited-dogfood-checklist.md

or:

- docs/runbooks/live-tty-limited-dogfood.md

## Conditional allowed scope

Only if the checklist uncovers an obvious documentation mismatch, update docs narrowly.

Only if a tiny non-product helper improves repeatability, it may be added under scripts/, but it must:

- not alter product code
- not run by default
- not require real provider
- not require external MCP
- not claim product readiness
- not hide manual observation requirements

## Forbidden modification scope

Do not modify product behavior in:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If live TTY testing reveals a product bug requiring these files, stop and report it as a bug/backlog item. Do not fix it in Route 07 unless explicitly approved.

## Checklist target

The manual checklist should cover limited dogfood user-facing flows.

At minimum, include sections for:

1. Environment and safety preflight
2. Repository cleanliness and residue expectations
3. CLI startup / interactive mode
4. `--print` mode
5. stdin mode
6. slash command basics
7. `/continue` or resume/continue flow, if supported
8. approval / permission prompt behavior
9. successful selected-workspace mutation display
10. stopped unsupported mutation display
11. failed mutation display or post-write failure display, if deterministically available
12. local deterministic MCP success display
13. MCP failure taxonomy display, deterministic only
14. compact / long-session continuity evidence
15. result surface checks: success / stopped / error
16. changedFiles / failedFiles visibility
17. no rollback / no atomicity wording
18. real-provider optional smoke, explicit opt-in only
19. known unsupported capabilities
20. pass/fail recording template

## Manual checklist design requirements

The checklist must clearly distinguish:

- deterministic automated gates
- manual live TTY observations
- optional real-provider checks
- unsupported/backlog capabilities
- product claims vs evidence

Each checklist item should include:

- purpose
- command or manual action
- expected visible behavior
- pass/fail criteria
- what to record
- cleanup needed
- whether the step is required, optional, or opt-in real-provider only

## Required manual observation categories

The checklist should force the tester to record:

- command used
- mode: interactive / stdin / --print
- whether approval was requested
- whether approval was denied or allowed
- terminal outcome: success / stopped / error
- changedFiles
- failedFiles
- postWriteVerification when visible
- whether unsupported request was stopped
- whether any rollback/atomicity claim was shown
- whether any external MCP readiness claim was implied
- whether secrets or private config appeared
- residue generated and cleaned
- follow-up bug/backlog item if needed

## Required unsupported/backlog reminders

The checklist must explicitly remind the tester that the following remain unsupported or not claimed:

- broad/general release readiness
- arbitrary project mutation
- broad apply_patch
- 3+ file writes
- delete/move
- rollback/atomicity
- external/user-configured MCP readiness
- default real-provider release gate
- broad real-provider mutation readiness

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Manual TTY execution:

If feasible in the current environment, run a small subset of the checklist and record observed results.

If live TTY cannot be run safely or meaningfully by Codex, do not fake it. Instead:

- mark manual execution as not performed
- explain why
- ensure the checklist is actionable for a human
- rely on deterministic gates for validation only

Do not add manual TTY checks to default gates.

## Optional real-provider manual section

The checklist may include an optional real-provider section.

It must say:

- opt-in only
- do not read or print private config
- do not expose secrets
- not part of default release readiness
- not required for deterministic release
- record whether realProviderTouched=true
- clean residue after run

Do not run optional real-provider manual steps unless explicitly approved.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary CLI workspaces
- temporary TTY logs
- temporary MCP logs
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 07 is complete only if:

- a clear live TTY limited dogfood checklist/runbook exists
- checklist distinguishes deterministic gates, manual observations, and optional real-provider checks
- checklist includes pass/fail recording template
- checklist includes cleanup expectations
- checklist explicitly avoids broad/general release claims
- checklist explicitly says external MCP remains unsupported/not claimed
- checklist explicitly says manual TTY validation is not a default release gate
- existing deterministic gates still pass
- local MCP and MCP taxonomy gates still pass
- session durability long still passes
- candidate mutation and CLI evidence gates still pass
- result contract still passes
- build passes
- deterministic release gate still passes
- no forbidden product files were modified
- no secret or provider config is printed
- final report states whether live TTY was actually executed

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01/02/03/04/05/06 baseline is missing
- completing this route requires changing product CLI/session/runtime/orchestration code
- completing this route requires adding a default live TTY gate
- completing this route requires external MCP productization
- completing this route requires reading private provider or MCP config
- live TTY reveals a product bug requiring code changes
- deterministic release gate breaks for reasons unrelated to this route
- the only way to pass is to weaken existing guards or claims

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Checklist/runbook created
5. Files changed
6. Forbidden product files touched? yes/no
7. Capability expanded? yes/no
8. Default gates changed? yes/no
9. Live TTY actually executed? yes/no
10. Real provider touched? yes/no
11. External MCP server touched? yes/no
12. Secret exposure risk? yes/no
13. Manual checklist sections included
14. Pass/fail recording template included? yes/no
15. Unsupported/backlog reminders included? yes/no
16. Validation commands and results
17. Residue cleanup status
18. Claim/readiness changes
19. Residual risks
20. Recommended next route
21. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

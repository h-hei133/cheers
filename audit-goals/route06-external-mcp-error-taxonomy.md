# Route 06: external MCP config/error taxonomy

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Improve external/user-configured MCP configuration and error taxonomy without claiming external MCP readiness.

The project already has deterministic local MCP execution evidence. Route 06 must not reinterpret local MCP fixture success as external/user-configured MCP readiness.

The goal is to make MCP-related failures clearer, safer, and more user-understandable when external/user-configured MCP is missing, unavailable, rejected, misconfigured, or returns execution errors.

This route is about classification and result surface only.

## Current context

Routes 01-05 established:

- Route 01: opt-in real candidate mutation happy path evidence.
- Route 02: candidate mutation failure taxonomy.
- Route 03: two-file CLI/user-entry evidence.
- Route 04: mutation routing projection extraction.
- Route 05: compact continuity summary builder extraction.

Route 06 should continue the same pattern:

- bounded surface
- no capability expansion
- no default gate expansion
- failure classification over product claim expansion

## Non-goals

Do not add or claim:

- external MCP ready
- user-configured MCP ready
- broad MCP ecosystem support
- MCP marketplace / discovery
- MCP remote server support unless already present
- new default MCP release gate
- real-provider dependency
- broad/general release readiness

Do not rewrite MCP core architecture.
Do not rewrite tool execution architecture.
Do not rewrite permission architecture.
Do not rewrite CLI/session/runtime.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not weaken existing deterministic, local MCP, candidate, session, provider-readiness, result-contract, or release gates.
- Do not make external MCP part of default release verification.
- Do not make real-provider tests part of default release verification.
- Do not claim external MCP readiness.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 06 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, or private config contents.

If any test or helper unexpectedly requires real-provider access, stop and report.

## MCP safety constraints

Do not connect to arbitrary external MCP servers.

Do not run untrusted external commands.

Do not introduce a dependency on a user’s real MCP config.

Do not read private MCP credentials or secret-bearing MCP config.

Do not print environment variables, command arguments, tokens, headers, API keys, or private MCP config contents.

Any MCP config/error fixture must be synthetic, deterministic, and safe.

## Preflight state check

Before coding, verify that Routes 01-05 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -12
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:session-durability:long
- rtk npm run verify:release:deterministic

If Route 05 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 06.

## Reference comparison before coding

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

- MCP
- tool failure
- tool result
- tool error
- permission denied
- external tool
- unavailable tool
- rejected tool
- tool execution result
- failed tool result
- user-visible error
- session transcript
- compact tool result

Focus only on how external/tool execution failures are classified, surfaced, and preserved.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- MCP
- tool execution
- tool failure
- permission
- permission denied
- tool metadata
- output metadata
- failed tool
- user-visible error
- provider failure
- command failure
- external command

Focus only on how tool execution failures, permission failures, unavailable tools, command errors, and user-visible tool errors are classified and surfaced.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to Route 06 MCP error taxonomy
- ideas not applicable to this project
- confirmation that no reference architecture was copied wholesale

If relevant material is not found, report that honestly with the search terms used.

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- scripts/verify-mcp-local-execution.mjs
- scripts/verify-release-core.mjs
- scripts/verify-release-deterministic.mjs
- packages/ts-shell/src/core/mcp/*
- packages/ts-shell/src/core/tools/registry.ts
- packages/ts-shell/src/core/tools/toolLifecycleProjection.ts
- packages/ts-shell/src/core/tools/toolExecutionProvenance.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts

## Allowed modification scope

Prefer the narrowest possible changes.

Allowed:

- packages/ts-shell/src/core/mcp/*
- packages/ts-shell/src/core/tools/toolLifecycleProjection.ts
- packages/ts-shell/src/core/tools/toolExecutionProvenance.ts
- existing MCP verification helpers or fixtures
- scripts/verify-mcp-local-execution.mjs
- a new narrowly scoped deterministic MCP error-taxonomy verification script
- focused tests for MCP error taxonomy / projection / provenance
- package.json only to add a clearly named non-default verification script
- documentation only if existing claims become inaccurate

A new script is acceptable only if it:

- uses synthetic/deterministic MCP fixtures
- does not connect to arbitrary external MCP servers
- does not depend on real user MCP config
- does not become part of default release gates
- clearly distinguishes local deterministic MCP from external/user-configured MCP readiness

## Conditional allowed scope

Only if strictly necessary for result surface correctness, a narrow change may be made in:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts

If touching these files, explain why MCP-layer classification/projection was insufficient.

Do not use this permission to rewrite shell runtime or session behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- provider/auth core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP product implementation
- external MCP discovery / marketplace / remote server productization
- rollback / snapshot / revert behavior
- default release gate membership

Avoid modifying SessionManager.ts. If a session continuity edge requires it, stop and report first.

## Taxonomy target

Route 06 should establish or verify clear MCP failure classifications for deterministic fixtures.

At minimum, cover or explicitly justify why not covered:

1. external MCP not configured
2. MCP server command missing / spawn failure
3. MCP server unavailable / startup failure
4. MCP protocol handshake failure
5. MCP tool unavailable / unknown tool
6. MCP permission denied / rejected
7. MCP tool returns isError
8. MCP tool throws during execution
9. MCP stdio/process error
10. MCP timeout or cancellation, if an existing deterministic path exists
11. malformed MCP tool result
12. successful local deterministic MCP execution remains success

Use existing names if the repo already has MCP error categories. Do not create parallel terminology unnecessarily.

If new terminology is needed, keep it minimal and map it clearly to existing user-visible outcomes.

## Classification principles

MCP classification should distinguish:

- config problem
- server unavailable
- protocol failure
- permission denied / rejected
- tool unavailable
- tool execution error
- tool returned isError
- stdio/process failure
- timeout/cancelled
- malformed result
- success

Each classified failure should preserve enough safe evidence for users/developers to understand what happened, without leaking secrets or command env details.

Failures should not become success.

Local deterministic MCP success should not imply external MCP readiness.

## Result surface requirements

For each covered MCP scenario, the result surface should make clear:

- scenario name
- whether MCP execution was attempted
- whether a server process was started
- whether the tool was visible
- whether the tool was invoked
- whether permission was requested / denied / approved, if applicable
- classification
- terminal outcome: success / stopped / error
- whether the failure is user config, server availability, permission, tool-level, protocol-level, or unknown
- safe non-secret diagnostic details

Do not expose secrets, env values, headers, tokens, private paths, or full command strings if they contain sensitive data.

## Required Route 06 scenarios

At minimum, Route 06 should produce deterministic evidence for:

- local deterministic MCP success still passes
- MCP unavailable/config failure does not become success
- MCP rejection/permission denied does not become success
- MCP tool isError does not become success
- MCP stdio/process throw does not become success
- malformed/unknown MCP result is classified or explicitly unknown with safe evidence

If some scenario cannot be covered without invasive product changes, report it as a residual gap rather than forcing a broad implementation.

## Documentation/readiness requirements

Update docs only if necessary to keep claims accurate.

Allowed statements:

- local deterministic MCP execution has evidence
- MCP failure taxonomy/provenance improved
- external/user-configured MCP remains unsupported or not claimed
- external MCP readiness is not part of default release readiness

Forbidden statements:

- external MCP ready
- user-configured MCP ready
- MCP ecosystem ready
- broad tool ecosystem ready
- remote MCP ready
- MCP production ready

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell

After changes:

- rtk npm run verify:mcp:local-execution
- run any new Route 06 MCP error taxonomy verification command
- run any focused MCP tests added by this route
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Optional:

- If package.json has a broader MCP routing or MCP provenance verification script, run it too.
- Do not run real-provider mutation unless explicitly needed and approved.
- Do not run arbitrary external MCP servers.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary MCP workspaces
- temporary MCP logs
- temporary MCP server fixtures
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 06 is complete only if:

- MCP failure taxonomy/provenance is clearer than before
- local deterministic MCP success still passes
- MCP unavailable/config failure does not become success
- MCP rejection/permission denied does not become success
- MCP tool isError does not become success
- MCP stdio/process throw does not become success
- malformed/unknown MCP result is classified or explicitly unknown with safe evidence
- no external/user-configured MCP readiness claim is introduced
- no external MCP product capability is added
- no default gate requires external MCP or real provider access
- session durability long still passes
- candidate mutation suite still passes
- Route 02 taxonomy self-test still passes
- Route 03 CLI evidence gate still passes
- MVP suite still passes
- result contract still passes
- provider readiness default behavior remains safe
- provider readiness classification self-test passes
- build passes
- deterministic release gate still passes
- no forbidden files were modified
- no secret or provider config is printed
- final report states whether real provider or external MCP was touched

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01/02/03/04/05 baseline is missing
- completing this route requires changing cli.tsx or runMvpIntegratedFlow.ts
- completing this route requires rewriting MCP architecture
- completing this route requires external MCP productization
- completing this route requires arbitrary external MCP server execution
- completing this route requires reading private provider or MCP config
- deterministic release gate breaks for reasons unrelated to this route
- the only way to pass is to weaken existing guards or claims
- the only way to cover a scenario is invasive product-flow rewrite

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. MCP taxonomy seam chosen
5. Files changed
6. Forbidden files touched? yes/no
7. Capability expanded? yes/no
8. External MCP readiness claimed? yes/no
9. Default gates changed? yes/no
10. Real provider touched? yes/no
11. External MCP server touched? yes/no
12. Secret exposure risk? yes/no
13. Covered MCP scenarios
14. Classification table
15. Success vs stopped/error evidence
16. Local deterministic MCP evidence
17. External/user-configured MCP residual gap
18. Focused tests or verification added
19. Validation commands and results
20. Residue cleanup status
21. Claim/readiness changes
22. Residual risks
23. Recommended next route
24. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

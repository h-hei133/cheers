# Route 09: release docs and allowed claims audit

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Audit and update release/readiness documentation and allowed claims after Routes 01-08, without changing product behavior or expanding release claims beyond the evidence.

Routes 01-08 produced new bounded evidence:

- Route 01: opt-in real candidate mutation happy path passed for selected-workspace single-file update, single-file create, and exactly-two-file update.
- Route 02: candidate mutation failure taxonomy stabilized; unsupported/post-write failures are stopped, not success.
- Route 03: deterministic CLI/user-entry two-file evidence added.
- Route 04: mutation routing projection helper extracted.
- Route 05: compact continuity summary builder extracted.
- Route 06: MCP error taxonomy improved without claiming external MCP readiness.
- Route 07: live TTY limited dogfood manual checklist created; manual-only, not a default gate.
- Route 08: unsupported patch E2E verifier added for real-model-like unsupported output shapes.

Route 09 must synchronize documentation and claim surfaces with this evidence while keeping unsupported/backlog boundaries explicit.

## Core principle

Do not make claims stronger than the evidence.

The goal is not to make the project sound more ready.
The goal is to make the project state more accurate.

## Allowed high-level claims

Allowed, if supported by existing validation:

- limited dogfood ready
- deterministic release-candidate gate green
- deterministic release gate covers bounded selected-workspace candidate mutation evidence
- candidate mutation has synthetic green evidence
- opt-in real candidate mutation happy path passed for bounded selected-workspace single update/create/two-file update
- deterministic failure taxonomy covers candidate mutation failure classes
- deterministic CLI/user-entry two-file evidence exists
- unsupported real-model-like patch outputs are stopped/error, not success
- local deterministic MCP execution has evidence
- MCP error taxonomy/provenance improved
- live TTY checklist exists for manual limited dogfood validation
- mutation routing and compact summary extraction reduced localized architecture risk without expanding capability

## Forbidden claims

Do not claim:

- broad/general release ready
- arbitrary project mutation ready
- broad apply_patch ready
- 3+ file mutation ready
- delete/move ready
- rollback ready
- atomic multi-file recovery ready
- external/user-configured MCP ready
- MCP ecosystem ready
- remote MCP ready
- real-provider default gate ready
- broad real-provider mutation ready
- true real-model unsupported patch coverage if only real-model-like deterministic evidence exists
- live TTY product ready if only a manual checklist exists
- Claude Code / opencode parity

## Non-goals

Do not:

- add product capability
- add or remove release gates
- add real-provider tests to default gates
- add external MCP to default gates
- rewrite verification scripts except claim text/reporting strings if necessary
- modify CLI/session/runtime/orchestration behavior
- modify mutation lanes
- modify provider/MCP core behavior
- run arbitrary external MCP servers
- read private provider or MCP config

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This is primarily a documentation and claim-surface audit.
- Do not weaken existing deterministic, candidate, session, MCP, provider-readiness, result-contract, or release gates.
- Do not make real-provider tests part of default release verification.
- Do not make manual live TTY validation part of default release verification.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 09 should not require real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Real provider checks, if any, must remain explicit opt-in and not be added to default gates.

## Preflight state check

Before editing, verify that Routes 01-08 are present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -20
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:release:deterministic

If Route 08 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 09.

## Reference comparison before editing

Before making changes, perform a narrow read-only comparison against the two reference repositories.

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

- release
- readiness
- limitations
- unsupported
- known limitations
- real provider
- MCP
- file edit
- apply patch
- rollback
- manual test
- dogfood
- verification

Focus only on how documentation or user-facing status describes supported vs unsupported capabilities.

Read at most 3-5 of the most relevant files or snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- release
- readiness
- limitations
- unsupported
- known limitations
- MCP
- apply_patch
- edit
- rollback
- snapshot
- verification
- manual test

Focus only on how supported/unsupported capability boundaries are documented.

Read at most 3-5 of the most relevant files or snippets.

### Comparison output requirement

Keep notes for the final report:

- search terms used
- files or snippets inspected
- ideas relevant to allowed-claims discipline
- ideas not applicable to this project
- confirmation that no reference architecture or claim style was copied wholesale

If relevant material is not found, report that honestly with search terms used.

## Required target reading

Read these before editing:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/manual-checks/live-tty-limited-dogfood-checklist.md
- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-mcp-local-execution.mjs
- scripts/verify-mcp-error-taxonomy.mjs
- scripts/verify-session-durability-long.mjs

Also inspect any existing docs or notes that mention:

- release readiness
- dogfood readiness
- deterministic release
- candidate mutation
- real provider
- MCP
- external MCP
- unsupported mutation
- broad apply_patch
- rollback
- live TTY
- manual checklist

Search for terms:

- broad
- general release
- release ready
- dogfood
- deterministic
- candidate mutation
- real provider
- real-provider
- MCP
- external MCP
- apply_patch
- rollback
- 3+
- delete
- move
- unsupported
- live TTY
- manual

## Allowed modification scope

Prefer docs-only changes.

Allowed:

- PROJECT_STATE.md
- RUNBOOK.md
- docs/manual-checks/live-tty-limited-dogfood-checklist.md
- docs/agent-routes/ only if route specs are intentionally tracked and need claim wording cleanup
- other existing documentation files that contain readiness/claim text
- package.json only if script descriptions or names are misleading; do not change gate membership
- verification scripts only for printed claim wording/report labels, not behavior or gate membership

Recommended primary outputs:

- update current readiness section
- update allowed claims / forbidden claims section
- update route evidence summary
- update unsupported/backlog list
- update deterministic release gate interpretation
- update manual TTY checklist references
- clarify external MCP remains not claimed
- clarify real-provider paths remain opt-in

## Conditional allowed scope

Only if a verification script prints stale or misleading readiness claims, make a narrow text-only adjustment in:

- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-mcp-local-execution.mjs
- scripts/verify-mcp-error-taxonomy.mjs

If touching scripts, explain why docs-only changes were insufficient.

Do not alter command behavior, gate membership, validation logic, or exit criteria in Route 09.

## Forbidden modification scope

Do not modify product behavior in:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/mcp/*
- packages/ts-shell/src/orchestration/*
- provider/auth core behavior
- MCP core behavior
- mutation lane capability limits
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership

If claim audit reveals product behavior is wrong, stop and report a bug/backlog item. Do not fix product behavior in Route 09.

## Required audit checklist

Route 09 must explicitly audit and, if needed, update these claim areas:

1. Current phase
   - limited dogfood ready
   - deterministic release-candidate green
   - not broad/general release ready

2. Candidate mutation
   - synthetic green
   - opt-in real happy path green for selected-workspace single update/create/two-file update
   - failure taxonomy guarded
   - unsupported patch E2E verifier covers real-model-like outputs
   - still not broad mutation readiness

3. CLI/user-entry evidence
   - deterministic two-file CLI evidence exists
   - live TTY checklist exists but has not necessarily been human-executed
   - live TTY checklist is not a default gate

4. Session/compact
   - session durability long evidence exists
   - compact continuity summary builder extracted
   - still not proof of arbitrary long real-provider sessions

5. MCP
   - local deterministic MCP execution evidence exists
   - MCP error taxonomy exists
   - external/user-configured MCP remains unsupported/not claimed

6. Real provider
   - default real-provider readiness remains skip/safe
   - opt-in real candidate happy path evidence exists
   - real provider remains non-default
   - no default gate requires real provider

7. Unsupported/backlog
   - broad apply_patch
   - 3+ file writes
   - delete/move
   - rollback/atomicity
   - arbitrary project mutation
   - external MCP
   - broad/general release

8. Architecture status
   - mutation routing projection extracted
   - compact summary builder extracted
   - large-file risk reduced but not eliminated
   - no claim of architectural maturity parity with Claude Code/opencode

9. Verification interpretation
   - deterministic release gate is a bounded release-candidate proof
   - synthetic/focused gates are valuable but not broad release proof
   - optional real-provider checks are not default gate proof
   - manual checklist is manual evidence, not automated proof

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
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
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
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

Do not run opt-in real-provider full execution unless explicitly approved. Route 09 should not require it.

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary release audit files
- temporary /tmp/private-agents-test directories created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Success criteria

Route 09 is complete only if:

- readiness docs reflect Routes 01-08 evidence accurately
- allowed claims are explicit
- forbidden claims are explicit
- deterministic release gate is described as bounded, not broad proof
- real-provider evidence is described as opt-in, not default
- external/user-configured MCP remains unsupported/not claimed
- live TTY checklist is described as manual-only and not a default gate
- unsupported/backlog capability list remains visible
- no product behavior was changed
- no default gate membership was changed
- all required validation commands pass
- no forbidden product files were modified
- no secret or provider config is printed
- final report states whether real provider was touched

## Stop conditions

Stop and report instead of forcing progress if:

- Route 01-08 baseline is missing
- completing this route requires changing product code
- completing this route requires changing default gate membership
- completing this route requires running real-provider full execution
- docs contain a claim conflict that requires product-direction input
- deterministic release gate breaks for reasons unrelated to this route
- the only way to make docs consistent is to overstate readiness

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Claim surfaces audited
5. Files changed
6. Product code touched? yes/no
7. Capability expanded? yes/no
8. Default gates changed? yes/no
9. Real provider touched? yes/no
10. Secret exposure risk? yes/no
11. Allowed claims after Route 09
12. Forbidden claims after Route 09
13. Unsupported/backlog list after Route 09
14. Deterministic release interpretation
15. Real-provider interpretation
16. MCP interpretation
17. Live TTY interpretation
18. Validation commands and results
19. Residue cleanup status
20. Claim/readiness changes
21. Residual risks
22. Recommended next route
23. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

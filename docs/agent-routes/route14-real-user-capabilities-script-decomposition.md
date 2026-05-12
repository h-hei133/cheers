# Route 14: real-user-capabilities script decomposition

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Decompose `scripts/verify-real-user-capabilities.mjs` into focused script-support modules for candidate mutation scenarios, classification, and report helpers, while preserving behavior exactly.

This route must reduce verification-script maintainability risk without changing product behavior, verifier semantics, release gates, opt-in real-provider boundaries, or readiness claims.

Route 13 recommended this because `scripts/verify-real-user-capabilities.mjs` now owns many scenario families and can become a readiness-claim mixing point.

## Current context

Routes 01-13 established:

- candidate mutation happy path evidence
- real-provider opt-in happy path evidence
- candidate failure taxonomy
- two-file CLI evidence
- unsupported patch E2E verifier
- exactly-three planning/no-write verifier
- planned-files continuity verifier
- release/readiness claim audit
- Routes 01-12 closeout audit

Route 14 should not add new scenario capability.
Route 14 should only improve script structure.

## Non-goals

Do not add:

- new mutation capability
- new product behavior
- new default release gate membership
- new real-provider default checks
- new external MCP behavior
- new broad/general release claim
- new 3-file write support
- new broad apply_patch support
- new delete/move support
- rollback or atomicity

Do not rewrite the whole verifier.
Do not change output contracts unless preserving existing markers requires moving code.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This is a behavior-preserving decomposition.
- Preserve all existing public CLI flags of `scripts/verify-real-user-capabilities.mjs`.
- Preserve all existing output markers relied on by release/deterministic gates.
- Preserve all existing JSON/report fields unless explicitly proven dead and not used; prefer no removals.
- Preserve all exit codes.
- Preserve redaction behavior.
- Preserve real-provider opt-in behavior.
- Preserve dry-run behavior.
- Preserve dirty-repo guard behavior.
- Preserve default gate behavior.
- Do not make real-provider execution part of default release verification.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 14 should not require full real-provider execution.

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

## Preflight state check

Before coding, verify that Route 13 is present and the repo is in a good state.

Run:

- rtk git status --short --branch
- rtk git log --oneline -35
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:release:deterministic

If Route 13 is not committed or baseline gates fail for unrelated reasons, stop and report instead of starting Route 14.

## Reference comparison before coding

Before making changes, perform a narrow read-only comparison against the two reference repositories only for script organization lessons.

Reference repositories, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume specific paths exist.
Do not copy architecture wholesale.
Do not perform a broad audit.
Do not modify either reference repository.

Use rtk for searching and reading.

Search keywords:

- verify
- test gate
- scenario
- fixture
- reporter
- classification
- capability
- smoke
- real provider
- dry run
- redaction

Focus only on how verification/gate code separates scenario data, execution helpers, and reporting.

Read at most 3 relevant files/snippets per repo.

Record:

- search terms used
- inspected files/snippets
- relevant organization idea
- what is not applicable
- confirmation no reference code/architecture was copied

## Required target reading

Read these before changes:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/audits/routes-01-12-closeout.md
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs
- scripts/verify-planned-files-continuity.mjs
- scripts/verify-mcp-error-taxonomy.mjs

Search in `scripts/verify-real-user-capabilities.mjs` for:

- candidate-mutation
- failure taxonomy
- Route01Class
- Route02Class
- Route08Class
- three-file-planning-no-write
- planned-files-continuity
- include-real
- dry-run
- realProviderTouched
- candidateMutationRealExecuted
- redaction
- dirty
- report
- scenario

## Allowed modification scope

Allowed:

- scripts/verify-real-user-capabilities.mjs
- new support modules under a focused script-support directory, for example:
  - scripts/real-user-capabilities/
  - scripts/real-user-capabilities/candidateMutationScenarios.mjs
  - scripts/real-user-capabilities/candidateMutationReport.mjs
  - scripts/real-user-capabilities/candidateMutationClassification.mjs
  - scripts/real-user-capabilities/redaction.mjs
- tests or self-tests only if required to prove behavior preservation
- package.json only if adding a non-default script to validate decomposition; avoid unless necessary
- docs only if claim text becomes stale

Prefer extracting one or two coherent seams rather than many tiny modules.

Best candidate seams:

1. candidate mutation scenario definitions
2. failure classification helpers
3. candidate mutation report formatting helpers
4. safe redaction/report utilities

Do not extract unrelated MVP, MCP, provider readiness, or release meta logic in this route unless it is tightly coupled to candidate mutation report behavior.

## Conditional allowed scope

Only if strictly necessary for verification reuse, a small helper may be added under:

- scripts/lib/
- scripts/support/

But prefer a route-specific support directory to avoid implying a broad framework.

## Forbidden modification scope

Do not modify product behavior in:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- default release gate membership

Do not change:

- package default release scripts
- release deterministic membership
- release core membership
- real-provider opt-in behavior
- dry-run semantics
- dirty repo guard semantics
- output marker names
- report field names
- redaction rules

If behavior preservation requires touching forbidden product files, stop and report.

## Required behavior preservation targets

After decomposition, all of the following must behave the same:

- `verify:real-user-capabilities -- --suite=candidate-mutation`
- `verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test`
- `verify:real-user-capabilities:two-file-cli-evidence`
- `verify:real-user-capabilities:unsupported-patch-e2e`
- `verify:real-user-capabilities:three-file-planning-no-write`
- `verify:real-user-capabilities:planned-files-continuity`
- `verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run`
- `verify:real-user-capabilities -- --tier=mvp`
- `verify:release:deterministic`

Preserve these kinds of outputs:

- scenario names
- classifications
- outcome names
- changedFiles / failedFiles / plannedFiles fields
- realProviderTouched
- candidateMutationRealExecuted
- include-real dry-run markers
- secret-safe provider diagnostics
- default skip markers
- unsupported/no-write evidence markers
- exit code behavior

## Suggested extraction approach

Use a small-step approach:

1. Add a support directory.
2. Move pure constants/scenario definitions first.
3. Move pure classification helper functions second.
4. Move pure report formatting helpers only if low risk.
5. Keep orchestration and command parsing in the main script.
6. Run focused validation after each meaningful extraction.
7. Avoid broad style cleanup.

Do not convert the script to a new framework.
Do not rename every function.
Do not reformat unrelated blocks.

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run

Baseline:

- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

After changes:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --tier=mvp
- rtk npm run verify:provider-readiness:real
- rtk npm run verify:provider-readiness:real -- --classification-self-test
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Do not run full opt-in real-provider execution unless explicitly approved.

## Optional behavior comparison

If feasible, capture safe non-secret before/after output snippets for the key candidate mutation commands and compare:

- scenario names unchanged
- markers unchanged
- exit codes unchanged
- classification labels unchanged
- no new secret output

Do not store large logs in the repo.

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

Route 14 is complete only if:

- `scripts/verify-real-user-capabilities.mjs` is smaller or has clearly delegated a focused responsibility
- at least one coherent candidate-mutation-related support module exists
- behavior is preserved
- all relevant CLI flags still work
- output markers and report fields are preserved
- exit codes are preserved
- redaction behavior is preserved
- real-provider opt-in and dry-run behavior are preserved
- no product code was modified
- no default gate changed
- no capability expanded
- all required validation passes
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- Route 13 baseline is missing
- decomposition requires product code changes
- decomposition risks changing output markers or exit codes
- decomposition risks weakening redaction
- decomposition risks changing real-provider opt-in boundaries
- release deterministic fails for unrelated reasons
- the only safe extraction would be too large for one route
- the script structure is too entangled to extract safely in this route

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Reference comparison summary
4. Extraction seam chosen
5. Files changed
6. Product code touched? yes/no
7. Capability expanded? yes/no
8. Default gates changed? yes/no
9. Real provider touched? yes/no
10. Secret exposure risk? yes/no
11. Support modules added
12. Main script responsibility reduced
13. Flags preserved
14. Output markers/report fields preserved
15. Exit codes preserved
16. Redaction/opt-in behavior preserved
17. Validation commands and results
18. Residue cleanup status
19. Claim/readiness changes
20. Residual risks
21. Recommended next route
22. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

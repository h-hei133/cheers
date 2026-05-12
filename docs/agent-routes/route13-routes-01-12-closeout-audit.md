# Route 13: Routes 01-12 closeout audit

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Perform a read-first closeout audit after Routes 01-12.

The goal is to determine the current true project state after the recent route sequence, verify that claims match evidence, identify any regressions or claim drift, and recommend the next bounded surface.

This route should not implement new capability.

## Context

Routes 01-12 reportedly established:

- Route 01: opt-in real candidate mutation happy path passed.
- Route 02: candidate mutation failure taxonomy stabilized.
- Route 03: deterministic two-file CLI/user-entry evidence added.
- Route 04: mutation routing projection helper extracted.
- Route 05: compact continuity summary builder extracted.
- Route 06: MCP error taxonomy improved without external MCP readiness claims.
- Route 07: live TTY limited dogfood manual checklist created.
- Route 08: unsupported patch E2E verifier added for real-model-like unsupported outputs.
- Route 09: release/readiness claims audited.
- Route 10: three-file planning/no-write evaluated.
- Route 11: exactly-three existing-file Update File planning/no-write added as stopped/no-write.
- Route 12: planned-files stopped/no-write continuity added.

Route 13 must verify whether those claims remain true in the repo.

## Core questions

Answer directly:

1. Are Routes 01-12 actually closed?
2. Did any route accidentally widen capability?
3. Did any default gate change unexpectedly?
4. Are docs and verifier outputs aligned?
5. Is the project still limited dogfood / deterministic release-candidate, not broad release?
6. Are real-provider checks still opt-in?
7. Is external/user-configured MCP still not claimed?
8. Are 3-file writes still unsupported?
9. Are plannedFiles clearly distinct from changedFiles?
10. What is the next best bounded surface?

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- This is primarily an audit route.
- Do not implement product capability.
- Do not change mutation support.
- Do not change default gate membership.
- Do not add real-provider checks to default gates.
- Do not claim broad/general release readiness.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 13 should not require full real-provider execution.

Real provider config exists under:

- /home/wang/.private-agents-real/provider.env

Never read, print, copy, grep, parse, modify, or summarize any file under:

- /home/wang/.private-agents-real

Never print secrets, API keys, provider env values, provider env contents, private config contents, or secret-bearing command lines.

Allowed real-provider-related checks:

- default skip/readiness checks
- classification self-test
- dry-run / listing checks

Do not run full opt-in real-provider execution unless the user explicitly approves it.

## Reference comparison

Do a very narrow read-only comparison only if needed to judge next surface.

Reference repos, read-only:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume specific paths.
Use keyword search.
Read at most 3 relevant snippets/files per repo.

Useful keywords:

- planning
- no write
- failed tool result
- changed files
- failed files
- compact
- resume
- apply_patch failure
- MCP failure
- live TTY
- manual test
- release readiness
- unsupported

Do not copy architecture.

## Required target reading

Read:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/design/three-file-planning-no-write-evaluation.md
- docs/manual-checks/live-tty-limited-dogfood-checklist.md
- scripts/verify-real-user-capabilities.mjs
- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs
- scripts/verify-mcp-local-execution.mjs
- scripts/verify-mcp-error-taxonomy.mjs
- scripts/verify-planned-files-continuity.mjs
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/core/mcp/errorTaxonomy.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts

## Allowed modification scope

Prefer no code changes.

Allowed:

- PROJECT_STATE.md
- RUNBOOK.md
- docs/design/
- docs/manual-checks/
- docs/agent-routes/
- a new closeout audit document, preferably:
  - docs/audits/routes-01-12-closeout.md

Only update docs if current docs are stale, incomplete, or misleading.

Do not change product code in this route.

## Forbidden modification scope

Do not modify product behavior in:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/mcp/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/core/query/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- default release gate membership

If the audit finds a product bug, document it as a next-route candidate. Do not fix it here.

## Required verification

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk git log --oneline -35

Core route evidence:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy

Safety/readiness:

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

## Audit checklist

Verify and report:

1. Route closeout table
   - Route number
   - Claimed outcome
   - Evidence command
   - Current pass/fail
   - Remaining limitation

2. Default gate audit
   - Did release deterministic change?
   - Did release core change?
   - Did any opt-in real-provider command become default?
   - Did any manual/live TTY step become default?

3. Capability boundary audit
   - single-file update
   - single-file create
   - exactly-two update
   - exactly-three planning/no-write
   - 3-file write
   - 3+ files
   - delete/move
   - broad apply_patch
   - rollback/atomicity

4. Result surface audit
   - success
   - stopped
   - error
   - unsupported
   - model-output
   - post-write
   - plannedFiles vs changedFiles

5. Session/compact audit
   - stopped result continuity
   - mutation compact continuity
   - planned-files continuity
   - long-session durability

6. MCP audit
   - local deterministic MCP
   - MCP error taxonomy
   - external/user-configured MCP claim status

7. Real-provider audit
   - default skip safety
   - opt-in status
   - dry-run behavior
   - last known opt-in happy-path evidence
   - what is not claimed

8. Documentation audit
   - PROJECT_STATE.md
   - RUNBOOK.md
   - manual checklist
   - design/evaluation docs
   - any stale or overbroad wording

9. Architecture debt audit
   - runMvpIntegratedFlow.ts status
   - SessionManager.ts status
   - verification script growth
   - new helper/projection files
   - whether route work reduced or shifted risk

10. Next-route recommendation
   - one recommended bounded surface
   - why now
   - allowed scope
   - forbidden scope
   - validation
   - success/failure criteria

## Success criteria

Route 13 is complete only if:

- current status of Routes 01-12 is verified
- validation commands pass or failures are clearly classified
- docs are confirmed accurate or updated narrowly
- no product code is modified
- no default gate is changed
- no capability is expanded
- no broad/general release claim is introduced
- no external MCP readiness claim is introduced
- no real-provider default readiness claim is introduced
- next bounded surface is recommended with concrete boundaries

## Stop conditions

Stop and report if:

- repo is dirty with unrelated changes
- required Route 01-12 evidence is missing
- verification failures suggest product regression
- audit reveals claim conflict requiring product-direction input
- completing the route would require product code changes
- completing the route would require real-provider full execution
- deterministic release fails for unrelated reasons

## Residue cleanup

Clean audit/history/runtime residue before final report when safe, including:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary /tmp/private-agents-test files created by this route

If residue cannot be cleaned, report:

- path
- why it exists
- why it cannot be safely removed
- whether it contains secrets
- whether it should be gitignored or manually removed

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Files changed
4. Product code touched? yes/no
5. Capability expanded? yes/no
6. Default gates changed? yes/no
7. Real provider touched? yes/no
8. External MCP touched? yes/no
9. Secret exposure risk? yes/no
10. Route 01-12 closeout table
11. Current readiness classification
12. Current allowed claims
13. Current forbidden claims
14. Default gate audit
15. Capability boundary audit
16. Result surface audit
17. Session/compact audit
18. MCP audit
19. Real-provider audit
20. Architecture debt audit
21. Verification commands and results
22. Residue cleanup status
23. Claim/doc changes
24. Residual risks
25. Recommended next bounded surface
26. Proposed commit message, if docs changed

## Commit and push policy

After final report, propose a commit message only if docs changed.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

# Route 23: session replay builder extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the SessionManager maintainability batch by extracting replay transcript / resume replay input construction from:

- packages/ts-shell/src/session/SessionManager.ts

into a focused module:

- packages/ts-shell/src/session/sessionReplayBuilder.ts

This must be a behavior-preserving extraction.

The goal is to migrate replay construction / projection responsibility out of `SessionManager.ts` while preserving:

- session schema
- history DB schema
- persistence behavior
- replay ordering
- current session selection
- project binding
- compact trigger behavior
- compact retention behavior
- CLI `/continue` behavior
- default gates

This route must not implement new session capability.

## Current context

Recent SessionManager extractions:

- Route 21:
  - sessionResumeContextBuilder.ts

- Route 22:
  - sessionContinuityTypes.ts
  - compactRetentionPlanner.ts
  - mutationContinuityState.ts

Route 23 should continue the same direction by extracting replay construction, but must not touch persistence or schema.

## Non-goals

Do not add or change:

- session schema
- history DB schema
- session persistence writes
- session loading semantics
- current session selection
- project binding semantics
- replay ordering semantics
- compact trigger policy
- compact retention semantics
- CLI behavior
- `/continue` command behavior
- provider behavior
- tool/MCP behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not rewrite `SessionManager.ts`.
Do not extract persistence in this route.
Do not extract project binding in this route.
Do not extract compact trigger logic in this route.
Do not change replay ordering.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve session schema.
- Preserve history DB schema.
- Preserve replay order.
- Preserve compact trigger behavior.
- Preserve current session/project binding.
- Preserve stopped/no-write continuity.
- Preserve plannedFiles vs changedFiles semantics.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 23 should not require full real-provider execution.

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
- docs/design/runtime-architecture-extraction-plan.md
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/sessionContinuityTypes.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/compactRetentionPlanner.ts
- packages/ts-shell/src/session/mutationContinuityState.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- package.json

Then produce a short internal migration inventory before coding:

1. Which replay transcript / replay context construction still lives in `SessionManager.ts`.
2. Which replay-related logic is pure construction/projection and safe to move.
3. Which replay-related logic is persistence/loading/current-session control and must stay.
4. Which compact-aware replay inputs can be delegated without changing compact trigger or retention behavior.
5. Which focused tests can prove behavior preservation.

If the ownership map does not identify replay builder extraction as a SessionManager priority, stop and report the mismatch.

## Preflight state check

Before coding, verify Route 22 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -75
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 22 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `SessionManager.ts`, identify logic that builds replay or resume input, including some or all of:

- replay transcript construction
- replay message filtering / projection
- replay context construction for follow-up turns
- compact-aware replay input preparation
- stopped-session replay context projection
- recent action / lastActionResult replay handoff
- mutation continuity replay context
- plannedFiles stopped/no-write replay context
- safe replay summary text or metadata
- boundary-only replay snapshot projection

The new module should own only replay construction/projection.

It must not own:

- session file writes
- history DB writes
- session loading
- current session selection
- project binding
- locks
- recovery snapshot loading
- compact trigger decisions
- compact retention decisions
- provider calls
- CLI behavior
- mutation execution
- approval lifecycle

## Desired module

Create:

- packages/ts-shell/src/session/sessionReplayBuilder.ts

Possible exported functions may include:

- `buildSessionReplay`
- `buildReplayTranscript`
- `buildResumeReplayInput`
- `projectReplayMessages`
- `buildCompactAwareReplayInput`
- `buildStoppedReplayContext`

Choose names based on the actual seam found.

The module should be pure or mostly pure.

Preferred properties:

- explicit inputs
- explicit outputs
- no filesystem writes
- no history DB access
- no session loading
- no provider calls
- no CLI side effects
- no mutation writes
- no access to process.env

## Allowed modification scope

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
  - only to delegate replay construction/projection to the new module
  - no schema rewrite
  - no persistence rewrite
  - no replay ordering behavior change
  - no compact trigger change
- packages/ts-shell/src/session/sessionReplayBuilder.ts
- packages/ts-shell/src/session/sessionReplayBuilder.test.ts
- packages/ts-shell/src/session/sessionContinuityTypes.ts
  - only for shared type reuse if necessary
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
  - only if needed to reuse existing resume context projections
- packages/ts-shell/src/session/compactRetentionPlanner.ts
  - only if needed for type sharing or pure input construction
- packages/ts-shell/src/session/mutationContinuityState.ts
  - only if needed for pure replay context reuse
- existing focused tests only if imports or behavior-preserving expectations require narrow updates

Allowed test additions:

- focused tests for replay transcript construction
- replay ordering preservation
- compact-aware replay input projection
- stopped-session replay context
- plannedFiles vs changedFiles replay context
- mutation continuity replay context

## Conditional allowed scope

Only if strictly necessary for type boundaries:

- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts

If touching these files, explain why the extraction could not stay within session modules.

Do not use this permission to change behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/core/mcp/*
- provider/auth core behavior
- MCP core behavior
- mutation lane write capability limits
- session storage schema
- history DB schema
- broad apply_patch implementation
- external MCP implementation
- rollback / snapshot / revert behavior
- default release gate membership
- package.json
- scripts/*

If completing this route requires touching forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

- replay transcript content
- replay ordering
- `/continue` or resume context behavior currently covered by tests/gates
- stopped-session continuity
- mutation compact continuity
- compact summary content
- compact retention behavior
- plannedFiles stopped/no-write continuity
- changedFiles / failedFiles / plannedFiles distinctions
- long-session durability
- session reload/follow-up behavior
- result contract
- deterministic release meta gate

Preserve:

- session schema
- history DB schema
- persistence behavior
- replay order
- compact trigger behavior
- compact retention behavior
- current session semantics
- project binding semantics
- stopped/no-write wording unless explicitly justified
- plannedFiles not changedFiles
- last action result seed semantics
- exit codes
- default gates

## Migration quality bar

A successful Route 23 should:

- move coherent replay construction/projection responsibility out of `SessionManager.ts`
- create a named module with clear ownership
- add focused tests for replay builder behavior
- make future replay/resume context changes possible without editing the giant session file
- preserve behavior through local, batch, and full validation

Do not move only one or two trivial formatting strings.
Do not move persistence or schema behavior.
Do not move session loading/control flow.
Do not use line-count reduction as the main success metric.

## Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If the focused test file is not added because no safe focused unit seam exists, explain why and rely on integration gates. But prefer adding focused tests.

## Batch validation

Run:

- rtk npm run test -w packages/ts-shell -- src/session/compactContinuitySummary.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If any listed test does not exist, inspect package.json/filesystem, report it, and run closest equivalent.

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
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

- session durability long
- planned-files continuity
- mutation compact continuity
- release deterministic summary

Compare:

- replay ordering unchanged
- stopped/no-write context unchanged
- plannedFiles not changedFiles
- last action result seed semantics unchanged
- compact/reload/follow-up context unchanged
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

Route 23 is complete only if:

- `sessionReplayBuilder.ts` exists and owns coherent replay construction/projection responsibility
- `SessionManager.ts` delegates that responsibility to the new module
- behavior is preserved
- focused tests exist or a clear reason is given why integration evidence is the only safe validation
- session schema is unchanged
- history DB schema is unchanged
- persistence behavior is unchanged
- replay order is unchanged
- compact trigger behavior is unchanged
- compact retention behavior is unchanged
- current session/project binding is unchanged
- plannedFiles / changedFiles semantics are preserved
- stopped/no-write continuity is preserved
- no provider/tool/mutation/CLI behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- Route 22 baseline is missing
- extraction requires touching cli.tsx or runMvpIntegratedFlow.ts
- extraction requires changing session schema
- extraction requires changing history DB schema
- extraction requires changing persistence behavior
- extraction requires changing replay order
- extraction requires changing current session/project binding
- extraction requires changing compact trigger policy
- extraction risks changing plannedFiles/changedFiles semantics
- extraction risks changing `/continue` behavior without focused evidence
- release deterministic fails for unrelated reasons
- replay construction seam is indistinguishable from persistence/loading control flow
- the only safe extraction is too small to justify the route

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding migration inventory
5. Extraction seam chosen
6. Files changed
7. Forbidden files touched? yes/no
8. Product behavior changed? yes/no
9. Capability expanded? yes/no
10. Default gates changed? yes/no
11. Real provider touched? yes/no
12. Secret exposure risk? yes/no
13. New module and responsibility
14. SessionManager responsibilities retained
15. SessionManager responsibilities migrated
16. Focused tests added/reused
17. replay ordering preservation evidence
18. plannedFiles/changedFiles preservation evidence
19. stopped/resume/continue preservation evidence
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

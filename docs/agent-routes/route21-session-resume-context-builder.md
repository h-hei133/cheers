# Route 21: session resume context builder extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Begin the SessionManager runtime maintainability batch by extracting resume / continue / stopped-session context construction from:

- packages/ts-shell/src/session/SessionManager.ts

into a focused module:

- packages/ts-shell/src/session/sessionResumeContextBuilder.ts

This must be a behavior-preserving extraction.

The goal is to migrate context-building / projection responsibility out of `SessionManager.ts`, while preserving session schema, persistence, replay order, compact trigger behavior, current session selection, project binding, CLI behavior, and default gates.

This route must not implement new session capability.

## Current context

Route 18 identified `sessionResumeContextBuilder.ts` as a high-priority migration for `SessionManager.ts`.

Route 20 completed the first meaningful `runMvpIntegratedFlow.ts` Batch 1 migration and moved several result/outcome/handoff projection responsibilities out of the orchestration file.

Route 21 should now start reducing the second major runtime risk center: `SessionManager.ts`.

Known existing session-related modules include:

- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts

Route 21 should build on those modules, not duplicate them unnecessarily.

## Non-goals

Do not add or change:

- session schema
- history DB schema
- current session selection semantics
- project binding semantics
- replay ordering
- compact trigger policy
- compact retention policy
- session persistence behavior
- approval lifecycle
- provider behavior
- tool/MCP behavior
- mutation behavior
- CLI behavior
- package scripts
- default gates
- readiness claims

Do not rewrite `SessionManager.ts`.
Do not extract persistence in this route.
Do not extract project binding in this route.
Do not extract compact retention planning in this route.
Do not extract CLI `/continue` bridge in this route.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve session schema.
- Preserve replay order.
- Preserve compact trigger behavior.
- Preserve resume/continue behavior.
- Preserve stopped/no-write continuity.
- Preserve plannedFiles vs changedFiles semantics.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 21 should not require full real-provider execution.

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
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/orchestration/runtimeHandoffProjection.ts, if present
- packages/ts-shell/src/orchestration/runtimeOutcomeProjection.ts, if present
- package.json

Then produce a short internal migration inventory before coding:

- resume/continue/stopped-session context responsibilities currently inside `SessionManager.ts`
- responsibilities already covered by `compactContinuitySummary.ts` or `stoppedSessionContinuity.ts`
- responsibilities safe to move in Route 21
- responsibilities too entangled with persistence/replay/current-session and left for later
- local validation after migration

If the ownership map does not identify session resume context builder extraction as a priority, stop and report the mismatch.

## Preflight state check

Before coding, verify Route 20 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -65
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 20 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Extraction target

Inside `SessionManager.ts`, identify logic that builds or projects context for resume / continue / stopped-session continuity, including some or all of:

- stopped-session resume context construction
- recent stopped/error context included in next turn
- last action result summary context
- mutation failure handoff context
- plannedFiles stopped/no-write context
- changedFiles / failedFiles / plannedFiles continuity context
- compact/reload/follow-up context that is currently constructed inline
- safe user-visible explanation of why a prior turn stopped
- context passed into `/continue` or follow-up session flow, if currently built inside `SessionManager.ts`

The new module should own only context construction/projection.

It must not own:

- session file writes
- history DB writes
- current session selection
- project binding policy
- replay execution
- compact trigger decisions
- compact retention policy
- provider calls
- CLI behavior
- mutation execution
- approval lifecycle

## Desired module

Create:

- packages/ts-shell/src/session/sessionResumeContextBuilder.ts

Possible exported functions may include:

- `buildSessionResumeContext`
- `buildStoppedSessionResumeContext`
- `buildMutationResumeContext`
- `buildPlannedFilesResumeContext`
- `projectLastActionResumeContext`

Choose names based on the actual seam found.

The module should be pure or mostly pure.

Preferred properties:

- explicit inputs
- explicit outputs
- no filesystem writes
- no history DB access
- no provider calls
- no CLI side effects
- no mutation writes
- no access to process.env

## Allowed modification scope

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
  - only to delegate resume/stopped/continue context building to the new module
  - no schema rewrite
  - no persistence rewrite
  - no replay behavior change
  - no compact trigger change
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.test.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
  - only if needed to reuse existing stopped continuity primitives
- packages/ts-shell/src/session/compactContinuitySummary.ts
  - only if needed for behavior-preserving shared context construction
- existing focused tests only if imports or behavior-preserving expectations require narrow updates

Allowed test additions:

- focused tests for stopped resume context
- plannedFiles vs changedFiles context
- mutation failure resume context
- lastActionResultSeed context
- compact/reload/follow-up context preservation if safe

## Conditional allowed scope

Only if strictly necessary for type boundaries:

- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts

If touching these files, explain why the extraction could not stay within `SessionManager.ts` plus session helper modules.

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

- `/continue` or resume context behavior currently covered by tests/gates
- stopped-session continuity
- mutation compact continuity
- plannedFiles stopped/no-write continuity
- long-session durability
- session reload/follow-up behavior
- result contract
- deterministic release meta gate

Preserve:

- session schema
- replay order
- compact trigger behavior
- compact retention behavior
- current session semantics
- project binding semantics
- stopped/no-write wording unless explicitly justified
- changedFiles / failedFiles / plannedFiles distinctions
- last action result seed semantics
- exit codes
- default gates

## Migration quality bar

This route should migrate a meaningful context-building responsibility.

A successful migration should:

- move a coherent resume/stopped/continue context-building responsibility out of `SessionManager.ts`
- create a named module with clear ownership
- add focused tests for the new builder
- make future resume/continue/compact context changes possible without editing the giant session file
- preserve behavior through local, batch, and full validation

Do not move only one or two trivial formatting strings.
Do not move persistence or schema behavior.
Do not use line-count reduction as the main success metric.

## Local validation after extraction

Run:

- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If the focused test file is not added because no safe focused unit seam exists, explain why and rely on integration gates. But prefer adding focused tests.

## Batch validation

Run:

- rtk npm run test -w packages/ts-shell -- src/session/compactContinuitySummary.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a listed test file does not exist, inspect package.json / filesystem, report it, and run the closest existing equivalent.

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

- planned-files continuity
- session durability long
- mutation compact continuity
- release deterministic summary

Compare:

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

Route 21 is complete only if:

- `sessionResumeContextBuilder.ts` exists and owns coherent resume/stopped context-building responsibility
- `SessionManager.ts` delegates that responsibility to the new module
- behavior is preserved
- focused tests exist or a clear reason is given why integration evidence is the only safe validation
- session schema is unchanged
- persistence behavior is unchanged
- replay order is unchanged
- compact trigger behavior is unchanged
- changedFiles / failedFiles / plannedFiles semantics are preserved
- stopped/no-write continuity is preserved
- no provider/tool/mutation/CLI behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- Route 20 baseline is missing
- extraction requires touching cli.tsx or runMvpIntegratedFlow.ts
- extraction requires changing session schema
- extraction requires changing persistence or history DB behavior
- extraction requires changing replay order
- extraction requires changing compact trigger policy
- extraction risks changing plannedFiles/changedFiles semantics
- extraction risks changing `/continue` behavior without focused evidence
- release deterministic fails for unrelated reasons
- the only safe extraction is too small to justify the route
- resume context seam is indistinguishable from persistence/replay control flow

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
17. plannedFiles/changedFiles preservation evidence
18. stopped/resume/continue preservation evidence
19. Local validation results
20. Batch validation results
21. Full validation results
22. Residue cleanup status
23. Claim/readiness changes
24. Residual risks
25. Recommended next route
26. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

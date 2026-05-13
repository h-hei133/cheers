# Route 22: SessionManager compact and continuity batch extraction

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue the SessionManager runtime maintainability batch by extracting compact retention / continuity state / shared continuity type responsibilities from:

- packages/ts-shell/src/session/SessionManager.ts

into focused session modules.

This is a behavior-preserving extraction.

Route 21 extracted resume/stopped/continue context construction into:

- packages/ts-shell/src/session/sessionResumeContextBuilder.ts

Route 22 should continue the same session batch with a coherent set of related responsibilities, not a tiny one-helper move.

Primary target modules may include:

- packages/ts-shell/src/session/sessionContinuityTypes.ts
- packages/ts-shell/src/session/compactRetentionPlanner.ts
- packages/ts-shell/src/session/mutationContinuityState.ts

Create only the modules justified by the actual code seams.

The goal is to reduce `SessionManager.ts` ownership of compact/continuity policy and shared continuity data shapes while preserving all session behavior.

## Non-goals

Do not add or change:

- session schema
- history DB schema
- session persistence behavior
- current session selection
- project binding semantics
- replay ordering
- compact trigger behavior
- compact retention semantics
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
Do not extract replay loading in this route.
Do not change `/continue` behavior.
Do not change compact trigger policy.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve session schema.
- Preserve history DB schema.
- Preserve replay order.
- Preserve compact trigger behavior.
- Preserve compact retention behavior.
- Preserve stopped/no-write continuity.
- Preserve plannedFiles vs changedFiles semantics.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Real provider constraints

Route 22 should not require full real-provider execution.

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
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.test.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/compactContinuitySummary.test.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- package.json

Then produce a short internal migration inventory before coding:

1. Which continuity/shared types are still declared in `SessionManager.ts`.
2. Which compact retention / retention decision logic remains inline.
3. Which mutation/plannedFiles continuity state construction remains inline.
4. Which responsibilities are already covered by `compactContinuitySummary.ts`, `stoppedSessionContinuity.ts`, or `sessionResumeContextBuilder.ts`.
5. Which responsibilities are safe to migrate in Route 22.
6. Which responsibilities are too entangled with persistence/replay/current-session and must stay.

If the ownership map does not identify compact/continuity extraction as a SessionManager priority, stop and report the mismatch.

## Preflight state check

Before coding, verify Route 21 is committed and current gates are healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -70
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo is dirty with unrelated changes, stop and report.
If Route 21 is not committed, stop and report.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

Inspect current `SessionManager.ts` and migrate all safely separable responsibilities from this batch.

### A. Shared session continuity types

Migrate if present:

- `SessionContinuitySnapshot`
- continuity snapshot type aliases
- stopped/resume/compact continuity data shapes
- plannedFiles continuity type shapes
- last-action/result seed type shapes

Suggested module:

- packages/ts-shell/src/session/sessionContinuityTypes.ts

This should resolve or reduce type-only imports from `SessionManager.ts` into new helper modules.

Must not own:

- persistence
- schema migration
- replay behavior
- compact trigger behavior
- runtime logic

### B. Compact retention planner

Migrate if present:

- compact retention decision helpers
- retention set construction
- compact boundary retention projection
- context retention inputs for compact summaries
- non-persistence compact planning helpers

Suggested module:

- packages/ts-shell/src/session/compactRetentionPlanner.ts

Must not own:

- compact trigger decision if currently tied to lifecycle control
- file/history writes
- replay execution
- schema change
- provider/tool/mutation behavior

### C. Mutation / plannedFiles continuity state

Migrate if present:

- mutation continuity state construction
- plannedFiles continuity state construction
- changedFiles / failedFiles / plannedFiles distinction helpers
- last write / no-write continuity state
- stopped/no-write state projection for future resume/compact context

Suggested module:

- packages/ts-shell/src/session/mutationContinuityState.ts

Must not own:

- mutation execution
- patch application
- session persistence
- runtime result assembly
- CLI display

### D. Existing helper consolidation

If responsibilities overlap heavily with existing modules, prefer extending or reusing:

- compactContinuitySummary.ts
- stoppedSessionContinuity.ts
- sessionResumeContextBuilder.ts

Do not create redundant modules.

## Important batching rule

This route should migrate a coherent compact/continuity batch, not a single trivial type alias.

However, do not force migration when:

- the seam is entangled with persistence or replay control
- extraction would change behavior
- extraction requires touching forbidden files
- focused tests cannot cover it
- local validation fails and fixing requires behavior change

If some batch responsibilities remain, list them with reasons.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.test.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/compactContinuitySummary.test.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- new session modules under packages/ts-shell/src/session/
- corresponding focused tests under packages/ts-shell/src/session/

Allowed new tests:

- sessionContinuityTypes test only if meaningful; avoid testing types only
- compactRetentionPlanner.test.ts
- mutationContinuityState.test.ts
- focused updates to sessionResumeContextBuilder.test.ts
- focused updates to compactContinuitySummary.test.ts
- focused updates to mutationCompactContinuity.test.ts

Only add tests for modules actually created.

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

If completing this batch requires touching forbidden files, stop and report.

## Behavior preservation requirements

After extraction, these must remain equivalent:

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

## Local validation after each migration

After shared type migration:

- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactContinuitySummary.test.ts
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After compact retention planner migration:

- rtk npm run test -w packages/ts-shell -- src/session/compactRetentionPlanner.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactContinuitySummary.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After mutation/plannedFiles continuity state migration:

- rtk npm run test -w packages/ts-shell -- src/session/mutationContinuityState.test.ts
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created, do not run its missing test.
Run equivalent focused tests for modules actually created.

## Batch validation

After completing all safe Route 22 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/compactContinuitySummary.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
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

## Migration quality bar

A successful Route 22 should:

- reduce `SessionManager.ts` ownership of compact/continuity policy or data shapes
- avoid tiny single-alias extraction unless paired with meaningful continuity/compact migration
- reduce type-only dependency from new helpers back to `SessionManager.ts`, if practical
- create named session modules with clear ownership
- add or update focused tests
- preserve all session behavior

Do not use line-count reduction as the only success metric.

## Stop conditions

Stop and report if:

- Route 21 baseline is missing
- extraction requires touching cli.tsx or runMvpIntegratedFlow.ts
- extraction requires changing session schema
- extraction requires changing history DB schema
- extraction requires changing persistence behavior
- extraction requires changing replay order
- extraction requires changing compact trigger policy
- extraction risks changing plannedFiles/changedFiles semantics
- extraction risks changing `/continue` behavior without focused evidence
- release deterministic fails for unrelated reasons
- all remaining compact/continuity seams are too entangled with persistence/replay control
- the only safe extraction is too small to justify the route

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

Route 22 is complete only if:

- Route 22 migration inventory is explicitly reported
- at least one meaningful compact/continuity responsibility is migrated, unless all are proven already migrated/unsafe
- no safe obvious compact/continuity responsibility is left unaddressed without explanation
- new module ownership is clear
- focused tests exist for created modules where meaningful
- SessionManager.ts delegates migrated responsibilities
- behavior is preserved
- session schema is unchanged
- history DB schema is unchanged
- persistence behavior is unchanged
- replay order is unchanged
- compact trigger behavior is unchanged
- compact retention behavior is unchanged
- plannedFiles / changedFiles semantics are preserved
- stopped/no-write continuity is preserved
- no provider/tool/mutation/CLI behavior changed
- no product capability was added
- no default gate changed
- no package scripts changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Pre-coding migration inventory
5. Migrations completed
6. Migrations intentionally left in SessionManager.ts and why
7. Files changed
8. Forbidden files touched? yes/no
9. Product behavior changed? yes/no
10. Capability expanded? yes/no
11. Default gates changed? yes/no
12. Real provider touched? yes/no
13. Secret exposure risk? yes/no
14. New modules and responsibilities
15. SessionManager responsibilities now retained
16. SessionManager responsibilities now migrated
17. Focused tests added/reused
18. plannedFiles/changedFiles preservation evidence
19. compact/continuity preservation evidence
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

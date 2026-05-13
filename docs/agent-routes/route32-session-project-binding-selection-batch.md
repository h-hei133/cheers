# Route 32: SessionManager project binding / current-session selection batch

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Continue SessionManager maintainability extraction from:

- packages/ts-shell/src/session/SessionManager.ts

Route 31 extracted approval / permission memory codecs and approval audit projection. Route 32 should now migrate project binding, project-root rebasing projection, and current-session selection helpers where safe.

Target modules, if safe:

- packages/ts-shell/src/session/projectBindingPolicy.ts
- packages/ts-shell/src/session/projectRootRebaseProjection.ts
- packages/ts-shell/src/session/currentSessionSelection.ts expansion, if this module already exists
  - or a new focused helper only if the existing module cannot own the seam cleanly

This route should migrate 2-3 related pure decision/projection seams if safe.

The goal is to reduce `SessionManager.ts` ownership of project binding decisions, project-root rebasing projection, current-session selection facts, and safe binding diagnostics while preserving session lifecycle, persistence read/write timing, locking, schema, history DB schema, replay behavior, compact behavior, CLI behavior, provider behavior, package scripts, and default gates.

Do not change session lifecycle behavior.
Do not change persistence timing.
Do not change project binding semantics.

## Current context

Completed SessionManager extraction modules include:

- sessionResumeContextBuilder.ts
- sessionContinuityTypes.ts
- compactRetentionPlanner.ts
- mutationContinuityState.ts
- sessionReplayBuilder.ts
- approvalMemoryCodec.ts
- permissionRequestMemoryCodec.ts
- approvalAuditProjection.ts

Route 31 residual risk noted that SessionManager.ts still owns adjacent project-root rebasing and compact summary wiring.

Current ownership map says SessionManager.ts should continue to retain:

- public session lifecycle facade
- persistence read/write timing
- locking and atomic write boundaries
- session loading
- current session facade
- project binding facade
- recovery trust boundary
- compact trigger control

Remaining candidates include:

- project binding helper
- current-session selection helper expansion
- session persistence gateway
- approval/persistence semantic work

Route 32 should handle only project binding / rebasing / current-selection decision or projection helpers. It must not implement persistence gateway.

## Non-goals

Do not add or change:

- session schema
- history DB schema
- session persistence read/write timing
- session loading semantics
- locking behavior
- atomic write behavior
- current session lifecycle semantics
- project binding semantics
- recovery trust boundary
- replay ordering
- compact trigger behavior
- compact retention semantics
- approval authorization semantics
- provider behavior
- CLI behavior
- tool/MCP behavior
- mutation behavior
- package scripts
- default gates
- readiness claims

Do not extract session persistence gateway in this route.
Do not rewrite `SessionManager.ts`.
Do not touch `runMvpIntegratedFlow.ts`.
Do not touch `cli.tsx`.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Preserve behavior exactly.
- Preserve session schema.
- Preserve history DB schema.
- Preserve project binding semantics.
- Preserve current session selection semantics.
- Preserve persistence timing.
- Preserve replay order.
- Preserve compact trigger behavior.
- Preserve real-provider opt-in boundaries.
- Preserve default gates.
- Do not create commits or push.

## Real provider constraints

Route 32 should not require full real-provider execution.

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

- project
- workspace
- current session
- resume
- session selection
- project root
- cwd
- trusted folder
- checkpoint

Read at most 2 relevant snippets per reference repo.

Use comparison only to calibrate boundaries:

- project/session binding decisions can be represented separately from persistence writes
- current-session selection helpers should not change lifecycle timing
- project-root rebasing should be pure projection unless it owns actual state writes
- workspace/project trust boundary should remain stable

Do not copy code or architecture.

## Required first step

Before editing, read:

- docs/design/runtime-module-ownership-map.md
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/currentSessionSelection.ts, if present
- packages/ts-shell/src/session/sessionContinuityTypes.ts
- packages/ts-shell/src/session/sessionResumeContextBuilder.ts
- packages/ts-shell/src/session/sessionReplayBuilder.ts
- packages/ts-shell/src/session/approvalMemoryCodec.ts
- packages/ts-shell/src/session/permissionRequestMemoryCodec.ts
- packages/ts-shell/src/session/approvalAuditProjection.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- package.json

Then locate inside `SessionManager.ts`:

- project binding decisions
- project-root rebasing logic
- current session selection logic
- session/project association facts
- project identity normalization
- cwd / project root normalization
- safe project/session diagnostics
- recovery trust boundary interactions
- any pure project binding or current-session helper still inline

This is seam inventory inside the migration task, not a separate audit artifact.

Before coding, prepare an internal inventory for the final report:

1. Project binding responsibilities currently inline.
2. Project-root rebasing projection responsibilities currently inline.
3. Current-session selection responsibilities currently inline.
4. Which seams are pure and migrated.
5. Which seams are lifecycle/persistence/recovery-adjacent and retained.
6. Local validation after each migrated module.

## Preflight state check

Before coding, verify current baseline is healthy.

Run:

- rtk git status --short --branch
- rtk git log --oneline -150
- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If the repo has unrelated dirty changes, stop and report.
If Route 31 changes are still uncommitted, proceed only if they are exactly the expected Route 31 files and do not conflict with this route. Report that Route 32 is stacked on top of Route 31 changes.
If baseline gates fail for unrelated reasons, stop and report.

## Batch migration targets

### A. projectBindingPolicy.ts

Extract project binding decision/projection if safe.

Possible responsibilities:

- normalize project binding facts
- project session/project association facts
- decide project binding summary from already-loaded data
- shape safe diagnostics for project binding
- preserve existing project binding outcomes and wording

Suggested exports:

- `projectSessionBinding`
- `normalizeProjectBinding`
- `ProjectBindingDecision`
- `ProjectBindingInput`

The module must not:

- write session state
- load sessions
- mutate current session
- change project binding semantics
- change recovery trust boundary
- change persistence timing

### B. projectRootRebaseProjection.ts

Extract project-root rebasing projection if safe.

Possible responsibilities:

- compute rebased project-root facts from explicit inputs
- normalize old/new project root metadata
- project safe rebase diagnostics
- preserve existing rebase output and behavior

Suggested exports:

- `projectRootRebase`
- `projectRebasedSessionRoot`
- `ProjectRootRebaseProjection`

The module must not:

- write rebased state
- change actual rebasing timing
- change session schema
- change recovery behavior
- access filesystem except through data passed in

### C. currentSessionSelection.ts expansion

If `currentSessionSelection.ts` exists, expand it only with pure selection/projection seams.

Possible responsibilities:

- current session candidate facts
- current session selection reason projection
- safe selection diagnostics
- pure selection helper from already-loaded session metadata

Suggested exports, if not already present:

- `selectCurrentSession`
- `projectCurrentSessionSelection`
- `CurrentSessionSelectionReason`

The module must not:

- load sessions
- create sessions
- persist current session
- mutate lifecycle state
- change project binding side effects
- change selection semantics

## Important batching rule

Do not stop after one tiny helper if multiple project/current-session seams are safely extractable.

However, do not force extraction when:

- it would change session lifecycle
- it would change persistence timing
- it would change project binding semantics
- it would change current session selection semantics
- it would change recovery trust boundary
- it would require touching forbidden files
- focused tests cannot reasonably cover it

If only one or two modules are safe, extract those and explicitly explain why the others were deferred.

## Allowed modification scope

Allowed:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/currentSessionSelection.ts
- packages/ts-shell/src/session/currentSessionSelection.test.ts
- packages/ts-shell/src/session/projectBindingPolicy.ts
- packages/ts-shell/src/session/projectBindingPolicy.test.ts
- packages/ts-shell/src/session/projectRootRebaseProjection.ts
- packages/ts-shell/src/session/projectRootRebaseProjection.test.ts
- existing session tests only if behavior-preserving import updates or focused coverage are needed

Only add modules that are actually extracted.

## Conditional allowed scope

Only if strictly necessary for type exports:

- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts

If touching these files, explain why type reuse could not stay inside session modules.

Do not change behavior.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/orchestration/*
- packages/ts-shell/src/entrypoints/*
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

- project binding behavior
- project-root rebasing behavior
- current-session selection behavior
- session durability
- replay behavior
- compact continuity
- plannedFiles stopped/no-write continuity
- result contract
- deterministic release meta gate

Preserve:

- session schema
- history DB schema
- persistence timing
- locking behavior
- recovery trust boundary
- current session lifecycle
- project binding semantics
- replay order
- compact trigger behavior
- changedFiles / failedFiles / plannedFiles distinctions
- exit codes
- broadReleaseReady=false
- realProviderTouched=false for deterministic/default checks

## Local validation after each migration

After project binding policy migration:

- rtk npm run test -w packages/ts-shell -- src/session/projectBindingPolicy.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After project-root rebase projection migration:

- rtk npm run test -w packages/ts-shell -- src/session/projectRootRebaseProjection.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

After current-session selection expansion:

- rtk npm run test -w packages/ts-shell -- src/session/currentSessionSelection.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If a module is not created or not changed, do not run its missing/unrelated test.
Run equivalent focused tests for actual modules.

## Batch validation

After completing all safe Route 32 migrations, run:

- rtk npm run test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts
- rtk npm run test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- rtk npm run verify:session-durability:long
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check

If any listed test does not exist, inspect package.json/filesystem, report it, and run the closest equivalent.

## Full validation before final report

Run:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation --include-real --dry-run
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
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
- release deterministic summary

Compare:

- project binding facts unchanged
- current-session selection facts unchanged
- rebase projection unchanged
- replay/compact behavior unchanged
- changedFiles / failedFiles / plannedFiles unchanged
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

Route 32 is complete only if:

- seam inventory is explicitly reported
- at least one meaningful project/current-session helper responsibility is migrated
- 2-3 modules are migrated if safe, or deferred modules are clearly justified
- `SessionManager.ts` delegates migrated responsibilities
- project binding semantics are unchanged
- current session selection semantics are unchanged
- persistence timing is unchanged
- session schema is unchanged
- history DB schema is unchanged
- replay and compact behavior are unchanged
- no provider/orchestration/CLI/MCP behavior changed
- no package scripts changed
- no default gates changed
- local, batch, and full validation pass
- no secret or provider config is printed

## Stop conditions

Stop and report if:

- extraction requires changing project binding semantics
- extraction requires changing current-session selection semantics
- extraction requires changing persistence timing
- extraction requires changing session schema
- extraction requires changing history DB schema
- extraction requires changing replay order
- extraction requires changing compact trigger behavior
- extraction requires touching runMvpIntegratedFlow.ts or cli.tsx
- extraction requires touching package.json or scripts
- all project/current-session seams are too entangled with persistence lifecycle
- release deterministic fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Ownership map alignment
4. Reference comparison summary, if performed
5. Pre-coding project/current-session seam inventory
6. Migrations completed
7. Migrations intentionally left in SessionManager.ts and why
8. Files changed
9. Forbidden files touched? yes/no
10. Product behavior changed? yes/no
11. Project binding semantics changed? yes/no
12. Current-session selection changed? yes/no
13. Persistence timing changed? yes/no
14. Session schema changed? yes/no
15. History DB schema changed? yes/no
16. Replay/compact behavior changed? yes/no
17. Capability expanded? yes/no
18. Default gates changed? yes/no
19. Real provider touched? yes/no
20. Secret exposure risk? yes/no
21. New modules and responsibilities
22. SessionManager responsibilities retained
23. SessionManager responsibilities migrated
24. Focused tests added/reused
25. Project/current-session preservation evidence
26. Session durability / plannedFiles preservation evidence
27. Local validation results
28. Batch validation results
29. Full validation results
30. Residue cleanup status
31. Claim/readiness changes
32. Residual risks
33. Recommended next route
34. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

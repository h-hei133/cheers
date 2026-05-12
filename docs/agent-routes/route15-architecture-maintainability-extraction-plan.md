# Route 15: architecture maintainability extraction plan

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Perform a focused architecture maintainability audit of the three highest-risk large files and produce a concrete, executable extraction plan.

This route is planning-only.

Target files:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/session/SessionManager.ts
- scripts/verify-real-user-capabilities.mjs

The goal is to design a realistic extraction roadmap that can move architecture maintainability toward a 4/5 score over several implementation routes, without broad rewrites or capability expansion.

The output must be a plan file:

- docs/design/architecture-maintainability-extraction-plan.md

The plan must be concrete enough that future Codex goals can execute it route by route.

## Current context

Recent audit says the project is no longer a toy and has bounded deterministic evidence, but architecture maintainability remains weak because several large files still centralize too much responsibility.

Known high-risk files:

- runMvpIntegratedFlow.ts: query/orchestration/provider/tool/mutation/session flow risk.
- SessionManager.ts: session/compact/replay/current-session/project-binding/continuity risk.
- verify-real-user-capabilities.mjs: verifier/scenario/report/redaction/real-provider/dry-run/claim-risk mixer.

Prior extractions already exist and must be considered:

- mutationRoutingProjection.ts
- compactContinuitySummary.ts
- MCP error taxonomy helpers
- real-user-capabilities candidate mutation classification helpers
- real-user-capabilities patch-shape helpers
- three-file planning/no-write and planned-files continuity evidence

This route should not repeat those small extractions. It should plan the next meaningful architecture work.

## Non-goals

Do not implement the extraction in this route.

Do not:

- edit product runtime behavior
- add mutation capability
- change default gates
- change release claims
- add real-provider default execution
- add external MCP support
- broaden apply_patch
- add 3-file writes
- add delete/move
- add rollback/atomicity
- rewrite runMvpIntegratedFlow.ts wholesale
- rewrite SessionManager.ts wholesale
- rewrite verify-real-user-capabilities.mjs wholesale

This route only writes a plan and, if necessary, narrow docs references to that plan.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not modify product code.
- Do not modify default gates.
- Do not modify package scripts unless absolutely necessary; prefer no package.json changes.
- Do not run full real-provider execution.
- Do not read, print, copy, grep, parse, modify, or summarize anything under /home/wang/.private-agents-real.
- Do not run arbitrary external MCP servers.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Planning quality bar

The plan must not be thin.

A thin plan is not acceptable. Examples of thin plans:

- "extract helpers from runMvpIntegratedFlow"
- "split SessionManager"
- "modularize verifier"
- "add tests"
- "reduce large files"

A useful plan must identify concrete responsibility seams, target modules, route sequence, validation commands, risks, and success/failure criteria.

Each proposed implementation route must remove or isolate a meaningful responsibility, not just move a few lines.

A meaningful extraction should generally satisfy at least three of:

- removes a complete responsibility from a large file
- introduces a named module with a clear owner/responsibility
- adds or reuses focused tests
- reduces coupling between runtime, projection, persistence, and reporting
- preserves behavior through existing gates
- reduces future route/code churn risk
- makes future changes possible without editing the giant file

Do not use raw line-count reduction as the only success metric, but include approximate expected impact where useful.

## Architecture target

The plan should define what "architecture maintainability 4/5" would mean for this project.

A reasonable target:

- runMvpIntegratedFlow.ts becomes orchestration wiring, not policy/projection/formatting owner.
- SessionManager.ts becomes session lifecycle coordinator, not compact/replay/continuity summary owner.
- verify-real-user-capabilities.mjs becomes CLI orchestration and high-level command dispatch, not scenario registry/classifier/reporting/redaction owner.
- New modules have clear responsibility boundaries and focused tests.
- Release/deterministic gates preserve behavior.
- No capability expansion is hidden inside refactors.
- Docs/claims remain bounded.

## Reference comparison before planning

Perform a narrow read-only comparison against both reference repositories.

Reference repos:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume file paths exist.
Use search first.
Do not copy architecture wholesale.
Do not perform broad audit.
Do not modify reference repos.

### Claude Code comparison

Search /home/wang/projects/source-claudecode for keywords:

- query loop
- orchestration
- session compact
- resume
- transcript
- tool result
- failed tool result
- file edit
- read first
- stale edit
- permission
- result projection
- verification
- scenario
- reporter

Focus on:

- how query loop is kept from owning every policy
- how compact/resume context is separated
- how file edit/tool failure metadata is represented
- how result and transcript structures avoid false success
- what not to copy because this project is narrower

Read at most 3-5 relevant files/snippets.

### opencode comparison

Search /home/wang/projects/opencode for keywords:

- tool execution
- permission
- permission denied
- apply_patch
- patch parse
- patch apply
- multiedit
- snapshot
- revert
- session output
- tool result
- error metadata
- scenario
- test fixture
- verification

Focus on:

- how tool execution and permission result are separated
- how patch parse/verify/apply/fail are layered
- how snapshot/revert exists there but is not current scope here
- how user-visible errors and result metadata are represented
- what not to copy because current project intentionally has no rollback/broad patch

Read at most 3-5 relevant files/snippets.

### Reference comparison output

The plan must include:

- search terms used
- inspected files/snippets
- useful architecture lessons
- explicitly rejected ideas
- why those ideas are not applicable now
- confirmation no reference code/architecture was copied wholesale

## Required target reading

Read before writing the plan:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- docs/audits/routes-01-12-closeout.md, if present
- docs/design/three-file-planning-no-write-evaluation.md, if present
- package.json
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*, if present
- scripts/verify-release-deterministic.mjs
- scripts/verify-release-core.mjs

Runtime/orchestration:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/*

Session:

- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts

Surface/result:

- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts

MCP/tool provenance:

- packages/ts-shell/src/core/mcp/*
- packages/ts-shell/src/core/tools/toolLifecycleProjection.ts
- packages/ts-shell/src/core/tools/toolExecutionProvenance.ts

Use targeted reading and search; do not dump entire huge files into output.

## Required analysis

For each of the three large files, the plan must include:

### 1. Current responsibility map

Identify concrete responsibilities currently owned by the file.

For runMvpIntegratedFlow.ts, consider:

- query loop orchestration
- provider readiness / provider call
- tool invocation
- approval or permission state
- mutation route selection
- mutation result projection
- stopped/error/success mapping
- session handoff
- compact/continuity input
- CLI/runtime result expectations

For SessionManager.ts, consider:

- session creation/loading
- current session selection
- project binding
- replay
- compact
- stopped-session continuity
- mutation compact continuity
- approval/mutation context
- persistence/history
- next-turn context

For verify-real-user-capabilities.mjs, consider:

- CLI parsing
- scenario registry
- scenario fixture setup
- candidate mutation execution
- taxonomy classification
- report formatting
- output markers
- redaction
- real-provider opt-in
- dry-run
- dirty-repo guard
- route-specific verifiers
- release/deterministic compatibility

### 2. Existing extracted modules

Identify already extracted modules and what they cover.

Examples:

- mutationRoutingProjection.ts
- compactContinuitySummary.ts
- candidateMutationClassification.mjs
- candidateMutationPatchShape.mjs
- errorTaxonomy.ts
- verify-planned-files-continuity.mjs

Clarify whether each extraction is:

- complete enough
- partial but useful
- too thin
- needs follow-up
- should not be expanded

### 3. Proposed target module decomposition

For each large file, propose target modules.

Each target module must include:

- module name
- responsibility
- inputs
- outputs
- side effects
- forbidden responsibilities
- existing tests to reuse
- new tests needed
- validation commands
- expected risk level
- recommended implementation route

### 4. Sequencing

Create a route sequence of 6-10 future tasks.

Each task must be meaningful, not thin.

Each task must include:

- title
- why now
- allowed files
- forbidden files
- implementation entry point
- success criteria
- failure criteria
- validation commands
- expected evidence strength
- how it reduces architecture maintainability risk

The sequence should avoid alternating tiny one-function extractions. Prefer responsibility-sized chunks.

### 5. Anti-goals

List explicit things not to do:

- no big rewrite
- no product capability expansion
- no broad apply_patch
- no rollback
- no default real-provider gate
- no external MCP ready claim
- no live TTY proof inflation
- no moving code without tests
- no extracting code only to make files smaller
- no claim changes without evidence

### 6. Recommended first execution route

Pick exactly one next execution route.

It must be bounded but meaningful.

The recommendation should not be generic.

It must include:

- concrete route name
- allowed files
- forbidden files
- implementation seam
- expected module(s)
- tests
- validation
- success criteria
- stop conditions
- why this is the best first step

## Suggested planning direction

You may decide otherwise based on evidence, but evaluate these candidate directions:

### A. verify-real-user-capabilities decomposition

Possible larger seams:

- candidateMutationScenarioRegistry.mjs
- candidateMutationReportWriter.mjs
- realProviderOptInGuard.mjs
- candidateMutationVerifierRunner.mjs
- routeVerifierRegistry.mjs

Goal: make main script command dispatch + orchestration only.

### B. runMvpIntegratedFlow decomposition

Possible larger seams:

- providerCallOutcomeProjection.ts
- toolExecutionOutcomeProjection.ts
- mutationSessionHandoff.ts
- shellResultAssembly.ts
- stoppedOrFailureResultProjection.ts
- doNextProjection.ts

Goal: keep runMvpIntegratedFlow as orchestration wiring, not result/session/mutation policy owner.

### C. SessionManager decomposition

Possible larger seams:

- sessionReplayBuilder.ts
- sessionProjectBinding.ts
- stoppedSessionResumeContext.ts
- compactRetentionPlanner.ts
- mutationContinuityState.ts
- sessionPersistenceGateway.ts

Goal: keep SessionManager as lifecycle coordinator, not owner of compact/replay/continuity policy.

The plan must decide which stream should go first and why.

## Required validation

This route is mostly docs, but still run current evidence gates to ensure planning is based on a healthy baseline.

Run through rtk:

Preflight:

- rtk git status --short --branch
- rtk git log --oneline -40

Core evidence:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities -- --candidate-mutation-failure-taxonomy-self-test
- rtk npm run verify:real-user-capabilities:two-file-cli-evidence
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:mcp:local-execution
- rtk npm run verify:mcp:error-taxonomy
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

If a command does not exist, record it and inspect package.json for the actual name.

Do not run full opt-in real-provider execution.
Do not run arbitrary external MCP servers.

## Allowed modification scope

Allowed:

- docs/design/architecture-maintainability-extraction-plan.md
- PROJECT_STATE.md only if adding a narrow pointer to this plan is useful
- RUNBOOK.md only if adding a narrow pointer to this plan is useful
- docs/audits/ only if adding a short audit note is useful

Prefer one main plan file.

Do not modify product code.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/**
- scripts/**
- package.json
- default gates
- product behavior
- mutation capabilities
- provider/MCP behavior

If you discover urgent product-code issues, record them in the plan as risks or future tasks. Do not fix them.

## Plan file required structure

The generated plan file must contain:

1. Executive summary
2. Why architecture maintainability is now the priority
3. Current evidence baseline
4. Reference comparison summary
5. The three large files and their current responsibilities
6. Existing extractions and what they solved
7. Remaining responsibility clusters
8. Target architecture principles
9. Proposed module decomposition for runMvpIntegratedFlow.ts
10. Proposed module decomposition for SessionManager.ts
11. Proposed module decomposition for verify-real-user-capabilities.mjs
12. Cross-cutting invariants
13. What must not change
14. Route sequence: 6-10 meaningful implementation routes
15. Recommended first implementation route
16. Validation matrix
17. Risk matrix
18. Definition of architecture maintainability 4/5
19. Stop conditions for the overall extraction program
20. Appendix: commands run and results

## Success criteria

Route 15 is complete only if:

- The plan file exists.
- It covers all three large files.
- It uses evidence from target repo files.
- It uses narrow reference comparison against Claude Code and opencode.
- It proposes responsibility-sized extraction routes, not thin helper moves.
- It recommends exactly one first execution route.
- It includes allowed/forbidden files and validation for each route.
- It preserves all current readiness boundaries.
- It does not suggest broad rewrite.
- It does not suggest capability expansion.
- All required validation commands pass or failures are classified.
- No product code is modified.
- No default gates are modified.
- No secrets or provider config are read or printed.

## Stop conditions

Stop and report instead of forcing progress if:

- repo is dirty with unrelated changes
- route baseline gates are failing
- AGENTS.md prevents this planning work
- reference repos are unavailable
- no meaningful extraction plan can be made without product-direction input
- plan would require broad rewrite or capability expansion
- required docs directory cannot be written

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

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Plan file created
4. Files changed
5. Product code touched? yes/no
6. Capability expanded? yes/no
7. Default gates changed? yes/no
8. Real provider touched? yes/no
9. Secret exposure risk? yes/no
10. Reference comparison summary
11. Three large files analyzed
12. Proposed extraction streams
13. Recommended first implementation route
14. Validation commands and results
15. Residue cleanup status
16. Residual risks
17. Proposed commit message

## Commit and push policy

After final report, propose a commit message.

Do not commit until the user confirms the diff and commit message.

After confirmation:

- run rtk git status --short --branch
- commit with the approved message
- push only if the user explicitly confirms push

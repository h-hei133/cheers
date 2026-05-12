# Route 16: runtime architecture extraction plan

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Perform a focused runtime architecture maintainability audit of the three largest runtime implementation files and produce a concrete, executable extraction plan.

This route is planning-only.

Target runtime files:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx

The goal is to design a practical extraction roadmap that can improve runtime architecture maintainability toward 4/5 over several implementation routes.

Do not implement the extraction in this route.

Output plan file:

- docs/design/runtime-architecture-extraction-plan.md

## Current context

The project has moved beyond toy status and has bounded deterministic evidence for:

- selected-workspace mutation
- candidate mutation
- failure taxonomy
- two-file CLI evidence
- three-file planning/no-write
- planned-files continuity
- local MCP execution and MCP error taxonomy
- deterministic release-candidate gate

However, architecture maintainability remains weak because runtime responsibilities are still concentrated in giant files.

Known runtime risk centers:

- runMvpIntegratedFlow.ts:
  - query loop
  - provider readiness/call
  - tool/MCP execution handoff
  - mutation path integration
  - result/failure surface
  - session handoff

- SessionManager.ts:
  - session creation/loading
  - current session/project binding
  - resume/continue
  - replay
  - compact
  - continuity state
  - persistence/history

- cli.tsx:
  - CLI entry
  - print/stdin/interactive modes
  - slash commands
  - approval bridge
  - session bridge
  - terminal UX / mode dispatch

This route should plan meaningful responsibility-sized extractions, not thin helper moves.

## Non-goals

Do not:

- implement extraction
- modify product runtime code
- modify scripts
- modify package.json
- modify default gates
- add mutation capability
- add 3-file write support
- add broad apply_patch
- add delete/move support
- add rollback/atomicity
- add external MCP readiness
- add real-provider default execution
- change release claims
- create commits
- push or merge

Do not make a generic “split big files” plan.
Do not recommend a big rewrite.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not read, print, copy, grep, parse, modify, or summarize anything under /home/wang/.private-agents-real.
- Do not run full opt-in real-provider mutation execution.
- Do not run arbitrary external MCP servers.
- Do not modify product code.
- Do not modify default gates.
- Do not modify readiness claims except docs created by this planning route.
- Clean audit/history/runtime residue before final report when safe.

## Planning quality bar

The plan must be strong enough to guide implementation.

A thin plan is not acceptable.

Bad examples:

- “extract helpers from runMvpIntegratedFlow”
- “split SessionManager”
- “clean up cli.tsx”
- “add tests”
- “modularize runtime”

A good plan must identify:

- current responsibilities
- concrete seams
- target modules
- allowed files
- forbidden files
- side effects
- test strategy
- validation commands
- risks
- stop conditions
- route sequence
- expected maintainability impact

Each proposed implementation route must remove or isolate a meaningful responsibility, not just move a few functions.

A meaningful route should generally satisfy at least three of:

- removes a complete responsibility from a giant runtime file
- introduces a named module with clear ownership
- has focused tests or reuses strong route gates
- reduces coupling between orchestration, session, CLI, provider, mutation, and result surface
- preserves behavior through existing deterministic gates
- makes future changes possible without editing the giant file
- reduces ambiguity around success/stopped/error/session handoff

Do not use line-count reduction as the only metric, but include expected impact where useful.

## Architecture target

Define what “runtime architecture maintainability 4/5” should mean.

A reasonable target:

- `runMvpIntegratedFlow.ts` becomes orchestration wiring, not policy/projection/session-result owner.
- `SessionManager.ts` becomes session lifecycle coordinator, not owner of compact/replay/continuity formatting/policy.
- `cli.tsx` becomes CLI composition and mode dispatch, not owner of command semantics, approval state policy, or session bridge details.
- Runtime result and failure surfaces have named projection modules.
- Session continuity and compact behavior have explicit builders/planners.
- CLI mode behavior is testable without reading the full entrypoint.
- No product capability expansion is hidden inside refactors.
- Default gates and readiness claims remain unchanged.

## Reference comparison before planning

Perform a narrow read-only comparison against both reference repositories.

Reference repos:

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode

Do not assume paths exist.
Use search first.
Do not copy architecture wholesale.
Do not perform broad audit.
Do not modify reference repos.

### Claude Code comparison

Search /home/wang/projects/source-claudecode using keywords related to:

- query loop
- orchestration
- compact
- resume
- session transcript
- continue
- tool result
- failed tool result
- file edit
- stale edit
- read first
- permission
- result projection
- CLI
- print mode
- interactive
- slash command

Focus on:

- how query loop avoids owning every policy
- how compact/resume context is separated
- how failed tool/edit results enter transcript/session
- how CLI mode dispatch is structured
- what is not applicable because this project is narrower

Read at most 3-5 relevant files/snippets.

### opencode comparison

Search /home/wang/projects/opencode using keywords related to:

- tool execution
- permission
- permission denied
- apply_patch
- patch parse
- patch apply
- multiedit
- session output
- snapshot
- revert
- CLI
- TUI
- command
- plan
- user-visible error
- changed files
- failed files

Focus on:

- how tool execution and permission results are separated
- how patch/edit result metadata is represented
- how session output and user-visible errors are shaped
- how CLI/TUI layers avoid owning execution internals
- what is not applicable because rollback/broad apply_patch are not current scope

Read at most 3-5 relevant files/snippets.

### Reference comparison output

The plan must include:

- search terms used
- inspected files/snippets
- useful architecture lessons
- explicitly rejected ideas
- why rejected ideas are not applicable now
- confirmation no reference code/architecture was copied wholesale

## Required target reading

Read before writing the plan:

Project state and gates:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- package.json
- docs/audits/routes-01-12-closeout.md, if present
- docs/design/three-file-planning-no-write-evaluation.md, if present

Runtime target files:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx

Existing extracted modules and related runtime surfaces:

- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- packages/ts-shell/src/session/mutationCompactContinuity.test.ts
- packages/ts-shell/src/session/longSessionDurability.test.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/core/tools/toolLifecycleProjection.ts
- packages/ts-shell/src/core/tools/toolExecutionProvenance.ts
- packages/ts-shell/src/core/mcp/*

CLI tests and evidence:

- packages/ts-shell/src/cli-baseline.test.ts
- any CLI entry / slash / continue / provider readiness tests discovered by search

Use targeted reading and search.
Do not dump huge files into the final output.

## Required analysis

For each target file, include the following.

### 1. Current responsibility map

For `runMvpIntegratedFlow.ts`, map concrete responsibilities such as:

- query loop coordination
- provider readiness and call boundary
- provider result interpretation
- tool execution / MCP handoff
- permission / approval bridge
- mutation eligibility and dispatch
- mutation result projection
- success/stopped/error assembly
- resultMapper handoff
- sessionRuntime handoff
- session/compact continuity input
- DoNext / next-action projection
- terminal-visible result shaping

For `SessionManager.ts`, map concrete responsibilities such as:

- session creation/loading
- current session selection
- project binding
- resume / continue
- replay
- compact planning
- compact summary
- stopped-session continuity
- mutation continuity
- planned-files continuity
- approval context persistence
- history persistence
- session metadata
- cleanup / durability behavior

For `cli.tsx`, map concrete responsibilities such as:

- argument parsing
- stdin mode
- --print mode
- interactive mode
- slash command registration / dispatch
- /continue bridge
- approval prompt / response bridge
- provider readiness display
- session selection bridge
- runtime invocation
- terminal output rendering
- error/stopped display
- setup / environment bootstrapping

### 2. Existing extractions

Identify existing extracted modules and evaluate whether each is:

- complete enough
- useful but partial
- too thin
- should be expanded later
- should not be expanded

At minimum evaluate:

- mutationRoutingProjection.ts
- compactContinuitySummary.ts
- stoppedSessionContinuity.ts
- sessionStateSurface.ts
- resultMapper.ts
- toolLifecycleProjection.ts
- toolExecutionProvenance.ts
- providerReadiness.ts

### 3. Proposed target module decomposition

For each giant file, propose concrete target modules.

Each module proposal must include:

- module name
- source file to extract from
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
- why this extraction is responsibility-sized, not too thin

Possible directions to evaluate, not blindly accept:

#### runMvpIntegratedFlow.ts

- providerCallOutcomeProjection.ts
- toolExecutionOutcomeProjection.ts
- shellResultAssembly.ts
- stoppedOrFailureResultProjection.ts
- mutationSessionHandoff.ts
- doNextProjection.ts
- orchestrationTraceProjection.ts
- runtimeCapabilityBoundary.ts

#### SessionManager.ts

- sessionProjectBinding.ts
- sessionReplayBuilder.ts
- compactRetentionPlanner.ts
- sessionResumeContextBuilder.ts
- mutationContinuityState.ts
- plannedFilesContinuityState.ts
- sessionPersistenceGateway.ts
- sessionHistoryCompactor.ts

#### cli.tsx

- cliModeDispatch.ts
- cliPrintModeRunner.ts
- cliStdinModeRunner.ts
- cliInteractiveBootstrap.ts
- slashCommandRegistry.ts
- continueCommandBridge.ts
- approvalPromptBridge.ts
- providerReadinessCliSurface.ts
- cliRuntimeInvocation.ts

The plan may reject some of these if evidence says they are not safe.

### 4. Sequencing

Create a route sequence of 6-10 future implementation routes.

Each route must include:

- route title
- target file
- why now
- allowed files
- forbidden files
- implementation seam
- tests to add/reuse
- validation commands
- success criteria
- failure criteria
- stop conditions
- evidence strength expected
- how it improves maintainability score

The sequence should avoid one-function helper extractions.
Prefer responsibility-sized chunks.

### 5. Recommended first implementation route

Pick exactly one next execution route.

The first route must be meaningful but low-risk.

It should probably target `runMvpIntegratedFlow.ts`, unless analysis shows `cli.tsx` or `SessionManager.ts` is a better first cut.

The recommendation must include:

- route name
- target module
- expected files changed
- allowed files
- forbidden files
- implementation entry point
- focused tests
- required validation
- success criteria
- stop conditions
- why this route moves maintainability toward 4/5

## Suggested prioritization rule

Prefer a first route that:

- touches one giant runtime file
- extracts one complete projection/assembly responsibility
- avoids provider call behavior changes
- avoids session persistence behavior changes
- avoids CLI interactive behavior changes
- has strong existing tests/gates
- reduces future changes to the giant file
- is larger than a tiny helper extraction

Likely good first candidates:

- `runMvpIntegratedFlow.ts` shell result assembly extraction
- `runMvpIntegratedFlow.ts` provider/tool outcome projection extraction
- `runMvpIntegratedFlow.ts` stopped/failure result projection extraction

Likely higher-risk later candidates:

- SessionManager persistence gateway extraction
- CLI interactive bootstrap extraction
- provider call orchestration changes
- approval lifecycle changes

## Anti-goals

The plan must explicitly reject:

- big bang rewrite
- extraction without tests
- line-count-only refactors
- capability expansion hidden in refactor
- default gate changes
- broad apply_patch
- 3-file writes
- delete/move
- rollback/atomicity
- external MCP ready claim
- default real-provider ready claim
- moving code into generic buckets without ownership
- mixing verifier decomposition into this runtime architecture program as the main goal

## Required validation

Run through rtk from /home/wang/projects/coding-agents.

Preflight:

- rtk git status --short --branch
- rtk git log --oneline -45

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

Optional if affordable:

- rtk npm run verify:cli-entry
- rtk npm run verify:release:core
- rtk npm run test -w packages/ts-shell -- src/cli-baseline.test.ts
- rtk npm run test -w packages/ts-shell -- src/core/shell/sessionRuntime.test.ts
- rtk npm run test -w packages/ts-shell -- src/core/query/resultMapper.test.ts

If a command does not exist, record it and inspect package.json for the actual name.

Do not run full opt-in real-provider execution.
Do not run arbitrary external MCP servers.

## Allowed modification scope

Allowed:

- docs/design/runtime-architecture-extraction-plan.md
- PROJECT_STATE.md only if adding a narrow pointer is useful
- RUNBOOK.md only if adding a narrow pointer is useful

Prefer one main plan file.

## Forbidden modification scope

Do not modify:

- packages/ts-shell/**
- scripts/**
- package.json
- default gates
- product behavior
- mutation capabilities
- provider behavior
- MCP behavior

If urgent product issues are discovered, record them as risks or future tasks. Do not fix them.

## Required plan file structure

The generated plan file must contain:

1. Executive summary
2. Why runtime architecture maintainability is now the priority
3. Current evidence baseline
4. Reference comparison summary
5. Target files and current responsibility maps
6. Existing extractions and what they solved
7. Remaining responsibility clusters
8. Target architecture principles
9. Proposed decomposition for runMvpIntegratedFlow.ts
10. Proposed decomposition for SessionManager.ts
11. Proposed decomposition for cli.tsx
12. Cross-cutting invariants
13. What must not change
14. Route sequence: 6-10 meaningful implementation routes
15. Recommended first implementation route
16. Validation matrix
17. Risk matrix
18. Definition of runtime architecture maintainability 4/5
19. Stop conditions for the overall extraction program
20. Appendix: commands run and results

## Success criteria

Route 16 is complete only if:

- The plan file exists.
- It covers runMvpIntegratedFlow.ts, SessionManager.ts, and cli.tsx.
- It uses evidence from target repo files.
- It uses narrow reference comparison against Claude Code and opencode.
- It proposes responsibility-sized extraction routes, not thin helper moves.
- It recommends exactly one first implementation route.
- It includes allowed/forbidden files and validation for each route.
- It explicitly separates runtime architecture work from verifier decomposition.
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
- baseline gates are failing
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
11. Runtime files analyzed
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

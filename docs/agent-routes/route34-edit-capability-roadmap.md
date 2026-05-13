# Route 34: edit capability upper-bound roadmap

This is a development-only Codex goal spec for bounded planning work.
It is not a product readiness claim.

## Objective

Switch from architecture extraction to edit capability upper-bound planning.

Analyze the current edit / patch / mutation capability of the target repository, compare it against three reference agent repositories, and write a concrete next-route roadmap into:

- docs/design/edit-capability-roadmap.md

This route is analysis + roadmap only.

Do not implement edit capability.
Do not modify product code.
Do not change tests, scripts, package scripts, default gates, runtime behavior, provider behavior, CLI behavior, session behavior, MCP behavior, or readiness claims.

The roadmap must be concrete enough to drive the next implementation routes. It must not be a thin generic plan.

## Target repository

- /home/wang/projects/coding-agents

## Reference repositories, read-only

- /home/wang/projects/source-claudecode
- /home/wang/projects/opencode
- /home/wang/projects/gemini-cli

If a referenced file path does not exist, use rtk search / rg to find the nearest relevant implementation.

## Current context

The project has recently completed major runtime/session/CLI maintainability extractions.

Architecture extraction is now paused. The next strategic direction is edit capability upper bound.

Known current bounded edit capabilities and claims to verify from code/docs/gates:

- MVP selected-workspace single-file update.
- Candidate single-file create.
- Candidate exactly-two existing-file update.
- Exactly-three existing-file planning/no-write.
- Unsupported patch E2E evidence for 3+ update, delete, move, broad apply_patch, malformed, mixed supported/unsupported.
- plannedFiles vs changedFiles continuity.
- stopped/error/success taxonomy.
- No broad apply_patch claim.
- No delete/move claim.
- No rollback/atomicity claim.
- No arbitrary mutation claim.
- No 3-file write claim.

The roadmap must verify these from current code/docs/tests rather than assuming.

## Path convention

Route/task specs belong under:

- docs/agent-routes/

Design and roadmap documents belong under:

- docs/design/

Write the actual roadmap to:

- docs/design/edit-capability-roadmap.md

Do not create additional route docs or design docs unless strictly necessary.

## Non-goals

Do not implement:

- 3-file writes
- broad apply_patch
- delete/move
- rollback
- snapshot/revert
- fuzzy patch
- stale-read recovery
- partial failure recovery
- new mutation lanes
- new provider behavior
- new CLI behavior
- new session behavior
- new gates

Do not modify:

- product code
- tests
- scripts
- package.json
- default gates
- PROJECT_STATE.md
- RUNBOOK.md

This route should produce a roadmap only.

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for file reads, search, git status/diff, tests, builds, verification, and large-output commands.
- Do not read, print, copy, grep, parse, modify, or summarize anything under:
  - /home/wang/.private-agents-real
- Do not run full real-provider execution.
- Do not modify reference repositories.
- Do not commit.
- Do not push.

## Required first step

Run:

- rtk git status --short --branch
- rtk git log --oneline -150

Read target repo docs first:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- docs/design/runtime-module-ownership-map.md
- docs/design/edit-capability-roadmap.md, if it already exists

Then inspect target edit/mutation implementation and gates.

Suggested target files / areas:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/mutationExecution.ts
- packages/ts-shell/src/orchestration/patchMutationLane.ts
- packages/ts-shell/src/orchestration/multiFileUpdatePlanning.ts, if present
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts
- packages/ts-shell/src/orchestration/providerOutcomeProjection.ts
- packages/ts-shell/src/orchestration/patchApplication/*
- packages/ts-shell/src/orchestration/patchResult/*
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- scripts/verify-real-user-capabilities.mjs
- scripts/real-user-capabilities/*
- package.json

Search target repo for:

- apply_patch
- mutation
- selected workspace
- changedFiles
- failedFiles
- plannedFiles
- postWriteVerification
- unsupported
- no-write
- three-file
- delete
- move
- rollback
- atomic
- stale
- read-before-write
- partial
- verification
- patchResult
- workspaceWriter

## Reference comparison requirements

Do a real comparison against all three reference repositories.

This must be narrow and purposeful, not a broad copy.

### Claude Code reference focus

Use Claude Code to understand product behavior and edit lifecycle patterns.

Search/read for:

- file edit read-first behavior
- stale read / stale edit rejection
- tool result surface
- permission/edit result surface
- failed edit result entering session/query loop
- user-visible edit UI

Suggested files if present:

- /home/wang/projects/source-claudecode/query.ts
- /home/wang/projects/source-claudecode/QueryEngine.ts
- /home/wang/projects/source-claudecode/tools/FileEditTool/FileEditTool.ts
- /home/wang/projects/source-claudecode/tools/FileEditTool/UI.tsx
- /home/wang/projects/source-claudecode/tools/FileEditTool/utils.ts
- /home/wang/projects/source-claudecode/tools/FileEditTool/types.ts

Extract lessons, not code.

Specifically identify:

- read-before-write expectations
- stale-file protection approach
- user-visible edit failure shape
- how failed edits remain visible to the loop/session
- what should not be copied because this project is smaller/bounded

### opencode reference focus

Use opencode as the strongest open implementation comparison for patch/edit/permission/snapshot layering.

Search/read for:

- edit
- multiedit
- apply_patch
- patch parse
- patch verify
- patch apply
- permission
- snapshot
- revert
- tool result
- changed files
- failed files
- output metadata

Suggested files if present:

- /home/wang/projects/opencode/packages/opencode/src/tool/edit.ts
- /home/wang/projects/opencode/packages/opencode/src/tool/multiedit.ts
- /home/wang/projects/opencode/packages/opencode/src/tool/apply_patch.ts
- /home/wang/projects/opencode/packages/opencode/src/patch/patch.ts
- /home/wang/projects/opencode/packages/opencode/src/permission/permission.ts
- /home/wang/projects/opencode/packages/opencode/src/permission/index.ts
- /home/wang/projects/opencode/packages/opencode/src/session/processor.ts
- /home/wang/projects/opencode/packages/opencode/src/snapshot/index.ts

Extract lessons, not code.

Specifically identify:

- parse / verify / permission / apply / summarize layering
- per-file metadata
- partial failure handling
- permission request/reply separation
- snapshot/revert architecture and why it is not a first implementation route here
- what can be adapted safely into this smaller bounded project

### Gemini CLI reference focus

Use Gemini CLI as a third comparison for CLI/core/tool architecture, tool schemas, checkpoint/sandbox behavior, and edit tool boundaries.

Search/read for:

- edit tool
- write file
- read file
- replace
- apply patch
- tools
- checkpoint
- restore
- sandbox
- trusted folder
- approval
- shell tool
- MCP tool
- core tool result

Suggested search roots if present:

- /home/wang/projects/gemini-cli/packages/cli
- /home/wang/projects/gemini-cli/packages/core

Suggested keywords:

- EditTool
- WriteFile
- ReadFile
- replace
- checkpoint
- sandbox
- tool result
- ToolResult
- FileOperation
- approval
- trusted

Extract lessons, not code.

Specifically identify:

- CLI/core separation around tools
- file edit / write tool boundaries
- checkpoint/sandbox/trusted-folder ideas
- how tool results are surfaced
- which ideas are too large for this project’s next route

## Required target analysis

The roadmap must include a current-state analysis of this project’s edit system.

At minimum, answer:

1. What edit capabilities are actually implemented?
2. What edit capabilities are only planned/no-write?
3. What edit requests are explicitly unsupported?
4. Where are capability boundaries enforced?
5. Where are unsupported requests classified?
6. Where are changedFiles / failedFiles / plannedFiles produced?
7. Where is post-write verification done?
8. Where is workspace boundary enforced?
9. What happens on malformed model output?
10. What happens on unsupported patch shape?
11. What happens on partial or post-write failure?
12. What is currently synthetic-only vs real-provider verified?
13. Which paths are covered by CLI evidence?
14. What is missing before broad apply_patch?
15. What is missing before 3-file writes?
16. What is missing before delete/move?
17. What is missing before rollback/atomicity?
18. What is missing before stale-read recovery?
19. What is missing before partial failure recovery?
20. What should remain explicitly unsupported for now?

Use paths, function names, tests, and verification commands as evidence.

## Required roadmap content

Write `docs/design/edit-capability-roadmap.md` with the following structure:

1. Executive summary
2. Current edit capability inventory
3. Current explicit non-claims
4. Current edit pipeline map
5. Evidence table
6. Reference comparison: Claude Code
7. Reference comparison: opencode
8. Reference comparison: Gemini CLI
9. Lessons to adopt
10. Lessons not to adopt yet
11. Capability gap analysis
12. Risk analysis
13. Proposed route sequence
14. First recommended implementation route
15. Validation strategy
16. Stop conditions
17. Readiness claim boundaries

## Current edit pipeline map

Include a pipeline diagram like:

User / CLI / provider output
→ model output parsing
→ mutation routing
→ capability boundary check
→ workspace boundary check
→ permission / approval if applicable
→ patch application / selected workspace writer
→ post-write verification
→ result projection
→ session continuity
→ CLI/user surface

For each stage, mark:

- implemented
- planned/no-write
- synthetic-only
- real-provider opt-in
- missing
- explicitly unsupported

## Evidence table

Include an evidence table with columns:

- Capability
- Status
- Evidence
- Evidence strength
- Gaps
- Next route if any

Use evidence strength levels:

- A = real-provider / real CLI / real runtime gate
- B = synthetic E2E / golden main path
- C = focused integration test
- D = unit / contract test
- E = documentation only
- F = static code inference

Do not overclaim based on weak evidence.

## Reference comparison depth

For each reference repo, include:

- Search terms used
- Files/fragments read
- Useful ideas
- Ideas rejected/deferred
- Concrete implication for this project’s roadmap

Do not merely name the repositories. The comparison must be actionable.

## Proposed route sequence

The route sequence should be concrete and bounded.

Do not propose “implement broad apply_patch” as one giant route.

Break it into route-sized steps, likely including some of:

- edit route contract hardening
- model-output patch fixture expansion
- stale-read/read-before-write detection
- broad apply_patch parser/evaluator in dry-run only
- per-file patch plan representation
- partial failure result surface
- exactly-three write capability only after no-write planning is proven enough
- delete/move plan classification before write support
- rollback/snapshot design only after patch result representation is mature
- real provider unsupported-output dogfood
- CLI user surface for edit failures
- session continuity for edit failure recovery

For each route include:

- objective
- allowed files
- forbidden files
- behavior boundaries
- validation commands
- success criteria
- stop conditions
- readiness claim impact

## First recommended implementation route

Pick exactly one next route.

It must be bounded and implementable.

It must explain why it is first.

It should probably not jump directly to broad apply_patch writes or rollback.

A good first candidate may be one of:

- edit route/result contract hardening
- stale-read/read-before-write detection
- model-output patch-shape fixture expansion
- broad apply_patch dry-run parser/plan only
- per-file patch plan representation without write capability

Choose based on actual code and reference comparison.

## Validation commands

Because this route is docs-only, required validation is:

- rtk git diff --check
- rtk git status --short --branch

Optional if you need to confirm current gates, but do not run full real-provider execution:

- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:unsupported-patch-e2e
- rtk npm run verify:real-user-capabilities:three-file-planning-no-write
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic

If optional gates are run, report results.

## Residue cleanup

If any command creates residue, clean it before final report when safe:

- permissions.jsonl
- history.db
- undefined/
- temporary audit output
- temporary logs
- /tmp/private-agents-test/test-results/real-user-capabilities-report.json

If residue cannot be cleaned, report why.

## Success criteria

Route 34 is complete only if:

- docs/design/edit-capability-roadmap.md exists
- roadmap includes current-state evidence
- roadmap compares all three reference repositories
- roadmap identifies actual implemented capabilities and explicit non-claims
- roadmap gives a concrete route sequence
- roadmap chooses exactly one next implementation route
- roadmap does not claim broad edit readiness
- roadmap does not propose unsafe giant jumps
- no product code changed
- no tests/scripts/package files changed
- validation passes
- no secret/provider config is printed

## Stop conditions

Stop and report if:

- target repo is dirty with unrelated changes
- reference repos are missing and cannot be searched
- AGENTS.md forbids the planned docs change
- roadmap would require reading private provider config
- you cannot identify current edit boundaries from code/docs
- validation fails for unrelated reasons

## Final report format

Produce a completion audit:

1. Route
2. Objective
3. Files changed
4. Product code touched? yes/no
5. Tests/scripts/package files touched? yes/no
6. Reference repositories inspected
7. Current edit capabilities summarized
8. Major gaps summarized
9. Proposed route sequence summarized
10. First recommended implementation route
11. Validation results
12. Residue cleanup status
13. Claim/readiness changes
14. Residual risks
15. Proposed commit message

## Commit and push policy

Do not commit or push.
Propose a commit message only.

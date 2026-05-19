# Route 131: Reference-informed module atlas

## Goal

Create a full modular architecture atlas for the project.

This is a docs-only architecture and research route. Do not modify source code.

The project has accumulated many strong capabilities through route-by-route development:

- edit / patch orchestration
- result contracts
- session / continue
- browser runtime
- browser agent-loop tools
- browser transactions
- browser trace / eval gate
- permission and policy gates
- harness and verification scripts

But the architecture has mostly evolved feature by feature. Reference projects have also been studied feature by feature instead of being understood as full systems.

Route 131 should fix that.

The goal is to study the current repo and top reference projects as complete modular systems, then define this project's next-stage module architecture.

Do not finish until all major modules are covered.

## Core principle

Do not define modules by folders or filenames.

A module is a responsibility boundary, not a directory.

Modules must be derived from:

- agent workflow responsibilities
- capability lifecycle stages
- data flow
- control flow
- ownership of decisions
- contracts between layers
- what can be tested and evolved independently

Files are evidence, not the source of truth.

Bad output:

- `core/context` is the Context module
- `core/harness` is the Harness module
- `session` is the Session module

Required output:

- identify conceptual modules
- map current files to primary and secondary module ownership
- identify shared contract files
- identify cross-layer concentration
- identify misplaced responsibilities
- identify duplicate contracts
- identify oversized or route-residue files

For example:

- `runMvpIntegratedFlow.ts` may contain Agent Loop, Tool Dispatch, Policy, Browser Agent Integration, and Result Mapping responsibilities. Do not assign it to one module just because of its location.
- `browserTxn.ts` may be primarily Browser Engineering but secondarily touches Runtime, Tool Execution, Evidence, and Agent Loop.
- `browserTxnEval.ts` may be browser-specific today but conceptually belongs to Harness / Eval Engineering.

## Required analysis order

Follow this order:

1. Scan the current project and identify responsibility clusters.
2. Reconstruct each reference project's native architecture in its own terms.
3. Write `docs/architecture/reference-architecture-maps.md`.
4. Derive cross-project architecture patterns.
5. Define this project's proposed module map.
6. Define the unified capability contract.
7. Map current project files to responsibility modules.
8. Identify architecture drift and duplicated contracts.
9. Produce the module backlog.
10. Produce the reusable module route template.

Do not start from the current repo's folder layout alone.
Do not start from a pre-decided module list alone.

The final module atlas must be informed by both:

- current project responsibility flow
- reference project architecture patterns

## Scope

Cover these modules in one route:

1. Agent Loop Engineering
2. Tool Engineering
3. Runtime Engineering
4. Context Engineering
5. Memory Engineering
6. Harness Engineering
7. Eval / Benchmark Engineering
8. Permission / Policy Engineering
9. Result Surface Engineering
10. Session / Continue Engineering
11. Provider / Model Engineering
12. CLI / UX Engineering
13. Workspace / File Context Engineering
14. Edit / Patch Engineering
15. Browser Engineering
16. Capability Contract Architecture

For each module, document:

- responsibility
- what belongs in the module
- what does not belong in the module
- current project files
- current strengths
- current drift / duplication / unclear boundaries
- reference project patterns
- what to adopt
- what to adapt
- what to reject
- project-specific innovation opportunity
- recommended follow-up routes

## Deliverables

Create these docs:

- `docs/architecture/reference-architecture-maps.md`
- `docs/architecture/module-atlas.md`
- `docs/architecture/capability-contract.md`
- `docs/architecture/reference-module-matrix.md`
- `docs/architecture/module-backlog.md`
- `docs/agent-routes/module-route-template.md`

Update only if useful:

- `docs/design/edit-capability-roadmap.md`

Do not modify source code.
Do not modify package files.

## Reference architecture extraction

Before proposing this project's module atlas, reconstruct how each reference project organizes itself.

Do not only read feature files.

For each reference project, document:

- top-level package / directory structure
- main architectural layers
- how it separates agent loop, tools, runtime, context, memory, eval, provider, permission, session, and UX
- what concepts are first-class modules
- what concepts are embedded inside larger modules
- where boundaries are strong
- where coupling or ad-hoc structure appears
- which boundaries are worth adopting
- which boundaries should be adapted
- which boundaries should not be copied

Create:

- `docs/architecture/reference-architecture-maps.md`

This doc must include one section per reference project:

1. ClaudeCode
2. opencode
3. OpenHands
4. Stagehand
5. Playwright MCP
6. Inspect AI
7. mini-swe-agent
8. gemini-cli

Each section should include:

- native module map
- organizing principle
- notable boundaries
- weak spots / coupling
- lessons for this project

Important:

- Do not force every reference project into this project's module list.
- First describe the reference project in its own terms.
- Then translate lessons into this project's module system.

## Reference projects

Primary references:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/stagehand`
- `/home/wang/projects/playwright-mcp`
- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`
- `/home/wang/projects/gemini-cli`

Reference focus:

### ClaudeCode

Focus on:

- agent loop
- tool execution
- permissions
- context compaction
- session / continue
- terminal result surface

### opencode

Focus on:

- tool registry
- provider boundaries
- permission model
- session state
- CLI UX
- runtime execution

### OpenHands

Focus on:

- action / observation event loop
- runtime sandbox
- event store
- browser/action integration
- task trajectory

### Stagehand

Focus on:

- browser observe / act / extract abstraction
- planner boundary
- action target confidence
- repair strategy
- browser-specific context

### Playwright MCP

Focus on:

- browser tool schemas
- tool result contracts
- browser lifecycle
- snapshots
- action evidence
- MCP backend boundary

### Inspect AI

Focus on:

- eval / task / scorer / report separation
- benchmark design
- pass / fail / skip semantics
- reproducible evaluation

### mini-swe-agent

Focus on:

- compact agent loop
- trajectory format
- simple harness design
- reproducible failure report

### gemini-cli

Focus on:

- provider boundary
- tool call handling
- CLI interaction
- context / tool integration

## Reference budget

This route may read more than normal because it is a system architecture pass.

Default budget:

- ClaudeCode: up to 20 files
- opencode: up to 20 files
- OpenHands: up to 20 files
- Stagehand: up to 15 files
- Playwright MCP: up to 15 files
- Inspect AI: up to 15 files
- mini-swe-agent: up to 10 files
- gemini-cli: up to 10 files

Target total: about 100-125 files.

Exceed only if a file directly clarifies a module boundary.

Do not dump raw reference notes.
Synthesize architecture patterns.

## Current repo scan

Scan the current project for responsibility ownership.

At minimum inspect:

- `packages/ts-shell/src`
- `packages/ts-shell/src/core`
- `packages/ts-shell/src/core/context`
- `packages/ts-shell/src/core/harness`
- `packages/ts-shell/src/orchestration`
- `packages/ts-shell/src/session`
- `packages/ts-shell/src/entrypoints`
- `packages/ts-shell/src/cli-baseline.test.ts`
- `scripts`
- `docs/design`
- `docs/agent-routes`
- package scripts

Produce a file-to-module ownership table.

Use this table format:

| File | Primary module | Secondary modules | Role | Drift risk | Future action |
|---|---|---|---|---|---|

Rules:

- Every file should have at most one primary module.
- A file may have multiple secondary modules.
- If a file has more than three secondary modules, mark it as cross-layer concentration.
- If a file contains policy + execution + result rendering + transcript logic, mark it as boundary drift.
- Do not recommend splitting files unless the responsibility split is clear.

Mark files as needed:

- single-module
- shared contract
- cross-layer concentration
- oversized
- route-specific residue
- misplaced responsibility
- candidate for future consolidation

Do not modify code.

## Capability flow analysis

For each major capability, map the full lifecycle across modules.

Cover at least:

- Browser transaction
- Edit / patch
- Shell command
- File read / workspace context
- Memory / continuation
- Provider / model call

Use this lifecycle:

availability -> policy -> planning -> execution -> observation -> evidence -> result mapping -> transcript -> continue/replay -> eval -> report -> cleanup/redaction

For each lifecycle, identify:

- which module owns each stage
- current files involved
- duplicated contracts
- missing stages
- inconsistent naming or evidence shape
- future consolidation opportunity

## Capability Contract Architecture

Define a project-wide capability contract.

Every major capability should eventually align to:

- availability
- policy
- planning
- execution
- observation
- evidence
- result mapping
- transcript
- continue / replay
- eval
- report
- cleanup
- redaction

Apply this model to at least:

- browser
- edit / patch
- shell
- file context
- memory
- provider / model
- session / continue

Document which capabilities already align and which do not.

## reference-architecture-maps.md

This doc explains how the reference projects are modularized in their own terms.

Required structure:

1. Executive summary
2. One section per reference project
3. Cross-project architecture patterns
4. Patterns to adopt
5. Patterns to adapt
6. Patterns to reject
7. Lessons for this project

Each project section must include:

- native module map
- organizing principle
- first-class concepts
- embedded concepts
- strong boundaries
- weak coupling / ad-hoc areas
- lessons for this project

## module-atlas.md

This is the main output for this project.

Required structure:

1. Executive summary
2. Proposed module map
3. Module dependency graph
4. Per-module ownership
5. Capability flow maps
6. Current file-to-module ownership table
7. Cross-cutting contracts
8. Current architecture drift
9. What reference projects teach
10. Project-specific architecture innovation
11. Recommended development order

Each module section must include:

- purpose
- responsibilities
- non-responsibilities
- current files
- reference patterns
- gaps
- next routes

## capability-contract.md

Define the unified capability contract.

Include:

- contract stages
- data shape expectations
- redaction rules
- evidence rules
- result mapping rules
- transcript / continue rules
- eval / report rules
- cleanup rules
- examples for browser, edit, shell, memory, context, and provider/model

This should become the standard future features follow.

## reference-module-matrix.md

Create a matrix that compares responsibility boundaries across projects.

The matrix must distinguish:

- native module name in the reference project
- equivalent responsibility in this project
- whether this project should adopt, adapt, or reject the pattern
- why

Use this format where useful:

| Responsibility | ClaudeCode | opencode | OpenHands | Stagehand | Playwright MCP | Inspect AI | mini-swe-agent | gemini-cli | Proposed project module |
|---|---|---|---|---|---|---|---|---|---|

Do not write file-by-file logs.

## module-backlog.md

Create a concrete backlog for future routes.

Required sections:

- high-priority module consolidation routes
- medium-priority module cleanup routes
- low-priority polish routes
- cross-module contract routes
- eval/gate routes

Each backlog item should include:

- route title
- module
- goal
- expected files
- reference projects
- validation
- risk

Include at least Routes 132-145.

## module-route-template.md

Create a reusable template for future module routes.

The template must force every future route to state:

- module
- layer
- capability contract stage
- references
- current project surfaces
- allowed changes
- boundaries
- validation
- final report format

This should replace vague feature-route prompts.

## Roadmap update

If useful, update `docs/design/edit-capability-roadmap.md` with a short Route 131 note.

Do not expand the roadmap heavily.

## Boundaries

Hard boundaries:

- docs only
- no source code changes
- no package changes
- no dependency changes
- no behavior changes
- no broad formatting churn
- no generated code
- no commit or push

This route may read a lot, but should write only architecture docs.

## Validation

Run:

- markdown/doc sanity checks if available
- `rtk git diff --check`
- `rtk git status --short --branch`
- verify no source files changed:
  - `rtk git diff --name-only -- packages/ts-shell/src`
  - `rtk git diff --name-only -- package.json package-lock.json packages/ts-shell/package.json`

Do not run broad tests unless docs tooling requires it.

## Final report

Include:

1. What docs were created/updated
2. Reference projects scanned
3. Native reference architecture findings
4. Modules covered
5. Most important architecture findings
6. Capability contract summary
7. Biggest current project drift
8. Recommended Routes 132-145
9. Validation
10. Confirm no source/package changes
11. Proposed commit message

Do not commit or push.

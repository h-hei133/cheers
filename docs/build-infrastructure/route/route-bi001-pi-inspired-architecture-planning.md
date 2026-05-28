# Build Infrastructure Route BI001: Pi-inspired Architecture Planning

## Goal

Use the uploaded Pi architecture summary, the local reference repository at /home/wang/projects/pi, and Serena semantic inspection to plan how this project should adopt Pi-inspired architecture patterns without reintroducing route-grown product structure.

This is a planning route, not an implementation route.

Codex must create build-infrastructure planning documents under:

docs/build-infrastructure

Route documents live under:

docs/build-infrastructure/route

Do not place new product code in this route.

## Why this route exists

The project recently completed architecture cleanup:

- runMvpIntegratedFlow became a thin compatibility wrapper
- owner-domain-first layout was introduced
- AGENTS.md became a short index with durable agent-rules
- ExecutionService became the TypeScript execution boundary
- Rust is now a native executor candidate, not the current execution plane
- Python is offline eval only
- evidence and truthfulness rules are durable
- route-era product naming is forbidden

Now the next step is to study Pi as a clean agent runtime reference and decide which architecture ideas should be adopted.

The objective is not to copy Pi blindly. The objective is to extract patterns that fit this project.

## Required inputs

Codex must use:

1. The uploaded Pi architecture summary supplied by the user.
2. The local Pi repository at /home/wang/projects/pi.
3. Serena semantic tools for targeted repository exploration.
4. This project current architecture rules:
   - AGENTS.md
   - agent-rules
   - docs/product-architecture-reset if relevant
   - current domain layout in packages/ts-shell/src
   - ExecutionService and execution boundary docs if present

Do not rely only on memory or web descriptions.

## Serena usage requirements

Use Serena for semantic inspection.

Required Serena activities:

1. Open or activate the current project workspace.
2. Inspect symbols and files around current agent runtime, session, execution, CLI, provider, tool, evidence, result, context, planning, proposal, edit, verification, and repair domains.
3. Inspect /home/wang/projects/pi with Serena for architecture-relevant symbols and file layout.
4. Prefer symbol overview, reference search, and targeted reads over broad file dumps.
5. Record what Serena inspected in the planning docs.
6. Do not let Serena edits modify product code in this route unless a tiny doc-only fix is required.

If Serena is unavailable, stop and report BLOCKED. Do not fake Serena-based findings.

## Pi architecture areas to study

Study Pi only for architecture patterns.

Focus areas:

1. Small core and extension model
   - what belongs in core
   - what should be extension or resource
   - how workflow stays outside core

2. AgentHarness and turn snapshot
   - mutable harness config
   - frozen turn snapshot
   - save points
   - phase model
   - steering, follow-up, next-turn delivery modes

3. Agent loop
   - streaming model response
   - tool call execution
   - tool results
   - next turn preparation
   - event stream

4. Tool runtime
   - tool schema
   - prepare arguments
   - before and after tool hooks
   - sequential versus parallel execution
   - content versus details
   - mutation queue risk

5. Session tree
   - append-only JSONL
   - id and parentId tree
   - active leaf
   - branch summary
   - compaction
   - current context path

6. Resource system
   - skills
   - prompt templates
   - extensions
   - packages
   - themes
   - custom models and providers

7. Provider abstraction
   - provider adapters
   - per-request auth resolution
   - custom providers
   - model compatibility flags

8. Execution environment
   - file system abstraction
   - shell abstraction
   - Result-style low-level errors
   - sandbox or remote executor readiness

9. SDK and UI adapter separation
   - CLI is one host
   - SDK and event stream are other hosts
   - TUI is separate from runtime

## Project fit analysis

For each Pi pattern, classify it as one of:

- adopt now
- adapt later
- reject
- already covered
- needs experiment

Every classification must include:

- Pi pattern
- local project problem it solves
- local owner domain
- target files or modules
- expected benefit
- risk of route-era pollution
- evidence or inspection source
- recommended route or implementation phase

Do not make vague claims such as improve architecture. Be specific.

## Required output documents

Create these documents under docs/build-infrastructure:

1. pi-reference-inspection-notes.md

Must include:
- Serena inspection scope
- Pi repo areas inspected
- local project areas inspected
- key symbols or files reviewed
- what was not inspected
- confidence level

2. pi-pattern-adoption-matrix.md

Must include:
- small core and extension model
- AgentHarness and turn snapshot
- save point and phase model
- session tree
- tool runtime and hooks
- event stream
- resource loader
- provider abstraction
- ExecutionEnv
- SDK and UI adapter separation
- extension or package model
- classification for each pattern

3. local-architecture-gap-analysis.md

Must include:
- current project strength after architecture cleanup
- remaining architectural gaps
- where Pi can help
- where Pi should not be copied
- risks of overfitting to Pi
- risks of route-grown relapse

4. build-infrastructure-roadmap.md

Must include:
- recommended implementation sequence
- owner domains
- allowed changes
- forbidden changes
- validation per phase
- expected first implementation route after planning

5. bi001-planning-summary.md

Must include:
- final recommendation
- top 5 adopt-now patterns
- top 5 adapt-later patterns
- rejected patterns
- immediate next route name
- no-code-change confirmation or exact doc-only changes

## Candidate adoption themes

The planning should strongly consider these directions but must verify with Serena:

1. Harness and turn runtime
   Possible local owners:
   - runtime
   - turn
   - session
   - cli

2. Session tree and continuation
   Possible local owners:
   - session
   - result
   - evidence

3. Tool runtime and ExecutionService alignment
   Possible local owners:
   - runtime/execution
   - tool
   - policy
   - browser
   - provider
   - edit
   - verification

4. Event stream and product surface
   Possible local owners:
   - runtime/events
   - cli
   - session
   - result

5. Resource and extension system
   Possible local owners:
   - runtime/resources
   - skills
   - prompts
   - provider
   - tool

6. Provider and model registry
   Possible local owners:
   - provider
   - policy
   - evidence

7. SDK or host separation
   Possible local owners:
   - cli
   - runtime
   - session

## Architecture cleanliness rules

This route must preserve the cleaned architecture.

Hard rules:

1. No route-numbered product files.
2. No capstone, cut-through, sprint, MVP, route, closeout, or temporary process words in product code names.
3. Do not grow compatibility shims.
4. Do not put business logic into runMvpIntegratedFlow, CLI compatibility files, or re-export shims.
5. Owner-domain-first. Every proposed file must name its owner domain.
6. No helpers, utils, common, misc, support dumping grounds.
7. Side effects must go through ExecutionService or a sanctioned owner.
8. Success must be evidence and verdict backed.
9. Provider remains opt-in.
10. Python remains offline eval only.
11. Rust remains a native executor candidate unless real execution pressure justifies expansion.
12. Contracts must not become business logic helpers.
13. Test failures must be classified before edits.

## What not to do

Do not:

- implement the Pi architecture in this route
- create product code
- create new route-era product files
- create a route runner
- create a verify:route script
- rewrite core runtime
- move files just to match Pi names
- copy Pi code directly
- weaken existing evidence or truthfulness rules
- bypass ExecutionService
- introduce new dependencies
- default-enable provider, tools, browser, or external execution

## Validation

Run only validation appropriate for docs and planning unless tiny doc tooling is touched.

Required:

- git diff --check
- git status --short --branch

Recommended if docs tooling or package metadata is touched:

- npm run build -w packages/ts-shell only if product code was accidentally touched or needed
- relevant docs lint only if available

Do not claim build or tests passed unless actually run.

## Completion criteria

This route is COMPLETE only if:

- Serena was used for both current project and /home/wang/projects/pi, or the route is honestly BLOCKED due to Serena unavailable
- all required docs were created under docs/build-infrastructure
- route document remains under docs/build-infrastructure/route
- no product code was changed
- Pi patterns are classified as adopt now, adapt later, reject, already covered, or needs experiment
- each adopt-now pattern has an owner domain and local target area
- architecture cleanliness rules are explicitly applied
- next implementation route is recommended
- git diff --check passes
- git status is reported

If Serena is unavailable or the local Pi repo cannot be inspected, final status must be BLOCKED or PARTIAL with exact reason.

## Final report

Final report should be concise.

Include:

1. Final status
2. Serena inspection summary
3. Documents created
4. Top adopt-now patterns
5. Top adapt-later patterns
6. Rejected patterns
7. Owner domains affected
8. Architecture risks
9. Validation pass/fail
10. Files changed
11. Recommended next route


# Build Infrastructure Route BI006: Pi Deep Audit And Next Directions

## Goal

Do not implement new product architecture in this route.

This route is an audit and documentation route.

BI001 to BI005 adopted the first Pi-inspired infrastructure layer:

- runtime turn snapshot
- phase and save point
- execution receipt and error taxonomy
- tool result content/details split
- session projection and runtime event projection
- static resource descriptor and projection

The user now wants a deeper audit of Pi before continuing implementation.

This route must answer:

What important Pi architecture patterns have not been studied or adopted yet?
Which patterns should be implemented next?
Which patterns should be postponed?
Which patterns should be rejected?
How should future build-infrastructure routes be grouped?

## Required inputs

Use:

- current project repository
- local Pi repository at /home/wang/projects/pi
- Pi official docs if internet access is available
- existing docs/build-infrastructure documents
- BI001 to BI005 route outputs and source changes
- current AGENTS.md and agent-rules

Use Serena for targeted local repository inspection.

Do not rely only on memory.

## Required Serena inspection

Use Serena on the current project and Pi.

Current project areas to inspect:

- runtime
- turn
- runtime/events
- runtime/execution
- runtime/resources
- session
- evidence
- result
- provider
- tools
- cli or core/shell
- planning
- context
- ExecutionService
- agent-rules

Pi areas to inspect:

- AgentHarness
- agent loop
- session tree
- compaction
- branch summary
- resources
- skills
- prompt templates
- extensions
- packages
- provider registry
- custom provider
- model registry
- SDK
- RPC mode if present
- JSON event stream if present
- TUI or renderer boundary
- tool hooks
- tool result details
- ExecutionEnv

If Serena is unavailable, stop and report BLOCKED.

## Audit scope

This route must audit at least these Pi-inspired architecture areas:

1. Extension lifecycle and hook boundary
2. Tool hook and permission interception
3. Session tree, branch, compaction, and context rebuilding
4. Programmatic runtime API, SDK, RPC, and JSON event stream
5. Provider and model registry with compatibility flags
6. Package and resource distribution governance
7. UI rendering and message renderer boundary
8. Resource loading beyond static descriptors
9. Steering, follow-up, and next-turn delivery modes
10. Compaction and branch summary strategy
11. Extension state persistence and branch-aware state rebuild
12. Parallel and sequential tool execution safety
13. Per-file mutation queue or write conflict prevention
14. Provider request hooks and per-request auth refresh
15. Runtime host separation between CLI, SDK, tests, and future UI

## Required output documents

Create these documents under docs/build-infrastructure:

1. pi-deep-audit-uncovered-patterns.md

Must include:
- what BI001 to BI005 already covered
- what Pi patterns remain uncovered
- Pi evidence from local repo and docs
- local project status for each pattern
- why each pattern matters
- whether it should become a route

2. pi-next-direction-map.md

Must include:
- recommended next directions
- priority order
- owner domains
- expected benefit
- implementation risk
- architecture cleanliness risk
- validation approach
- whether each item is implementation, planning, audit, or experiment

3. pi-pattern-rejection-and-delay-log.md

Must include:
- patterns to reject now
- patterns to delay
- why not now
- what signal would make them worth revisiting
- risk of copying Pi blindly

4. build-infrastructure-route-index.md

Must include:
- completed routes BI001 to BI005
- proposed next routes
- route grouping strategy
- what can be combined
- what must stay separate
- recommended immediate next route
- recommended route after that

5. bi006-deep-audit-summary.md

Must include:
- final audit conclusion
- top adopt-now candidates
- top adapt-later candidates
- rejected candidates
- recommended next route
- no-product-code-change confirmation

## Route grouping guidance

The audit should decide whether the next implementation routes should be grouped like this or adjusted:

Candidate BI007:
Extension Lifecycle And Hook Boundary

Candidate BI008:
Session Branch Compaction And Context Rebuild

Candidate BI009:
Programmatic Runtime API And JSON Event Stream

Candidate BI010:
Provider Model Registry And Compatibility Flags

Candidate BI011:
Tool Hook Permission Interception

Candidate BI012:
Package Resource Governance

Candidate BI013:
UI Rendering And Message Renderer Boundary

The audit may merge routes if they share an owner domain and validation path.

The audit may split routes if they carry different safety risks.

## Architecture cleanliness rules

Preserve the cleaned architecture.

Hard rules:

- no product code changes in this route
- no route-numbered product files
- no route-era product naming
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no dynamic plugin execution
- no provider default enablement
- no package installation
- no session schema migration
- no broad runtime rewrite
- no new dependencies
- no Python runtime
- no contracts business logic
- no ExecutionService bypass
- no success claims outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement BI007 or later
- create product code
- create route runner
- create verify route script
- create JSON capability report
- copy Pi file structure directly
- move files
- modify package scripts
- edit AGENTS.md or agent-rules unless a tiny documentation reference is necessary
- claim build or tests passed if not run

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

## Completion criteria

BI006 is COMPLETE only if:

- Serena was used on current project and Pi
- Pi docs were checked if internet access was available, or marked unavailable
- all five required docs were created under docs/build-infrastructure
- no product code was changed
- uncovered Pi patterns are clearly listed
- proposed next routes are grouped and prioritized
- every next route has owner domains and risk notes
- rejected or delayed Pi patterns are documented
- immediate next route is recommended
- git diff --check passes
- git status is reported

If Serena or Pi repo is unavailable, report BLOCKED or PARTIAL honestly.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Pi docs inspection status
4. Documents created
5. Top uncovered Pi patterns
6. Recommended next routes
7. Patterns rejected or delayed
8. Immediate next route
9. Validation pass/fail
10. Files changed
11. Confirmation that no product code changed

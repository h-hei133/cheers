# Product Loop Route PL003: Agent Loop Remaining Phases Audit

## Goal

Audit and plan the remaining Agent Loop productization phases after PL002.

PL002 connected the real CLI coding path to the agent loop spine as observation only.

That is only the beginning of the Agent Loop.

PL003 must audit the remaining Agent Loop phases needed to approach the local architecture study target:

prompt
-> model boundary
-> assistant response accumulation
-> tool call batch collection
-> before-tool policy
-> tool execution dispatch
-> tool result messages
-> after-tool annotation
-> save point
-> prepare next turn
-> steering and follow-up delivery
-> verification and repair handoff
-> session continuation
-> product surface and event stream

This route is audit and planning only.

Do not implement product code in this route.

## Why this route exists

PL002 proves that the current CLI product path can emit loop observations, but it does not prove full Agent Loop behavior.

Still missing or only contract/projection-level:

- real model response boundary
- provider streaming or response accumulation
- model-driven tool call collection
- real tool batch dispatch policy
- tool result message construction for next model turn
- prepare-next-turn semantics
- steering queue
- follow-up queue
- next-turn delivery ordering
- abort and cancellation propagation
- verification handoff inside loop
- repair handoff inside loop
- session context rebuild as real next-turn input
- storage-backed branch and compaction behavior
- SDK/RPC event stream host integration

PL003 must define the remaining blocks and route order before more implementation.

## Required inputs

Use local project state.

Use recent product loop docs if present:

- docs/build-infrastructure/product-loop-real-cli-agent-loop-audit.md
- docs/build-infrastructure/product-loop-real-cli-agent-loop-implementation-plan.md
- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md
- docs/build-infrastructure/agent-loop-infrastructure-connection-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md

Use current source code.

Use the local architecture study repository for targeted Agent Loop comparison.

Do not rely on memory alone.

## Required inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted local repository search and report that honestly.

Inspect current project:

- runtime loop contract
- loop trajectory projection
- workflowExecutionCoordinator
- ShellSessionRuntime
- CLI runtime invocation path
- provider registry and provider readiness
- provider draft or response boundary
- tool dispatcher
- tool result split
- tool interception
- ExecutionService
- execution receipt
- save point and turn boundary
- session active path projection
- context rebuild projection
- verification command stage
- repair flow or repair iteration surface
- runtime event projection
- JSON event stream
- product surface renderer
- result and evidence truthfulness

Inspect the local architecture study repository for Agent Loop only:

- main loop implementation
- assistant streaming boundary
- model response accumulation
- tool call extraction
- tool batch dispatch
- tool result message construction
- prepare next turn
- save point behavior
- steering queue
- follow-up queue
- next-turn delivery mode
- abort and cancellation handling
- session context rebuild
- event emission
- tool update events
- compaction interaction with loop

Do not broad dump either repository.

Record inspected symbols and files in the final report.

## Audit questions

### 1. What is the complete target Agent Loop?

Define the target loop phases in local project terms.

Required classification:

- already product-integrated
- observation-only
- contract-only
- projection-only
- missing
- unsafe to implement now
- deferred

### 2. What did PL002 actually complete?

Classify PL002 precisely.

Expected classification:

- real CLI path observation connected
- workflow coordinator can emit loop trajectory
- shell and presentation can consume observation
- product loop not replaced
- model/tool loop not implemented
- next-turn loop not implemented
- verification/repair loop not integrated as loop phases

Do not overclaim PL002.

### 3. What is the next block after PL002?

Choose the next implementation block.

Candidate blocks:

1. Model response boundary and provider response accumulation
2. Tool call batch boundary and tool result messages
3. Save point and prepare-next-turn product semantics
4. Steering and follow-up queues
5. Verification and repair handoff inside the loop
6. Session context rebuild as next-turn input
7. Runtime API and JSON stream product host
8. Full product loop adapter

Choose the next block based on dependency order and product value.

### 4. Which phases can be combined?

Plan aggressive but safe grouping.

Combine phases only when they share owner domains and validation path.

Possible grouping:

- model response boundary plus tool call extraction
- tool batch dispatch plus tool result message construction
- save point plus prepare-next-turn
- steering plus follow-up plus next-turn delivery
- verification failure handoff plus repair handoff
- session context rebuild plus next-turn input

Do not combine:

- real provider streaming with default provider enablement
- tool execution behavior with command allowlist expansion
- session schema migration with product loop adapter
- SDK/RPC server with CLI product loop stabilization
- browser/external tools with local tool loop stabilization

### 5. What should stay observation-only?

Explicitly identify which parts should stay observation-only in the next few routes.

Expected observation-only areas:

- terminal success
- provider success unless proven by provider owner
- tool success as task success
- command exit zero as verification success
- save point as success
- next turn prepared as success
- session context rebuild as enough-context success
- rendered product surface as success

### 6. What are the route phases to reach near-target Agent Loop?

Create a phased roadmap.

It should include at least:

- PL004 model response and tool-call boundary
- PL005 tool batch dispatch and tool result messages
- PL006 save point, prepare-next-turn, steering and follow-up
- PL007 verification and repair handoff inside loop
- PL008 session context rebuild and continuation loop hardening
- PL009 product loop adapter consolidation
- PL010 optional SDK or JSON host route only after local loop is stable

The audit may adjust names and grouping.

### 7. What is the immediate next implementation route?

Write the next implementation route summary in enough detail that a route file can be generated later.

It must include:

- goal
- owner domains
- files likely to inspect
- allowed changes
- forbidden shortcuts
- tests
- validation
- completion criteria
- what remains not-proven

## Required output documents

Create these docs under docs/build-infrastructure:

1. product-loop-agent-loop-remaining-phases-audit.md

Must include:

- target Agent Loop phase model
- PL002 actual completion classification
- gap analysis against target loop
- local current owner map
- architecture study findings
- risk and truthfulness guardrails

2. product-loop-agent-loop-phase-roadmap.md

Must include:

- recommended PL004 onward route sequence
- what each route implements
- what each route defers
- what can be combined
- what must stay separate
- owner domains
- validation expectations
- completion criteria
- when the loop can be considered close to target

Update if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Only update it if this audit changes or sharpens the route order.

Do not create JSON reports.

Do not create route runners.

Do not create verify scripts.

## Architecture constraints

Hard rules:

- audit and planning only
- no product code changes
- no route-numbered product files
- no external-origin product naming in product paths
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no product loop replacement
- no provider default enablement
- no real provider calls
- no tool behavior changes
- no command allowlist expansion
- no edit behavior changes
- no verification behavior changes
- no repair behavior changes
- no session schema migration
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement PL004
- rewrite workflowExecutionCoordinator
- rewrite ShellSessionRuntime
- call provider
- execute tools
- add route runner
- add verify script
- add JSON capability report
- add package scripts
- edit tests
- change product behavior

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

Do not claim build or tests passed unless actually run.

## Completion criteria

PL003 audit is COMPLETE only if:

- targeted inspection was performed and reported
- target Agent Loop phases are defined
- PL002 is precisely classified
- remaining gaps are mapped
- route sequence PL004 onward is planned
- next implementation route is specified
- truthfulness risks and guardrails are documented
- required docs are created
- no product code is changed
- git diff check passes
- git status is reported

If the local product loop or study target is too unclear to plan safely, report PARTIAL and list exactly what must be inspected next.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. PL002 actual scope
5. Target Agent Loop phase model
6. Remaining gaps
7. Recommended route sequence
8. Immediate next implementation route
9. Truthfulness guardrails
10. Validation pass or fail
11. Files changed
12. Confirmation whether product code changed

# VR001: Verification Repair Behavior Audit

## Goal

Start the Verification And Repair Behavior capability block.

This is an audit and planning task only.

Do not implement product code in this task.

The purpose is to decide how verification, repair, post-repair verification, and final verdict should connect to the current Agent Loop spine.

This block must connect to:

- context and planning facts
- model boundary facts
- tool batch and tool outcome facts
- next-turn and response cycle facts
- edit and proposal facts
- verification intent
- verification dispatch boundary
- verification result evidence
- repair requirement
- repair proposal
- repair authority
- repair apply observation
- post-repair verification
- evidence and final verdict
- runtime events and JSON stream
- product surface

This block must not become an isolated verification subsystem.

## Current Context

The project now has three connected capability blocks:

- Context and Planning
- Provider and Model Boundary
- Model Tool Runtime

The current Agent Loop can observe context, planning, request preparation, controlled invocation facts, response reentry, tool extraction, tool batch execution facts, tool outcome bundles, save point input, and next-turn preparation.

The missing behavior block is verification and repair.

Without this block, tool and model outcomes can flow through the loop, but the runtime still cannot safely decide:

- whether task-relevant verification was run
- whether verification passed
- whether verification failed
- whether repair is required
- whether repair was proposed
- whether repair was authorized
- whether repair was applied
- whether post-repair verification passed
- whether success can enter verdict consideration

## Core Question

How should verification and repair become an Agent Loop behavior block without creating false success?

The answer must identify:

- which owner domain owns verification intent
- which owner domain owns verification dispatch
- which owner domain owns verification result evidence
- which owner domain owns repair requirement
- which owner domain owns repair proposal
- which owner domain owns repair authority
- which owner domain owns repair apply observation
- which owner domain owns post-repair verification
- which owner domain owns final verdict input
- which facts flow from model, tool, edit, and planning blocks into verification
- which facts flow from verification into repair
- which facts flow from repair into verdict or next turn
- what remains not-proven

## Required Inputs

Use local project state.

Use recent local docs if present:

- docs/build-infrastructure/context-planning-quality-roadmap.md
- docs/build-infrastructure/provider-streaming-model-boundary-audit.md
- docs/build-infrastructure/provider-streaming-model-boundary-roadmap.md
- docs/build-infrastructure/model-tool-batch-handoff-audit.md
- docs/build-infrastructure/model-tool-batch-handoff-roadmap.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md
- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Use current source code.

Do not rely on memory alone.

## Required Inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- verification command planning
- verification command dispatch
- verification result classification
- verification failure classification
- task-relevant verification selection
- verification result evidence
- repair requirement surfaces
- repair proposal surfaces
- repair apply surfaces
- post-repair verification surfaces
- evidence ledger and verdict surfaces
- result truthfulness surfaces
- claim or proof projection surfaces
- edit and proposal handoff surfaces
- tool outcome and next-turn surfaces
- model response cycle surfaces
- Agent Loop contract and trajectory
- runtime event projection and JSON stream
- product surface and renderer
- CLI or session seams only to understand existing flow
- focused tests around verification, repair, result, evidence, tool outcomes, model cycle, product surface, and loop facts

Do not inspect outside code unless a concrete local blocker requires it.

If outside inspection is used, keep outside names out of product code, tests, runtime events, package commands, user-facing output, and newly created local docs for this task.

Record inspected local files and symbols in the final report.

## Audit Scope

### 1. Current verification path map

Map the current verification path:

- verification intent source
- command or check selection
- relevance classification
- authority requirement
- dispatch boundary
- receipt or result evidence
- pass/fail/blocked/not-run classification
- task relevance status
- failure classification
- product surface status
- result or verdict consumption

Classify each piece as:

- product path
- contract only
- projection only
- focused test only
- legacy compatibility
- missing owner
- not-proven

### 2. Current repair path map

Map the current repair path:

- repair requirement source
- original failure preservation
- repair proposal source
- repair proposal status
- repair authority requirement
- repair apply boundary
- repair apply observation
- post-repair verification
- final verdict candidate
- continuation or next-turn handoff

Classify each piece as:

- product path
- contract only
- projection only
- focused test only
- legacy compatibility
- missing owner
- not-proven

### 3. Agent Loop fit

Map verification and repair facts to loop phases:

- context and planning output
- edit and proposal handoff
- model response outcome
- tool outcome bundle
- next-turn bundle
- verification intent
- verification dispatch
- verification result
- repair requirement
- repair proposal
- repair authority
- repair apply observation
- post-repair verification
- verdict candidate
- save point
- next turn
- runtime events
- product surface

Classify each as:

- ready for product integration
- projection only
- contract only
- missing owner
- unsafe to integrate now
- deferred

### 4. Prior block dependency

Verification and repair must consume the existing Agent Loop facts, not bypass them.

Audit how verification should use:

- planning verification intent
- edit handoff facts
- tool outcome facts
- model response cycle facts
- next-turn facts
- context sufficiency facts
- not-proven claims
- authority and policy facts

Audit how repair should use:

- original verification failure
- changed target facts
- edit or proposal facts
- failure classification
- safe context facts
- authority facts
- post-repair verification requirement

### 5. Verification boundary requirements

Define the safe verification boundary.

It must distinguish:

- intent selected
- command selected
- command not selected
- selected not run
- dispatch blocked
- dispatch authorized
- dispatch executed
- passed
- failed
- cancelled
- timed out
- irrelevant command
- task-relevant verification
- readback-only observation
- not-proven

Verification intent is not verification run.

Selected command is not passed verification.

Command exit zero is not task-relevant verification unless relevance is proven.

### 6. Repair boundary requirements

Define the safe repair boundary.

It must distinguish:

- repair not required
- repair required
- repair blocked
- repair proposal prepared
- repair proposal insufficient
- repair authority required
- repair authority granted
- repair apply not run
- repair apply observed
- repair apply failed
- post-repair verification required
- post-repair verification passed
- post-repair verification failed
- verdict candidate
- not-proven

Repair proposal is not repair applied.

Repair applied is not post-repair verified.

### 7. Verdict and evidence requirements

Audit how verdict should consume verification and repair facts.

Required rules:

- no success without task-relevant verification or accepted equivalent evidence
- no success from intent only
- no success from selected-not-run
- no success from readback-only unless task requires only readback and evidence says so
- no success from repair proposal
- no success from repair apply without post-repair verification
- original failure must remain visible after repair success
- partial, blocked, failed, skipped, or not-proven states must remain visible

### 8. Runtime events and product surface

Audit needed events and surface sections.

Potential observations:

- verification intent observed
- verification dispatch selected
- verification blocked
- verification executed
- verification passed as verification fact
- verification failed as verification fact
- repair required
- repair proposal observed
- repair authority required
- repair apply observed
- post-repair verification observed
- verdict candidate observed

Product surface must render facts only.

### 9. Truthfulness risks

Audit false-success risks:

- verification intent becomes verification run
- selected command becomes verification pass
- command exit zero becomes task success
- tool execution success becomes verification success
- readback-only becomes task verification
- repair required becomes repair success
- repair proposal becomes repair applied
- repair apply becomes post-repair verified
- post-repair verification omitted but success claimed
- original failure hidden by final success
- product surface rendered becomes success

Every risk must have a guardrail.

### 10. Implementation grouping for next task

Plan the next implementation task so it can combine high-value work without becoming a rewrite.

Likely combined work:

- verification intent to dispatch boundary
- task relevance facts
- dispatch blocked or selected-not-run facts
- verification result evidence model
- runtime event projection
- product surface section
- evidence and verdict input facts

Likely deferred work:

- automatic repair execution
- broad command allowlist expansion
- new verification tools
- full repair apply behavior
- full post-repair success path
- browser or external tool verification
- product loop replacement
- session schema migration

## Required Output Documents

Create these documents under docs/build-infrastructure:

1. verification-repair-behavior-audit.md

Must include:

- current verification path map
- current repair path map
- Agent Loop fit
- prior block dependency
- verification boundary requirements
- repair boundary requirements
- verdict and evidence requirements
- runtime event and product surface requirements
- truthfulness risks and guardrails
- chosen implementation seam
- rejected seams

2. verification-repair-behavior-roadmap.md

Must include:

- recommended implementation sequence
- owner domains
- files likely to inspect or change
- what can be combined in one task
- what must be deferred
- validation plan
- completion criteria
- next task name

Update if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Only update it if the audit sharpens the immediate next task.

Do not create JSON reports.

Do not create command aliases.

Do not create verification scripts.

## Naming And Content Restrictions

During this task and future development in this block:

- product file names must not contain process-history words
- product file contents must not contain process-history words unless inside historical docs
- product file names and contents must not contain outside project names
- product tests must assert local product vocabulary only
- runtime events and user-facing output must use local product vocabulary only
- docs may discuss local history, but product code must not expose origin or process vocabulary

Avoid these words in new product files and new product text:

- route
- reference
- learning
- inspired
- copied
- borrowed
- upstream
- benchmarked against

Use local terms instead:

- task
- block
- contract
- boundary
- owner
- runtime
- loop
- handoff
- event
- surface
- evidence
- verdict
- verification
- repair

## Architecture Constraints

Hard rules:

- docs and audit only
- no product code changes
- no verification execution changes
- no repair execution changes
- no command allowlist expansion
- no provider calls
- no tool behavior changes
- no edit or apply changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no product loop replacement
- no compatibility shim growth
- no success outside evidence, verdict, and result truthfulness

## What Not To Do

Do not:

- implement verification behavior
- implement repair behavior
- run verification commands
- execute repair
- add command registrations
- broaden command execution
- call live provider
- change prompt behavior
- change CLI behavior
- rewrite result or verdict logic
- rewrite workflow coordinator
- create command aliases
- create verification scripts
- create JSON capability reports
- add package scripts
- change tests to make future implementation easier

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

Do not claim build or tests passed unless actually run.

## Commit And Push Policy

Allowed after validation passes:

- commit the audit documents
- push once

Before pushing, run:

- git status --short --branch
- git diff --check

Push at most once.

If push fails, do not retry. Report the failure and provide the manual command.

## Completion Criteria

This audit is COMPLETE only if:

- targeted inspection was performed and reported
- current verification path is mapped
- current repair path is mapped
- Agent Loop fit is mapped
- prior block dependency is documented
- verification boundary requirements are documented
- repair boundary requirements are documented
- verdict and evidence requirements are documented
- runtime event and product surface requirements are documented
- truthfulness guardrails are documented
- next implementation task is planned
- required docs are created
- no product code is changed
- diff check passes
- status is reported
- commit and push are completed if validation is clean

If the verification or repair path is too unclear to plan safely, report PARTIAL and list what must be inspected next.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Current verification path summary
5. Current repair path summary
6. Agent Loop fit
7. Prior block dependency summary
8. Chosen seam
9. Rejected seams
10. Next implementation task summary
11. Truthfulness guardrails
12. Validation result
13. Files changed
14. Product code changed or not
15. Commit id if committed
16. Push status

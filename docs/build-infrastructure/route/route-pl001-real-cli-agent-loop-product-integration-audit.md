# Product Loop Route PL001: Real CLI Agent Loop Product Integration Audit

## Goal

Start the next phase after the build-infrastructure closeout.

This is not another general infrastructure route.

This route audits and plans the first real product loop block:

Real CLI Agent Loop Product Integration

The goal is to inspect how the current real CLI coding path can be connected to the agent loop spine without replacing the existing product loop in one rewrite.

This route is audit and planning only.

Do not implement product code in this route.

## Why this block is next

BI001 to BI017 built the first infrastructure baseline:

- turn snapshots
- runtime phases
- evidence-only save points
- execution receipts
- tool result details
- session projections
- runtime events
- static resources
- extension and hook policy contracts
- provider and model metadata
- tool interception
- package governance
- product surface rendering
- agent loop contract
- agent loop integration spine

BI017 roadmap says the next immediate product route is Real CLI Coding Loop Integration.

The reason is that the agent loop spine currently exists mostly as contract, projection, and observation infrastructure.

The missing product step is:

real CLI prompt
-> current product path
-> agent loop trajectory facts
-> provider/model boundary facts
-> tool/execution facts
-> save point
-> session/context projection
-> product surface
-> evidence/result truthfulness

This route must decide how to integrate that path safely.

## Core audit question

Can the current real CLI coding path begin emitting and consuming agent loop trajectory facts without replacing the current product loop?

The expected answer should be specific:

- which seam should emit loop trajectory facts
- which seam should remain host adapter only
- which facts come from existing product owners
- which facts are projection-only
- which facts remain not-proven
- which implementation steps can be combined in the next product route
- which steps must remain deferred

## Required inputs

Use local project state.

Use BI closeout documents if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md
- docs/build-infrastructure/agent-loop-infrastructure-connection-map.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md
- docs/build-infrastructure/build-infrastructure-closeout-summary.md
- docs/build-infrastructure/build-infrastructure-route-index.md

Use current source code.

Use the local architecture study repository only for targeted comparison if needed.

Do not rely on memory alone.

## Required inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- CLI entry and prompt path
- ShellSessionRuntime
- session runtime boundaries
- workflowExecutionCoordinator
- runtime loop contract
- loop trajectory projection
- runtime event projection
- JSON event stream
- turn snapshot and turn boundary
- save point
- execution receipt
- tool result split
- tool interception
- provider registry and readiness
- context rebuild projection
- session active path projection
- product surface renderer
- result and evidence truthfulness
- relevant tests around CLI/session/runtime/product loop

Inspect the local architecture study repository only if needed for:

- real agent loop adapter
- prompt submission
- model boundary
- tool batch
- save point
- next turn preparation
- event emission

Do not broad dump either repository.

## Audit scope

### 1. Real CLI path map

Map the current real CLI flow:

- input entry
- prompt normalization
- session loading
- runtime invocation
- workflow coordinator call
- result projection
- session update
- output rendering

Identify the current owner for each step.

Identify where agent loop trajectory facts can be emitted with the least risk.

### 2. Agent loop spine fit

Map current product facts to the BI016 loop spine:

- prompt input
- turn snapshot
- model or provider boundary
- tool policy
- tool result
- execution receipt
- save point
- next turn preparation
- session active path
- context rebuild
- runtime events
- product surface
- result facts
- not-proven claims

Classify each as:

- ready for product integration
- projection-only
- contract-only
- missing owner
- risky to integrate now
- deferred

### 3. Product integration seam decision

Decide the safest integration seam.

Candidates:

- workflowExecutionCoordinator emits loop trajectory facts
- ShellSessionRuntime consumes loop trajectory facts
- runtime API exposes loop trajectory facts
- product surface renders loop trajectory facts
- session summary persists a compact loop observation
- result projection attaches loop observation without changing verdict

For each candidate, record:

- owner domain
- benefit
- risk
- test strategy
- reason to choose or reject

### 4. Implementation grouping for next product route

Plan the next product route so it can combine high-value work in one route without becoming a rewrite.

Likely combined work:

- emit loop trajectory facts from current product path
- connect provider/model metadata into trajectory
- connect tool/execution receipt facts into trajectory when available
- connect save point and session/context projection
- expose trajectory through runtime event stream
- render trajectory through product surface
- preserve result truthfulness

Likely deferred work:

- replacing product loop
- real provider streaming
- real model-driven tool call batch execution
- SDK/RPC server
- session schema migration
- browser or external tool product path
- dynamic extension execution
- package loading
- new TUI

### 5. Validation plan

Define validation for the next implementation route.

Required validation should include:

- focused CLI product path tests
- workflow coordinator boundary tests
- loop trajectory tests
- runtime event stream tests
- product surface rendering tests
- session/context projection tests
- tool interception and execution receipt tests if touched
- result-contract gate if terminal/result behavior is touched
- build
- diff and status hygiene

### 6. Truthfulness risks

Audit risks that would create false success:

- loop trajectory observed becomes task success
- provider boundary observed becomes provider success
- tool result observed becomes task success
- command exit zero becomes verification success
- product surface rendered becomes success
- save point created becomes success
- next turn prepared becomes success
- prompt text grants write authority
- CLI display hides not-proven claims

Every risk must have a guardrail.

## Required output documents

Create these documents under docs/build-infrastructure:

1. product-loop-real-cli-agent-loop-audit.md

Must include:

- current CLI product path map
- agent loop spine fit
- candidate integration seams
- chosen next route seam
- rejected seams
- truthfulness risks
- validation strategy

2. product-loop-real-cli-agent-loop-implementation-plan.md

Must include:

- recommended next implementation route
- owner domains
- files likely to inspect or change
- what to combine in one route
- what to defer
- phased implementation plan
- completion criteria
- tests and validation

Update if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Only update it if the audit changes or sharpens the immediate route.

Do not create JSON reports.

Do not create route runners.

Do not create verify scripts.

## Architecture constraints

Hard rules:

- docs and audit only
- no product code changes
- no route-numbered product files
- no external-origin product naming in product paths
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no product loop replacement plan without phased adapter path
- no provider default enablement
- no tool or command expansion
- no edit or verification behavior changes
- no session schema migration
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement the integration
- rewrite workflowExecutionCoordinator
- rewrite ShellSessionRuntime
- rewrite SessionManager
- create a new product loop
- call real provider
- add tool execution behavior
- create route runner
- create verify script
- create JSON capability report
- add package scripts
- change tests to make future implementation look easier

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

Do not claim build or tests passed unless actually run.

## Completion criteria

PL001 audit is COMPLETE only if:

- targeted inspection was performed and reported
- current real CLI product path is mapped
- BI016 loop spine fit is mapped
- integration seam is chosen
- rejected seams are documented
- next implementation route is planned
- truthfulness risks and guardrails are documented
- validation plan is documented
- required docs are created
- no product code is changed
- git diff check passes
- git status is reported

If the current product path is too unclear to plan safely, report PARTIAL and list exactly what must be inspected next.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Current CLI product path summary
5. Chosen integration seam
6. Rejected seams
7. Next implementation route summary
8. Truthfulness guardrails
9. Validation pass or fail
10. Files changed
11. Confirmation whether product code changed

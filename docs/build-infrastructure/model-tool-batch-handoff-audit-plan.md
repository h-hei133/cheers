# Model To Tool Batch Handoff Audit Plan

## Goal

Start the next capability block after Provider Streaming And Model Boundary.

This is an audit and planning task only.

Do not implement product code in this task.

The purpose is to decide how model-produced tool calls should become a safe Agent Loop tool batch handoff.

This block must connect to:

- Agent Loop model boundary
- provider response and assistant accumulation
- normalized tool call extraction
- tool policy interception
- ExecutionService authority
- tool result details
- runtime events and JSON event stream
- product surface
- save point and next-turn preparation
- result and evidence truthfulness

This block must not become an isolated tool subsystem.

## Core Question

How should extracted model tool calls move into a safe tool batch boundary without executing tools prematurely, bypassing authority, hiding malformed calls, or manufacturing success?

The answer must identify:

- which owner domain owns tool call normalization
- which owner domain owns tool batch planning
- which owner domain owns before-tool policy
- which owner domain owns ExecutionService authority
- which owner domain owns tool result message shaping
- which owner domain owns Agent Loop phase transition
- which owner domain owns product rendering
- which facts flow from model boundary into tool batch
- which facts flow from tool batch toward save point and next turn
- what remains not-proven

## Required Inputs

Use local project state.

Use recent block docs if present:

- docs/build-infrastructure/provider-streaming-model-boundary-audit.md
- docs/build-infrastructure/provider-streaming-model-boundary-roadmap.md
- docs/build-infrastructure/context-planning-quality-roadmap.md
- docs/build-infrastructure/agent-loop-infrastructure-connection-map.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md
- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Use current source code.

Do not rely on memory alone.

## Required Inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- model response boundary
- assistant accumulation
- normalized tool call extraction
- malformed tool call classification
- unsupported tool call classification
- tool result message contracts
- tool result details
- tool interception policy
- tool dispatcher
- core tool registry
- ExecutionService
- execution receipts
- Agent Loop contract
- loop trajectory projection
- runtime events and JSON stream
- save point and next-turn contracts
- product surface renderer
- result and evidence truthfulness
- current CLI product invocation seam only to understand current flow
- focused tests around model boundary, tool extraction, tool interception, execution receipt, event stream, product surface, and result truthfulness

Do not inspect external codebases unless a specific local blocker requires it. If external inspection is used, keep names out of product files, product code, product tests, package commands, runtime events, and user-facing output.

Record inspected files and symbols in the final report.

## Audit Scope

### 1. Current tool-call path map

Map the current path from model output to tool-call facts:

- assistant response source
- content accumulation
- tool call extraction
- normalized tool call shape
- malformed call handling
- unsupported call handling
- unknown tool handling
- argument redaction
- execution status
- product surface status

Classify each piece as:

- product path
- contract only
- projection only
- focused test only
- missing owner
- not-proven

### 2. Agent Loop tool phase fit

Map how tool facts should connect to Agent Loop phases:

- model boundary complete or partial
- extracted tool call batch
- tool batch plan
- before-tool policy decision
- authority requirement
- dispatch eligibility
- execution not-run state
- execution receipt if available
- tool result message
- after-tool annotation
- save point
- next-turn bundle
- runtime events
- product surface
- result truthfulness

Classify each as:

- ready for product integration
- projection only
- contract only
- missing owner
- unsafe to integrate now
- deferred

### 3. Prior block dependency

Tool batch must consume Provider Streaming And Model Boundary facts, not bypass them.

Audit how tool batch preparation should use:

- model boundary status
- assistant accumulation status
- stream completion or partial status
- tool call delta or extracted call status
- provider failure classification
- output invalid or insufficient facts
- cancellation or abort facts
- redaction state
- not-proven claims

Tool batch must not treat model boundary completion as task success.

### 4. Tool batch handoff requirements

Define the safe handoff from model boundary to tool batch.

The handoff must include:

- batch id
- source model boundary id
- normalized tool call ids
- safe tool kind
- argument redaction status
- malformed or unsupported status
- unknown tool status
- authority requirement
- before-tool policy requirement
- dispatch eligibility
- execution status
- not-proven claims

Tool call extracted is not tool execution.

Tool batch ready is not task success.

### 5. Policy and authority requirements

Audit how before-tool policy and ExecutionService authority should interact.

The plan must explain:

- when a call is blocked
- when authority is required
- when redaction is required
- when dispatch is unsupported
- when ExecutionService may receive the call
- how policy facts are reflected in execution receipts
- how denied or blocked calls become tool result messages
- how no command allowlist expansion is preserved

Prompt text cannot grant tool authority.

### 6. Tool result message requirements

Audit how tool result messages should be shaped even when execution is not run.

Required result categories:

- not-dispatched
- blocked by policy
- authority required
- unsupported tool
- unknown tool
- malformed arguments
- execution unavailable
- execution receipt observed
- execution failed
- execution succeeded as tool fact only

Tool result message exists is not task success.

Execution succeeded is not verification success.

### 7. Runtime events and product surface

Audit which events and sections should exist.

Potential events:

- tool batch extracted
- tool batch planned
- tool policy observed
- tool authority required
- tool call blocked
- tool call not dispatched
- tool result message prepared
- tool batch partial
- tool batch completed as observation

Product surface should show tool batch state without leaking raw arguments or command output.

### 8. Save point and next-turn connection

Audit how tool batch outcomes should flow toward:

- evidence-only save point
- next-turn bundle
- follow-up or steering queue if applicable
- replay-safe loop state
- continuation context

Do not execute next provider turn in this block.

### 9. Truthfulness risks

Audit false-success risks:

- tool call extracted becomes tool executed
- tool batch planned becomes tool result
- policy allowed becomes authority granted
- authority requested becomes authority granted
- execution receipt exists becomes task success
- command exit zero becomes verification success
- tool result message becomes next-turn completion
- save point created becomes success
- product surface rendered becomes success

Every risk must have a guardrail.

### 10. Implementation grouping for next task

Plan the next implementation task so it can combine high-value work without becoming a rewrite.

Likely combined work:

- model-to-tool batch handoff facts
- normalized tool batch plan
- before-tool policy and authority projection
- not-dispatched tool result messages
- tool result message shape
- runtime event projection
- product surface section
- Agent Loop feature contract

Likely deferred work:

- real tool execution expansion
- command allowlist expansion
- parallel tool execution
- next provider turn execution
- browser or external tool execution
- dynamic plugin execution
- package loading
- session schema migration
- SDK or RPC host

## Required Output Documents

Create these documents under docs/build-infrastructure:

1. model-tool-batch-handoff-audit.md

Must include:

- current tool-call path map
- Agent Loop tool phase fit
- prior block dependency
- safe handoff requirements
- policy and authority requirements
- tool result message requirements
- event and product surface requirements
- save point and next-turn connection
- truthfulness risks and guardrails
- chosen implementation seam
- rejected seams

2. model-tool-batch-handoff-roadmap.md

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
- product file names and contents must not contain external project names
- product tests must assert local product vocabulary only
- runtime events and user-facing output must use local product vocabulary only
- docs may discuss history, but product code must not expose origin or process vocabulary

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

## Architecture Constraints

Hard rules:

- docs and audit only
- no product code changes
- no tool execution changes
- no command allowlist expansion
- no provider calls
- no provider streaming implementation
- no fallback execution
- no edit or apply changes
- no verification execution changes
- no repair changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no product loop replacement
- no compatibility shim growth
- no success outside evidence, verdict, and result truthfulness

## What Not To Do

Do not:

- implement the tool batch handoff
- execute tools
- add real tools
- add command registrations
- broaden command execution
- call live provider
- change prompt behavior
- change CLI behavior
- rewrite tool dispatcher
- rewrite ExecutionService
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
- push the commit

Before pushing, run:

- git status --short --branch
- git diff --check

Do not push if product code changed unexpectedly.

## Completion Criteria

This audit is COMPLETE only if:

- targeted inspection was performed and reported
- current model-to-tool path is mapped
- Agent Loop tool phase fit is mapped
- prior block dependency is documented
- safe handoff requirements are documented
- policy and authority requirements are documented
- tool result message requirements are documented
- event and product surface requirements are documented
- save point and next-turn connection is documented
- truthfulness guardrails are documented
- next implementation task is planned
- required docs are created
- no product code is changed
- diff check passes
- status is reported
- commit and push are completed if validation is clean

If the tool path is too unclear to plan safely, report PARTIAL and list what must be inspected next.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Current model-to-tool path summary
5. Agent Loop tool phase fit
6. Prior block dependency summary
7. Chosen seam
8. Rejected seams
9. Next implementation task summary
10. Truthfulness guardrails
11. Validation result
12. Files changed
13. Product code changed or not
14. Commit id if committed
15. Push status

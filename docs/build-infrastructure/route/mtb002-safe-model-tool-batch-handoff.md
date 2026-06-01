# MTB002: Safe Model Tool Batch Handoff And Non-Executed Result Messages

## Goal

Implement the first Model To Tool Batch capability task after the audit.

The previous block made the model boundary product-visible. This task must consume completed or partial model-boundary facts and produce a safe tool batch handoff without executing tools.

Expected final status: COMPLETE.

This task must connect:

- model boundary facts
- assistant accumulation facts
- extracted tool call facts
- tool batch planning facts
- before-tool policy facts
- authority requirement facts
- non-executed tool result messages
- runtime events and JSON stream
- product surface
- save point and next-turn inputs
- result and evidence truthfulness

This task must not execute tools.

## Core Rule

A model-produced tool call is only an intent until policy, authority, dispatch, execution, receipt, result details, and downstream verification prove more.

Tool call extracted is not tool executed.

Tool batch planned is not task success.

Policy allowed is not authority granted.

Tool result message prepared is not next-turn completion.

## Owner Domains

Primary owners:

- tools
- turn
- runtime/loop
- runtime/events
- evidence
- presentation

Boundary owner only:

- runtime/execution for authority and receipt metadata

Consumers only:

- result
- core/tools
- core/shell if existing display needs a thin adapter

Allowed target areas:

- packages/ts-shell/src/tools
- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not put this logic in CLI, coordinator, provider adapter, product surface, or compatibility shims.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- provider response boundary
- assistant response accumulation
- tool call batch extraction
- malformed and unsupported classification
- tool batch planning
- tool policy interception
- tool result message shaping
- tool result details
- tool dispatcher and registry for boundary only
- ExecutionService and receipts for authority metadata only
- loop contract and trajectory
- runtime event projection and JSON stream
- save point model
- next-turn bundle
- product surface and renderer
- result and evidence truthfulness
- focused tests around these surfaces

Do not inspect external code unless a concrete blocker requires it. If used, keep external names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Model-to-tool handoff facts

Add a report-safe handoff from model boundary to tool batch.

It should include:

- handoff id
- source model boundary id
- source assistant message id if safe
- extraction status
- batch id
- normalized tool call ids
- malformed call ids
- unsupported call ids
- unknown tool call ids
- argument redaction status
- dispatch eligibility
- policy requirement
- authority requirement
- execution status
- save point input id if available
- next-turn input id if available
- not-proven claims

The handoff must not include raw provider output, raw tool arguments if unsafe, raw command output, hidden reasoning, transcript dumps, secrets, or unsafe file contents.

### 2. Normalized tool batch plan

Add or harden a tool batch plan.

It should represent:

- batch id
- ordered calls
- call kind
- safe tool label
- argument safety state
- malformed state
- unsupported state
- unknown tool state
- dispatch eligibility
- policy decision id if available
- authority requirement
- execution state
- not-proven claims

No real dispatch should occur in this task.

### 3. Policy and authority projection

Connect tool batch planning to existing policy and authority facts.

Represent:

- allowed
- blocked
- authority_required
- redaction_required
- unsupported
- rejected
- not_evaluated

Prompt text must not grant authority.

Allowed policy must not become granted authority.

Authority required must not become executed.

### 4. Non-executed tool result messages

Prepare result messages for non-executed outcomes.

Required message categories:

- not_dispatched
- blocked_by_policy
- authority_required
- unsupported_tool
- unknown_tool
- malformed_arguments
- execution_unavailable

Messages must be safe for the next-turn boundary but must not trigger next provider execution in this task.

Message exists is not success.

### 5. Runtime events and JSON stream

Emit or project observation-only events for:

- tool batch handoff observed
- tool batch planned
- policy decision observed
- authority required
- tool call blocked
- tool call not dispatched
- non-executed result message prepared
- tool batch partial
- tool batch observation completed

Events must remain JSON-safe and terminalSuccessClaim false.

### 6. Product surface

Add concise surface facts if needed.

Show:

- batch status
- call count
- blocked count
- authority-required count
- malformed or unsupported count
- not-dispatched messages
- not-proven claims
- next action

The surface must render facts only.

### 7. Save point and next-turn connection

Prepare observation facts for downstream phases:

- save point input id or reason absent
- next-turn input id or reason absent
- non-executed message ids
- not-proven claims

Do not execute next provider turn.

## Required Tests

Add focused tests only.

Test:

1. completed model boundary creates safe tool handoff
2. malformed, unsupported, and unknown calls are classified
3. argument redaction state is preserved
4. policy and authority states do not execute tools
5. blocked and authority-required calls create non-executed messages
6. not-dispatched calls remain not executed
7. runtime events and JSON stream are observation-only
8. product surface renders facts without success inflation if touched
9. save point and next-turn inputs are prepared but not executed
10. redaction excludes secrets, provider config, raw provider output, raw unsafe arguments, raw command output, hidden reasoning, transcripts, unsafe file contents
11. truthfulness prevents tool intent, batch plan, policy allow, authority request, message prepared, save point, or surface rendering from becoming success

## Constraints

Hard rules:

- owner-domain-first
- no product file names with process-history words
- no external project names in product files
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no tool execution changes
- no command allowlist expansion
- no provider calls
- no provider streaming changes
- no fallback execution
- no prompt behavior changes
- no CLI behavior changes
- no edit or apply changes
- no verification execution changes
- no repair changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no product loop replacement
- no success outside evidence, verdict, and result truthfulness

## Naming Restrictions

For new product code, tests, runtime events, user-facing output, and package commands, avoid origin and process-history vocabulary.

Do not use these words in new product filenames or product text:

- route
- reference
- learning
- inspired
- copied
- borrowed
- upstream
- benchmarked against

Use local product terms:

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

Historical docs may discuss history. Product code must not expose it.

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim validation passed unless actually run.

## Commit And Push Policy

Allowed after validation passes:

- commit the completed implementation
- push once

Before push, run:

- git status --short --branch
- git diff --check

Push at most once.

If push fails, do not retry. Report the failure and provide the manual command.

## Completion Criteria

COMPLETE requires:

- targeted inspection performed and reported
- safe model-to-tool handoff facts exist
- normalized tool batch plan exists
- malformed, unsupported, unknown, blocked, authority-required, and not-dispatched states are represented
- non-executed tool result messages exist
- policy and authority projection exists without execution
- runtime event or JSON stream observation exists
- product surface observation exists if safe
- save point and next-turn input facts are prepared without execution
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- no tool execution or command expansion introduced
- commit and single push completed if validation is clean

If this requires tool execution, command expansion, product loop replacement, or provider use, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Handoff design
6. Tool batch plan
7. Policy and authority projection
8. Non-executed result messages
9. Runtime events and JSON stream
10. Product surface changes if any
11. Save point and next-turn connection
12. Redaction behavior
13. Truthfulness behavior
14. Validation pass or fail
15. Constraints preserved
16. Remaining not-proven capabilities
17. Commit id if committed
18. Push status
19. Recommended next task

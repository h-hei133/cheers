# MTB008: Model Response Reentry And Cycle Boundary

## Goal

Implement model response reentry after controlled invocation attempts.

MTB007 added controlled invocation adapter facts, provider attempt outcome facts, response handoff facts, runtime events, and product surface observations.

MTB008 must connect safe response handoff facts back into the model boundary, assistant accumulation, tool extraction, and loop cycle boundary.

Expected final status: COMPLETE.

This task must connect:

- controlled provider attempt outcomes
- response handoff facts
- model boundary reentry
- assistant accumulation
- tool call extraction readiness
- no-tool completion boundary
- malformed or unsupported tool facts
- runtime loop cycle facts
- runtime events and JSON stream
- product surface
- result and evidence truthfulness

This task must not create an automatic infinite loop or call providers by default.

## Core Rule

Provider response handoff can reenter the model boundary, but it cannot become task success.

Model response reentered is not final success.

Assistant accumulated is not task success.

Tool calls extracted are not tool execution.

No-tool response is not necessarily task completion.

Cycle boundary observed is not terminal success.

## Owner Domains

Primary owners:

- provider
- runtime loop
- tools
- runtime events
- evidence
- presentation

Consumers only:

- turn
- result

Allowed target areas:

- packages/ts-shell/src/provider
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not place this logic in CLI, workflow coordinator, compatibility shims, session storage, or product surface as fact owner.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- provider request attempt
- provider response handoff
- provider response boundary
- model boundary
- assistant accumulation
- tool call extraction and classification
- tool handoff and batch plan
- loop contract and trajectory
- runtime event projection
- JSON event stream
- product surface and renderer
- result and evidence truthfulness
- focused tests around touched surfaces

Do not inspect outside code unless a concrete blocker requires it. If used, keep outside names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Response reentry facts

Add report-safe facts for reentering the model boundary from a provider response handoff.

Include:

- reentry id
- source attempt id
- source response handoff id
- response classification
- assistant content availability
- tool extraction readiness
- redaction state
- raw output excluded status
- reentry status
- not-proven claims

Statuses:

- ready_for_boundary_processing
- processed
- blocked_by_redaction
- blocked_by_invalid_output
- blocked_by_insufficient_output
- blocked_by_cancelled_attempt
- blocked_by_failed_attempt
- unsupported
- not_ready

### 2. Assistant accumulation from response handoff

Connect safe response facts to assistant accumulation.

Represent:

- assistant accumulation id
- source reentry id
- content availability
- content summary safe label
- content redaction state
- hidden channel excluded status
- completion status
- not-proven claims

Do not persist or print raw provider output.

Assistant accumulation is not task success.

### 3. Tool extraction from reentered response

Connect reentered response to tool extraction facts.

Represent:

- extraction id
- source assistant accumulation id
- extracted call ids
- malformed call ids
- unsupported call ids
- unknown tool ids
- no-tool status
- extraction confidence
- handoff readiness
- not-proven claims

Tool extraction readiness is not tool execution.

No-tool status is not task completion.

### 4. Cycle boundary facts

Add loop cycle boundary facts.

Represent:

- cycle id
- source invocation attempt id
- response reentry id
- assistant accumulation id
- tool extraction id if present
- next handoff kind
- cycle status
- stop reason if any
- continuation requirement
- not-proven claims

Cycle statuses:

- tool_handoff_ready
- no_tool_response_observed
- partial_response
- blocked_response
- failed_response
- cancelled_response
- unsupported
- not_ready

This cycle boundary must not trigger another provider call automatically.

### 5. Runtime events and JSON stream

Emit or project observation-only events:

- response reentry observed
- model boundary processing observed
- assistant accumulation observed
- tool extraction observed
- no-tool response observed
- loop cycle boundary observed
- loop cycle blocked
- loop cycle partial

Events must remain JSON-safe and terminalSuccessClaim false.

### 6. Product surface

If safe, expose concise status:

- response reentry status
- assistant accumulation status
- tool extraction status
- no-tool status
- cycle boundary status
- next handoff kind
- blockers
- not-proven claims

Product surface renders facts only.

### 7. Truthfulness boundaries

Preserve:

- response handoff is not final assistant success
- reentry processed is not task success
- assistant accumulated is not task success
- tool extracted is not tool executed
- no-tool response is not task completion
- cycle boundary observed is not terminal success
- product surface rendered is not success

## Required Tests

Add focused tests only.

Test:

1. safe provider response handoff can reenter model boundary
2. failed provider attempt blocks reentry
3. redaction failure blocks reentry
4. insufficient output blocks or downgrades reentry
5. assistant accumulation excludes raw provider output and hidden content
6. tool extraction produces handoff readiness without execution
7. malformed, unsupported, and unknown tool calls remain visible
8. no-tool response is represented without task success
9. cycle boundary distinguishes tool handoff, no-tool, partial, blocked, failed, and cancelled states
10. runtime events and JSON stream are observation-only
11. product surface renders facts without success inflation if touched
12. redaction excludes secrets, provider config, raw provider output, unsafe message content, command output, hidden reasoning, transcripts, unsafe file contents
13. truthfulness prevents reentry, accumulation, extraction, no-tool, cycle boundary, or surface rendering from becoming success

## Constraints

Hard rules:

- owner-domain-first
- no product filenames with process-history words
- no outside project names in product files
- no compatibility shim growth
- no helper, common, misc, support dumping ground
- no default provider calls
- no manual private config reads
- no fallback execution
- no provider streaming expansion
- no automatic next model invocation
- no automatic infinite loop
- no new real tools
- no command allowlist expansion
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
- response reentry facts exist
- assistant accumulation from response handoff exists
- tool extraction from reentered response exists
- no-tool response boundary exists
- cycle boundary facts exist
- failed or unsafe responses cannot reenter as success
- runtime event or JSON stream observations exist
- product surface observation exists if safe
- no automatic provider call or infinite loop occurs
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- commit and single push completed if validation is clean

If this requires default provider calls, automatic provider recursion, fallback execution, product loop replacement, session schema migration, command expansion, or unsafe provider config access, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Response reentry facts
6. Assistant accumulation
7. Tool extraction
8. Cycle boundary facts
9. Runtime events and JSON stream
10. Product surface changes if any
11. Redaction behavior
12. Truthfulness behavior
13. Validation pass or fail
14. Constraints preserved
15. Remaining not-proven capabilities
16. Commit id if committed
17. Push status
18. Recommended next task

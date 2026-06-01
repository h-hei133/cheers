# MTB003: Controlled Tool Batch Execution And Receipts

## Goal

Implement controlled execution for safe tool batches produced by the previous model-to-tool handoff task.

This task must connect:

- normalized tool batch plans
- policy decisions
- authority requirements
- existing sanctioned dispatch boundaries
- ExecutionService authority metadata
- execution receipts
- tool result details
- tool result messages
- runtime events and JSON stream
- product surface
- save point input
- next-turn input
- result and evidence truthfulness

Expected final status: COMPLETE.

This task must not add new tools, broaden command execution, or make tool execution imply task success.

## Core Rule

A tool may execute only when all required facts are true:

- tool call is normalized
- tool kind is known and supported
- arguments are report-safe or redacted
- policy allows execution
- required authority is granted through the existing authority path
- dispatch uses existing sanctioned boundaries
- execution receipt is recorded
- result details are report-safe

Execution success is only a tool fact. It is not task success, verification success, repair success, or terminal success.

## Owner Domains

Primary owners:

- tools
- runtime/execution
- runtime/events
- runtime/loop
- turn
- evidence
- presentation

Allowed target areas:

- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/turn
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not place this logic in CLI, provider, workflow coordinator, product surface, compatibility shims, or session storage.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- toolHandoff
- toolCallBatch
- toolBatchDispatch
- toolResultMessage
- tool interception policy
- tool dispatcher and registry
- ExecutionService
- execution receipts
- model boundary integration
- loop contract and trajectory
- runtime event projection
- JSON event stream
- save point and next-turn inputs
- product surface
- evidence and result truthfulness
- focused tests around all touched surfaces

Do not inspect external code unless a concrete blocker requires it. If external inspection is used, keep outside names out of product code, product tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Controlled dispatch eligibility

Harden dispatch eligibility for each tool call.

Represent:

- dispatch id
- source batch id
- source call id
- known or unknown tool status
- supported or unsupported status
- argument safety state
- policy decision
- authority requirement
- authority grant status
- dispatch eligibility
- not-dispatched reason
- not-proven claims

A call is ineligible if any required condition is missing.

### 2. Existing sanctioned dispatch bridge

Connect eligible calls to existing sanctioned dispatch boundaries.

Allowed:

- use existing dispatcher seams
- use existing ExecutionService metadata
- use existing tool result details
- use injected test-safe executor only for tests if current architecture already supports injection

Not allowed:

- new real tool registrations
- command allowlist expansion
- direct shell execution outside sanctioned owner
- provider calls
- edit, apply, verification, or repair execution changes
- CLI behavior changes

### 3. Execution receipt linkage

Every executed call must link to a report-safe receipt.

Receipt linkage should include:

- receipt id
- execution status
- caller
- operation kind
- authority mode
- policy metadata
- exit or result status if safe
- error class if any
- redaction state
- not-proven claims

Receipt exists is not task success.

### 4. Tool result details

Tool result details should distinguish:

- executed_success
- executed_failed
- blocked_by_policy
- authority_required
- authority_denied
- unsupported_tool
- unknown_tool
- malformed_arguments
- execution_unavailable
- not_dispatched

Details must remain report-safe and must not include raw unsafe arguments, raw command output, secrets, provider config, hidden reasoning, transcript dumps, or unsafe file contents.

### 5. Tool result messages

Prepare result messages for both executed and non-executed outcomes.

Messages should be safe for next-turn input, but this task must not execute the next provider turn.

Message exists is not next-turn completion.

### 6. Partial batch semantics

Support mixed batch outcomes:

- all blocked
- all require authority
- partial executed
- partial failed
- partial unsupported
- all executed as tool facts

Partial execution must remain visible.

One successful tool result must not hide failed, blocked, or unsupported calls.

### 7. Runtime events and JSON stream

Emit or project observation-only events:

- tool dispatch eligibility observed
- tool execution started
- tool execution receipt observed
- tool execution failed
- tool execution completed as tool fact
- tool result message prepared
- tool batch partial
- tool batch completed as observation

Events must remain JSON-safe and terminalSuccessClaim false.

### 8. Product surface

If safe, expose concise tool execution status:

- total calls
- executed count
- blocked count
- authority-required count
- failed count
- unsupported count
- not-dispatched count
- receipt ids
- not-proven claims
- next action

Product surface renders facts only.

### 9. Save point and next-turn input

Prepare facts for downstream phases:

- result message ids
- receipt ids
- partial batch status
- failure facts
- blocked facts
- save point input readiness
- next-turn input readiness
- not-proven claims

Do not create terminal success.

Do not execute the next provider turn.

## Required Tests

Add focused tests only.

Test:

1. ineligible calls do not execute
2. blocked calls do not execute
3. authority-required calls do not execute without grant
4. eligible known supported calls can execute through existing sanctioned seam
5. execution receipt is linked to result details
6. execution failure is represented without success inflation
7. mixed batch preserves partial failures and blocked calls
8. result messages are prepared for executed and non-executed outcomes
9. runtime events and JSON stream are observation-only
10. product surface renders facts without success inflation if touched
11. save point and next-turn inputs are prepared but not executed
12. redaction excludes secrets, provider config, raw provider output, unsafe raw arguments, raw command output, hidden reasoning, transcripts, unsafe file contents
13. truthfulness prevents tool execution, receipt, exit zero, result message, save point, or surface rendering from becoming task success or verification success

## Constraints

Hard rules:

- owner-domain-first
- no product filenames with process-history words
- no external project names in product files
- no compatibility shim growth
- no helper, common, misc, support dumping ground
- no new real tools
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
- dispatch eligibility exists
- eligible calls can execute through existing sanctioned seam
- ineligible calls remain not executed
- policy and authority blocking works
- execution receipts are linked
- tool result details distinguish executed and non-executed states
- mixed batch partial outcomes remain visible
- result messages are prepared
- runtime event or JSON stream observations exist
- product surface observation exists if safe
- save point and next-turn input facts are prepared without next provider execution
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- no new tools or command expansion introduced
- commit and single push completed if validation is clean

If this requires new tools, command expansion, product loop replacement, provider use, or next-turn provider execution, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Dispatch eligibility
6. Sanctioned dispatch bridge
7. Execution receipt linkage
8. Tool result details
9. Tool result messages
10. Mixed batch semantics
11. Runtime events and JSON stream
12. Product surface changes if any
13. Save point and next-turn input
14. Redaction behavior
15. Truthfulness behavior
16. Validation pass or fail
17. Constraints preserved
18. Remaining not-proven capabilities
19. Commit id if committed
20. Push status
21. Recommended next task

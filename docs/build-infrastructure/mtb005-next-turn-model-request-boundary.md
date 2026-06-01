# MTB005: Next Turn Model Request Boundary

## Goal

Implement the next task after tool result save point and next-turn integration.

MTB004 prepared evidence-only save point input and next-turn bundle facts from tool outcomes.

MTB005 must connect next-turn bundles back to the model request boundary without calling a provider.

Expected final status: COMPLETE.

This task must connect:

- next-turn bundle facts
- safe tool result messages
- follow-up and steering facts
- context and planning constraints
- provider and model metadata
- model request preparation facts
- runtime loop phase facts
- runtime events and JSON stream
- product surface
- result and evidence truthfulness

This task must not call a provider or execute the next model turn.

## Core Rule

A next-turn bundle can prepare a model request, but it cannot execute one.

Prepared request is not provider call.

Provider readiness is not provider success.

Tool result messages in request input are not task success.

Model request prepared is not model response complete.

## Owner Domains

Primary owners:

- turn
- runtime loop
- provider
- runtime events
- evidence
- presentation

Consumer only:

- tools
- result

Allowed target areas:

- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/provider
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not place this logic in CLI, workflow coordinator, compatibility shims, session storage, or product surface as fact owner.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- next-turn bundle
- tool outcome bundle
- tool result messages
- steering and follow-up facts
- model request boundary
- provider request preparation
- provider readiness
- provider and model registry
- context-aware prompt construction
- runtime loop contract and trajectory
- runtime event projection
- JSON event stream
- product surface and renderer
- result and evidence truthfulness
- focused tests around touched surfaces

Do not inspect outside code unless a concrete blocker requires it. If used, keep outside names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Next-turn request preparation facts

Add report-safe facts for model request preparation from a next-turn bundle.

Include:

- request preparation id
- source next-turn bundle id
- included tool result message ids
- excluded message ids
- exclusion reasons
- steering ids
- follow-up ids
- context constraint ids if available
- planning constraint ids if available
- provider metadata id if available
- model metadata id if available
- readiness status
- blocked reasons
- redaction state
- not-proven claims

Prepared request must not include raw provider output, raw unsafe tool arguments, raw command output, hidden reasoning, transcript dumps, secrets, or unsafe file contents.

### 2. Request readiness status

Represent readiness without executing.

Statuses:

- ready_for_explicit_model_invocation
- ready_with_partial_tool_results
- blocked_by_policy
- blocked_by_authority
- blocked_by_failed_tool
- blocked_by_missing_context
- blocked_by_provider_unavailable
- blocked_by_redaction
- unsupported
- not_ready

Readiness must not trigger provider calls.

### 3. Provider metadata connection

Connect provider and model metadata to request preparation.

Represent:

- provider safe label
- model safe label
- provider opt-in state
- auth readiness projection
- compatibility flags if available
- streaming capability if known
- missing provider facts
- fallback metadata if available
- not-proven claims

Metadata existence is not provider readiness.

Provider opt-in required remains visible.

### 4. Message shaping boundary

Prepare safe request input messages.

Include:

- system or instruction summary if already safe
- task or turn summary
- safe tool result messages
- steering or follow-up summaries
- excluded unsafe messages
- redaction state
- not-proven claims

Do not include hidden reasoning, raw transcript dumps, raw command output, unsafe tool arguments, or raw provider output.

### 5. Loop phase and event integration

Emit or project observation-only events:

- next-turn request preparation observed
- request input message prepared
- request blocked
- provider metadata observed
- provider opt-in required
- redaction blocked request
- request ready for explicit invocation

Events must remain JSON-safe and terminalSuccessClaim false.

### 6. Product surface

If safe, expose concise status:

- request preparation status
- provider and model safe labels
- included message count
- excluded message count
- blocked reason
- required user action
- not-proven claims
- next action

Product surface renders facts only.

### 7. Truthfulness boundaries

Preserve:

- next-turn bundle ready is not provider call
- request prepared is not provider call
- provider metadata is not provider success
- opt-in available is not opt-in granted
- safe message prepared is not model response
- product surface rendered is not success

## Required Tests

Add focused tests only.

Test:

1. ready next-turn bundle prepares request facts without provider call
2. partial tool results produce partial readiness
3. failed or blocked tool results block or downgrade request readiness
4. unsafe messages are excluded with reasons
5. steering and follow-up facts are included safely
6. provider metadata is connected without enabling provider
7. provider opt-in required remains visible
8. runtime events and JSON stream are observation-only
9. product surface renders facts without success inflation if touched
10. redaction excludes secrets, provider config, raw provider output, unsafe raw arguments, raw command output, hidden reasoning, transcripts, unsafe file contents
11. truthfulness prevents request prepared, metadata observed, opt-in required, message prepared, or surface rendering from becoming success

## Constraints

Hard rules:

- owner-domain-first
- no product filenames with process-history words
- no outside project names in product files
- no compatibility shim growth
- no helper, common, misc, support dumping ground
- no provider calls
- no provider streaming changes
- no fallback execution
- no next model turn execution
- no new real tools
- no command allowlist expansion
- no prompt behavior changes beyond safe request preparation facts
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
- next-turn request preparation facts exist
- readiness statuses exist
- provider metadata connection exists without provider call
- safe message shaping exists
- unsafe messages are excluded or redacted
- runtime event or JSON stream observations exist
- product surface observation exists if safe
- no provider call or next model turn execution happens
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- commit and single push completed if validation is clean

If this requires provider calls, next model execution, product loop replacement, session schema migration, or command expansion, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Request preparation facts
6. Readiness statuses
7. Provider metadata connection
8. Message shaping boundary
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

# MTB006: Explicit Model Invocation Gate

## Goal

Implement the next task after next-turn model request preparation.

MTB005 prepared model request facts from next-turn bundle facts, provider metadata, safe messages, steering facts, follow-up facts, and readiness status.

MTB006 must add an explicit model invocation gate.

Expected final status: COMPLETE.

This task must connect:

- prepared model request facts
- provider and model metadata
- provider opt-in state
- auth readiness projection
- redaction state
- invocation eligibility
- invocation blocked facts
- invocation attempt envelope
- runtime events and JSON stream
- product surface
- result and evidence truthfulness

Default behavior must remain no provider call.

## Core Rule

Prepared request is not provider invocation.

Provider metadata is not provider success.

Opt-in available is not opt-in granted.

Invocation eligible is not invocation attempted.

Invocation attempted is not response success.

Provider response success is not task success.

## Owner Domains

Primary owners:

- provider
- runtime loop
- runtime events
- evidence
- presentation

Consumer only:

- turn
- result

Allowed target areas:

- packages/ts-shell/src/provider
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not place this logic in CLI, workflow coordinator, compatibility shims, session storage, or product surface as fact owner.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- provider request boundary
- provider readiness
- provider registry
- provider fetch boundary
- provider failure classification
- provider redaction handling
- next-turn request preparation
- model boundary facts
- runtime loop contract and trajectory
- runtime event projection
- JSON event stream
- product surface and renderer
- result and evidence truthfulness
- focused tests around touched surfaces

Do not inspect outside code unless a concrete blocker requires it. If used, keep outside names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Invocation gate facts

Add report-safe facts for the model invocation gate.

Include:

- gate id
- source prepared request id
- provider metadata id if available
- model metadata id if available
- opt-in state
- auth readiness state
- redaction state
- request readiness state
- eligibility status
- blocked reasons
- required user action
- not-proven claims

Eligibility statuses:

- eligible_for_explicit_invocation
- blocked_by_missing_opt_in
- blocked_by_auth
- blocked_by_provider_unavailable
- blocked_by_redaction
- blocked_by_request_not_ready
- blocked_by_policy
- unsupported
- not_ready

Gate facts must not include secrets, provider config, raw provider output, raw unsafe message content, hidden reasoning, raw command output, transcript dumps, or unsafe file contents.

### 2. Attempt envelope

Add a report-safe invocation attempt envelope.

It should represent:

- attempt id
- source gate id
- source prepared request id
- provider safe label
- model safe label
- invocation mode
- attempt status
- failure class if blocked or failed
- redaction state
- retry eligibility if available
- fallback eligibility if available
- not-proven claims

Attempt statuses:

- not_attempted
- blocked
- attempted
- completed
- failed
- cancelled
- unsupported

This task may use injected test-safe providers if existing architecture supports injection.

This task must not call real provider by default.

### 3. Explicit opt-in requirement

Invocation attempt may only proceed when explicit opt-in facts are present.

Represent:

- opt-in missing
- opt-in present
- opt-in invalid
- opt-in not applicable
- opt-in source safe label

Prompt text cannot grant opt-in.

Product surface text cannot grant opt-in.

### 4. Auth and redaction gate

Invocation attempt must be blocked if:

- auth readiness is missing or failed
- redaction is failed
- request includes unsafe message
- provider is unavailable
- request readiness is not ready

Blocked state must be visible.

### 5. Runtime events and JSON stream

Emit or project observation-only events:

- invocation gate observed
- invocation blocked
- explicit opt-in required
- auth readiness observed
- redaction blocked invocation
- invocation attempt prepared
- invocation attempt observed
- invocation failed as provider fact
- invocation completed as provider fact

Events must remain JSON-safe and terminalSuccessClaim false.

### 6. Product surface

If safe, expose concise status:

- gate status
- provider and model safe labels
- opt-in requirement
- auth readiness
- blocked reason
- attempt status
- retry or fallback eligibility
- required user action
- not-proven claims

Product surface renders facts only.

### 7. Truthfulness boundaries

Preserve:

- request prepared is not provider invocation
- invocation eligible is not attempted
- invocation attempted is not provider success
- provider completed is not task success
- provider failed is not terminal success
- fallback eligible is not fallback executed
- product surface rendered is not success

## Required Tests

Add focused tests only.

Test:

1. default request remains not attempted
2. missing opt-in blocks invocation
3. auth failure blocks invocation
4. redaction failure blocks invocation
5. request not ready blocks invocation
6. eligible request can create attempt envelope through test-safe seam only
7. attempt envelope records provider and model safe labels
8. failure classes remain distinct
9. retry and fallback eligibility are metadata only
10. runtime events and JSON stream are observation-only
11. product surface renders facts without success inflation if touched
12. redaction excludes secrets, provider config, raw provider output, unsafe message content, command output, hidden reasoning, transcripts, unsafe file contents
13. truthfulness prevents prepared request, eligible gate, attempted invocation, completed provider fact, retry eligibility, fallback eligibility, or surface rendering from becoming task success

## Constraints

Hard rules:

- owner-domain-first
- no product filenames with process-history words
- no outside project names in product files
- no compatibility shim growth
- no helper, common, misc, support dumping ground
- no default provider calls
- no real provider call unless an existing explicit approved test seam already exists and is required
- no provider streaming changes
- no fallback execution
- no next model turn execution beyond the gate and attempt envelope
- no new real tools
- no command allowlist expansion
- no prompt behavior changes outside safe gate facts
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
- invocation gate facts exist
- eligibility statuses exist
- explicit opt-in gate exists
- auth and redaction blocking exists
- attempt envelope exists
- default behavior remains no provider call
- retry and fallback eligibility remain metadata only
- runtime event or JSON stream observations exist
- product surface observation exists if safe
- no real provider call occurs by default
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- commit and single push completed if validation is clean

If this requires default provider calls, fallback execution, product loop replacement, session schema migration, command expansion, or unsafe provider config access, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Invocation gate facts
6. Attempt envelope
7. Opt-in behavior
8. Auth and redaction blocking
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

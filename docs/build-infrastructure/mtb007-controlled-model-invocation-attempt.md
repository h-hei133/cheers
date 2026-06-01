# MTB007: Controlled Model Invocation Attempt Adapter

## Goal

Implement controlled model invocation attempts after explicit model invocation gating.

MTB006 added provider-owned invocation gate facts, eligibility statuses, opt-in boundaries, auth and redaction blocking, attempt envelopes, runtime observations, and product surface facts.

MTB007 must connect eligible invocation gates to the existing provider fetch boundary through an explicit controlled adapter.

Expected final status: COMPLETE.

Default behavior must remain no provider call.

## Core Rule

A model invocation attempt may happen only when:

- prepared request is ready
- explicit opt-in fact is present
- provider metadata is available
- auth readiness is acceptable
- redaction passed
- gate eligibility is satisfied
- invocation mode is explicitly controlled
- existing provider fetch boundary is used

Invocation attempted is not provider success.

Provider response completed is not task success.

Provider response completed is not tool execution.

Fallback eligibility is not fallback execution.

## Owner Domains

Primary owners:

- provider
- runtime loop
- runtime events
- evidence
- presentation

Consumers only:

- turn
- tools
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

- provider request invocation gate
- provider request boundary
- provider readiness
- provider registry
- provider fetch boundary
- provider failure classification
- provider response and model boundary adapter
- redaction handling
- next-turn request preparation
- runtime loop contract and trajectory
- runtime event projection
- JSON event stream
- product surface and renderer
- result and evidence truthfulness
- focused tests around touched surfaces

Do not inspect outside code unless a concrete blocker requires it. If used, keep outside names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Controlled invocation adapter

Add a provider-owned adapter that consumes an eligible invocation gate and a prepared request.

It should produce:

- adapter id
- source gate id
- source prepared request id
- provider safe label
- model safe label
- invocation mode
- controlled opt-in state
- attempt decision
- attempt id if created
- blocked reason if blocked
- redaction state
- not-proven claims

Default mode must remain not attempted.

### 2. Attempt execution boundary

Allow an attempt only through existing provider fetch boundary.

Allowed:

- existing provider fetch seam
- injected test-safe provider executor for tests
- existing provider failure classification
- existing redaction boundaries
- existing provider registry metadata

Not allowed:

- default real provider calls
- manual private config reads
- fallback execution
- provider streaming expansion
- CLI behavior changes
- product loop replacement

### 3. Attempt outcome facts

Represent provider attempt outcomes.

Statuses:

- not_attempted
- blocked
- attempted
- completed
- failed
- cancelled
- output_invalid
- output_insufficient
- redaction_failed
- unsupported

Outcome facts should include:

- attempt id
- source gate id
- provider safe label
- model safe label
- failure class if any
- retry eligibility
- fallback eligibility
- fallback attempted false
- response handoff id if safe
- redaction state
- not-proven claims

### 4. Response handoff to model boundary

When a controlled attempt returns a safe provider response, prepare model boundary input facts.

Include:

- response handoff id
- source attempt id
- response classification
- assistant content availability
- tool call extraction readiness
- redaction status
- raw output excluded status
- not-proven claims

Provider response handoff is not final assistant success.

Tool extraction readiness is not tool execution.

### 5. Failure classification

Preserve distinct failure classes:

- config
- auth
- network
- endpoint
- rate_limited
- timeout
- cancelled
- output_invalid
- output_insufficient
- redaction_failed
- unsupported
- unknown

Do not collapse provider failures into generic error.

### 6. Runtime events and JSON stream

Emit or project observation-only events:

- invocation adapter observed
- invocation attempt blocked
- invocation attempt started
- invocation attempt completed as provider fact
- invocation attempt failed as provider fact
- provider response handoff prepared
- fallback eligible but not attempted
- retry eligible but not attempted

Events must remain JSON-safe and terminalSuccessClaim false.

### 7. Product surface

If safe, expose concise status:

- adapter status
- attempt status
- provider and model safe labels
- failure class
- retry eligibility
- fallback eligibility
- fallback not attempted
- response handoff status
- required user action
- not-proven claims

Product surface renders facts only.

## Required Tests

Add focused tests only.

Test:

1. default gate does not call provider
2. missing opt-in blocks attempt
3. auth failure blocks attempt
4. redaction failure blocks attempt
5. eligible gate can use injected test-safe provider executor
6. successful controlled attempt creates provider outcome facts
7. safe response creates model boundary handoff facts
8. failed attempt preserves distinct failure class
9. retry and fallback eligibility remain metadata only
10. runtime events and JSON stream are observation-only
11. product surface renders facts without success inflation if touched
12. redaction excludes secrets, provider config, raw provider output, unsafe message content, command output, hidden reasoning, transcripts, unsafe file contents
13. truthfulness prevents attempt, completed provider fact, response handoff, retry eligibility, fallback eligibility, or surface rendering from becoming task success

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
- no next model turn loop execution
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
- controlled invocation adapter exists
- default behavior remains no provider call
- missing opt-in blocks attempts
- auth and redaction blockers work
- eligible controlled attempt can use test-safe provider executor
- provider outcome facts exist
- response handoff to model boundary exists
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
5. Controlled invocation adapter
6. Attempt execution boundary
7. Attempt outcome facts
8. Response handoff to model boundary
9. Failure classification
10. Runtime events and JSON stream
11. Product surface changes if any
12. Redaction behavior
13. Truthfulness behavior
14. Validation pass or fail
15. Constraints preserved
16. Remaining not-proven capabilities
17. Commit id if committed
18. Push status
19. Recommended next task

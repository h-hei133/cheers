# MTB004: Tool Result Save Point And Next Turn Integration

## Goal

Implement the next Model To Tool Batch task after controlled tool execution receipts.

MTB003 proved that eligible known supported tool calls can execute through existing sanctioned boundaries and produce report-safe receipts, details, messages, events, and surface facts.

MTB004 must connect tool batch outcomes to evidence-only save point input and next-turn bundle preparation.

Expected final status: COMPLETE.

This task must connect:

- tool batch outcomes
- execution receipts
- tool result details
- tool result messages
- mixed batch status
- evidence-only save point input
- next-turn bundle input
- follow-up and steering delivery facts
- runtime events and JSON stream
- product surface
- result and evidence truthfulness

This task must not execute the next provider turn.

## Core Rule

Tool results can prepare the next turn, but they cannot complete it.

A tool result message is not next-turn completion.

A save point is not task success.

A next-turn bundle is not a provider call.

A successful tool execution is not verification success.

## Owner Domains

Primary owners:

- turn
- tools
- runtime loop
- runtime events
- evidence
- presentation

Boundary owner only:

- runtime execution for receipt metadata

Allowed target areas:

- packages/ts-shell/src/turn
- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not place this logic in CLI, provider, workflow coordinator, product surface, compatibility shims, or session storage.

## Required Inspection

Use Serena targeted inspection before editing. If unavailable, use targeted repository search and report that honestly.

Inspect:

- tool result message model
- tool batch dispatch results
- tool handoff facts
- execution receipts
- evidence-only save point model
- next-turn bundle model
- steering and follow-up delivery model
- runtime loop contract
- loop trajectory
- runtime event projection
- JSON event stream
- product surface and renderer
- result and evidence truthfulness
- focused tests around touched surfaces

Do not inspect external code unless a concrete blocker requires it. If used, keep outside names out of product code, tests, runtime events, package commands, and user-facing output.

## Capability To Build

### 1. Tool outcome bundle

Add or harden a report-safe tool outcome bundle.

It should include:

- bundle id
- source batch id
- source model boundary id if available
- result message ids
- receipt ids
- executed count
- failed count
- blocked count
- authority-required count
- unsupported count
- malformed count
- unknown count
- not-dispatched count
- mixed outcome status
- redaction status
- not-proven claims

The bundle must not include raw unsafe arguments, raw command output, secrets, provider config, hidden reasoning, transcript dumps, or unsafe file contents.

### 2. Save point input

Prepare evidence-only save point input from tool outcomes.

It should include:

- save point input id
- source bundle id
- receipt ids
- result message ids
- partial outcome facts
- blocked facts
- failed facts
- redaction state
- evidence-only status
- not-proven claims

Save point input does not create task success.

Save point creation, if already supported, remains evidence-only.

### 3. Next-turn bundle

Prepare next-turn bundle facts.

It should include:

- next-turn bundle id
- source tool outcome bundle id
- safe tool result messages
- included message ids
- excluded message ids
- exclusion reasons
- readiness status
- blocking facts
- required user action if any
- steering facts if any
- follow-up facts if any
- not-proven claims

Readiness statuses should include:

- ready
- ready_with_partial_tool_results
- blocked_by_policy
- blocked_by_authority
- blocked_by_failed_tool
- blocked_by_malformed_tool_call
- blocked_by_unsupported_tool
- unsupported
- not_ready

Next-turn ready is not a provider call.

### 4. Follow-up and steering facts

Represent follow-up and steering delivery facts.

They should include:

- delivery id
- source next-turn bundle id
- delivery kind
- queued state
- delivered state
- blocked state
- reason
- safe user-facing summary
- not-proven claims

Queued is not delivered.

Delivered is not provider execution.

### 5. Mixed batch semantics

Preserve mixed outcomes across save point and next-turn preparation.

Rules:

- one successful tool result must not hide blocked or failed calls
- failed calls must remain visible
- blocked calls must remain visible
- malformed calls must remain visible
- unsupported calls must remain visible
- partial batch status must carry forward

### 6. Runtime events and JSON stream

Emit or project observation-only events:

- tool outcome bundle observed
- save point input prepared
- next-turn bundle prepared
- next-turn bundle blocked
- follow-up queued
- steering queued
- delivery blocked
- partial tool outcome carried forward

Events must remain JSON-safe and terminalSuccessClaim false.

### 7. Product surface

If safe, expose concise status:

- tool outcome summary
- save point input status
- next-turn readiness
- follow-up or steering state
- blockers
- required user action
- not-proven claims

Product surface renders facts only.

### 8. Truthfulness contract

Preserve these boundaries:

- tool executed is not task success
- receipt exists is not task success
- exit zero is not verification success
- result message exists is not next-turn completion
- save point input exists is not save point success
- next-turn bundle ready is not provider execution
- follow-up queued is not delivered
- product surface rendered is not success

## Required Tests

Add focused tests only.

Test:

1. tool outcome bundle preserves executed and non-executed states
2. mixed batch status keeps failed and blocked calls visible
3. save point input carries evidence-only facts
4. next-turn bundle includes safe messages and excludes unsafe messages
5. next-turn readiness distinguishes ready, partial, blocked, unsupported, and not-ready states
6. follow-up and steering facts distinguish queued, delivered, and blocked
7. runtime events and JSON stream are observation-only
8. product surface renders facts without success inflation if touched
9. redaction excludes secrets, provider config, raw provider output, unsafe raw arguments, raw command output, hidden reasoning, transcripts, unsafe file contents
10. truthfulness prevents result message, receipt, save point input, next-turn bundle, delivery facts, or surface rendering from becoming success

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
- no next provider turn execution
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
- tool outcome bundle exists
- save point input facts exist
- next-turn bundle facts exist
- follow-up and steering facts exist
- mixed batch status remains visible
- unsafe messages are excluded or redacted
- runtime event or JSON stream observations exist
- product surface observation exists if safe
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- no forbidden product naming introduced
- no next provider turn execution introduced
- no new tools or command expansion introduced
- commit and single push completed if validation is clean

If this requires next provider execution, new tools, command expansion, product loop replacement, provider use, or session schema migration, stop and report PARTIAL or BLOCKED.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Tool outcome bundle
6. Save point input
7. Next-turn bundle
8. Follow-up and steering facts
9. Mixed batch semantics
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

# Model Tool Batch Safe Handoff Task

## Goal

Implement MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages.

This task turns completed model-boundary facts and extracted model tool calls into a safe Agent Loop tool phase handoff.

It must not execute tools by default.

It must not expand command allowlists.

It must not change provider, edit, apply, verification, repair, session schema, host API, UI framework, browser, plugin, package loading, or runtime ownership.

Expected final status: COMPLETE.

## Why This Task Exists

The previous model-boundary block made provider request and response facts visible in the Agent Loop.

The latest audit found that model output can already produce assistant accumulation and normalized tool-call extraction facts, but the handoff into a safe tool phase is still mostly contract and projection.

This task must close that gap.

The result should be:

model boundary facts
-> normalized tool batch handoff
-> policy and authority projection
-> non-executed result messages
-> runtime observations
-> product surface state
-> save point and next-turn references
-> no success upgrade

## Owner Domains

Primary owners:

- tools
- turn
- runtime/loop
- runtime/events
- evidence
- presentation

Boundary consumers:

- runtime/execution as authority and receipt boundary only
- core/tools as sanctioned registry consumer only
- result as truthfulness guard only

Allowed target areas:

- packages/ts-shell/src/tools
- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/presentation
- packages/ts-shell/src/runtime/execution only for metadata consumption
- packages/ts-shell/src/core/tools only for registry lookup consumption
- focused tests beside touched modules

Do not place business logic in compatibility surfaces.

Do not create product files with history-process words or external source names.

Do not use external source names in product code, product tests, runtime events, user-facing output, package commands, or product filenames.

## Required Inspection

Use Serena targeted inspection before editing.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- provider response boundary
- assistant response accumulation
- tool call batch extraction
- tool batch dispatch planning
- tool policy interception
- tool result message projection
- tool result split
- tool dispatcher only to verify it is not the owner for this task
- core tool registry only as sanctioned metadata consumer
- ExecutionService and execution receipts only as authority and receipt boundaries
- Agent Loop contract
- loop trajectory projection
- runtime event projection
- JSON event stream
- save point model
- next-turn bundle
- product surface model and renderer
- result and evidence truthfulness
- focused tests for the same areas

Do not inspect external code unless a concrete blocker requires it.

If external inspection is used, no external source names may enter product code, tests, package commands, runtime events, or user-facing output.

## Capability To Build

### 1. Model-to-tool handoff facts

Add a report-safe handoff fact that consumes completed model-boundary facts and extracted tool-call batch facts.

Recommended fields:

- handoff id
- source model boundary id
- source assistant accumulation id
- source tool call batch id
- handoff status
- batch status
- normalized tool call ids
- malformed count
- unsupported count
- unknown count
- partial count
- redaction status
- dispatch eligibility
- policy requirement
- authority requirement
- execution status
- not-proven claims

Allowed handoff statuses:

- ready_for_policy
- ready_for_authority
- blocked_by_policy
- blocked_by_malformed_calls
- blocked_by_unknown_tool
- blocked_by_unsupported_tool
- blocked_by_redaction
- partial_batch
- no_tool_calls
- not_dispatched
- unsupported

Tool handoff exists is not tool execution.

### 2. Unknown tool classification

Make unknown tool names explicit before product integration.

Unknown must be distinct from:

- malformed
- unsupported kind
- metadata-only
- policy blocked
- authority required
- not dispatched

Unknown tool classification must not attempt dispatch.

### 3. Policy and authority projection

Connect each normalized call to before-tool policy and authority facts.

The projection should include:

- policy decision id if available
- policy status
- authority requirement
- authority status
- dispatch allowed by policy
- dispatch allowed by authority
- dispatch eligibility
- blocking reason
- redaction status
- not-proven claims

Policy allowed is not authority granted.

Authority requested is not authority granted.

### 4. Non-executed result messages

Prepare tool result messages for non-executed outcomes.

Required categories:

- not_dispatched
- blocked_by_policy
- authority_required
- unsupported_tool
- unknown_tool
- malformed_arguments
- redaction_blocked
- execution_unavailable

Each message should be report-safe and suitable for future next-turn preparation.

The message must not include raw arguments, raw command output, hidden reasoning, provider output, patch text, transcript dumps, or unsafe file contents.

Tool result message exists is not tool result success.

### 5. Runtime observations

Emit or project observation-only runtime events for safe tool handoff.

Potential event kinds:

- tool handoff observed
- tool batch planned
- tool policy required
- tool authority required
- tool call blocked
- tool result message prepared
- tool handoff partial
- tool handoff unsupported

Events must be JSON-safe and report-safe.

Events must not claim terminal success.

### 6. Save point and next-turn references

Where safe, connect non-executed tool result messages to save point and next-turn references.

This may include:

- save point candidate id
- next-turn bundle input id
- pending tool message ids
- delivery status
- not-proven claims

Do not execute next provider turn.

Do not claim next-turn completion.

### 7. Product surface state

If safe, expose a concise product surface section for tool handoff.

It should show:

- handoff status
- batch status
- malformed, unsupported, unknown, blocked, authority-required, not-dispatched counts
- policy and authority summary
- next action
- not-proven claims

The product surface must not become the fact owner.

### 8. Agent Loop contract

Add or harden the Agent Loop feature contract for the model-to-tool handoff phase.

It should include:

- owner domain
- loop phase
- input facts
- output handoff facts
- runtime observations
- evidence facts
- product surface section if rendered
- result truthfulness boundary
- not-proven claims
- forbidden shortcuts
- validation gates
- terminalSuccessClaim false

## Required Tests

Add focused tests only.

Required categories:

1. Handoff facts
   Completed model-boundary facts and extracted calls produce a report-safe handoff.

2. Unknown, malformed, unsupported
   Unknown, malformed, and unsupported calls stay distinct and non-executed.

3. Policy and authority
   Policy and authority projections preserve blocking and request states without granting authority.

4. Non-executed result messages
   Blocked, authority-required, unsupported, unknown, malformed, redaction-blocked, unavailable, and not-dispatched cases produce safe messages.

5. Runtime observations
   Runtime events and JSON stream entries are observation-only and redacted.

6. Save point and next-turn references
   Pending tool result messages can reference save point and next-turn inputs without executing the next turn.

7. Product surface
   If touched, tool handoff state renders without success inflation.

8. Truthfulness
   Extracted call, planned batch, policy allowed, authority requested, result message prepared, save point referenced, next-turn input prepared, event emitted, or surface rendered cannot become task success, tool success, verification success, repair success, or terminal success.

9. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw tool arguments, raw command output, raw patch text, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

## Architecture Constraints

Hard rules:

- owner-domain-first
- no history-process words in product filenames
- no external source names in product filenames or product content
- no compatibility surface growth
- no helper, utils, common, misc dumping ground
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
- no success outside evidence, verdict, and result truthfulness

## What Not To Do

Do not:

- execute tools
- add real tools
- add command registrations
- broaden command execution
- call live provider
- change prompt behavior
- change CLI behavior
- rewrite tool dispatcher broadly
- rewrite ExecutionService broadly
- rewrite workflow coordinator
- create command aliases
- create verification scripts
- create JSON capability reports
- add package scripts
- change tests to make implementation appear stronger than it is

## Validation

Required:

- focused tool handoff tests
- focused tool batch tests
- focused policy and authority tests
- focused non-executed message tests
- focused runtime event and JSON stream tests if events change
- focused save point and next-turn tests if those references change
- focused product surface tests if display changes
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim validation passed unless actually run.

## Commit And Push Policy

Allowed after validation passes:

- commit the implementation
- push once

Before pushing, run:

- git status --short --branch
- git diff --check

Push policy:

- push at most once
- if push fails, do not retry
- report the failure and local commit id
- do not push unexpected product code changes
- do not push if validation is failing

## Completion Criteria

This task is COMPLETE only if:

- targeted inspection was performed and reported
- model-to-tool handoff facts exist
- unknown, malformed, unsupported, blocked, authority-required, and not-dispatched states are distinct
- policy and authority projection exists
- non-executed tool result messages exist
- runtime observations exist if safe
- save point and next-turn references exist if safe
- product surface displays tool handoff state if touched
- Agent Loop contract has terminalSuccessClaim false
- no tool execution occurs by default
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- status is reported
- commit and a single push are completed if validation is clean

If implementation requires real tool execution, command allowlist expansion, provider calls, product loop rewrite, or broad dispatcher rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final Report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Handoff fact design
6. Classification design
7. Policy and authority projection
8. Non-executed result messages
9. Runtime observations
10. Save point and next-turn references
11. Product surface changes if any
12. Redaction behavior
13. Truthfulness behavior
14. Validation pass or fail
15. Architecture constraints preserved
16. What remains deliberately not-proven
17. Commit id if committed
18. Push status
19. Recommended next task

## Next Task

After this task is complete, continue with:

MTB003 Sanctioned Tool Dispatch Receipt Observation

That task should dispatch only eligible calls through existing sanctioned boundaries when authority is proven and a dispatch seam is explicitly available.

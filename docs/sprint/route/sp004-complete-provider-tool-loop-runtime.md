# SP004 Complete Provider Tool Loop Runtime

## Goal

Build the complete provider-to-tool-to-next-turn runtime loop.

This is a major capability-system task. It must move the project from trusted status projection toward real agent behavior by proving one shared runtime path for synthetic provider responses, tool call extraction, tool dispatch, tool result messages, next model turn preparation, stop conditions, events, replay, and terminal-facing status.

This task is not complete if it only adds provider metadata, only adds a tool result projection, only adds event fields, only adds tests around isolated helpers, or only updates documentation.

## Capability Target

The completed capability must support this controlled lane:

user turn input
-> provider request preparation
-> synthetic provider response intake
-> assistant message accumulation
-> tool call extraction
-> tool policy decision
-> tool batch dispatch through the sanctioned execution boundary
-> tool result message construction
-> next-turn request preparation
-> stop or continue decision
-> runtime event stream
-> replay-safe carry forward
-> CLI and session status envelope
-> evidence/result truth boundary

Synthetic provider behavior must exercise the same runtime seams that a real provider would use, but no live provider may run in this task.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- provider
- runtime
- tools
- turn
- policy
- session
- presentation
- evidence
- result
- verification
- repair
- cli or shell status consumer

Change at least six rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/tools
- packages/ts-shell/src/tools/policy
- packages/ts-shell/src/turn
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- nearby owner tests

## Required Runtime Behavior

Implement a complete synthetic provider and tool loop lane with these properties:

1. Provider request preparation accepts existing request blockers and continuation facts.
2. A deterministic synthetic provider can return assistant text, tool calls, failures, and stop conditions.
3. The model response boundary or response intake path accumulates assistant output without treating it as success.
4. Tool calls are extracted into the existing tool batch shape.
5. Tool policy can allow, block, or require authority for tool calls.
6. Allowed tool calls dispatch through the sanctioned execution boundary or existing safe dispatch seams.
7. Tool results become model-facing result messages for the next turn.
8. Failed, blocked, malformed, or authority-needed tool calls produce explicit next actions.
9. The runtime can decide continue, stop, wait for user, or fail without owning terminal truth.
10. Events, replay, product surface, and CLI/session status envelope consume the same owner facts.
11. Evidence/result remains the only terminal truth owner.
12. The lane must be usable in tests without live provider credentials.

## Required State Coverage

Tests must cover at least these states:

- provider request blocked
- synthetic provider text-only stop
- synthetic provider tool call then continue
- tool call allowed and result message prepared
- tool call blocked by policy
- malformed provider tool call
- provider failure
- tool execution failure
- next-turn request prepared after tool result
- missing proof remains non-success
- complete proof still requires evidence/result verdict

## Required Integration Tests

Add at least two end-to-end or focused integration tests:

1. Happy lane: synthetic provider returns a tool call, tool dispatch produces a result, the runtime prepares the next-turn message, events and replay carry safe facts, and CLI/session status shows next action without terminal success.

2. Blocked lane: request, provider, or tool policy blocks the lane, no tool result is treated as success, events/replay/status show the blocker, and terminal success remains false.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- provider request prepared
- synthetic provider response received
- assistant text generated
- tool call extracted
- tool policy allowed
- tool dispatched
- tool result produced
- next-turn request prepared
- event emitted
- replay carried forward
- CLI or session status rendered
- verification intent
- repair proposal or apply without post-repair verification

Skipped, blocked, failed, malformed, authority-needed, partial, stopped, unknown, and missing-proof states must remain visible.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add new writer behavior
- bypass the sanctioned execution boundary
- hide behavior in compatibility shims
- make terminal text the runtime API
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven synthetic provider and tool loop runtime
- still default-off live provider behavior
- still unproven broad provider compatibility if not completed
- still unproven mutation and rollback behavior if not completed
- still unsupported dynamic execution areas

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- provider request and response tests
- runtime loop tests
- tool policy and dispatch tests
- turn result-message tests
- runtime event tests
- session replay tests
- CLI/session status envelope tests
- product surface tests
- evidence/result truth tests if terminal status mapping changes
- anti-false-success gate
- package build if imports, contracts, or runtime-facing types changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. A deterministic synthetic provider lane exists.
2. Tool call extraction, policy, dispatch, result message, and next-turn preparation are connected.
3. At least two integration tests prove happy and blocked lanes.
4. At least ten required states are covered by tests.
5. At least six owner domains are changed or justified as already compliant.
6. Events, replay, product surface, and CLI/session status consume the same owner facts.
7. Terminal truth remains evidence/result owned.
8. No live provider or secret access occurs.
9. Sprint docs are updated by editing stale claims.
10. Focused validation and diff checks pass.
11. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- runtime lane implemented
- states covered
- integration tests added
- files changed
- negative controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

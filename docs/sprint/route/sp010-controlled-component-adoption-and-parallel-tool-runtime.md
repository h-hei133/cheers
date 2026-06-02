# SP010 Controlled Component Adoption And Parallel Tool Runtime

## Goal

Build a controlled mature-component adoption path and a complete read-only parallel tool runtime.

This is a major capability-system task. It must improve implementation quality and runtime efficiency without turning this project into a clone, without bypassing owner domains, and without weakening truthfulness.

This task is not complete if it only writes an adoption note, only adds a scheduler helper, only changes tool metadata, only adds event fields, only writes docs, or only proves isolated unit helpers.

## Why This Task Exists

The project now has proven host evaluation, provider/model compatibility, synthetic provider lanes, tool dispatch, mutation recovery, branch and compaction runtime, and CLI/session status. The next useful runtime acceleration is safe read-only parallel tool execution before broad mutation concurrency.

At the same time, mature implementation code can be higher quality than freshly generated code. This task may use mature local implementation and public documentation to import or port component-level behavior, but only through a controlled adoption boundary.

## Component Adoption Rules

Use current code and current sprint docs first. Then inspect mature local implementation and public documentation only for the component being adopted or ported.

Allowed adoption modes:

1. Dependency use
   Use an existing package dependency only when it is license-compatible, side-effect boundaries are clear, and product ownership remains in this repository.

2. Structured port
   Reimplement the component behavior and tests in this repository using domain ownership, without copying external names, file layout, runtime fields, or user-visible wording.

3. Isolated source adoption
   Direct source adoption is allowed only for a self-contained component when license requirements, attribution requirements, owner boundaries, tests, redaction, and truthfulness can all be satisfied. If required notices would violate the naming/content constraints for this task, do not copy source; use structured port instead.

4. Behavior-only alignment
   Use this mode for agent loop, permission, mutation, provider secret handling, terminal truth, evidence/result verdicts, and runtime lifecycle behavior.

Every adopted or ported component must have:

- adoption decision recorded in docs/sprint/component-adoption-log.md
- selected mode
- owner domain
- reason for use
- rejected alternatives
- expected callers
- side-effect boundary
- truthfulness boundary
- validation evidence
- rollback plan if the component proves unsafe

Do not put external project names, comparison wording, process wording, or provenance wording in product code names, runtime fields, user-visible output, or product file names.

## Capability Target

The completed runtime must support this controlled lane:

synthetic provider tool calls
-> tool dependency and effect classification
-> policy decision
-> read-only parallel execution plan
-> execution through sanctioned seams
-> deterministic result ordering
-> partial failure handling
-> cancellation or stop request handling
-> tool result messages
-> next-turn preparation
-> runtime events
-> host evaluation result
-> replay-safe carry-forward
-> product surface
-> CLI/session status envelope
-> evidence/result truth boundary

Read-only tools may run in parallel. Mutation tools must not run in parallel in this task.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- tools
- tools/policy
- runtime/execution
- turn
- runtime/loop
- runtime/events
- runtime/api
- runtime/evaluation
- provider/response
- session/replay
- session/presentation
- presentation/surface
- core/shell
- evidence
- result
- policy

Change at least seven rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/tools
- packages/ts-shell/src/tools/policy
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/api
- packages/ts-shell/src/runtime/evaluation
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- docs/sprint/component-adoption-log.md
- nearby owner tests

## Required Runtime Behavior

Implement controlled read-only parallel tool runtime with these properties:

1. Tool calls are classified by effect type: read-only, mutation, unknown, blocked, authority-required, unsupported.
2. Tool dependency facts can express independent, ordered-after, conflicts-with, and unknown dependency.
3. Policy decides allowed parallel read-only execution, forced sequential execution, blocked execution, authority required, or unsupported.
4. Read-only tool calls with no conflicts can be planned into parallel groups.
5. Mutation, unknown-effect, authority-required, unsupported, and conflicting tools do not enter parallel execution.
6. Dispatch records start, completion, failure, cancellation, timeout, skipped, blocked, and partial group facts.
7. Result messages preserve deterministic model-facing order even when execution is parallel.
8. Partial failures preserve successful read-only results and failed tool facts without claiming task success.
9. Cancellation or stop request can prevent remaining parallel work and produce explicit next action.
10. Runtime loop can continue, wait, retry, stop, or fail without owning terminal truth.
11. Host evaluation can run parallel read-only cases and report passed, failed, blocked, unsupported, skipped, or not-proven.
12. Events, replay, product surface, and CLI/session status consume the same scheduling facts.
13. Evidence/result remains the only terminal truth owner.
14. Report-safe surfaces redact raw command output, raw provider output, secrets, raw edit text, patch bodies, and hidden reasoning.

## Required State Coverage

Tests must cover at least these states:

- single read-only tool
- multiple independent read-only tools
- read-only tools forced sequential by dependency
- read-only conflict blocked
- unknown effect blocked
- mutation excluded from parallel plan
- authority-required mutation blocked or waiting
- unsupported tool
- policy denied tool
- one parallel tool fails
- partial parallel group success
- deterministic result ordering
- cancellation before dispatch
- cancellation during group
- timeout in one tool
- skipped dependent tool
- host evaluation passed
- host evaluation blocked
- replay carries safe scheduling facts
- product surface and CLI/session status render scheduling facts
- scheduling facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least four integration tests:

1. Parallel happy lane: synthetic provider emits multiple independent read-only tool calls, scheduler groups them, dispatch records results, result messages keep deterministic order, next turn is prepared, host/events/replay/status agree, and terminal success remains evidence/result owned.

2. Dependency lane: tool calls with ordering constraints run sequentially or in ordered groups, with deterministic result messages and no false success.

3. Blocked lane: mutation, unknown effect, authority-required, unsupported, or conflicting tools do not enter parallel execution; blockers are visible in host/events/replay/status.

4. Partial failure lane: one read-only tool fails or times out, successful results remain report-safe, failed facts are preserved, next action is explicit, and no task success is inferred.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- scheduler planned parallel work
- policy allowed read-only execution
- dispatch started
- tool result produced
- partial group completed
- all read-only tools completed
- result message prepared
- next turn prepared
- host evaluation case executed
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add parallel mutation execution
- add arbitrary writer behavior
- bypass sanctioned tool, policy, execution, provider, session, edit, or result owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven controlled component adoption path
- newly proven read-only parallel tool runtime
- still unproven broad parallel mutation
- still unsupported dynamic execution areas
- still unproven broad SDK or RPC server behavior if not completed
- still default-off live provider behavior

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- tool policy tests
- tool scheduling tests
- tool dispatch tests
- runtime execution tests if touched
- turn result-message tests
- runtime loop tests
- runtime event tests
- runtime API host tests
- runtime evaluation tests
- session replay tests
- CLI/session status tests
- product surface tests
- evidence/result truth tests if terminal status mapping changes
- anti-false-success gate
- package build if imports, contracts, runtime-facing types, host envelopes, or scripts changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Component adoption decision process exists and is used for at least one component or behavior port in this task.
2. Read-only parallel tool scheduler exists and is connected to policy, dispatch, result messages, runtime loop, host evaluation, events, replay, surface, and CLI/session status.
3. At least four integration tests prove parallel happy, dependency, blocked, and partial failure lanes.
4. At least twenty required states are covered by tests.
5. At least seven owner domains are changed or justified as already compliant.
6. Mutation tools do not execute in parallel.
7. Deterministic result ordering is proven.
8. Terminal truth remains evidence/result owned.
9. Report-safe surfaces redact unsafe content.
10. Sprint docs and adoption log are updated by editing stale claims.
11. Focused validation and diff checks pass.
12. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- adoption mode used and why
- component or behavior ported
- parallel tool runtime implemented
- states covered
- integration tests added
- files changed
- deterministic ordering behavior
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

# Build Infrastructure Route BI010: Agent Loop Reference Implementation

## Goal

Pause the provider/model registry route.

BI009 created host-neutral runtime API and JSON-safe event stream, but the project still lacks an explicit Pi-inspired main Agent Loop reference.

This route must study Pi main Agent Loop deeply and implement a local reference loop kernel that shows how this project should structure:

user prompt
-> turn start
-> model/provider response boundary
-> tool call batch
-> tool result batch
-> save point
-> next turn preparation
-> stop or continue decision
-> follow-up or continuation handling
-> result and event projection

Expected final status: COMPLETE.

This is not a broad rewrite of the current product loop.

The output should be a small, clean, host-neutral reference implementation in the rightful runtime or turn owner domain, with tests and event projections. It should be usable as the future direction for product loop refactoring, but should not replace the current production loop unless the change is tiny and safe.

## Why this route exists

BI002 to BI009 built many pieces around the loop:

- turn snapshot
- phase model
- save point
- execution receipts
- tool result details
- runtime events
- session projection
- static resources
- extension hook observations
- runtime API
- JSON event stream

But none of those routes explicitly implemented or documented the main agent loop shape.

Pi's strongest runtime idea is not just AgentHarness. It is the low-level loop structure:

- stream assistant response
- collect tool calls
- execute tools
- emit tool results
- prepare next turn
- handle steering and follow-up queues
- stop only at a well-defined boundary

BI010 must add this missing center.

## Owner domains

Primary owners:

- runtime
- runtime/loop if created
- turn
- runtime/events
- evidence
- result

Secondary owners only if needed:

- tools for tool-call batch typing only
- session for continuation references only
- provider for model boundary typing only

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/tools only for type integration
- packages/ts-shell/src/provider only for boundary types

Do not put loop logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- runtime workflow coordinator
- turn boundary and turn snapshot
- runtime phase
- runtime event projection
- JSON event stream
- execution receipt
- runtime save point
- tools dispatcher and result split
- provider draft or provider boundary
- result and evidence truthfulness
- session API from BI009
- current runMvp compatibility wrapper only to confirm it remains thin

Inspect Pi reference repo with Serena:

- agent loop implementation
- runAgentLoop or equivalent
- assistant streaming boundary
- tool call batch execution
- tool result message construction
- prepareNextTurn or save point handoff
- steering queue
- follow-up queue
- nextTurn delivery mode
- abort or stop handling
- agent and turn event emission

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Local agent loop reference model

Add a small reference loop model in the runtime owner domain.

It should define the local loop concepts:

- loop input
- turn input
- model response boundary
- tool call request
- prepared tool call batch
- tool result batch
- save point request
- next turn preparation
- loop stop reason
- queued steering message
- queued follow-up message
- aborted state
- emitted runtime events

This should be a reference implementation or kernel, not a second product runtime island.

It must compose with existing BI002 to BI009 structures where possible.

### 2. Loop state machine

Define a minimal loop state machine.

Recommended states:

- idle
- starting
- turn_running
- awaiting_tool_results
- saving_point
- preparing_next_turn
- waiting_for_follow_up
- stopped
- aborted
- failed

Use local naming if better.

The loop state must not duplicate terminal result verdicts.

Loop stopped is not the same as task success.

### 3. Tool batch boundary

Define how the loop handles a batch of tool calls.

The reference loop should support:

- zero tool calls
- one tool call
- multiple tool calls as a batch
- sequential or parallel policy as metadata only if current tool runtime supports it
- tool result details from BI003
- execution receipt references
- failed tool result classification
- terminate or stop request if already supported locally

Do not expand real tool execution behavior in this route.

Do not add new tools.

### 4. Save point and next turn boundary

Integrate BI002 save point semantics.

After a tool result batch or equivalent observation boundary, the loop should produce or request:

- evidence-only save point
- event projection
- next turn snapshot request
- pending facts for next turn
- not-proven claims

Save point cannot imply success.

Next turn preparation cannot imply success.

### 5. Steering, follow-up, and next-turn delivery modes

Add a local delivery-mode contract inspired by Pi.

Define the concepts:

- steer
- follow-up
- next-turn

This route may implement metadata and queue semantics in the reference loop only.

It should not change real CLI interactive behavior unless the change is tiny, safe, and separately tested.

Delivery modes must be report-safe and must not hide terminal truthfulness.

### 6. Event projection

The reference loop must emit or project host-neutral runtime events.

Events should cover:

- loop started
- turn started
- model boundary observed
- tool call batch observed
- tool result batch observed
- save point requested or created
- next turn prepared
- steering queued or delivered
- follow-up queued or delivered
- loop stopped
- loop aborted
- loop failed

Events must be JSON-safe through BI009 event stream projection if applicable.

### 7. Product integration boundary

This route should not replace current product loop.

Minimum acceptable integration:

- reference loop uses existing runtime events, save points, execution receipts, and tool result split
- tests prove it can model a simple product-like turn
- existing product path remains unchanged
- documentation or final report identifies future integration seam

If there is a very small safe integration with existing workflow coordinator, it may be added only if it does not rewrite behavior.

## Required tests

Add focused tests only.

Test categories:

1. Loop no-tool path
   A model response with no tool calls stops or prepares next state without success claim.

2. Tool batch path
   A tool call batch produces tool result batch evidence and save point request.

3. Save point truthfulness
   Save point and next turn preparation do not imply task success.

4. Steering and follow-up modes
   Steering and follow-up are queued or delivered according to the reference contract.

5. Abort and failure
   Abort or failed model/tool boundary produces stopped or failed loop state without terminal success.

6. Event ordering
   Events are emitted in stable order and are JSON-safe.

7. Redaction
   Loop events and states do not contain provider secrets, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, full transcript dumps, or unsafe file contents.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no broad runtime rewrite
- no replacement of current product loop in this route
- no provider behavior change
- no tool execution expansion
- no edit, verification, browser, or MCP expansion
- no session schema migration
- no dynamic plugin execution
- no package loading
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- rewrite workflowExecutionCoordinator broadly
- rewrite SessionManager
- create a new product runtime island
- create a route runner
- create a verify route script
- create JSON capability reports
- implement SDK or RPC server
- implement provider streaming
- implement new tools
- implement dynamic extension execution
- change CLI interactive behavior broadly
- copy Pi loop code directly
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI010 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- local agent loop reference model exists in rightful runtime or turn owner domain
- loop state machine is represented
- tool batch boundary is represented
- save point and next turn boundary is represented
- steering, follow-up, and next-turn delivery modes are represented
- host-neutral loop events are projected
- tests cover no-tool, tool-batch, save-point, delivery mode, abort/failure, event ordering, and redaction
- existing product loop is not broadly replaced
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If implementation would require broad product loop rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Pi agent loop findings
6. Local loop reference model
7. Loop state machine
8. Tool batch boundary
9. Save point and next turn boundary
10. Steering and follow-up delivery model
11. Event projection
12. Product integration boundary
13. Redaction behavior
14. Truthfulness behavior
15. Tests and validation pass or fail
16. Architecture constraints preserved
17. What remains deliberately not-proven
18. Recommended next route

## Next route

After BI010 is complete, continue with:

docs/build-infrastructure/route/route-bi011-provider-model-registry-compatibility.md

BI011 should address provider and model registry, compatibility flags, provider failure classification, fallback policy metadata, and per-request auth contract without default-enabling providers.

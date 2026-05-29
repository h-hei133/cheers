# Product Loop Route PL006: Save Point Next Turn Steering And Follow-up

## Goal

Implement the next Agent Loop product phase after PL005.

PL004 added model response and tool-call boundary.
PL005 added tool batch dispatch planning, sanctioned dispatch boundary, tool result details, tool result messages, after-tool annotations, and save point observation.

PL006 must implement the next loop boundary:

tool result messages
-> evidence-only save point
-> prepare-next-turn bundle
-> steering queue
-> follow-up queue
-> next-turn delivery projection
-> runtime event and JSON stream observation
-> product surface rendering

Expected final status: COMPLETE.

This route must not execute a new model turn by default.

## Why this route exists

The Agent Loop cannot approach the target architecture until the boundary after a tool result batch is explicit.

The missing phase is not tool execution. PL005 handled the dispatch and result-message side.

The missing phase is:

save current observations
-> prepare what would be passed into the next model turn
-> handle steering and follow-up messages
-> decide delivery ordering
-> expose the state through events and product surface
-> keep success owned by evidence and result layers

## Owner domains

Primary owners:

- turn
- runtime/loop
- evidence
- runtime/events
- session
- context
- result

Consumer owners:

- presentation
- core/shell

Input owners used by projection:

- tools
- runtime/execution
- provider

Allowed target areas:

- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/evidence
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/session
- packages/ts-shell/src/context
- packages/ts-shell/src/result
- packages/ts-shell/src/presentation only as consumer
- packages/ts-shell/src/core/shell only as host consumer
- packages/ts-shell/src/tools only for tool result message input types
- packages/ts-shell/src/runtime/execution only for receipt references

Do not put next-turn or queue logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- turn/toolResultMessage
- turn/assistantResponse
- evidence/runtimeSavePoint
- runtime/loop/agentLoopContract
- runtime/loop/trajectoryProjection
- runtime/loop/infrastructureMap
- runtime/events/runtimeEventProjection
- runtime/events/jsonEventStream
- tools/toolBatchDispatch
- tools/toolCallBatch
- tools/resultSplit
- runtime/execution/executionReceipt
- session/sessionTreeProjection
- context/sessionContextRebuildProjection
- runtime/workflowExecutionCoordinator
- presentation/productSurface
- core/shell/sessionTerminalState
- result and evidence truthfulness surfaces
- focused tests around turn, loop, events, surface, coordinator

Inspect the local architecture study repository only for Agent Loop comparison if needed:

- save point after tool batch
- prepare next turn
- next turn delivery
- steering queue
- follow-up queue
- abort or stop boundary
- event emission around next turn

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Next-turn input bundle

Add a report-safe next-turn bundle.

The bundle should represent what would be available to the next model turn.

It may include:

- bundle id
- turn id or trajectory id
- source tool result message ids
- safe assistant response summary
- safe user follow-up summary if present
- steering message ids
- follow-up message ids
- context rebuild projection id if available
- session active path id if available
- resource or provider metadata ids if already safe
- redaction state
- delivery status
- not-proven claims

Delivery statuses should include:

- prepared
- waiting
- blocked
- unsupported
- not_prepared
- delivered
- abandoned

The bundle must not contain:

- API keys
- provider.env
- auth headers
- raw provider output
- raw oldText
- raw newText
- unredacted command output
- hidden reasoning
- transcript dumps
- unsafe file contents

### 2. Evidence-only save point boundary

Use or extend the existing save point model so it can capture the post-tool-result boundary.

The save point may reference:

- tool result messages
- tool result details
- execution receipt ids
- before-tool decisions
- after-tool annotations
- next-turn bundle id
- session/context projection ids
- result facts
- redaction state
- not-proven claims

The save point cannot imply success.

The save point cannot imply that next turn executed.

The save point cannot imply verification passed.

### 3. Steering queue

Add a report-safe steering queue projection.

Steering means runtime or user steering that should influence a future turn without being treated as immediate task success.

The queue should represent:

- steering id
- source
- safe summary
- priority if local architecture needs it
- delivery status
- redaction state
- not-proven claims

Allowed statuses:

- queued
- delivered
- blocked
- redacted
- unsupported
- abandoned

Steering delivery must not execute provider by default.

### 4. Follow-up queue

Add a report-safe follow-up queue projection.

Follow-up means user-facing or model-facing follow-up content prepared after a boundary.

It should represent:

- follow-up id
- source
- safe summary
- target turn or pending bundle
- delivery status
- redaction state
- not-proven claims

Follow-up prepared is not next-turn success.

Follow-up delivered is not terminal success.

### 5. Next-turn delivery policy

Add a small local delivery policy for next-turn preparation.

It should define ordering between:

- steering
- follow-up
- tool result messages
- context rebuild facts
- session active path facts
- model response carry-forward if available

This route may only prepare or project delivery.

It must not execute the next model turn by default.

### 6. Loop trajectory integration

Attach save point and next-turn facts to loop trajectory.

Trajectory may record:

- post-tool save point created
- next-turn bundle prepared
- steering queued
- follow-up queued
- delivery policy evaluated
- next turn waiting
- next turn not executed
- not-proven claims

### 7. Runtime event and JSON stream integration

Add host-neutral events for:

- post-tool save point observed
- next-turn bundle prepared
- steering queued
- steering delivered
- follow-up queued
- follow-up delivered
- next-turn delivery policy evaluated
- next-turn waiting
- next-turn delivery unsupported
- next-turn abandoned

Events must remain JSON-safe.

Events must not imply task success.

### 8. Product surface rendering

Product surface should render save point and next-turn state.

Expected sections:

- save point
- session
- context
- tools
- events
- not_proven
- next_action

Rendered output must distinguish:

- save point observed
- next-turn bundle prepared
- steering queued
- follow-up queued
- next turn not executed
- success not proven

Presentation must not become fact owner.

### 9. CLI product path integration

If safe, workflowExecutionCoordinator may include fake/default-safe next-turn bundle observations in the existing loop trajectory.

Do not execute a new model turn.

Do not call real provider.

Do not execute new tools.

Do not change edit, verification, or repair behavior.

## Required tests

Add focused tests only.

Test categories:

1. Next-turn bundle
   Builds a safe bundle from tool result messages, session/context projections, and redacted summaries.

2. Save point boundary
   Post-tool save point references result messages and receipts without success claim.

3. Steering queue
   queued, delivered, blocked, redacted, unsupported, and abandoned steering states are represented safely.

4. Follow-up queue
   queued, delivered, blocked, redacted, unsupported, and abandoned follow-up states are represented safely.

5. Delivery policy
   Delivery order is deterministic and report-safe.

6. No next-turn execution
   Prepared or delivered next-turn state does not call provider and does not execute a new model turn.

7. Trajectory integration
   Loop trajectory includes save point, next-turn bundle, steering, follow-up, and delivery policy facts.

8. Runtime events and JSON stream
   Events are ordered, JSON-safe, and observation-only.

9. Product surface
   Save point and next-turn state render clearly with not-proven claims.

10. CLI product path safety
   Any default-safe coordinator integration does not change terminal state.

11. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

12. Result truthfulness
   save point created, next-turn bundle prepared, steering delivered, follow-up delivered, and delivery policy evaluated cannot upgrade terminal success.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no real provider call
- no provider default enablement
- no manual provider.env read
- no provider streaming implementation
- no new model turn execution by default
- no arbitrary tool execution
- no command allowlist expansion
- no new real tools
- no browser or MCP expansion
- no edit behavior change
- no verification behavior change
- no repair behavior change
- no session schema migration
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no product loop replacement
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- call real provider
- execute a new model turn
- execute arbitrary tools
- implement real provider streaming
- implement verification handoff
- implement repair handoff
- replace workflowExecutionCoordinator
- rewrite ShellSessionRuntime
- rewrite SessionManager
- add package scripts
- create route runner
- create verify script
- create JSON capability report
- hide not-proven claims

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched
- git diff --check
- git status --short --branch

After all required validation passes and audit residue is clean, commit the changes with message:

pl006: add next turn preparation and delivery boundaries

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL006 is COMPLETE only if:

- targeted inspection was performed and reported
- next-turn bundle exists
- post-tool save point boundary exists or is extended safely
- steering queue projection exists
- follow-up queue projection exists
- delivery policy exists
- next turn remains not executed by default
- loop trajectory observes save point and next-turn facts
- runtime events and JSON stream observe save point and next-turn phases safely
- product surface renders save point and next-turn state safely
- no provider call occurs
- no tool execution expansion occurs
- no terminal success is manufactured
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If safe next-turn preparation cannot be implemented without model execution or broad loop rewrite, report PARTIAL and keep unsupported claims visible.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Next-turn bundle design
6. Save point boundary design
7. Steering queue design
8. Follow-up queue design
9. Delivery policy
10. Trajectory integration
11. Runtime event and JSON stream integration
12. Product surface integration
13. CLI product path integration
14. Redaction behavior
15. Truthfulness behavior
16. Tests and validation pass or fail
17. Commit hash if committed
18. Architecture constraints preserved
19. What remains deliberately not-proven
20. Recommended next route

## Next route

After PL006 is complete, continue with:

docs/build-infrastructure/route/route-pl007-verification-repair-loop-handoff.md

PL007 should implement verification and repair handoff inside the agent loop, without treating repair proposal, repair apply, or command exit zero as terminal success.

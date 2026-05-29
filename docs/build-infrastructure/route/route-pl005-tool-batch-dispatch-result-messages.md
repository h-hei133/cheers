# Product Loop Route PL005: Tool Batch Dispatch And Result Messages

## Goal

Implement the next Agent Loop product phase after PL004.

PL004 added the model response boundary, assistant response accumulation, and normalized tool-call extraction. Every extracted tool-call batch remained dispatchStatus: not_dispatched.

PL005 must implement the next phase:

normalized tool-call batch
-> before-tool policy
-> sanctioned dispatch boundary
-> ExecutionService receipt when applicable
-> tool result details
-> after-tool annotation
-> tool result messages for next turn
-> save point observation
-> loop trajectory and event observation
-> product surface rendering

Expected final status: COMPLETE.

This route must not broaden tool capability. It must connect the tool batch phase through existing sanctioned owners only.

## Why this route exists

The Agent Loop cannot approach the target architecture until tool calls become a real loop phase.

PL004 proved that assistant output can produce a normalized tool-call batch. PL005 must prove that a tool-call batch can be processed through local policy and execution boundaries without faking task success.

This route must still preserve the core truthfulness rule:

tool dispatch is not task success
tool result is not verification success
command exit zero is not terminal success
tool result message is not next-turn success
save point is not success

## Owner domains

Primary owners:

- tools
- runtime/execution
- runtime/loop
- runtime/events
- turn
- evidence
- result

Consumer owners:

- presentation
- core/shell

Allowed target areas:

- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/turn
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/presentation only as consumer
- packages/ts-shell/src/core/shell only as host consumer

Do not put tool batch logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- tools/toolCallBatch
- tools/interception
- tools/dispatcher
- tools/resultSplit
- tools/types
- core/tools/runtime
- core/tools/registry
- runtime/execution/executionService
- runtime/execution/executionReceipt
- runtime/loop/agentLoopContract
- runtime/loop/trajectoryProjection
- runtime/workflowExecutionCoordinator
- runtime/events/runtimeEventProjection
- runtime/events/jsonEventStream
- evidence/runtimeSavePoint
- turn/assistantResponse
- provider/modelResponseBoundary
- presentation/productSurface
- result and evidence truthfulness
- existing focused tests around tools, execution, loop, runtime events, product surface, and workflow coordinator

Inspect the local architecture study repository only for Agent Loop comparison if needed:

- tool call batch dispatch
- before-tool hook or permission boundary
- tool execution update events
- tool result message construction
- after-tool annotation
- save point after tool result batch
- next turn preparation boundary

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Tool batch dispatch plan

Add a report-safe dispatch plan for normalized tool-call batches.

The plan should represent:

- batch id
- turn id or response id
- ordered tool calls
- dispatch policy
- sequential or unsupported parallel marker
- before-tool policy decision per call
- authority requirement
- dispatch status
- redaction status
- not-proven claims

Required statuses:

- planned
- blocked
- authority_required
- partially_dispatchable
- dispatched
- dispatch_failed
- unsupported
- not_dispatched

This route may keep parallel execution unsupported or metadata-only.

### 2. Before-tool policy integration

Use the existing tool interception policy boundary.

Each tool call must receive a before-tool policy result.

Allowed outcomes:

- allow
- block
- request_authority
- redact_then_allow
- observe_only
- unsupported
- rejected

Forbidden outcomes remain forbidden:

- bypass authority
- mutate files without sanctioned owner
- run shell outside ExecutionService or sanctioned owner
- call provider
- declare success
- alter hidden transcript
- expose secrets

A blocked or authority-required call must not execute.

### 3. Sanctioned dispatch boundary

Dispatch only through existing sanctioned owners.

Allowed:

- existing tool dispatcher seam
- existing core tool registry seam
- ExecutionService-backed command seam if already allowed
- test-safe in-process seam already used by the project
- fake/default-safe tool execution fixture only if clearly labeled as fixture and not product success

Not allowed:

- new real tools
- command allowlist expansion
- arbitrary shell execution
- provider calls
- browser or external tool path
- MCP expansion
- edit or verification behavior change

If no safe dispatch seam exists for a tool call, classify it as unsupported or not_dispatched.

Do not fake dispatch success as real execution.

### 4. Execution receipt integration

When a dispatch reaches ExecutionService or an execution-backed sanctioned owner, attach a report-safe execution receipt.

Receipt facts may include:

- receipt id
- caller
- operation kind
- authority mode
- execution status
- error class
- exit code if relevant
- redaction status
- policy metadata
- not-proven claims

Receipt success must not become task success.

Exit code zero must not become verification success.

### 5. Tool result details

Build tool result details from dispatched or blocked calls.

The result details should include:

- tool call id
- tool name or kind
- result status
- content summary
- system details
- report-safe projection
- execution receipt id if available
- policy decision id
- redaction status
- not-proven claims

Required result statuses:

- not_executed
- blocked
- authority_required
- succeeded
- failed
- unsupported
- rejected
- redacted

Model-visible content and system-visible details must remain separated.

### 6. Tool result messages for next turn

Add a tool result message projection for future next-turn preparation.

It should represent what would be delivered to the next model turn.

It must be report-safe.

It may include:

- tool call id
- role or message kind
- safe content summary
- delivery status
- redaction status
- not-proven claims

Delivery statuses:

- prepared
- blocked
- not_prepared
- unsupported
- redacted

This route does not need to implement full prepare-next-turn semantics. That belongs to PL006.

### 7. After-tool annotation

Use existing after-tool observation and annotation contracts.

After-tool annotation may record:

- annotation id
- tool call id
- execution receipt id
- status
- safe summary
- next action suggestion
- blocked follow-up marker
- not-proven claims

Annotation cannot rewrite success.

### 8. Save point observation

After a tool result batch, create or attach an evidence-only save point observation if the existing seam supports it.

The save point may reference:

- tool result ids
- execution receipt ids
- policy decision ids
- result message ids
- redaction state
- not-proven claims

Save point cannot imply success.

### 9. Loop trajectory integration

Attach tool batch dispatch facts to the existing loop trajectory.

Trajectory may record:

- tool batch planned
- before-tool policy completed
- tool dispatch completed or blocked
- tool result details observed
- tool result messages prepared
- after-tool annotation observed
- save point observed
- next turn not yet executed
- not-proven claims

### 10. Runtime event and JSON stream integration

Add host-neutral runtime events for:

- tool batch dispatch planned
- before-tool policy decided
- tool call blocked
- tool call authority required
- tool call dispatched
- tool result observed
- tool result message prepared
- after-tool annotation observed
- tool batch save point observed

Events must be JSON-safe.

Events must not imply task success.

### 11. Product surface rendering

Product surface should render tool batch dispatch facts.

Expected sections:

- tools
- authority
- execution
- events
- not_proven
- next_action

Rendered output must distinguish:

- planned
- blocked
- authority required
- dispatched
- result observed
- result message prepared
- task success not proven

Presentation must not become fact owner.

### 12. CLI product path integration

If safe, workflowExecutionCoordinator may include fake/default-safe tool batch dispatch observations in the existing loop trajectory when PL004 provides a default-safe tool-call batch.

Do not execute arbitrary tools.

Do not call real provider.

Do not change current task behavior.

## Required tests

Add focused tests only.

Test categories:

1. Dispatch plan
   no-tool, one-tool, multi-tool, unsupported, blocked, authority-required, and partially dispatchable batches are planned.

2. Before-tool policy
   policy outcomes gate dispatch correctly.

3. Sanctioned dispatch
   only existing sanctioned or test-safe seams can execute; unsupported calls remain not_dispatched or unsupported.

4. Execution receipt
   dispatched execution-backed calls carry report-safe receipts.

5. Tool result details
   content/details/reportSafe separation is preserved for succeeded, failed, blocked, unsupported, and redacted results.

6. Tool result messages
   next-turn tool result messages are prepared safely but do not execute next turn.

7. After-tool annotation
   annotations are report-safe and cannot rewrite success.

8. Save point truthfulness
   save point after tool batch cannot become success.

9. Trajectory integration
   loop trajectory includes dispatch plan, policy decisions, tool result details, result messages, annotations, save point, and not-proven claims.

10. Runtime events and JSON stream
   events are ordered, JSON-safe, and observation-only.

11. Product surface
   tool batch phases render clearly with not-proven claims.

12. CLI product path safety
   any default-safe coordinator integration does not change terminal state.

13. Redaction
   no API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

14. Result truthfulness
   tool allowed, tool dispatched, tool succeeded, receipt exit zero, result message prepared, and save point created cannot upgrade terminal success.

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
- no command allowlist expansion
- no new real tools
- no browser or MCP expansion
- no edit behavior change
- no verification behavior change
- no repair behavior change
- no full prepare-next-turn implementation
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
- execute arbitrary shell commands
- broaden allowlists
- add new tools
- add browser or external tools
- implement verification command selection
- implement repair handoff
- implement full next-turn delivery
- replace workflowExecutionCoordinator
- rewrite ShellSessionRuntime
- create route runner
- create verify script
- create JSON capability report
- add package scripts
- hide not-proven claims

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched
- git diff --check
- git status --short --branch

After all required validation passes and audit residue is clean, commit the changes with message:

pl005: add tool batch dispatch and result messages

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL005 is COMPLETE only if:

- targeted inspection was performed and reported
- dispatch plan exists
- before-tool policy gates dispatch
- sanctioned dispatch boundary exists
- unsupported calls remain unsupported or not_dispatched
- execution receipts attach when execution-backed dispatch occurs
- tool result details preserve content/details/reportSafe separation
- tool result messages are prepared safely
- after-tool annotation exists
- save point observation exists after tool result batch where supported
- loop trajectory observes tool batch dispatch facts
- runtime events and JSON stream observe tool batch phases safely
- product surface renders tool batch phases safely
- no arbitrary tool execution occurs
- no command allowlist expansion occurs
- no terminal success is manufactured
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If safe dispatch cannot be implemented without broad tool rewrites, report PARTIAL and keep unsupported calls visible.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Dispatch plan design
6. Before-tool policy integration
7. Sanctioned dispatch boundary
8. Execution receipt integration
9. Tool result details
10. Tool result messages
11. Save point observation
12. Trajectory integration
13. Runtime event and JSON stream integration
14. Product surface integration
15. CLI product path integration
16. Redaction behavior
17. Truthfulness behavior
18. Tests and validation pass or fail
19. Commit hash if committed
20. Architecture constraints preserved
21. What remains deliberately not-proven
22. Recommended next route

## Next route

After PL005 is complete, continue with:

docs/build-infrastructure/route/route-pl006-save-point-next-turn-steering-followup.md

PL006 should implement save point, prepare-next-turn, steering queue, follow-up queue, and next-turn delivery semantics without executing a new model turn by default.

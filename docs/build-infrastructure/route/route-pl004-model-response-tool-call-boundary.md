# Product Loop Route PL004: Model Response And Tool-Call Boundary

## Goal

Implement the next Agent Loop product route after PL003.

PL002 connected the real CLI product path to loop trajectory observation.
PL003 audited the remaining Agent Loop phases and selected this route as the next dependency.

PL004 must implement the model response and tool-call boundary needed before real tool dispatch can exist.

Target capabilities:

- product-loop model response boundary
- fake/default-safe assistant response adapter
- assistant response accumulation
- normalized tool-call extraction
- tool-call batch projection
- runtime event observation
- loop trajectory attachment
- product surface observation

Expected final status: COMPLETE.

This route must not call real provider and must not execute tools.

## Why this route exists

The current project can observe a CLI loop trajectory, but the loop still lacks the first real inner-loop boundary:

model response
-> assistant response accumulation
-> tool call extraction
-> normalized tool-call batch
-> trajectory and event observation

Without this boundary, later tool dispatch, tool result messages, next-turn preparation, verification handoff, repair handoff, and loop consolidation would be built on fake or implicit assumptions.

## Owner domains

Primary owners:

- provider
- turn
- runtime/loop
- runtime/events
- tools
- evidence
- result

Consumer owners:

- presentation
- core/shell

Allowed target areas:

- packages/ts-shell/src/provider
- packages/ts-shell/src/turn
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/tools
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/presentation only as consumer
- packages/ts-shell/src/core/shell only as host consumer

Do not put model response or tool-call boundary logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- provider registry and readiness
- provider draft or provider response boundary
- context aware provider prompt if relevant
- runtime loop contract
- loop trajectory projection
- workflowExecutionCoordinator loop observation seam
- turn snapshot and turn boundary
- runtime event projection
- JSON event stream
- tools types
- tools dispatcher only to understand future dispatch seam
- tool interception
- tool result split
- product surface view model
- terminal renderer
- result and evidence truthfulness

Inspect the local architecture study repository only for Agent Loop comparison if needed:

- model response accumulation
- assistant response boundary
- tool call extraction
- tool call batch shape
- event emission around model and tool calls
- prepare next turn boundary only for later context

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Model response boundary

Add a report-safe model response boundary in the rightful provider or runtime loop owner domain.

It should represent:

- response id
- turn id or snapshot id if available
- provider mode
- provider safe label if available
- model safe label if available
- response source
- response status
- assistant content summary
- tool call count
- redaction status
- not-proven claims

Allowed response sources:

- fake_default_safe
- product_fixture
- existing_safe_projection
- unavailable

Real provider response is not allowed in this route.

The boundary must not include:

- API keys
- provider.env
- auth headers
- raw provider output
- raw patch payloads
- hidden reasoning
- full transcript dumps
- unsafe file contents

### 2. Assistant response accumulation

Add assistant response accumulation as a local turn or runtime loop boundary.

It should support:

- text delta accumulation from safe input
- final assistant response summary
- structured state for tool call extraction
- accumulation status
- redaction metadata
- not-proven claims

This route may use fake/default-safe chunks or already-safe strings.

Do not implement real provider streaming.

Do not persist raw provider text.

Do not treat assistant text as success.

### 3. Tool-call extraction and normalization

Add tool-call extraction from the accumulated assistant response.

It should support:

- no tool calls
- one tool call
- multiple tool calls
- malformed tool call
- unsupported tool call
- duplicate tool call id if relevant
- unknown tool name
- redacted arguments
- not-proven claims

The normalized tool-call batch should include:

- batch id
- turn id or response id
- ordered tool calls
- tool kind or name
- report-safe argument summary
- risk level if available
- before-tool policy pending marker
- dispatch status set to not_dispatched
- not-proven claims

This route must not dispatch tools.

This route must not broaden tool allowlists.

This route must not create new tools.

### 4. Loop trajectory integration

Attach model response and tool-call batch observations to the existing loop trajectory projection.

The trajectory may record:

- model boundary observed
- assistant accumulation observed
- tool-call batch extracted
- tool dispatch not run
- not-proven claims

Do not change terminal result.

Do not treat tool-call extraction as tool execution.

### 5. Runtime event and JSON stream integration

Add host-neutral runtime events for:

- model response boundary observed
- assistant response accumulated
- tool-call batch extracted
- tool-call extraction failed
- tool dispatch not run

Events must remain JSON-safe.

Events must not imply provider success, tool success, task success, or terminal success.

### 6. Product surface observation

Allow product surface to render the model response and tool-call boundary as observation.

Expected sections may include:

- provider
- turn
- tools
- events
- not proven
- next action

Rendered output must clearly distinguish:

- response observed
- tool calls extracted
- tool dispatch not run
- tool results not available
- success not proven

Presentation must not become fact owner.

### 7. Existing CLI product path integration

If safe, workflowExecutionCoordinator may include the model boundary and tool-call batch observation in the existing loop observation.

This must be fake/default-safe only.

Do not call real provider.

Do not change live provider behavior.

Do not change tool behavior.

Do not change edit, verification, or repair behavior.

## Required tests

Add focused tests only.

Test categories:

1. Model response boundary
   Fake/default-safe response creates report-safe model boundary without provider secrets or raw output.

2. Assistant accumulation
   Accumulates safe chunks and produces a final response state without success claim.

3. Tool-call extraction
   Handles no tool calls, one tool call, multiple tool calls, malformed tool calls, unsupported tools, and redacted arguments.

4. Tool-call batch truthfulness
   Extracted tool calls remain not_dispatched and cannot become tool success or task success.

5. Trajectory integration
   Loop trajectory includes model boundary and tool-call batch observations.

6. Runtime events and JSON stream
   Events are ordered, JSON-safe, and observation-only.

7. Product surface rendering
   Surface renders model/tool-call observations with visible not-proven claims.

8. CLI product path safety
   Existing CLI product path can include fake/default-safe model boundary observation without changing terminal state.

9. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

10. Result truthfulness
   Provider response observed and tool calls extracted cannot upgrade terminal success.

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
- no tool execution
- no command allowlist expansion
- no new tools
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
- enable provider by default
- parse private provider config manually
- implement provider streaming
- execute tools
- create tool result messages for dispatched tools
- implement save point or prepare-next-turn behavior beyond observation
- implement verification or repair handoff
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
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched.

After all required validation passes and audit residue is clean, commit the changes with message:

pl004: add model response and tool call boundary

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL004 is COMPLETE only if:

- targeted inspection was performed and reported
- model response boundary exists
- assistant response accumulation exists
- normalized tool-call batch exists
- malformed and unsupported tool calls are classified
- tool dispatch remains not run
- loop trajectory can observe model boundary and tool-call batch
- runtime events and JSON stream can observe the boundary safely
- product surface can render the observation safely
- CLI product path integration is fake/default-safe only if added
- no real provider call occurs
- no tool execution occurs
- not-proven claims remain visible
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires real provider calls or tool execution, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Model response boundary design
6. Assistant accumulation design
7. Tool-call extraction and batch design
8. Trajectory integration
9. Runtime event and JSON stream integration
10. Product surface integration
11. CLI product path integration
12. Redaction behavior
13. Truthfulness behavior
14. Tests and validation pass or fail
15. Commit hash if committed
16. Architecture constraints preserved
17. What remains deliberately not-proven
18. Recommended next route

## Next route

After PL004 is complete, continue with:

docs/build-infrastructure/route/route-pl005-tool-batch-dispatch-result-messages.md

PL005 should implement tool batch dispatch through sanctioned owners, before-tool policy, ExecutionService receipts, after-tool annotations, and tool result messages for next turn, without broadening command allowlists or treating tool success as task success.

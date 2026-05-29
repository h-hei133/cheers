# Product Loop Route PL002: Real CLI Agent Loop Observation Integration

## Goal

Implement the first product loop integration route after PL001 audit.

PL001 chose workflowExecutionCoordinator as the safest primary emission seam for real CLI agent loop observations.

PL002 must connect the current real CLI coding path to the BI016 agent loop spine as observation only.

Target path:

CLI prompt
-> ShellSessionRuntime
-> workflowExecutionCoordinator
-> loop trajectory observation
-> runtime events
-> JSON event stream
-> product surface rendering
-> result and evidence truthfulness preserved

Expected final status: COMPLETE.

This route must not replace the product loop.

## Why this route exists

BI002 to BI016 built the infrastructure around an agent loop:

- turn snapshot
- runtime phase
- save point
- execution receipt
- tool result split
- tool interception
- provider and model metadata
- session active path
- context rebuild projection
- runtime event projection
- JSON event stream
- product surface renderer
- agent loop contract
- agent loop integration spine

PL001 audited the current real CLI product path and found the next safe step:

workflowExecutionCoordinator should emit loop trajectory observations from facts already owned by existing domains.

ShellSessionRuntime and presentation should consume observations only.

Result, evidence, and verdict remain the only terminal truth owners.

## Owner domains

Primary owners:

- runtime
- runtime/loop
- runtime/events
- turn
- evidence
- result

Consumer owners:

- core/shell
- presentation
- session
- context

Metadata owners used by projection:

- provider
- tools
- runtime/execution

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/turn
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/presentation
- packages/ts-shell/src/session
- packages/ts-shell/src/context
- packages/ts-shell/src/provider
- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/execution

Do not put observation logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect:

- entrypoints cli runtime module
- CLI runtime invocation bridge
- ShellSessionRuntime
- workflowExecutionCoordinator
- runtime loop trajectory projection
- runtime loop integration map
- turn snapshot and turn boundary
- runtime save point
- runtime event projection
- JSON event stream
- execution receipt
- tool result split
- tool interception
- provider registry and readiness
- session active path projection
- context rebuild projection
- product surface view model
- terminal message renderer
- result and evidence truthfulness surfaces
- focused tests around CLI, shell runtime, workflow coordinator, loop trajectory, runtime events, product surface

Do not inspect external repositories unless a local seam is unclear.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Product path loop observation attachment

Add a report-safe observation attachment from the current CLI product path.

The attachment should represent a LoopTrajectoryProjection or a narrow product-path wrapper around it.

It must be produced from existing owner-domain facts.

It may include:

- prompt or task summary if already safe
- turn snapshot id
- runtime phase facts
- provider boundary metadata
- provider readiness metadata
- tool policy facts when available
- tool result details when available
- execution receipts when available
- save point id or save point facts
- session active path projection
- context rebuild projection
- runtime event ids
- JSON stream ids if projected
- product surface section ids if rendered
- result facts
- not-proven claims

It must not include:

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
- terminal success claims not backed by result and evidence

### 2. Coordinator emission seam

Use workflowExecutionCoordinator as primary emission seam.

The coordinator may assemble observations from facts it already has or obtains through sanctioned owner projections.

The coordinator must not become the fact owner for:

- provider success
- tool authority
- tool success
- execution success
- session truth
- context truth
- result verdict
- presentation wording

If a fact is unavailable, mark it not-proven or unsupported. Do not omit it in a way that looks like success.

### 3. Provider metadata attachment

Attach provider and model metadata only when safely available.

Provider metadata may include:

- provider mode
- opt-in status
- safe provider label
- safe model label
- compatibility flags if available
- readiness status
- not-proven claims

Provider metadata must not imply:

- provider success
- proposal success
- model compatibility proof
- auth secret availability
- terminal success

Do not call real provider in this route.

Do not change provider defaults.

Do not manually read provider.env.

### 4. Tool and execution facts attachment

Attach tool and execution facts only when available.

May include:

- before-tool policy decision
- after-tool annotation
- tool result split projection
- execution receipt projection
- command status summary
- authority metadata
- not-proven claims

Tool and execution facts must not imply:

- task success
- verification success
- authority granted
- write permission
- repair success

Do not broaden tool behavior.

Do not broaden command allowlists.

Do not add new tools.

### 5. Save point, session, and context attachment

Attach safe projections:

- evidence-only save point
- session active path
- context rebuild projection
- missing facts
- redaction status
- not-proven claims

Do not migrate session schema.

Do not dump raw transcripts.

Do not treat context rebuild projection as enough-context success unless the existing owner proves that.

### 6. Runtime event and JSON stream integration

Expose the loop observation through runtime events and JSON event stream as observation only.

Events should remain host-neutral.

JSON stream entries must remain report-safe and ordered.

Event emission cannot imply terminal success.

### 7. Product surface and ShellSessionRuntime consumption

Let presentation render loop observation sections.

Let ShellSessionRuntime consume or pass through the observation as a host adapter.

ShellSessionRuntime must not become the fact owner.

Presentation must not compute success.

Expected rendered sections may include:

- task
- turn
- provider
- tools
- execution
- save point
- session
- context
- events
- verdict
- not proven
- next action

Do not redesign CLI.

Do not build TUI.

Do not change interactive flow broadly.

### 8. Result truthfulness

Loop observation must not change:

- terminal status
- result kind
- verification status
- repair status
- authority status
- provider success status
- session persistence semantics

Result, evidence, and verdict layers remain authoritative.

## Required tests

Add focused tests only.

Test categories:

1. Coordinator observation emission
   workflowExecutionCoordinator emits loop observation from product-path facts.

2. Missing facts visibility
   unavailable provider, tool, execution, session, context, or stream facts remain not-proven or unsupported.

3. Provider metadata truthfulness
   provider boundary or readiness metadata does not become provider success or terminal success.

4. Tool and receipt truthfulness
   tool result, tool allowed, execution receipt, or exit code zero does not become task success.

5. Save point truthfulness
   save point creation and next-turn facts do not become success.

6. Event and JSON stream
   trajectory observation is projected as ordered report-safe events and JSON stream entries.

7. Product surface rendering
   product surface renders loop trajectory sections with visible not-proven claims.

8. ShellSessionRuntime consumption
   shell session consumes or passes through observation without changing terminal state.

9. Result contract
   result/evidence/verdict remain terminal truth owners.

10. Redaction
   no API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no product loop replacement
- no workflowExecutionCoordinator rewrite beyond narrow observation emission
- no ShellSessionRuntime rewrite beyond host-adapter consumption
- no SessionManager rewrite
- no session schema migration
- no provider default enablement
- no real provider call
- no manual provider.env read
- no tool behavior expansion
- no command allowlist broadening
- no edit or verification behavior change
- no browser or external tool path
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- replace current product loop
- create a new product runtime island
- implement provider streaming
- implement model-driven tool call execution
- implement real parallel tool execution
- change provider prompt behavior
- change edit behavior
- change verification behavior
- add package scripts
- create route runner
- create verify script
- create JSON capability report
- hide not-proven claims for prettier output
- treat rendered output as proof

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

PL002 is COMPLETE only if:

- targeted inspection was performed and reported
- current CLI product path emits a loop trajectory observation
- workflowExecutionCoordinator remains composition seam, not owner of provider/tool/session/context/result facts
- ShellSessionRuntime remains host adapter and consumer only
- product surface renders loop observation safely
- runtime events and JSON stream can observe the loop trajectory
- missing facts are visible as not-proven or unsupported
- loop observations cannot upgrade terminal success
- no provider default enablement occurs
- no tool behavior expansion occurs
- no product loop replacement occurs
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires broad product loop replacement, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Observation attachment design
6. Coordinator emission seam
7. Provider metadata integration
8. Tool and execution fact integration
9. Save point, session, and context integration
10. Runtime event and JSON stream integration
11. Product surface and shell consumption
12. Result truthfulness behavior
13. Redaction behavior
14. Tests and validation pass or fail
15. Architecture constraints preserved
16. What remains deliberately not-proven
17. Recommended next route

## Next route

After PL002 is complete, continue with:

docs/build-infrastructure/route/route-pl003-real-agent-loop-tool-batch-boundary-audit.md

PL003 should audit and plan the next block: real model and tool batch loop behavior, including assistant response boundary, tool call collection, before-tool policy, ExecutionService dispatch, tool result messages, save point, and next-turn preparation.

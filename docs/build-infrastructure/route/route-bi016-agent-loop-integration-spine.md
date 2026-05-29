# Build Infrastructure Route BI016: Agent Loop Integration Spine

## Goal

Implement the integration route that should happen before build-infrastructure closeout.

BI002 to BI015 created many infrastructure pieces around the agent loop:

- turn snapshot
- runtime phase
- evidence-only save point
- execution receipt
- tool result details
- session active path and context rebuild projection
- runtime event stream
- static resources
- extension lifecycle and hook policy observation
- provider and model metadata
- agent loop contract
- tool interception
- package governance
- product surface renderer

BI016 must connect these pieces to the agent loop spine.

Expected final status: COMPLETE.

This route must not replace the existing product loop. It must create a local integration spine that proves how the infrastructure maps onto the main agent loop.

## Core question

Do all build-infrastructure pieces connect to the agent loop?

This route must answer that with product code and tests.

The answer should be:

- yes for structural projections and event flow
- partial for real provider streaming
- partial for real tool execution batch
- partial for session storage backed branching
- not-proven for full product loop replacement

Do not overclaim.

## Owner domains

Primary owners:

- runtime
- runtime/loop
- runtime/events
- turn
- session
- context
- tools
- runtime/execution
- provider
- presentation
- evidence
- result

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/turn
- packages/ts-shell/src/session
- packages/ts-shell/src/context
- packages/ts-shell/src/tools
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/provider
- packages/ts-shell/src/presentation
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result

Do not put loop integration logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena before implementation.

Inspect current project with targeted symbol and file inspection:

- runtime loop contract
- turn snapshot and turn boundary
- runtime phase
- runtime save point
- execution receipt
- tool result split
- tool interception
- provider registry metadata
- session tree projection
- session context rebuild projection
- runtime event projection
- JSON event stream
- product surface view model and renderer
- result and evidence truthfulness surfaces
- workflow coordinator only to understand current seam
- shell session runtime only to understand current host seam

Inspect the local architecture study repository only if needed to verify loop connection concepts:

- loop execution
- tool batch
- save point
- next turn preparation
- steering or follow-up delivery
- event emission
- session context rebuild

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, continue only if targeted repository search is enough, and report that Serena was unavailable.

## Capability to build

### 1. Loop integration map

Create a local loop integration map in the runtime loop owner domain.

It should map loop phases to existing infrastructure:

- prompt input
- turn snapshot
- model boundary
- provider metadata
- tool call batch
- before-tool policy
- execution receipt
- tool result details
- after-tool annotation
- save point
- next turn preparation
- session active path
- context rebuild projection
- runtime events
- JSON event stream
- product surface sections
- result facts
- not-proven claims

This map is product architecture code, not a documentation-only table.

It must be report-safe.

### 2. Integrated loop trajectory projection

Create a projection that can represent a single in-process loop trajectory.

The trajectory should include:

- loop id
- turn id or snapshot id
- ordered stages
- event ids
- receipt ids
- tool policy ids
- save point ids
- session projection ids
- context rebuild projection ids
- provider metadata ids
- product surface section ids
- final observed facts
- not-proven claims

The trajectory is observation-only.

It must not claim terminal success.

### 3. Structural connection from BI002 to BI015

The projection must be able to consume or reference:

- turn snapshot
- runtime phase
- save point
- execution receipt
- tool result split
- tool interception decision
- provider and model registry metadata
- session active path
- context rebuild projection
- package and resource inventory metadata
- runtime events
- product surface view model

If any piece cannot be connected, record it as unsupported or not-proven.

Do not hide disconnected pieces.

### 4. Event stream integration

The integrated trajectory must project host-neutral runtime events.

Events should cover:

- loop input observed
- turn snapshot observed
- provider boundary observed
- tool policy observed
- tool result observed
- execution receipt observed
- save point observed
- next turn prepared
- session context projected
- product surface projected
- loop stopped or waiting

Events must remain JSON-safe.

Events must not manufacture success.

### 5. Product surface integration

The product surface should be able to render a loop trajectory summary.

Minimum sections:

- task or prompt
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

The renderer must not become the fact owner.

### 6. Current product loop boundary

Do not replace the current product loop.

This route should identify the future product integration seam:

- where the current workflow coordinator could emit loop trajectory facts
- where shell session runtime could consume them
- where runtime API could expose them

Only add safe minimal wiring if it does not change behavior.

### 7. Truthfulness and not-proven policy

The integrated loop trajectory cannot upgrade:

- provider metadata
- provider called
- tool allowed
- tool result
- command exit zero
- execution receipt
- save point
- next turn prepared
- session projected
- context rebuilt
- product surface rendered
- event emitted

into terminal success.

Terminal success remains owned by result and evidence.

## Required tests

Add focused tests only.

Test categories:

1. Integration map completeness
   All BI002 to BI015 infrastructure categories are mapped or explicitly marked not-proven.

2. Trajectory projection
   A synthetic in-process trajectory connects prompt, turn snapshot, provider metadata, tool policy, tool result, execution receipt, save point, next turn, session context, events, and product surface.

3. Event ordering
   Loop trajectory events have stable ordering and JSON-safe projection.

4. Product surface rendering
   A loop trajectory can be rendered through product surface without turning observations into success.

5. Disconnected piece truthfulness
   Unsupported or not-proven infrastructure remains visible.

6. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

7. Existing product loop safety
   Current product loop behavior is not replaced or broadly changed.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no product loop replacement
- no workflow coordinator rewrite
- no shell session runtime rewrite
- no session schema migration
- no provider default enablement
- no real provider streaming implementation
- no real tool execution expansion
- no edit, verification, browser, or MCP expansion
- no command allowlist broadening
- no dynamic plugin execution
- no package loading
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- replace workflowExecutionCoordinator
- replace ShellSessionRuntime
- create a new runtime island
- implement real provider streaming
- implement real parallel tool execution
- implement SDK or RPC server
- implement TUI
- migrate session storage
- add tools
- change provider behavior
- change edit or verification behavior
- create a route runner
- create a verify route script
- create JSON capability reports
- move files to mirror an external project

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI016 is COMPLETE only if:

- targeted inspection was performed and reported
- loop integration map exists in rightful runtime loop owner domain
- integrated loop trajectory projection exists
- BI002 to BI015 infrastructure categories are mapped or explicitly marked not-proven
- event stream can observe loop trajectory safely
- product surface can render loop trajectory safely
- current product loop is not replaced
- disconnected capabilities remain visible as not-proven
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires broad product loop rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Loop integration map
6. Integrated trajectory projection
7. BI002 to BI015 connection status
8. Event stream integration
9. Product surface integration
10. Current product loop boundary
11. Redaction behavior
12. Truthfulness behavior
13. Tests and validation pass or fail
14. Architecture constraints preserved
15. What remains deliberately not-proven
16. Recommended next route

## Next route

After BI016 is complete, continue with:

docs/build-infrastructure/route/route-bi017-build-infrastructure-closeout-and-roadmap.md

BI017 should close the initial build-infrastructure sequence, update the route index, summarize completed infrastructure layers, identify remaining deferred patterns, and recommend the next real product feature route.

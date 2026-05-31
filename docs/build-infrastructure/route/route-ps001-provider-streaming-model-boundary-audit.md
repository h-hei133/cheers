# Provider Streaming Route PS001: Provider Streaming And Model Boundary Audit

## Goal

Start the Provider Streaming And Model Boundary capability block after the Context and Planning block.

This is an audit and planning route only.

Do not implement product code in this route.

The purpose is to decide how real provider streaming, assistant response accumulation, tool call detection, abort or cancel propagation, partial event emission, provider failure classification, and next-turn handoff should connect to the Agent Loop core.

This block must not become an isolated provider subsystem.

It must connect to:

- Agent Loop model boundary
- CP006 context and planning output
- provider and model registry metadata
- runtime events and JSON stream
- tool call batch extraction
- save point and next-turn preparation
- product surface rendering
- result and evidence truthfulness

Expected final status: COMPLETE.

## Why this block is next

The Context and Planning block is complete enough to produce loop-governed context, plan, handoff, memory, and continuation facts.

The next natural Agent Loop phase is model invocation and model response handling.

Current gaps:

- provider streaming is not product-proven
- assistant response accumulation from stream is not product-proven
- streaming tool call detection is not product-proven
- model boundary to tool batch handoff is not product-proven
- abort or cancel propagation through provider stream is not product-proven
- partial provider events are not product-proven
- provider failure recovery is not product-proven
- model response boundary does not yet consume CP context and planning facts as a coherent loop phase

This route must audit how to close those gaps safely.

## Core audit question

How should the product path move from loop-governed context and planning facts into a real model boundary without breaking safety, truthfulness, provider privacy, or Agent Loop ownership?

The answer must identify:

- which owner domain owns provider streaming
- which owner domain owns model response accumulation
- which owner domain owns tool call extraction
- which owner domain owns provider failure classification
- which owner domain owns loop phase transition
- which owner domain owns rendered output
- which facts flow from CP006 into model request preparation
- which facts flow from model response into tool batch and next turn
- what remains not-proven

## Required inputs

Use local project state.

Use recent block docs if present:

- docs/build-infrastructure/context-planning-quality-roadmap.md
- docs/build-infrastructure/context-planning-quality-audit.md
- docs/build-infrastructure/product-loop-real-cli-agent-loop-audit.md
- docs/build-infrastructure/product-loop-real-cli-agent-loop-implementation-plan.md
- docs/build-infrastructure/agent-loop-infrastructure-connection-map.md
- docs/build-infrastructure/build-infrastructure-owner-domain-map.md
- docs/build-infrastructure/build-infrastructure-deferred-patterns.md
- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Use current source code.

Use local architecture study repositories only for targeted comparison if needed.

Do not rely on memory alone.

## Required inspection

Use Serena targeted inspection first.

If Serena is unavailable, use targeted repository search and report that honestly.

Inspect current project:

- provider fetch and provider draft stages
- provider readiness and provider registry
- provider failure classification
- context-aware provider prompt construction
- planning runtime product proposal and live provider proposal path
- model response boundary and tool call extraction from previous PL work
- agent loop contract and loop trajectory projection
- runtime events and JSON event stream
- runtime API if relevant
- turn snapshot and save point
- tool batch and tool result message contracts
- CP006 context planning summary
- product surface renderer
- result and evidence truthfulness
- CLI product path only to understand current invocation seam
- tests around provider, model response boundary, live provider opt-in, tool extraction, event stream, product surface, and result truthfulness

Inspect local architecture study repositories only for targeted comparison if needed:

- streaming provider boundary
- assistant response accumulation
- tool call extraction during streaming
- abort or cancel handling
- model request and response events
- provider failure classification
- next-turn preparation after model response

Do not broad dump any repository.

Record inspected files and symbols in the final report.

## Audit scope

### 1. Current provider path map

Map the current provider path:

- provider opt-in gates
- provider readiness
- provider config loading boundary
- provider request construction
- provider fetch boundary
- provider response classification
- provider output parsing
- fallback policy if present
- redaction boundaries
- current live provider tests or gates

Identify which pieces are production path, fake path, focused test path, metadata-only path, or not-proven.

### 2. Model boundary fit with Agent Loop

Map how provider/model facts should connect to Agent Loop phases:

- prompt input
- context planning summary
- model request preparation
- provider registry metadata
- auth readiness projection
- stream start
- assistant content delta
- tool call delta
- stream complete
- model response boundary
- tool call batch handoff
- save point
- next turn preparation
- runtime events
- product surface
- result truthfulness

Classify each as:

- ready for product integration
- projection-only
- contract-only
- missing owner
- unsafe to integrate now
- deferred

### 3. CP block dependency

Provider streaming must consume Context and Planning facts, not bypass them.

Audit how model request preparation should use:

- context discovery summary
- context acquisition summary
- planning summary
- edit handoff facts
- verification intent facts
- continuation readiness
- not-proven claims
- missing required and optional facts
- review-only or no-write constraints

The provider path must not treat plan readiness as edit authority.

### 4. Streaming response model

Plan the product-safe streaming response model.

It should account for:

- content deltas
- reasoning or hidden channels if any must be excluded
- tool call partials
- malformed tool call partials
- unsupported tool call shapes
- final assistant message
- stream usage metadata if safe
- stream abort
- stream timeout
- stream network failure
- stream provider error
- stream output insufficient
- redaction status

No raw provider output should be persisted or printed.

### 5. Tool call handoff

Audit how tool calls extracted from model response should hand off to the Agent Loop tool batch.

The handoff must include:

- normalized tool call ids
- tool names or safe kinds
- arguments redaction status
- malformed or unsupported status
- authority requirement
- before-tool policy requirement
- execution not-run status
- not-proven claims

Tool call extracted is not tool execution.

Tool batch ready is not task success.

### 6. Abort and cancellation

Audit abort and cancellation requirements:

- user abort
- timeout abort
- provider stream abort
- tool-call accumulation abort
- session stop
- continuation cancellation
- retry eligibility
- partial response handling

Abort must leave replay-safe and report-safe facts.

Abort must not become success.

### 7. Provider failure taxonomy

Audit whether current provider failure classes are enough for streaming.

Required categories to consider:

- config
- auth
- network
- endpoint
- rate limited
- timeout
- cancelled
- stream protocol error
- malformed stream event
- output invalid
- output insufficient
- redaction failure
- fallback eligible
- fallback ineligible
- unknown

Failure classification must be precise enough for result truthfulness and fallback policy.

### 8. Runtime events and product surface

Audit which provider/model events should be emitted and rendered.

Potential events:

- model request prepared
- provider readiness observed
- provider stream started
- assistant delta observed
- tool call delta observed
- model response accumulated
- tool call batch extracted
- provider stream cancelled
- provider stream failed
- model boundary completed
- model boundary partial
- fallback eligible observed
- fallback not attempted

Product surface should show model boundary state without leaking secrets or raw output.

### 9. Truthfulness risks

Audit false-success risks:

- provider called becomes provider success
- stream started becomes model response complete
- content delta becomes final assistant response
- tool call partial becomes executable tool call
- tool call extracted becomes tool executed
- fallback eligible becomes fallback executed
- provider output parsed becomes patch correctness
- model response complete becomes task success
- product surface rendered becomes success
- CP plan handoff becomes mutation authority

Every risk must have a guardrail.

### 10. Implementation grouping for next route

Plan the next implementation route so it can combine high-value work without becoming a rewrite.

Likely combined work:

- model request boundary consuming CP facts
- streaming event contract
- assistant accumulation model
- tool call delta and extraction model
- provider failure taxonomy for streaming
- abort and cancel projection
- Agent Loop model-boundary feature contract
- product surface model-boundary section

Likely deferred work:

- default live provider streaming execution
- real fallback execution
- real tool execution from streaming output
- product loop replacement
- SDK or RPC streaming host
- provider plugin loading
- hidden reasoning support
- broad CLI redesign

## Required output documents

Create these documents under docs/build-infrastructure:

1. provider-streaming-model-boundary-audit.md

Must include:

- current provider path map
- model boundary fit with Agent Loop
- CP block dependency
- streaming response model requirements
- tool call handoff requirements
- abort and cancellation requirements
- provider failure taxonomy requirements
- runtime event and product surface requirements
- truthfulness risks and guardrails
- chosen implementation seam
- rejected seams

2. provider-streaming-model-boundary-roadmap.md

Must include:

- recommended implementation sequence
- owner domains
- files likely to inspect or change
- what can be combined in one route
- what must be deferred
- validation plan
- completion criteria
- next route name

Update if present:

- docs/build-infrastructure/build-infrastructure-next-product-roadmap.md

Only update it if the audit sharpens the immediate next route.

Do not create JSON reports.

Do not create route runners.

Do not create verify scripts.

## Architecture constraints

Hard rules:

- docs and audit only
- no product code changes
- no provider calls
- no real provider streaming implementation
- no fallback execution
- no tool execution changes
- no edit or apply changes
- no verification execution changes
- no repair changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no product loop replacement
- no compatibility shim growth
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- implement provider streaming
- call live provider
- read provider.env manually
- print provider config or secrets
- add provider fallback execution
- add tool execution
- change prompt behavior
- change CLI behavior
- rewrite provider fetch
- rewrite workflow coordinator
- create route runner
- create verify script
- create JSON capability report
- add package scripts
- change tests to make future implementation easier

## Validation

Required:

- git diff --check
- git status --short --branch

No build or tests are required for docs-only audit.

If product code is accidentally touched, revert it or run focused validation and explain why.

Do not claim build or tests passed unless actually run.

## Completion criteria

PS001 audit is COMPLETE only if:

- targeted inspection was performed and reported
- current provider path is mapped
- Agent Loop model-boundary fit is mapped
- CP block dependency is documented
- streaming response requirements are documented
- tool call handoff requirements are documented
- abort and cancellation requirements are documented
- provider failure taxonomy requirements are documented
- runtime event and product surface requirements are documented
- truthfulness guardrails are documented
- next implementation route is planned
- required docs are created
- no product code is changed
- git diff check passes
- git status is reported

If the provider path is too unclear to plan safely, report PARTIAL and list what must be inspected next.

## Final report

Include:

1. Final status
2. Inspection summary
3. Documents created or updated
4. Current provider path summary
5. Agent Loop model-boundary fit
6. CP dependency summary
7. Chosen implementation seam
8. Rejected seams
9. Next implementation route summary
10. Truthfulness guardrails
11. Validation pass or fail
12. Files changed
13. Confirmation whether product code changed

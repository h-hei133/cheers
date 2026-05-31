# Provider Streaming Route PS002: Provider Streaming Model Boundary

## Goal

Implement the first Provider Streaming and Model Boundary capability route after PS001 and the SR002 to SR005 structure cleanup.

This is a product capability route, not another structure route.

PS002 must implement the model boundary as an Agent Loop phase:

context and planning facts
-> model request boundary
-> provider readiness and registry facts
-> streaming response event contract
-> assistant response accumulation
-> tool call delta and extraction boundary
-> abort and cancellation projection
-> provider failure classification
-> tool batch handoff
-> product surface visibility
-> truthfulness guardrails

Expected final status: COMPLETE.

This route must not default-enable live provider execution. It must not read provider.env manually. It must not print provider config, API keys, raw provider output, raw patch text, hidden reasoning, or unsafe command output.

## Why this route exists

Context and Planning is now closed as a loop-governed capability block. The next Agent Loop phase is the model boundary.

Previous work established:

- context and planning summary
- provider registry metadata
- provider request structure
- provider response boundary
- runtime loop contract
- runtime events and stream
- tool policy and result contracts
- product surface rendering
- evidence and result truthfulness

PS002 must connect these pieces into a real model-boundary implementation.

The implementation should make provider streaming structurally usable without claiming that all live provider streaming behavior is complete.

## Owner domains

Primary owners:

- provider/request
- provider/response
- provider/registry
- runtime/loop
- runtime/events
- tools/result
- tools/policy only for handoff metadata
- presentation
- result and evidence only if truthfulness projections are touched

Allowed target areas:

- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/tools/result
- packages/ts-shell/src/tools/policy
- packages/ts-shell/src/presentation
- packages/ts-shell/src/result only if necessary
- packages/ts-shell/src/evidence only if necessary
- focused tests beside touched modules

Do not put model-boundary logic into compatibility shims.

Do not move ownership into CLI, shell host, workflow coordinator, or SessionManager.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- provider/request/prompt
- provider/request/draft
- provider/request/fetch
- provider/request/readiness if present
- provider/response/boundary
- provider/registry/provider
- model response boundary tests
- live provider opt-in tests
- provider failure classification surfaces
- runtime/loop/contract
- runtime/loop/trajectory
- runtime/loop/feature
- runtime/events/projection
- runtime/events/stream
- tools/result/split
- tools/policy/interception
- CP006 context planning summary
- presentation/surface/model
- presentation/terminal/renderer
- result and evidence truthfulness surfaces
- PS001 audit and roadmap docs if present
- SR005 pressure report if present

Use targeted repository search for imports.

Do not inspect external repositories unless a concrete blocker appears.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Model request boundary

Add or harden a model request boundary that consumes report-safe upstream facts.

It should include:

- request id
- turn id or loop id if available
- provider id or safe provider label
- model safe label
- provider readiness facts
- provider registry facts
- context and planning summary ids if available
- planning constraints
- no-write or review-only constraints
- missing required facts
- missing optional facts
- redaction state
- not-proven claims

This boundary must not include secrets, provider.env, raw provider output, raw patch text, hidden reasoning, full transcript dumps, unsafe file contents, or unredacted command output.

The model request boundary does not imply provider success.

### 2. Streaming response event contract

Add a provider response stream event contract.

Event kinds should cover:

- stream_started
- content_delta
- tool_call_delta
- tool_call_completed
- assistant_message_completed
- stream_completed
- stream_cancelled
- stream_failed
- output_invalid
- output_insufficient
- redaction_failed

Use local naming if existing conventions differ.

Events must be report-safe.

Do not store or print raw provider output.

Content deltas may be summarized or redacted.

Hidden reasoning channels must be excluded or marked redacted.

### 3. Assistant accumulation model

Add an assistant response accumulation model.

It should accumulate safe facts from stream events:

- accumulated message id
- content presence
- content summary if safe
- content redaction state
- tool call ids
- malformed tool call count
- unsupported tool call count
- stream completion status
- failure status
- not-proven claims

A content delta is not final assistant response.

A completed assistant message is not task success.

### 4. Tool call extraction boundary

Add or harden tool call extraction from accumulated model response.

It should produce normalized tool call handoff facts:

- tool call id
- tool name or safe kind
- argument redaction state
- parse status
- malformed status
- unsupported status
- authority requirement
- before-tool policy required
- execution status not_run
- not-proven claims

Tool call extracted is not tool executed.

Tool batch ready is not task success.

### 5. Abort and cancellation projection

Represent abort and cancellation facts:

- user_cancelled
- timeout_cancelled
- provider_cancelled
- stream_aborted
- partial_response_preserved
- retry_eligible
- retry_not_allowed
- not-proven claims

Abort and cancellation must preserve replay-safe facts.

Abort is not success.

### 6. Provider failure classification

Add or harden streaming provider failure classes.

Required classes to consider:

- config
- auth
- network
- endpoint
- rate_limited
- timeout
- cancelled
- stream_protocol
- malformed_stream_event
- output_invalid
- output_insufficient
- redaction_failure
- fallback_eligible
- fallback_ineligible
- unknown

Failure classification must be precise enough for result truthfulness.

Fallback eligibility is not fallback execution.

### 7. Agent Loop model boundary feature contract

Add or update a model-boundary feature contract.

It should include:

- owner domain
- loop phase
- input facts
- output handoff facts
- runtime events
- evidence facts
- product surface section
- result truthfulness boundary
- not-proven claims
- forbidden shortcuts
- validation gates
- terminalSuccessClaim false

The model boundary must connect CP006 context planning facts to tool batch handoff facts.

### 8. Runtime event integration

Expose provider/model boundary observations as runtime events.

Events may include:

- model request prepared
- provider readiness observed
- provider stream started
- provider stream delta observed
- assistant response accumulated
- tool call extracted
- tool batch handoff prepared
- provider stream cancelled
- provider stream failed
- model boundary partial
- model boundary completed

Events are observations only.

They must not imply provider success, tool execution, verification success, or task success.

### 9. Product surface integration

Expose a concise model boundary section through product surface.

It should show:

- provider mode
- model safe label
- request readiness
- stream status
- assistant accumulation status
- tool call extraction status
- failure class if any
- cancellation status if any
- fallback eligibility if any
- not-proven claims
- next action

Rendered output must not include secrets or raw provider output.

Rendered output must not imply task success.

## Real provider policy

Live provider execution is not required for PS002.

Default path must remain provider disabled unless existing explicit opt-in is used.

If live provider is used only because an existing approved seam requires it:

- explicit opt-in only
- approved provider loading path only
- no manual provider.env read
- no printing provider config
- no printing API keys
- no printing auth headers
- no raw provider output
- no oldText or newText
- no retries beyond existing policy
- no fake live success

Prefer deterministic stream fixtures or existing fake provider seams for tests.

## Required tests

Add focused tests only.

Required categories:

1. Model request boundary
   Consumes provider registry and CP context planning facts without leaking secrets or granting success.

2. Streaming event contract
   Stream start, content delta, tool call delta, completion, cancellation, and failure are represented safely.

3. Assistant accumulation
   Deltas accumulate into report-safe assistant response facts without treating partial content as final success.

4. Tool call extraction
   Valid, malformed, unsupported, and unknown tool calls become handoff facts with execution not_run.

5. Abort and cancellation
   Cancelled or aborted streams preserve partial facts and never become success.

6. Provider failure classification
   Config, auth, network, endpoint, timeout, cancelled, malformed stream, output invalid, output insufficient, redaction failure, and unknown are distinct where supported.

7. Agent Loop feature contract
   Model boundary contract validates and has terminalSuccessClaim false.

8. Runtime event integration
   Model boundary events are observation-only and JSON-safe.

9. Product surface
   Model boundary section renders safe status without raw output or success inflation.

10. Truthfulness
   Provider called, stream started, content delta, assistant accumulated, tool call extracted, fallback eligible, product surface rendered, or loop observation cannot become task success, tool executed, verification passed, repair success, or mutation authority.

11. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, shared, or support dumping ground
- no provider default enablement
- no manual provider.env reads
- no secret printing
- no fallback execution behavior change
- no tool execution behavior change
- no command allowlist broadening
- no edit/apply behavior changes
- no verification or repair execution changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no broad workflow coordinator rewrite
- no SessionManager rewrite
- no result success outside evidence and result truthfulness

## Stop conditions

Stop and report PARTIAL if:

- streaming requires broad provider fetch rewrite
- provider config or auth behavior must change
- live provider execution becomes required
- raw provider output would need to be persisted
- tool execution behavior must change
- result truthfulness behavior changes unexpectedly
- product loop replacement is required
- package scripts or build config must change
- compatibility exports need logic
- import churn becomes too large
- tests require behavior changes to pass

## Validation

Required:

- focused provider request tests
- focused provider response tests
- focused runtime loop feature contract tests
- focused runtime event tests
- focused product surface tests
- focused tool result or policy tests if tool handoff is touched
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result-facing output or terminal behavior is touched
- git diff --check
- git status --short --branch
- git status after optional commit

Do not claim tests or build passed unless actually run.

## Commit policy

Committing is allowed after validation passes.

Codex may choose the commit message.

The commit message must not contain:

- route
- reference
- learning
- external project names
- sprint
- capstone
- closeout
- cut-through
- MVP

Do not push.

Do not commit failing states.

## Completion criteria

PS002 is COMPLETE only if:

- targeted inspection was performed and reported
- model request boundary exists or is hardened
- streaming response event contract exists
- assistant accumulation model exists
- tool call extraction boundary exists
- abort and cancellation projection exists
- provider failure classification covers streaming cases
- Agent Loop model boundary feature contract exists
- runtime events observe model boundary facts safely
- product surface can render model boundary status safely
- provider remains disabled by default
- no raw provider output or secrets are exposed
- no tool call extraction is treated as tool execution
- no model response fact is treated as task success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- status is reported
- optional commit is created only after validation passes
- commit message follows naming policy if committed

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Model request boundary
6. Streaming event contract
7. Assistant accumulation
8. Tool call extraction
9. Abort and cancellation projection
10. Provider failure classification
11. Agent Loop feature contract
12. Runtime event integration
13. Product surface integration
14. Tests and validation pass or fail
15. Optional commit hash and commit message if committed
16. Behavior preservation notes
17. Truthfulness guardrails preserved
18. What remains deliberately not-proven
19. Recommended next step

## Next step

After PS002 is complete, continue with:

Provider Streaming Route PS003: Product Provider Stream Adapter

PS003 should connect the model boundary to the existing provider fetch path with explicit opt-in only, while preserving redaction, failure classification, cancellation, Agent Loop events, and no default provider enablement.

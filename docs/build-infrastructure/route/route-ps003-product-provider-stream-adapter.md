# Provider Streaming Route PS003: Product Provider Stream Adapter

## Goal

Implement the next Provider Streaming and Model Boundary capability route after PS002.

PS002 added the model request boundary, streaming response event contract, assistant accumulation, tool call extraction boundary, abort and cancellation projection, streaming failure classes, Agent Loop model-boundary feature contract, runtime event integration, and product surface status.

PS003 must connect that model boundary to the existing provider fetch path through explicit opt-in only.

Expected final status: COMPLETE.

This route should prove that the product provider path can feed the model-boundary stream contract without default provider enablement and without leaking provider secrets or raw output.

## Core flow

The intended product flow is:

Context and Planning facts
-> model request boundary
-> explicit provider opt-in and readiness
-> existing provider fetch path
-> stream adapter or response-to-stream projection
-> assistant accumulation
-> tool call extraction boundary
-> Agent Loop model-boundary events
-> product surface status
-> truthful partial, failed, or completed model boundary result

This is not a full autonomous agent loop.

This is not tool execution.

This is not mutation authority.

This is not verification success.

## Owner domains

Primary owners:

- provider/request
- provider/response
- provider/registry
- runtime/loop
- runtime/events
- presentation
- result and evidence only if truthfulness projection is touched

Allowed target areas:

- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/presentation
- packages/ts-shell/src/result only if necessary
- packages/ts-shell/src/evidence only if necessary
- focused tests beside touched modules

Do not put provider stream adapter logic into CLI, shell host, compatibility shims, workflow coordinator, or SessionManager.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- provider/request/boundary
- provider/request/fetch
- provider/request/draft
- provider/request/prompt
- provider/request/readiness if present
- provider/response/boundary
- provider/response/stream
- provider/registry/provider
- runtime/loop/modelBoundary
- runtime/loop/feature
- runtime/loop/trajectory
- runtime/events/projection
- runtime/events/stream
- presentation/surface/model
- presentation/terminal/renderer
- result and evidence truthfulness surfaces
- current explicit live provider opt-in path
- provider fetch tests
- model boundary tests
- live provider classification tests
- PS001 and PS002 docs if present

Use targeted repository search for imports.

Do not inspect external repositories unless a concrete blocker appears.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Product provider stream adapter

Add a provider stream adapter that accepts the existing provider fetch result or provider response facts and projects them into PS002 stream events.

The adapter should support:

- started
- content delta or safe content summary
- completed
- cancelled
- failed
- output invalid
- output insufficient
- redaction failed

If the existing provider path is non-streaming, adapt the completed response into a deterministic single-response stream event sequence.

Do not require true network streaming if the existing provider fetch path does not support it yet.

Do not rewrite provider fetch broadly.

### 2. Explicit opt-in only

The adapter must only run when explicit provider opt-in is already granted through an existing approved product seam or a new narrow explicit opt-in parameter in the provider owner domain.

Default path must remain:

- provider disabled
- no provider call
- no stream adapter execution
- no fake live success

Provider-called is not provider success.

Provider response received is not task success.

### 3. Readiness and request validation

Before calling the provider fetch path, validate:

- provider mode
- provider readiness
- model safe label
- auth readiness projection without exposing secrets
- model request boundary redaction status
- CP context and planning constraints
- no-write or review-only constraints
- missing required facts if present

If readiness fails, emit a safe model-boundary failure or blocked status.

Do not read provider.env manually.

Do not print or persist provider config.

### 4. Fetch result to stream event projection

Map existing fetch outcomes to stream outcomes.

Required mapping:

- successful response -> stream_started, content_delta or summarized delta, assistant_message_completed, stream_completed
- provider output insufficient -> output_insufficient
- invalid provider output -> output_invalid
- network failure -> stream_failed with network class
- auth failure -> stream_failed with auth class
- config failure -> stream_failed with config class
- timeout -> stream_failed with timeout class
- cancellation -> stream_cancelled
- redaction issue -> redaction_failed

If a current provider error class is not precise enough, add a safe local classification without changing provider fetch behavior.

### 5. Assistant accumulation through real adapter output

Provider stream adapter events must feed the PS002 assistant accumulation model.

Accumulation should produce:

- accumulated message id
- stream completion status
- content presence or safe summary
- tool call extraction input if available
- malformed or unsupported tool call counts
- redaction state
- not-proven claims

Do not persist raw provider output.

Do not expose hidden reasoning.

### 6. Tool call extraction boundary

If provider output contains tool call-shaped content, project it through the existing PS002 tool call extraction boundary.

Tool calls must remain:

- extracted or malformed
- not dispatched
- authority required if applicable
- before-tool policy required
- not-proven

Do not execute tools.

Do not broaden tool allowlists.

### 7. Runtime event integration

Emit or project model-boundary runtime events from the adapter.

Events should cover:

- model request validated
- provider fetch attempted
- provider stream projected
- assistant accumulated
- tool calls extracted
- provider fetch failed
- provider fetch blocked
- provider stream cancelled
- model boundary partial
- model boundary completed

Events remain observation-only.

terminalSuccessClaim must remain false.

### 8. Product surface integration

Product surface should render the provider adapter state.

It should show:

- explicit opt-in state
- provider readiness state
- fetch attempted or not attempted
- stream projected or not projected
- assistant accumulation status
- tool calls extracted but not dispatched
- failure class
- redaction state
- not-proven claims
- next action

It must not display raw provider output.

It must not display secrets.

It must not display task success from provider response.

### 9. Optional live provider smoke

Live provider is optional, not required.

If used, it must be one explicit opt-in smoke only, through the approved provider loading path.

Rules:

- no manual provider.env read
- no provider config printing
- no API key printing
- no raw provider output printing
- no oldText or newText printing
- no retries beyond existing policy
- classify failure honestly
- do not count fake or blocked provider as live success

A deterministic test seam is preferred for completion.

## Required tests

Add focused tests only.

Required categories:

1. Default disabled path
   No provider call and no stream adapter execution without explicit opt-in.

2. Readiness validation
   Config, auth, model, and request redaction failures block or classify safely.

3. Fetch success projection
   Existing provider fetch success becomes stream events and assistant accumulation without raw output leakage.

4. Fetch failure projection
   Network, auth, config, timeout, invalid output, insufficient output, cancellation, and redaction failures map to safe stream failure classes.

5. Assistant accumulation
   Adapter events feed accumulation and do not become task success.

6. Tool call extraction
   Tool call-shaped output becomes extraction handoff with execution not dispatched.

7. Runtime events
   Adapter facts appear as observation-only model-boundary runtime events.

8. Product surface
   Surface renders adapter status, failure, redaction, not-proven, and next action safely.

9. Truthfulness
   Explicit opt-in, provider attempted, stream projected, assistant accumulated, tool call extracted, product surface rendered, or model boundary completed cannot become task success, tool execution, mutation authority, verification pass, repair success, or terminal success.

10. Redaction
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
- no provider config or auth behavior change
- no secret printing
- no fallback execution behavior change
- no tool execution behavior change
- no command allowlist broadening
- no edit or apply behavior changes
- no verification or repair execution changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no broad workflow coordinator rewrite
- no SessionManager rewrite
- no result success outside evidence and result truthfulness

## Stop conditions

Stop and report PARTIAL if:

- provider fetch must be broadly rewritten
- provider config or auth behavior must change
- explicit opt-in cannot be preserved
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
- focused provider registry tests if failure classes are touched
- focused runtime loop model-boundary tests
- focused runtime event tests
- focused product surface tests
- focused tool extraction tests if touched
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

PS003 is COMPLETE only if:

- targeted inspection was performed and reported
- provider stream adapter exists
- explicit opt-in path is enforced
- default provider-disabled path remains no-call
- readiness validation exists
- existing provider fetch outcomes map to stream events
- assistant accumulation consumes adapter events
- tool call extraction remains not dispatched
- runtime events observe adapter facts safely
- product surface renders adapter status safely
- no raw provider output or secrets are exposed
- no provider response fact becomes task success
- no tool call extraction becomes tool execution
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
5. Provider stream adapter
6. Explicit opt-in enforcement
7. Readiness validation
8. Fetch result to stream mapping
9. Assistant accumulation
10. Tool call extraction boundary
11. Runtime event integration
12. Product surface integration
13. Tests and validation pass or fail
14. Optional commit hash and commit message if committed
15. Behavior preservation notes
16. Truthfulness guardrails preserved
17. What remains deliberately not-proven
18. Recommended next step

## Next step

After PS003 is complete, continue with:

Provider Streaming Route PS004: Live Provider Streaming Smoke And Failure Recovery

PS004 should run one explicit opt-in live provider smoke only if approved and safe, classify live streaming success or failure honestly, and prove fallback eligibility or recovery handoff without fake success.

# PS004: Live Provider Smoke And Recovery

## Goal

Implement the next provider streaming capability step after PS003.

PS003 connected existing provider fetch outcomes to the model-boundary stream adapter with explicit opt-in only. PS004 must now run a narrow real-provider smoke path through that adapter and classify success or failure honestly.

Expected final status: COMPLETE only if the smoke is attempted through the approved product path, secrets remain private, failures are classified precisely, and no fake success is reported.

If the real provider is unavailable, blocked, misconfigured, rate-limited, or returns insufficient output, COMPLETE is still possible only if the product path, classification, redaction, recovery handoff, and no-success guardrails are proven. Do not force live success.

## Core flow

Approved opt-in
-> provider readiness
-> model request boundary
-> existing provider fetch path
-> stream adapter
-> assistant accumulation
-> tool-call extraction as not-dispatched
-> model-boundary events
-> product surface status
-> recovery or retry eligibility facts
-> truthful final status

This is not tool execution.
This is not edit authority.
This is not verification success.
This is not terminal task success.

## Naming rule

New product files and new product content must avoid user-banned process or origin words.

Do not introduce product filenames or product strings containing the banned words requested by the user.

Do not mention external project names in product code, comments, test names, generated reports, or commit messages.

Docs for this task should also avoid those words except this file path already being created by the user command context.

## Owner domains

Primary owners:

- provider/request
- provider/response
- provider/registry
- runtime/loop
- runtime/events
- presentation

Allowed target areas:

- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/presentation
- focused tests beside touched modules
- scripts only if a narrowly scoped smoke runner is necessary

Do not put live-provider logic into CLI, shell host, compatibility exports, coordinator, or SessionManager.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- provider/request/boundary
- provider/request/fetch
- provider/request/draft
- provider/request/prompt
- provider/response/adapter
- provider/response/stream
- provider/response/boundary
- provider/registry/provider
- runtime/loop/providerStreamAdapter
- runtime/loop/modelBoundary
- runtime/loop/feature
- runtime/events/projection
- runtime/events/stream
- presentation/surface/model
- presentation/terminal/renderer
- current approved real-provider opt-in seam
- existing provider smoke or classification tests
- PS002 and PS003 docs if present

Use targeted search for imports.

Do not inspect external repositories.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Real smoke runner or product seam

Add the smallest safe smoke path that exercises the existing provider fetch path through the PS003 adapter.

It must:

- require explicit opt-in
- use approved provider config loading only
- avoid manual provider.env reads
- avoid printing provider config
- avoid printing API keys
- avoid printing auth headers
- avoid printing raw provider output
- avoid printing raw patch text
- avoid printing hidden reasoning
- avoid writing unsafe payloads to docs or logs

The runner or seam must return a report-safe summary only.

If an existing approved smoke path can be reused, prefer that over adding a new script.

### 2. Live attempt classification

Classify the smoke result as one of:

- live_completed
- live_partial
- provider_blocked
- config_failed
- auth_failed
- network_failed
- endpoint_failed
- rate_limited
- timeout
- cancelled
- output_invalid
- output_insufficient
- redaction_failed
- unsupported
- unknown_failed

The classification must be report-safe.

A provider call is not provider success.

A model-boundary completion is not task success.

### 3. Recovery and retry eligibility

Add or harden recovery facts:

- retry eligible
- retry not allowed
- fallback eligible
- fallback not eligible
- fallback not attempted
- manual action required
- provider unavailable
- output insufficient recovery needed
- redaction failure blocks reporting

Fallback eligibility must not mean fallback executed.

Retry eligibility must not mean retry executed.

### 4. Stream adapter proof

The live or simulated provider outcome must flow through:

- request boundary
- fetch outcome
- stream adapter
- assistant accumulation
- model-boundary phase
- runtime events
- product surface

If real provider returns failure, the failure must still flow through the same projection path.

### 5. Product surface

Product surface must show:

- opt-in state
- fetch attempted or not attempted
- live classification
- stream projection status
- accumulation status
- tool-call extraction status if present
- recovery or retry eligibility
- redaction status
- not-proven claims
- next action

It must not show raw provider output or secrets.

### 6. Optional fallback smoke

Fallback execution is optional and should not be attempted unless the existing approved policy clearly allows it and the primary failure class is eligible.

If fallback is not attempted, report fallback_not_attempted.

Do not add broad retry loops.

Do not hide primary failure.

## Required tests

Add focused tests only.

Required categories:

1. Explicit opt-in
   Default path does not call provider and does not run smoke.

2. Secret redaction
   Smoke summary, events, and surface output never expose secrets, provider config, raw output, raw patch text, hidden reasoning, or auth headers.

3. Live classification
   Success, partial, insufficient output, invalid output, network, auth, config, timeout, cancellation, and unknown failures classify safely.

4. Recovery facts
   Retry and fallback eligibility are facts only and do not execute automatically.

5. Adapter flow
   Provider outcome flows through request boundary, stream adapter, assistant accumulation, model-boundary phase, events, and product surface.

6. Truthfulness
   Opt-in, provider attempted, live completed, stream projected, assistant accumulated, fallback eligible, retry eligible, or product surface rendered cannot become task success, tool execution, mutation authority, verification success, repair success, or terminal success.

7. No raw output
   Raw provider response is not persisted in report-safe objects.

## Real provider policy

One live smoke attempt is allowed only through approved opt-in.

Use the primary configured provider once.

Use fallback only if existing policy allows and the failure class is eligible.

No manual config reads.

No secret printing.

No raw provider output printing.

No repeated retries.

If live provider cannot be safely called, complete the product path with deterministic provider outcomes and report live smoke as blocked or unsupported.

## Current manual retest status

Status date: 2026-06-03.

Latest user-reported manual retest after the live smoke fallback update. This
documentation update did not inspect private provider configuration.

- `real-readonly-coding-smoke` passed.
- The live anchored provider smoke passed with the primary configured provider.
- Fallback was configured but skipped because the primary provider succeeded.
- No raw provider output leaked.
- No write/no apply behavior was preserved.

Interpretation:

- `changedFiles=[]` visibility for the read-only no-mutation smoke is fixed.
- Fallback configuration is report-visible without forcing fallback execution.
- Primary success correctly leaves fallback as skipped, not attempted.
- Fallback configuration visibility and fallback skipped status are safe
  metadata only. They do not prove fallback execution success or
  provider-wide compatibility.
- A provider smoke pass remains only smoke evidence; it is not task success,
  mutation authority, apply success, verification success, or repair success.

## Validation

Required:

- focused provider request tests
- focused provider response tests
- focused runtime loop adapter tests
- focused runtime event tests
- focused product surface tests
- focused smoke/classification tests if a runner is added
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result-facing output or terminal behavior is touched
- git diff --check
- git status --short --branch
- git status after optional commit

Do not claim tests or build passed unless actually run.

## Commit policy

Committing is allowed after validation passes.

Codex may choose the commit message.

The commit message must avoid the user-banned process or origin words.

Do not push.

Do not commit failing states.

## Stop conditions

Stop and report PARTIAL if:

- approved provider config cannot be used safely
- manual config read would be required
- raw provider output would need to be persisted
- provider fetch must be broadly rewritten
- fallback behavior must change
- tool execution behavior must change
- result truthfulness behavior changes unexpectedly
- product loop replacement is required
- build config or package scripts must change
- compatibility exports need logic
- tests require behavior changes to pass

## Completion criteria

PS004 is COMPLETE only if:

- targeted inspection was performed and reported
- explicit opt-in is enforced
- default path remains no-call
- live smoke is attempted safely or blocked with precise reason
- provider outcomes classify safely
- recovery and retry eligibility facts exist
- fallback execution is either safely avoided or honestly classified
- provider outcome flows through stream adapter and model-boundary projection
- runtime events observe smoke facts safely
- product surface renders smoke status safely
- no raw provider output or secrets are exposed
- truthfulness tests pass
- redaction tests pass
- focused tests pass
- build passes
- diff check passes
- status is reported
- optional commit is created only after validation passes

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Smoke path or seam
6. Explicit opt-in enforcement
7. Live attempt result or blocked reason
8. Provider classification
9. Recovery and retry facts
10. Fallback status
11. Stream adapter flow
12. Runtime event integration
13. Product surface integration
14. Tests and validation pass or fail
15. Optional commit hash and commit message if committed
16. Behavior preservation notes
17. Truthfulness guardrails preserved
18. What remains deliberately not-proven
19. Recommended next step

## Next step

After PS004, continue with a model-to-tool batch capability step only if live provider output or deterministic provider output can safely produce tool-call handoff facts without executing tools by default.

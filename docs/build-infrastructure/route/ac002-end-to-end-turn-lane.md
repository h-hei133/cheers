# AC002 End To End Turn Lane

## Goal

Build a full end-to-end turn lane that makes the existing capability blueprint actionable in product code.

This task must be larger than a single seam or field projection. It must connect a real runtime path across multiple owner domains:

user turn input
-> session continuation state
-> context handoff or reduction readiness
-> provider request preparation
-> model response boundary or simulated response intake
-> tool intent or tool result handling
-> next action decision
-> runtime event emission
-> replay-safe carry forward
-> product surface rendering
-> evidence/result truth boundary

The goal is not to implement every advanced capability. The goal is to make one coherent turn lane work end to end with strong negative controls.

## Required Inputs

Use the existing capability blueprint:

docs/build-infrastructure/agent-capability-blueprint.md

Use the mature local implementation and public documentation named by that blueprint only to confirm capability shape when needed. Do not copy code, type names, file names, runtime field names, user-visible wording, or folder layout.

## Completion Bar

This task is complete only if all exit gates below are met.

Required exit gates:

1. At least five rightful owner domains are inspected.
2. At least four rightful owner domains are changed, unless the final report proves the existing owners already connected one required domain without code changes.
3. A single end-to-end test proves the happy lane from turn input through request preparation, response or tool observation, next action, runtime event, replay-safe carry forward, and product surface.
4. At least two negative tests prove blocked, unsafe, stale, failed, partial, or missing-proof states do not become task success.
5. Runtime and policy may choose next action, but terminal truth remains evidence/result owned.
6. Product surface renders integrated status without upgrading success.
7. Replay carries only safe facts.
8. Build and focused validation pass.
9. No TODO-only, documentation-only, projection-only, or single-field-only implementation is accepted.

If these exit gates cannot be met, do not claim completion. Either continue within this task or stop with a blocker report. Do not commit or push a half-complete implementation.

## Implementation Scope

Implement one coherent end-to-end lane. The lane should preferably include:

- continuation-aware request preparation from the previous batch
- context handoff or reduction readiness
- provider request blocker propagation
- response or tool observation intake
- tool outcome to next action decision
- runtime event projection
- replay-safe summary carry forward
- product surface status
- not-proven and missing-proof preservation

The lane may use deterministic test fixtures or simulated model/tool observations. It must not require a real provider.

## Allowed Work

Allowed owner domains include:

- session
- context
- provider
- runtime
- turn
- tools
- policy
- evidence
- result
- presentation
- verification
- repair

Add small domain files only when the current owner cannot express the behavior safely. Prefer wiring existing owners before adding new abstractions.

## Forbidden Work

Do not:

- call a real provider
- read provider secrets
- add browser automation
- add external tool server behavior
- add dynamic plugin loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add new writer behavior
- move terminal truth out of evidence/result
- hide behavior in compatibility shims
- weaken tests
- mass-rebaseline snapshots
- finish with only documentation, only projections, only renamed files, or only isolated unit helpers

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- model output
- provider request preparation
- provider call attempt
- response intake
- tool intent
- tool result
- next action decision
- event emission
- replay carry forward
- continuation readiness
- context reduction summary
- product rendering
- repair proposal
- repair authority
- repair apply without post-repair verification

Skipped, blocked, failed, partial, stale, unsafe, unknown, and missing-proof states must remain visible.

## Tooling

Use semantic MCP navigation for owner discovery, symbol lookup, references, and diagnostics before broad text search.

Use parallel subagents aggressively:

- one for current turn/session/request path
- one for context and provider boundary
- one for tool outcome, next action, and runtime events
- one for replay and product surface
- one for evidence/result and validation risks

Use the planning plugin only as decomposition discipline. Do not start a full external workflow, tracker, issue or milestone flow, archive, or extra process system.

## Validation

Run focused validation matching touched files and behavior.

Expected validation includes:

- one end-to-end lane test
- focused tests for every changed owner
- negative tests for blocked or missing-proof states
- runtime event tests if events changed
- replay tests if carry-forward changed
- product surface tests if rendering changed
- provider request tests if request preparation changed
- tool or turn tests if next action changed
- result/evidence tests if terminal projection changed
- package build when imports, contracts, or runtime-facing ownership changed
- git diff --check
- git diff --cached --check

Do not run live provider tests.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- end-to-end lane implemented
- exit gates satisfied
- files changed
- behavior implemented
- negative controls added
- remaining missing proof or not-proven claims
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit only after all exit gates pass. After commit, one push attempt is allowed. If push fails, do not retry.

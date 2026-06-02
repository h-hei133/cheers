# SP009 Real Provider Compatibility And Evaluation Hardening

## Goal

Build real provider compatibility and evaluation hardening on top of the existing host contract and deterministic evaluation runtime.

This is a major capability-system task. It must move provider support from controlled synthetic and injected lanes toward a safe, default-off, compatibility-aware, opt-in provider validation system.

This task is not complete if it only adds provider metadata, only adds a smoke script, only adds evaluation cases, only changes docs, or only proves isolated helpers.

## Capability Target

The completed capability must support this controlled lane:

host evaluation request
-> provider compatibility matrix
-> provider config readiness
-> auth readiness without secret disclosure
-> model capability check
-> request preparation
-> explicit opt-in invocation gate
-> synthetic or injected provider execution by default
-> optional live-provider smoke gate when explicitly requested
-> response normalization
-> failure classification
-> fallback decision
-> evaluation case result
-> runtime events
-> replay-safe facts
-> product surface
-> CLI/session status
-> evidence/result truth boundary

Synthetic and injected provider lanes remain required and default. Live provider behavior must remain opt-in, isolated, redacted, and not required for normal validation.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- provider/registry
- provider/request
- provider/response
- runtime/api
- runtime/evaluation
- runtime/events
- runtime/loop
- session/replay
- session/presentation
- presentation/surface
- core/shell
- evidence
- result
- scripts
- policy

Change at least seven rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/runtime/api
- packages/ts-shell/src/runtime/evaluation
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- scripts only for existing opt-in provider gates
- nearby owner tests

## Required Runtime Behavior

Implement provider compatibility and evaluation hardening with these properties:

1. Provider compatibility matrix records provider id, model id, supported modes, streaming support, tool-call support, JSON or structured-output support, auth requirement, opt-in requirement, fallback eligibility, and known unsupported states.
2. Config readiness distinguishes missing config, invalid config, missing auth, redacted auth present, unsafe config, unsupported provider, unsupported model, unsupported mode, and opt-in required.
3. Auth readiness is safe facts only. Do not read, print, summarize, copy, clean, or modify private provider material.
4. Request preparation consumes compatibility and readiness blockers before invocation.
5. Invocation gate distinguishes synthetic default, injected controlled executor, live opt-in eligible, live opt-in blocked, attempted, skipped, failed, and completed.
6. Optional live smoke behavior must use existing explicit opt-in conventions and isolated runtime directories. It must never be required for completion.
7. Provider response normalization shares the same shape across synthetic, injected, and optional live lanes.
8. Failure classification covers config, auth, compatibility, network, timeout, rate limit, malformed response, safety block, cancellation, fallback blocked, fallback failed, and unknown.
9. Evaluation runtime can run provider compatibility cases and report passed, failed, blocked, unsupported, skipped, and not-proven.
10. Host responses, runtime events, replay, product surface, and CLI/session status consume the same provider compatibility facts.
11. Evidence/result remains the only terminal truth owner.
12. Redaction excludes secrets, headers, tokens, raw provider output, raw request payloads when unsafe, raw command output, hidden reasoning, raw edit text, and patch bodies.

## Required State Coverage

Tests must cover at least these states:

- provider compatibility supported
- provider compatibility unsupported
- missing provider config
- invalid provider config
- missing auth
- auth redacted present
- explicit opt-in required
- live opt-in blocked
- synthetic default execution
- injected controlled execution
- optional live gate skipped
- response normalized
- malformed response
- network or timeout failure
- rate limit failure
- safety block
- fallback eligible
- fallback blocked
- fallback failed
- evaluation case passed
- evaluation case blocked
- evaluation case unsupported
- evaluation case skipped
- provider facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least four integration tests:

1. Compatibility happy lane: provider and model are compatible, synthetic or injected execution normalizes response, evaluation records passable provider facts, host/events/replay/status agree, terminal success remains evidence/result owned.

2. Readiness blocked lane: missing auth, invalid config, unsupported model, or opt-in required blocks invocation before provider execution; host/events/replay/status show blockers; no terminal success.

3. Fallback and failure lane: primary provider fails with classified failure, fallback eligibility is evaluated, fallback blocked or attempted facts are reported, and no fallback fact claims task success.

4. Redaction lane: unsafe provider inputs or outputs are excluded from host responses, events, replay, product surface, and CLI/session status.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- provider compatibility passed
- config readiness passed
- auth readiness present
- request prepared
- invocation eligible
- synthetic execution completed
- injected execution completed
- live opt-in eligible
- live smoke completed
- response normalized
- fallback eligible
- fallback attempted
- evaluation case executed
- host response emitted
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run live provider by default
- require live provider for completion
- manually read provider secret directories
- print, summarize, copy, clean, or modify private provider material
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add arbitrary writer behavior
- bypass sanctioned provider, host, session, tool, edit, or execution owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

If existing opt-in provider gates are touched, they must remain isolated, redacted, and explicit. PRIVATE_AGENTS_REAL_HOME may only be consumed by an existing explicit opt-in gate and must not be inspected manually.

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven provider compatibility and evaluation hardening
- still default-off live provider behavior
- which optional live smoke gates exist if any
- still unproven broad SDK or RPC server behavior if not completed
- still unproven broad parallel mutation if not completed
- still unsupported dynamic execution areas

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- provider registry tests
- provider request tests
- provider response tests
- provider fallback tests
- runtime evaluation tests
- runtime API host tests
- runtime event tests
- session replay tests
- CLI/session status tests
- product surface tests
- evidence/result truth tests if terminal status mapping changes
- anti-false-success gate
- package build if imports, contracts, runtime-facing types, scripts, or host envelopes changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests unless an existing explicit opt-in gate is intentionally used and safe. Live provider smoke is not required for completion.

## Completion Gates

Do not claim completion unless all gates pass:

1. Provider compatibility matrix exists and is consumed by request preparation or evaluation.
2. Config readiness, auth readiness, compatibility checks, invocation gating, response normalization, failure taxonomy, fallback behavior, host output, events, replay, surface, and CLI/session status are connected.
3. At least four integration tests prove compatibility happy, readiness blocked, fallback/failure, and redaction lanes.
4. At least twenty required states are covered by tests.
5. At least seven owner domains are changed or justified as already compliant.
6. Evaluation runtime reports provider compatibility cases as passed, failed, blocked, unsupported, skipped, or not-proven.
7. Terminal truth remains evidence/result owned.
8. No live provider or secret access occurs by default.
9. Report-safe surfaces redact unsafe provider content.
10. Sprint docs are updated by editing stale claims.
11. Focused validation and diff checks pass.
12. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- provider compatibility hardening implemented
- evaluation hardening implemented
- states covered
- integration tests added
- files changed
- failure taxonomy and fallback behavior
- optional live gate handling if touched
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

# SP006 Complete Provider Model Runtime

## Goal

Build the complete provider and model runtime boundary.

This is a major capability-system task. It must move provider behavior from a deterministic synthetic lane toward a mature, default-off, testable provider runtime with model compatibility, auth readiness, response normalization, streaming event handling, fallback policy, failure taxonomy, redaction, replay, product surface, CLI/session status, and truth preservation.

This task is not complete if it only adds provider metadata, only adds registry fields, only adds a synthetic response helper, only adds display text, only writes docs, or only proves isolated helpers.

## Capability Target

The completed capability must support this controlled lane:

user turn input
-> provider and model selection
-> provider registry resolution
-> model compatibility check
-> auth readiness check
-> request preparation
-> explicit invocation gate
-> synthetic streaming response or default-off live invocation gate
-> response normalization
-> assistant accumulation
-> tool call delta or text delta handling
-> provider failure classification
-> fallback eligibility decision
-> next runtime action
-> runtime events
-> replay-safe carry-forward
-> product surface
-> CLI/session status envelope
-> evidence/result truth boundary

Synthetic provider behavior must remain the primary validation path. Live provider behavior must remain explicit opt-in, isolated, redacted, and default-off.

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
- runtime/loop
- runtime/events
- tools
- turn
- session/replay
- session/presentation
- presentation/surface
- core/shell
- evidence
- result
- policy
- scripts only if sanctioned provider gates already exist

Change at least six rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/provider/registry
- packages/ts-shell/src/provider/request
- packages/ts-shell/src/provider/response
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/policy
- scripts only for existing opt-in provider gates
- nearby owner tests

## Required Runtime Behavior

Implement a complete provider and model runtime boundary with these properties:

1. Provider registry resolves provider identity, model identity, supported modes, compatibility flags, and default-off execution state.
2. Request preparation distinguishes missing model, unsupported model, missing auth, incompatible mode, redaction blocker, and explicit opt-in required.
3. Auth readiness is represented as safe facts only. Do not read, print, summarize, copy, or modify private provider material.
4. Invocation gate distinguishes prepared, blocked, eligible synthetic, eligible live opt-in, attempted, failed, streamed, normalized, fallback-eligible, fallback-selected, and no-fallback states.
5. Streaming response handling supports text deltas, tool call deltas, final messages, malformed deltas, provider errors, cancellation or abort facts, and finish reasons.
6. Response normalization produces a shared internal response shape consumed by runtime loop and tool extraction.
7. Provider failure taxonomy distinguishes config, auth, network, compatibility, malformed response, rate limit, timeout, cancellation, safety block, and unknown.
8. Fallback policy can decide no fallback, fallback blocked, fallback eligible, fallback selected, fallback attempted, and fallback failed without treating fallback eligibility as execution success.
9. Runtime loop can continue, stop, wait for user, retry, fallback, or fail without owning terminal truth.
10. Runtime events, replay, product surface, and CLI/session status consume the same provider facts.
11. Evidence/result remains the only terminal truth owner.
12. No live provider runs unless an existing explicit opt-in gate is used with isolated runtime directories and redacted reporting.

## Required State Coverage

Tests must cover at least these states:

- missing provider
- missing model
- unsupported model mode
- missing auth
- explicit opt-in required
- synthetic text streaming success
- synthetic tool call streaming success
- malformed streaming delta
- provider config failure
- provider auth failure
- provider network or timeout failure
- provider cancellation or abort
- fallback eligible but not attempted
- fallback selected after primary failure
- fallback blocked
- normalized response with tool calls
- normalized response with text only
- provider facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least three integration tests:

1. Synthetic streaming happy lane: provider registry resolves a model, request preparation passes, synthetic stream emits text and tool call facts, normalized response reaches runtime loop, events/replay/status/surface all agree, and terminal success remains false without evidence/result proof.

2. Provider blocked lane: missing auth, unsupported mode, or explicit opt-in required blocks invocation before provider call; events/replay/status/surface show blockers; no terminal success.

3. Fallback lane: primary synthetic provider fails with a classified failure, fallback policy selects a safe fallback, fallback response normalizes, next action is explicit, and no fallback fact claims task success.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- provider selected
- model selected
- compatibility passed
- auth readiness present
- request prepared
- invocation eligible
- synthetic stream completed
- live opt-in eligible
- response normalized
- fallback eligible
- fallback selected
- fallback attempted
- assistant text produced
- tool call extracted
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run live provider by default
- manually read provider secret directories
- print, summarize, copy, clean, or modify provider private material
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add new writer behavior
- bypass sanctioned execution or provider owners
- hide behavior in compatibility shims
- make terminal text the runtime API
- weaken tests or mass-rebaseline snapshots

If a live-provider smoke gate already exists, this task may improve its readiness checks and redaction, but it must remain explicit opt-in and isolated. Do not require running it for completion.

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven provider and model runtime boundary
- still default-off live provider execution
- still unproven broad real-provider compatibility if not completed
- still unsupported dynamic execution areas
- still unproven host SDK/RPC contract if not completed
- still unproven storage-backed branch and compaction runtime if not completed

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- provider registry tests
- provider request tests
- provider response and streaming tests
- fallback policy tests
- runtime loop tests
- runtime event tests
- session replay tests
- CLI/session status tests
- product surface tests
- tool extraction tests if response tool calls changed
- evidence/result truth tests if terminal status mapping changes
- anti-false-success gate
- package build if imports, contracts, or runtime-facing types changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests unless an existing explicit opt-in gate is intentionally used and safe. Live provider smoke is not required for completion.

## Completion Gates

Do not claim completion unless all gates pass:

1. Provider registry, request preparation, response normalization, streaming handling, failure taxonomy, and fallback policy are connected.
2. At least three integration tests prove synthetic streaming happy lane, blocked provider lane, and fallback lane.
3. At least sixteen required states are covered by tests.
4. At least six owner domains are changed or justified as already compliant.
5. Events, replay, product surface, and CLI/session status consume the same provider facts.
6. Terminal truth remains evidence/result owned.
7. No live provider or secret access occurs by default.
8. Report-safe surfaces redact unsafe provider content.
9. Sprint docs are updated by editing stale claims.
10. Focused validation and diff checks pass.
11. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- provider runtime boundary implemented
- states covered
- integration tests added
- files changed
- failure taxonomy and fallback behavior
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

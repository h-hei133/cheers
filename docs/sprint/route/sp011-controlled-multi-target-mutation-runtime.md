# SP011 Controlled Multi Target Mutation Runtime

## Goal

Build the complete controlled multi-target mutation runtime.

This is a major capability-system task. It must move mutation support from a single controlled recovery lane to a multi-file and multi-target planning, conflict, apply, revert, verification, and recovery system.

This task is not complete if it only adds a batch model, only adds snapshot metadata, only updates display, only writes docs, or only proves isolated helpers.

## Capability Target

The completed capability must support this controlled lane:

synthetic provider edit intent
-> mutation plan
-> target classification
-> conflict detection
-> authority check
-> stale-read check per target
-> snapshot or restore plan per target
-> execution queue
-> sanctioned apply per target
-> ordered apply observations
-> partial failure classification
-> revert or rollback decision
-> task-relevant verification plan
-> verification result per target and whole task
-> repair eligibility
-> result-owned verdict
-> runtime events
-> host evaluation
-> replay-safe facts
-> product surface
-> CLI/session status
-> evidence/result truth boundary

This task may support grouped planning and ordered execution. It must not enable uncontrolled parallel mutation. Mutation concurrency is allowed only if every conflict, authority, snapshot, ordering, and rollback condition is proven. If that proof is not ready, implement sequential mutation queue with explicit reasons that parallel mutation remains unsupported.

## Controlled Component Adoption

Use the four-level adoption model from the sprint knowledge base:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

For this task, prefer structured port or behavior-only alignment for conflict planning, settlement ordering, queue state machines, and evaluation harness behavior.

Direct source adoption is allowed only when license and notice requirements can be satisfied without violating this task's naming and content constraints. If that is not possible, do not copy source. Use structured port instead.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with:

- selected mode
- owner domain
- reason for use
- rejected alternatives
- expected callers
- side-effect boundary
- truthfulness boundary
- validation evidence
- rollback plan if unsafe

Do not put process wording, comparison wording, provenance wording, or outside project names into product code names, runtime fields, user-visible output, product file names, or product content.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/component-adoption-log.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- edit
- edit/result
- edit/multifile
- edit/recovery
- runtime/execution
- tools
- tools/policy
- tools/scheduling
- turn
- runtime/loop
- runtime/events
- runtime/api
- runtime/evaluation
- verification
- repair
- evidence
- result
- session/replay
- session/presentation
- presentation/surface
- core/shell
- policy

Change at least eight rightful owner domains unless the final report proves one inspected owner already satisfies required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/edit
- packages/ts-shell/src/edit/multifile
- packages/ts-shell/src/edit/recovery
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/tools
- packages/ts-shell/src/tools/policy
- packages/ts-shell/src/tools/scheduling
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/api
- packages/ts-shell/src/runtime/evaluation
- packages/ts-shell/src/verification
- packages/ts-shell/src/repair
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- nearby owner tests

## Required Runtime Behavior

Implement controlled multi-target mutation with these properties:

1. Mutation plan can represent multiple files, multiple hunks, multiple operations, and per-target intent.
2. Target classification distinguishes read-only, create, update, delete, move, unsupported, unknown, authority-required, and blocked.
3. Conflict detection identifies same-file overlap, stale base, missing file, path escape, unsupported operation, dependency ordering, snapshot conflict, and unknown conflict.
4. Mutation authority is per target and per batch.
5. Final stale-read check runs per target before apply.
6. Snapshot or restore plan exists per target before apply.
7. Apply queue records planned, ready, skipped, blocked, applying, applied, failed, reverted, revert-failed, and unknown.
8. Sanctioned apply uses existing edit or execution owners only.
9. Partial apply failure preserves successful target facts and failed target facts without claiming task success.
10. Revert or rollback decision can be per target and per batch.
11. Verification planning distinguishes per-target verification and whole-task verification.
12. Verification skipped, blocked, not-run, failed, partial, or incomplete cannot become success.
13. Repair eligibility preserves original failures and per-target history.
14. Result-owned verdict is the only complete path.
15. Events, host evaluation, replay, product surface, and CLI/session status consume the same mutation facts.
16. Report-safe surfaces redact raw old text, new text, patch bodies, command output, provider output, hidden reasoning, and secrets.

## Required State Coverage

Tests must cover at least these states:

- multi-file plan created
- create target
- update target
- delete target blocked or unsupported if not implemented
- move target blocked or unsupported if not implemented
- same-file conflict
- overlapping hunk conflict
- stale base blocked
- missing file blocked
- path escape blocked
- authority missing
- batch authority partial
- snapshot created
- snapshot unavailable
- apply queue ready
- apply skipped due dependency
- one target applied
- one target failed
- partial batch failure
- revert required
- revert succeeded
- revert failed
- verification per target passed
- verification per target failed
- whole-task verification missing
- repair eligible
- repair not eligible
- result-owned complete proof
- raw edit content redacted
- host evaluation passed
- host evaluation blocked
- mutation facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least four integration tests:

1. Multi-target happy lane: synthetic edit intent creates a multi-target plan, authority and stale-read pass, snapshots exist, ordered apply succeeds, verification passes, evidence/result produces complete verdict, and events/host/replay/status agree.

2. Conflict blocked lane: overlapping changes, stale base, path escape, or missing target blocks mutation before apply; host/events/replay/status show blockers; terminal success remains false.

3. Partial failure recovery lane: one target applies and another fails, revert or rollback decision is produced, original failure and applied target facts are preserved, verification does not claim success, and next action is explicit.

4. Verification and repair lane: apply succeeds but verification fails, repair eligibility is evaluated, repair apply or not-eligible facts are preserved, post-repair verification controls result-owned verdict.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- multi-target plan created
- conflict check passed
- authority granted
- stale-read passed
- snapshot created
- apply queue ready
- target applied
- batch applied
- revert attempted
- revert succeeded
- verification planned
- repair eligible
- repair applied
- host evaluation case executed
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add uncontrolled parallel mutation
- add arbitrary writer behavior outside sanctioned edit or execution owners
- bypass ExecutionService or existing edit owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process wording, comparison wording, provenance wording, or outside project names. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven controlled multi-target mutation runtime
- whether parallel mutation remains unsupported or bounded
- still unsupported dynamic execution areas
- still default-off live provider behavior
- still unproven broad SDK or RPC server behavior if not completed
- still unproven browser or external tool server behavior if not completed

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- edit owner tests
- multifile edit tests
- recovery tests
- runtime execution tests if touched
- tool policy and scheduling tests if touched
- runtime loop tests
- runtime event tests
- runtime API host tests
- runtime evaluation tests
- verification and repair tests
- session replay tests
- CLI/session status tests
- product surface tests
- evidence/result truth tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or scripts changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Multi-target mutation plan, conflict detection, authority, stale-read, snapshot or restore plan, apply queue, partial failure, revert or rollback, verification, repair eligibility, result verdict, host evaluation, events, replay, surface, and CLI/session status are connected.
2. At least four integration tests prove happy, conflict blocked, partial failure recovery, and verification or repair lanes.
3. At least thirty required states are covered by tests.
4. At least eight owner domains are changed or justified as already compliant.
5. Uncontrolled parallel mutation is not enabled.
6. Deterministic apply and result ordering is proven.
7. Terminal truth remains evidence/result owned.
8. Report-safe surfaces redact unsafe content.
9. Sprint docs and adoption log are updated by editing stale claims.
10. Focused validation and diff checks pass.
11. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- adoption mode used and why
- component or behavior ported
- multi-target mutation runtime implemented
- states covered
- integration tests added
- files changed
- conflict and ordering behavior
- partial failure and revert behavior
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

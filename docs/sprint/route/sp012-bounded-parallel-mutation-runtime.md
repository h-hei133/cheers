# SP012 Bounded Parallel Mutation Runtime

## Goal

Build a bounded parallel mutation runtime on top of the existing controlled multi-target mutation system.

This is a major capability-system task. It must improve edit throughput by allowing safe independent mutation groups to execute concurrently while preserving authority, stale-read, snapshot, rollback, verification, redaction, host evaluation, and evidence/result truth boundaries.

This task is not complete if it only adds a parallel flag, only changes queue metadata, only updates display, only writes docs, or only proves isolated helpers.

## Capability Target

The completed capability must support this controlled lane:

synthetic edit intent
-> multi-target mutation plan
-> effect and target classification
-> conflict and dependency graph
-> authority check per target and per group
-> stale-read check per target
-> snapshot or restore plan per target
-> parallel eligibility decision
-> bounded parallel execution groups
-> sanctioned apply per target
-> deterministic settlement ordering
-> partial failure classification
-> group cancellation or rollback decision
-> per-target and whole-task verification
-> repair eligibility
-> result-owned verdict
-> runtime events
-> host evaluation
-> replay-safe facts
-> product surface
-> CLI/session status
-> evidence/result truth boundary

Parallel mutation is allowed only for proven independent targets. If any condition is uncertain, the target must run sequentially or be blocked.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

For this task, prefer structured port or behavior-only alignment for scheduling, graph, settlement, and cancellation behavior.

Direct source adoption is allowed only when license and notice requirements can be satisfied without violating this task's naming and content constraints. If required notices or copied files would require disallowed names or content, do not copy source. Use structured port instead.

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

- edit/multifile
- edit/recovery
- runtime/execution
- tools/policy
- tools/scheduling
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

## Required Runtime Behavior

Implement bounded parallel mutation with these properties:

1. Mutation graph represents target identity, operation type, dependency, conflict, authority, stale-read, snapshot, and rollback facts.
2. Parallel eligibility distinguishes eligible, forced sequential, blocked, unsupported, unknown, authority-required, stale, conflict, dependency-blocked, snapshot-missing, rollback-missing, and unsafe.
3. Independent targets may run in the same bounded group only when authority, stale-read, snapshot, rollback, and conflict checks all pass.
4. Same-file, overlapping hunk, move/delete interaction, path escape, dependency ordering, missing snapshot, missing rollback, unknown effect, and stale base prevent parallel execution.
5. Group size is bounded and explicit.
6. Apply attempts go through sanctioned edit or execution owners only.
7. Settlement preserves deterministic target order independent of completion order.
8. Partial group failure preserves successful target facts, failed target facts, skipped target facts, and original failure.
9. Group rollback can be per target and per group, and rollback success is not task success.
10. Verification distinguishes per-target, per-group, and whole-task proof.
11. Repair eligibility preserves per-target history.
12. Host evaluation can report passed, failed, blocked, unsupported, skipped, and not-proven for parallel mutation cases.
13. Events, replay, product surface, and CLI/session status consume the same group facts.
14. Evidence/result remains the only terminal truth owner.
15. Report-safe surfaces redact raw old text, new text, patch bodies, command output, provider output, hidden reasoning, and secrets.

## Required State Coverage

Tests must cover at least these states:

- two independent targets eligible
- bounded group created
- group size capped
- deterministic settlement order
- same-file conflict forced sequential or blocked
- overlapping hunk blocked
- dependency forces ordering
- stale target blocked
- missing snapshot blocked
- missing rollback blocked
- authority missing
- path escape blocked
- move/delete interaction blocked or unsupported
- unknown effect blocked
- one target applies fast
- one target applies slow
- one target apply fails
- partial group failure
- successful target retained as fact
- failed target retained as fact
- skipped target due group failure
- rollback required
- rollback succeeded
- rollback failed
- per-target verification passed
- per-target verification failed
- group verification failed
- whole-task proof missing
- repair eligible
- result-owned complete proof
- host evaluation passed
- host evaluation blocked
- replay carries safe group facts
- product surface and CLI/session status render group facts
- unsafe content redacted
- group facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least five integration tests:

1. Parallel happy lane: independent targets run in bounded parallel groups, settle deterministically, verification passes, result-owned verdict completes, and host/events/replay/status agree.

2. Conflict fallback lane: conflicting targets are forced sequential or blocked with explicit facts and no false success.

3. Partial failure lane: one target fails, successful and failed facts are preserved, rollback decision is explicit, and no task success is inferred.

4. Rollback lane: group rollback succeeds or fails with original failure preserved and terminal success still evidence/result-owned.

5. Verification lane: applies complete but per-target or group verification fails, repair eligibility is evaluated, and result remains non-success unless proof completes.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- parallel eligibility passed
- group created
- apply started
- target applied
- group applied
- settlement completed
- rollback attempted
- rollback succeeded
- verification planned
- repair eligible
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

- newly proven bounded parallel mutation runtime
- still unsupported uncontrolled parallel mutation
- still unsupported dynamic execution areas
- still default-off live provider behavior
- still unproven broad SDK or RPC server behavior if not completed
- still unproven browser or external tool server behavior if not completed

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- edit multifile tests
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

1. Bounded parallel mutation graph, eligibility, grouping, deterministic settlement, partial failure, rollback, verification, repair eligibility, result verdict, host evaluation, events, replay, surface, and CLI/session status are connected.
2. At least five integration tests prove parallel happy, conflict fallback, partial failure, rollback, and verification lanes.
3. At least thirty-five required states are covered by tests.
4. At least eight owner domains are changed or justified as already compliant.
5. Uncontrolled parallel mutation is not enabled.
6. Deterministic settlement ordering is proven.
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
- bounded parallel mutation runtime implemented
- states covered
- integration tests added
- files changed
- grouping and ordering behavior
- conflict fallback behavior
- partial failure and rollback behavior
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

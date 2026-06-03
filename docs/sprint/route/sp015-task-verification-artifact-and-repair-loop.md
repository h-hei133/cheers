# SP015 Task Verification Artifact And Repair Loop

## Goal

Build a task-completion loop that directly attacks the top blockers measured by the task bench:

- verification not selected
- artifact invalid
- repair failed

This is a major task-completion capability task. It must connect task-relevant verification selection, artifact workflow receipts and validation, failure diagnosis, bounded repair, retry or stop decisions, task-bench outcomes, and evidence/result verdicts.

This task is not complete if it only adds another status field, event projection, artifact metadata helper, verification intent, repair state, or documentation update.

## Capability Target

The completed capability must support this lane:

task case
-> goal and task kind
-> context and plan facts
-> task-relevant verification selector
-> code mutation or artifact workflow
-> validation result
-> failure diagnosis
-> repair or retry decision
-> bounded repair action
-> post-repair validation
-> host or evaluation outcome
-> evidence/result verdict
-> updated top blockers

The output must show whether the top blockers improved, stayed the same, or exposed deeper blockers.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

For this task, prefer structured port or behavior-only alignment for verification selection, artifact receipts, failure taxonomy, and repair loop behavior.

Direct source adoption is allowed only when license and notice requirements can be satisfied without violating this task's naming and content constraints. If required notices or copied files would require disallowed names or content, do not copy source. Use structured port or behavior-only alignment instead.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, provenance wording, or outside project names.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP014 task outcomes as product evidence. Current code, tests, command output, and safe runtime evidence remain the source of truth.

## Owner Domains

Inspect at least these owners:

- runtime/evaluation
- runtime/api/host
- verification
- repair
- evidence
- result
- artifacts if it exists
- context
- planning
- edit
- tools
- provider/request
- provider/response
- session/replay
- session/presentation
- presentation/surface
- core/shell

Change only rightful owner domains needed for verification selection, artifact receipts, failure diagnosis, repair loop integration, task bench outcomes, and report-safe status.

## Required Verification Selector

Add or strengthen a task-relevant verification selector.

It must distinguish:

- code edit verification
- debug repair verification
- artifact validation
- data or structured output validation
- report or summary validation
- continuation freshness validation
- blocked verification
- unsupported verification
- not-selected verification
- selected but not run
- selected and failed
- selected and passed
- insufficient verification

For every selection, record:

- why selected
- what it proves
- what it does not prove
- blockers
- fallback verification
- evidence/result input eligibility

## Required Artifact Workflow

Add or strengthen a first-class artifact workflow owner or receipt model.

It must represent:

- artifact intent
- artifact kind
- source receipts
- scope expectations
- output path or durable handle
- format expectation
- validation check
- validation result
- unsafe path blocker
- missing source blocker
- invalid artifact blocker
- not-proven artifact state

At minimum, cover report or summary output and structured data or artifact-like output. Do not treat file existence or generated text as completion.

## Required Debug And Repair Loop

Connect failed verification to diagnosis and bounded repair.

It must represent:

- failure class
- diagnostic context needed
- repair eligibility
- repair blocked
- repair proposed
- repair attempted
- repair failed
- repair succeeded but unverified
- post-repair validation failed
- post-repair validation passed
- retry exhausted
- user input required
- original failure preserved

Repair cannot hide original failure. Repair apply is not success without post-repair validation and evidence/result verdict.

## Required Task Bench Integration

Rerun or reclassify the SP014 blockers through deterministic cases.

Required cases to improve or explicitly keep failing with better evidence:

- failed-check-repair
- rollback-recovery
- source-report
- structured-artifact
- resume-from-context or another not-proven continuation case

Each case must record before outcome, after outcome, changed blocker, remaining blocker, and whether the result is complete, partial, failed, blocked, skipped, unsupported, or not-proven.

## Required State Coverage

Tests must cover at least these states:

- verification not selected
- verification selected for code edit
- verification selected for debug repair
- verification selected for artifact
- verification selected but blocked
- verification selected but failed
- verification selected and passed
- insufficient verification
- artifact intent created
- artifact source missing
- artifact invalid
- artifact validation passed
- artifact validation failed
- unsafe artifact path blocked
- debug failure diagnosed
- repair eligible
- repair blocked
- repair attempted
- repair failed
- repair succeeded but unverified
- post-repair validation failed
- post-repair validation passed
- retry exhausted
- continuation not-proven improved or preserved with reason
- evidence/result complete proof
- non-success facts remain non-success

## Required Integration Tests

Add at least five integration tests:

1. Code verification lane: a coding task selects relevant verification and reaches complete only through evidence/result proof.
2. Debug repair lane: failed verification drives diagnosis, repair, post-repair validation, and verdict.
3. Artifact validation lane: report or structured output validates sources and format before completion.
4. Invalid artifact lane: invalid or unsafe artifact stays failed, blocked, or not-proven with clear blocker.
5. Not-proven continuation lane: missing or stale continuation facts remain not-proven unless a real validation path resolves them.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Allowed Fixes

This task may fix:

- verification selection gaps
- artifact receipt or validation gaps
- failure diagnosis gaps
- repair-loop wiring gaps
- task-bench outcome reporting gaps
- one small low-risk blocker found while rerunning the cases

Do not launch unrelated broad feature work.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- verification selected
- verification command chosen
- artifact intent created
- artifact file exists
- artifact validation attempted
- failure diagnosed
- repair proposed
- repair attempted
- repair applied
- retry attempted
- host outcome emitted
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- manually read provider secret directories
- run live provider unless an existing explicit opt-in gate is intentionally selected and safe
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add arbitrary writer behavior
- bypass sanctioned provider, host, session, tool, edit, execution, artifact, evidence, or result owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process wording, comparison wording, provenance wording, or outside project names. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md if adoption decisions changed

Rewrite stale priorities based on measured blocker changes. Do not append progress logs.

The docs must distinguish:

- improved blocker outcomes
- blockers that remain
- newly proven verification selection
- newly proven artifact workflow behavior
- newly proven or still weak repair loop behavior
- remaining live task weakness

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench tests
- verification selector tests
- artifact workflow tests
- debug repair tests
- runtime evaluation tests
- host API tests if host output changes
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests unless an existing explicit opt-in gate is intentionally selected and safe.

## Completion Gates

Do not claim completion unless all gates pass:

1. Task-relevant verification selector exists.
2. Artifact workflow receipt or owner exists.
3. Debug repair loop connects failed verification to diagnosis and bounded repair.
4. At least five SP014 blocker cases are rerun or reclassified.
5. At least five integration tests prove code verification, debug repair, artifact validation, invalid artifact, and not-proven continuation lanes.
6. At least twenty-five required states are covered by tests.
7. Top blockers are updated from actual case outcomes.
8. Terminal truth remains evidence/result owned.
9. Report-safe surfaces redact unsafe content.
10. Sprint docs are updated by editing stale claims.
11. Focused validation and diff checks pass.
12. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report owner domains inspected, owner domains changed, adoption mode used and why, verification selector implemented, artifact workflow implemented, debug repair loop implemented, SP014 cases before and after, top blockers before and after, files changed, integration tests added, negative and redaction controls, sprint docs updated, remaining weak areas, why terminal truth still belongs to evidence/result, validation commands and outcomes, final git status, commit hash, and push status.

# SP020 Autonomous Task Core Upgrade

## Goal

Aggressively upgrade the project's autonomous task core.

This task must inspect the mature local implementation and public docs already named in sprint docs, extract concrete task-driving behavior, and adopt, port, or implement it locally. The goal is broad deterministic task capability improvement, not another narrow model, proof, readiness, status, event, or documentation pass.

Do not use subagents.

## Core Direction

The project now has audited deterministic task proof and a manually confirmed no-write live smoke. The next task is to make the deterministic autonomous task core substantially closer to a mature agent workflow.

The target workflow is:

short prompt
-> workspace discovery
-> context assembly
-> task plan
-> request packet
-> tool strategy
-> execution
-> verification
-> diagnosis
-> repair or artifact correction
-> proof
-> result verdict
-> updated bench outcomes

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed for narrow self-contained code only when license and notice requirements can be satisfied without violating naming and content constraints. If not, use structured port or behavior-only alignment.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, source-history wording, or outside project names.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP017, SP018, and SP019 outcomes as product evidence.

## Required Extraction Areas

Inspect the mature local implementation and public docs already named in sprint docs for concrete behavior in:

- workspace discovery
- context assembly
- task planning
- provider request shaping
- tool choice and action policy
- verification execution
- failure diagnosis
- debug repair
- artifact, report, and data output workflow
- continuation and freshness handling
- bench scripts and task result reporting

Do not stop at a summary. Convert the extracted behavior into local code.

## Required Implementation Scope

This task may touch all rightful owners needed for deterministic task capability:

- context selection
- planning execution
- provider request packet
- tools policy and strategy
- verification selection and execution
- repair loop
- artifact workflow
- runtime evaluation task bench
- evidence/task
- result/task
- host/evaluation reporting
- scripts if needed for deterministic task checks
- sprint docs and adoption log

Do not add unrelated product layers.

## Explicit Exclusions

Do not implement:

- SDK
- extension or plugin system
- browser automation
- external tool servers
- dynamic loading
- default live provider behavior
- broad command expansion
- arbitrary writers
- broad server behavior

Existing explicit live gates may remain available, but this task's primary proof is deterministic task-core capability.

## Hard Outcome Requirements

Do not claim completion unless outcomes improve.

Required outcomes:

1. Existing complete task cases remain complete.
2. rollback-recovery becomes complete, or one exact hard blocker names the missing owner and required fix.
3. Add at least four more realistic short-prompt deterministic task cases.
4. At least ten deterministic task cases are complete total.
5. At least two debug or repair cases are complete.
6. At least three artifact, report, or data cases are complete.
7. At least three pathless workspace or context cases are complete.
8. At least one continuation case is complete.
9. Every complete case has task-relevant proof and negative-control coverage.

Valid proof examples:

- coding task has relevant verification after final change
- debug task has failed check, bounded repair, and post-repair verification
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- validation selected but not run
- repair attempted
- host output emitted
- status rendered
- relabeling

## Allowed Aggressive Work

Allowed:

- replace weak local task-path code
- restructure deterministic task workflow
- add integrated task workflow behavior
- use dependency adoption when safe
- use isolated source adoption when legal, narrow, and safe
- structured-port mature behavior
- add scripts and tests that prove task outcomes
- update proof owners when task proof is too narrow

Do not preserve weak local architecture merely because it already exists.

## Required Tests

Add or update tests proving:

- before and after outcomes
- at least ten complete deterministic task cases
- rollback-recovery status
- debug/repair outcome
- artifact/report/data outcome
- pathless workspace/context outcome
- continuation outcome
- adopted or ported behavior under local owners
- negative controls for complete cases
- evidence/result ownership
- redaction

The tests must prove behavior changed, not labels.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become success by themselves:

- context selected
- plan created
- request packet shaped
- provider output
- tool chosen
- tool executed
- artifact created
- verification attempted
- repair attempted
- host outcome emitted
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays partial or not-proven.

## Safety And Scope

Do not:

- use subagents
- manually read provider secret directories
- print, summarize, copy, clean, or modify private provider material
- enable provider defaults
- run live provider outside an existing explicit opt-in gate
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add arbitrary writer behavior
- bypass sanctioned provider, host, session, tool, edit, execution, artifact, evidence, or result owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench tests
- context and planning tests
- provider request tests if touched
- tool policy tests if touched
- verification tests
- repair tests
- artifact workflow tests
- host/evaluation tests
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, scripts, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

## Completion Gates

Do not claim completion unless all gates pass:

1. Mature task-driving behavior is inspected and converted into concrete local implementation.
2. Four-level adoption decisions are recorded for concrete behavior used.
3. Hard outcome requirements pass.
4. Complete outcomes are proven by task-relevant evidence, not relabeling.
5. Terminal truth remains evidence/result owned.
6. Report-safe surfaces redact unsafe content.
7. Sprint docs are updated from measured outcomes.
8. Focused validation and diff checks pass.
9. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report inspected behavior, adoption modes, owner domains changed, case outcomes before and after, complete case count, rollback-recovery status, added cases, files changed, tests added or updated, docs updated, remaining blockers, validation commands and outcomes, final git status, commit hash, and push status.

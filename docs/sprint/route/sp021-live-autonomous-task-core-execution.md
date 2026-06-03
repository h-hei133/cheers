# SP021 Live Autonomous Task Core Execution

## Goal

Move the upgraded autonomous task core from deterministic assessment into repeatable explicit opt-in live task execution.

SP019 manually confirmed a no-write live smoke. SP020 upgraded deterministic task capability. This task must connect those results: no-write or low-risk task paths must become live-ready and, where safe, actually execute through existing explicit gates.

This is not another readiness-only, proof-only, status-only, event-only, or documentation-only task.

Do not use subagents.

## Core Direction

The target workflow is:

short prompt
-> context packet
-> task request packet
-> provider/auth readiness
-> allowed tool policy
-> explicit opt-in gate
-> live provider execution
-> verification or artifact validation
-> task proof
-> result verdict
-> live outcome report

The goal is to prove useful live task behavior without enabling default live provider behavior or broad write authority.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating naming and content constraints. If not, use structured port or behavior-only alignment.

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

Use SP019 manual live smoke and SP020 deterministic task outcomes as product evidence.

## Target Cases

Start with no-write and low-risk cases:

- pathless-workspace-question
- source-report
- resume-from-context
- test-impact-question
- owner-context-question
- incident-summary-report
- csv-summary-artifact
- real-readonly-coding-smoke

Write-capable cases may only enter dry-run, manual-review, or blocked state unless existing explicit gates safely allow them.

## Required Behavior

Implement or strengthen:

- provider readiness
- auth readiness
- context packet for live tasks
- task request packet for live tasks
- no-write tool policy
- artifact validation for live-like outputs
- verification plan for live outputs
- host or evaluation live outcome reporting
- redaction
- exact blocker reporting
- task proof handoff

The live result model must distinguish:

- complete
- useful partial
- failed
- blocked
- skipped
- unsupported
- unsafe
- manual review required
- provider readiness missing
- auth readiness missing
- verification unavailable
- artifact validation unavailable
- provider output insufficient
- redaction blocked

## Hard Outcomes

Do not claim completion unless outcomes improve.

Required outcomes:

1. At least four no-write or low-risk cases are live-ready with exact requirements.
2. At least three cases execute through existing explicit opt-in gates if safe.
3. At least two executed cases reach complete or useful partial with task proof.
4. At least one report, artifact, or data case executes.
5. At least one pathless workspace or context case executes.
6. Generic skipped or blocked results are not acceptable. Every non-executed case must name exact missing config, gate, owner, or safety requirement.
7. Write-capable cases remain dry-run, manual-review, blocked, or unsafe unless safe gates already exist.

If no case can execute, do not claim completion. Fix at least one concrete blocker or produce a hard stop report.

## Valid Proof

Live complete requires task-relevant proof.

Valid proof examples:

- read-only coding task answers using anchored context and verification or source evidence
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild
- tool output is checked against the task rubric

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- validation selected but not run
- host output emitted
- status rendered
- relabeling

## Allowed Aggressive Work

Allowed:

- replace weak live-readiness plumbing
- improve provider request packets
- improve context packets
- improve no-write tool policy
- improve verification or artifact validation
- improve host/evaluation live result reporting
- add scripts or tests that make live task execution repeatable through explicit gates
- update proof owners if live proof is too narrow

Do not add unrelated product layers.

## Explicit Exclusions

Do not implement:

- SDK
- extension or plugin systems
- browser automation
- external tool servers
- dynamic loading
- default live provider behavior
- broad command expansion
- arbitrary writers
- broad server behavior

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become success by themselves:

- live readiness ready
- provider selected
- auth readiness present
- request packet shaped
- provider called
- tool executed
- artifact created
- verification attempted
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

Use only existing explicit opt-in gates and isolated or safe runtime state.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Rewrite priorities from live outcomes. Do not append progress logs.

The docs must distinguish:

- deterministic complete
- live-ready
- live-executed
- live-complete
- useful partial
- blocked with exact blocker
- unsafe
- skipped with exact blocker
- remaining live task weakness

## Validation

Run focused validation for changed owners.

Expected validation includes:

- live readiness and execution tests
- provider request tests
- host/evaluation tests
- task bench tests
- context and planning tests if touched
- tool policy tests if touched
- verification tests
- artifact workflow tests
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, scripts, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

Live provider execution is allowed only through existing explicit opt-in gates and only if safe.

## Completion Gates

Do not claim completion unless all gates pass:

1. Required hard outcomes pass or a hard stop report proves execution cannot safely proceed.
2. Existing explicit opt-in gates are used for live execution.
3. No provider default is enabled.
4. No private provider material is manually inspected or leaked.
5. Complete or useful partial outcomes are proven by task-relevant evidence.
6. Terminal truth remains evidence/result owned.
7. Report-safe surfaces redact unsafe content.
8. Sprint docs are updated from live outcomes.
9. Focused validation and diff checks pass.
10. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report live cases, executed cases, live-ready cases, complete or useful partial outcomes, blocked or skipped cases with exact blockers, write-case status, adopted behavior, owner domains changed, files changed, tests added or updated, docs updated, validation commands and outcomes, final git status, commit hash, and push status.

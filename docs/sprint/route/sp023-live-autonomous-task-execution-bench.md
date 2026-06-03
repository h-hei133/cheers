# SP023 Live Autonomous Task Execution Bench

## Goal

Build a repeatable opt-in live task execution bench for autonomous task capability.

SP021 proved no-write live smoke can run. SP022 strengthened deterministic task capability. This task must connect them by running multiple short-prompt no-write or low-risk task paths through existing explicit gates and recording complete, useful partial, failed, blocked, skipped, unsupported, or unsafe outcomes with exact proof or blockers.

This is not another deterministic-only expansion, readiness-only pass, status pass, event pass, or documentation pass.

Do not use subagents.

## Core Direction

Target workflow:

short prompt
-> context packet
-> request packet
-> provider and auth readiness
-> no-write tool policy
-> explicit opt-in gate
-> live provider execution
-> verification or artifact validation
-> task proof
-> result verdict
-> live outcome report

The goal is repeatable live task evidence, not another manual-only smoke.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating naming and content constraints. If not, use structured port or behavior-only alignment.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, callers, side-effect boundary, truth boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, source-history wording, or outside project names.

## Required Starting Point

Read these first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP020, SP021, and SP022 outcomes as evidence.

## Target Live Entries

Start with no-write or low-risk entries:

- pathless workspace question
- owner context question
- test impact question
- source or incident report
- CSV or metrics artifact
- resume after context
- real readonly coding smoke
- one write-capable dry-run planning entry

Write-capable work must remain dry-run, manual-review, unsafe, or blocked unless existing explicit gates safely allow more.

## Required Behavior

Implement or strengthen:

- provider readiness
- auth readiness
- context packet for live tasks
- request packet for live tasks
- no-write tool policy
- artifact validation for live outputs
- verification plan for live outputs
- host or evaluation live outcome reporting
- redaction
- exact blocker reporting
- task proof handoff
- repeatable scripts if needed

## Required Outcome Classes

Live entries must distinguish:

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

Do not claim completion unless all pass:

1. At least six live task entries exist with exact requirements.
2. At least four entries execute through existing explicit gates if safe.
3. At least three executed entries reach complete or useful partial with task proof.
4. At least one pathless workspace or context entry executes.
5. At least one report, artifact, or data entry executes.
6. At least one continuation entry executes or reaches useful partial with exact blocker.
7. At least one readonly coding entry executes.
8. Generic skipped or blocked results are not acceptable. Every non-executed entry must name exact missing config, gate, owner, or safety rule.
9. Write-capable entries remain dry-run, manual-review, unsafe, or blocked unless safe gates already exist.

If execution cannot happen, fix at least one concrete blocker or produce a hard blocker report and do not claim completion.

## Valid Proof

Live complete or useful partial requires task-relevant proof.

Valid proof examples:

- read-only coding answer uses anchored context and source or verification evidence
- report has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation has freshness proof or valid context rebuild
- provider answer is checked against task rubric
- live no-write case proves no mutation and redaction

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- validation selected but not run
- host output emitted
- status rendered
- relabeling

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

## Safety And Truth

Evidence/result owns terminal truth.

Do not:

- use subagents
- manually read provider secret directories
- print, summarize, copy, clean, or modify private provider material
- run live provider outside existing explicit opt-in gates
- enable provider defaults
- bypass sanctioned provider, host, session, tool, edit, execution, artifact, evidence, or result owners
- make terminal text the machine API
- weaken tests or mass-rebaseline snapshots

Missing proof stays partial or not-proven. Report-safe surfaces must redact transcripts, provider output, command output, edit text, patch bodies, hidden reasoning, secrets, tokens, headers, and private paths.

## Documentation

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured live outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including live execution, provider request, host/evaluation, task bench, context/planning, verification, artifact workflow, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Live provider execution is allowed only through existing explicit opt-in gates and only if safe.

## Final Report

Report live entries, executed outcomes, complete or useful partial count, blockers, write-case status, adopted behavior, owner domains changed, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

After commit, one push attempt is allowed. If push fails, do not retry.

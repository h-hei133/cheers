# SP024 Live Write Reviewed Apply

## Goal

Move from live no-write task execution to safe live write-capable task execution.

SP023 proved repeatable no-write and low-risk live entries. This task must push write-capable tasks through a controlled chain:

live provider intent
-> patch intent
-> safe plan
-> dry-run diff
-> explicit review authority
-> isolated apply
-> post-apply verification
-> task proof
-> result verdict

This is not a no-write smoke, readiness-only pass, status pass, event pass, or documentation pass.

Do not use subagents.

## Core Direction

The target workflow is:

short prompt
-> context packet
-> request packet
-> live provider execution through existing explicit gate
-> write intent extraction
-> patch plan
-> dry-run diff
-> review authority
-> isolated apply
-> verification
-> repair or rollback if needed
-> evidence/result verdict
-> live write outcome report

The goal is safe write-capable live task progress without enabling default live provider behavior or unreviewed writes.

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

Use SP021, SP022, and SP023 outcomes as evidence.

## Target Entries

Start with write-capable or write-adjacent entries:

- single-file edit
- coordinated edit
- failed-check repair
- rollback recovery
- package script impact
- write-planning-dry-run

Keep these no-write entries passing:

- pathless workspace question
- owner context question
- incident report
- metrics artifact
- readonly coding check

## Required Behavior

Implement or strengthen:

- live write intent extraction
- safe patch intent model
- dry-run diff generation
- write authority and review gate
- isolated apply path
- changed-files accounting
- post-apply verification
- repair or rollback decision
- task proof handoff
- host/evaluation live write outcome reporting
- redaction
- exact blocker reporting

## Hard Outcomes

Do not claim completion unless all pass:

1. At least three write-capable entries produce live patch intent and dry-run diff.
2. At least two entries pass explicit review authority in isolated fixtures and apply.
3. At least two applied entries pass post-apply verification and task proof.
4. At least one debug or repair entry reaches complete or useful partial.
5. rollback recovery becomes complete, useful partial, or reports one exact hard blocker.
6. Existing no-write live entries remain passing.
7. Real workspace mutation remains forbidden unless an existing explicit gate safely allows it.
8. No unreviewed apply occurs.
9. Generic skipped or blocked results are not acceptable. Every non-executed entry must name exact missing config, gate, owner, or safety rule.

If apply cannot happen safely, fix at least one concrete blocker or produce a hard blocker report and do not claim completion.

## Valid Proof

Live write complete requires task-relevant proof.

Valid proof examples:

- final diff is produced by dry-run and approved by explicit authority
- apply occurs only in isolated state
- changed files match expected target set
- relevant verification passes after apply
- repair preserves original failure and passes post-repair verification
- rollback records original failure, rollback action, and final verification

Invalid proof examples:

- provider output only
- patch intent only
- dry-run only
- review authority only
- apply without verification
- artifact or diff existence only
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

Rewrite priorities from measured live write outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including live write execution, provider request and response, edit dry-run and apply, authority, verification, repair, host/evaluation, task bench, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Live provider execution is allowed only through existing explicit opt-in gates and only if safe.

## Final Report

Report live write entries, dry-run outcomes, apply outcomes, verification outcomes, complete or useful partial count, blockers, write safety status, adopted behavior, owner domains changed, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

After commit, one push attempt is allowed. If push fails, do not retry.

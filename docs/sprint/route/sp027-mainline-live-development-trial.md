# SP027 Mainline Live Development Trial

## Goal

Force the product task loop to complete real live autonomous development tasks.

This task must run explicit opt-in live tasks through the product task loop. Readiness, metadata, scripts, extra cases, and blocker reports are not completion. A blocker is work to fix inside this task unless it is a safety, license, or missing user-provided credential hard stop.

Do not use subagents.

## Core Rule

Do not give yourself an exit by saying a risky or difficult area is deferred. Fix the missing owner, gate, or runtime connection within this task. If a hard safety or license limit prevents completion, mark NOT COMPLETE and do not push.

## Required Runtime Path

All live tasks must use the product task loop:

short prompt
-> task state
-> context
-> plan
-> request
-> provider turn
-> action
-> observation
-> verification
-> repair or retry
-> proof
-> verdict

Scripts may prepare input, set explicit gates, call the runtime, and print safe results. Scripts must not own task behavior.

## Four-Level Component Adoption

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Prefer isolated source adoption or structured port when legal, narrow, and safe. Behavior-only alignment is allowed only with a concrete reason.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, callers, side-effect boundary, truth boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, origin wording, or outside project names.

## Required Starting Point

Read these first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP023 through SP026 outcomes as evidence.

## Required Code-Path Inspection

Inspect the mature local implementation and public docs already named in sprint docs for concrete task-loop code paths:

- input handling
- task state
- context assembly
- request shaping
- provider turn handling
- tool and edit actions
- observations
- verification
- retry or repair
- artifact handling
- continuation
- final verdict
- host or script invocation

Convert useful behavior into local product code. Notes alone are not enough.

## Hard Live Outcomes

Do not claim completion unless all pass:

1. At least five explicit opt-in live tasks execute through the product task loop.
2. At least three live tasks complete with task proof.
3. At least two write-capable tasks reach reviewed isolated apply plus post-apply verification.
4. At least one debug or repair task completes.
5. At least one multi-file or coordinated edit task reaches complete or useful partial.
6. At least one artifact or report task completes.
7. At least one continuation or context task completes.
8. All tasks record prompt, context, plan, provider turn, action, verification, proof, and verdict.
9. Every failed task enters retry, repair, or exact stop state through the runtime.
10. Deterministic and live paths share runtime logic.
11. Terminal truth remains evidence/result owned.

If any gate fails, continue fixing rightful owners and rerun. Do not replace completion with a blocker report.

## Allowed Owners

Change rightful owners as needed:

- task loop
- context
- planning
- provider request and response
- tools and policy
- edit, dry-run, and apply
- verification
- repair
- artifacts
- evidence and result
- host or evaluation
- scripts as thin callers

Do not preserve weak local architecture merely because it exists.

## Valid Proof

Valid proof examples:

- code task has reviewed isolated apply and relevant verification after final change
- debug task has failure evidence, bounded repair, and post-repair verification
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild
- live no-write task has provider call, safe context, no mutation, redaction, and task-relevant proof

Invalid proof examples:

- provider output only
- tool execution only
- patch intent only
- dry-run only
- review authority only
- apply without verification
- artifact existence only
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

After all gates pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured live outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including main task loop, live execution, provider request and response, tool policy, edit, dry-run, apply, verification, repair, artifact workflow, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Run explicit live commands through existing gates when safe.

## Final Report

Report live tasks, complete/partial/failure outcomes, fixes made after blockers, adopted code paths, owner domains changed, shared runtime evidence, write outcomes, artifact/report outcomes, debug outcomes, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

Commit only after every hard gate passes. After commit, one push attempt is allowed. If push fails, do not retry.

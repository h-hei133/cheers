# SP029 Live Development Gauntlet

## Goal

Run a real live autonomous development gauntlet through the product task loop.

This task must prove that the project can complete real live development tasks, not just report readiness, metadata, dry-run facts, or quality counts.

Do not use subagents.

## Core Rule

A blocker is work to fix in this task. Do not treat blockers as completion. If safety, license, or missing user-provided credentials prevents a hard gate, mark NOT COMPLETE and do not commit or push.

## Required Main Path

All tasks must use the product task loop:

short prompt
-> task state
-> context
-> plan
-> request
-> provider turn
-> action
-> observation
-> verification
-> retry or repair
-> proof
-> verdict

Scripts may only set explicit gates, prepare isolated inputs, call the runtime, and print safe results.

## Four-Level Adoption

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Prefer isolated source adoption or structured port when legal, narrow, and safe. Behavior-only alignment is last resort and requires a concrete reason.

Use the local documentation playbook as navigation. Then inspect the mature local implementation for concrete task-loop code paths. Documentation alone is not enough.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, callers, side-effect boundary, truth boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, origin wording, or outside project names.

## Required Starting Point

Read these first:

- AGENTS.md
- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md
- the local documentation playbook

Use SP023 through SP028 outcomes as evidence.

## Required Live Task Mix

Use short prompts. Do not hand-feed exact file names unless the task explicitly tests that behavior.

Required mix:

- single-file edit
- coordinated or multi-file edit
- failed-check repair
- rollback recovery
- package-script impact
- owner or context task
- report or artifact task
- resume or continuation task

## Hard Gates

Do not claim completion unless all pass:

1. At least eight explicit opt-in live development tasks execute through the product task loop.
2. At least five tasks complete with task proof.
3. At least three write-capable tasks perform reviewed disposable workspace apply plus post-apply verification.
4. At least one debug or repair task completes.
5. At least one multi-file or coordinated edit completes or reaches useful partial with exact remaining fix.
6. At least one artifact or report task completes.
7. At least one continuation or context task completes.
8. Manual correction is zero for at least three completed write tasks.
9. Any remaining manual correction becomes an automated rule or a failing gate.
10. Deterministic and live paths still share the same runtime logic.
11. Terminal truth remains evidence/result owned.
12. No raw provider output, patch body, command output, token, header, secret, hidden reasoning, or private path is printed.

If any gate fails, fix rightful owners and rerun. Do not replace completion with blocker reporting.

## Allowed Owners

Change rightful owners as needed:

- task loop
- context
- planning
- provider request and response
- tool policy
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

- reviewed disposable apply for write tasks
- changed-file accounting
- relevant verification after action
- failure evidence plus repair evidence for debug tasks
- source or format validation for artifacts
- freshness proof for continuation
- evidence/result verdict

Invalid proof examples:

- provider output only
- tool execution only
- patch intent only
- dry-run only
- review approval only
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

## Safety

Use only existing explicit opt-in gates and disposable or isolated state.

Do not:

- use subagents
- manually read provider secret directories
- print, summarize, copy, clean, or modify private provider material
- run live provider outside existing explicit opt-in gates
- enable provider defaults
- mutate the main workspace
- bypass sanctioned provider, host, session, tool, edit, execution, artifact, evidence, or result owners
- make terminal text the machine API
- weaken tests or mass-rebaseline snapshots

Missing proof stays partial or not-proven.

## Documentation

After every hard gate passes, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured live development outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including task loop, live execution, provider request and response, tool policy, edit, dry-run, apply, verification, repair, artifact workflow, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Run explicit live commands through existing gates.

## Final Report

Report live tasks, complete/partial/failure outcomes, fixes made after failed gates, manual correction count, adopted code paths, owner domains changed, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

Commit only after every hard gate passes. After commit, one push attempt is allowed. If push fails, do not retry.

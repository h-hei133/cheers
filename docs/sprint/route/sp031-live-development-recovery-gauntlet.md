# SP031 Live Development Recovery Gauntlet

## Goal

Run a real live development failure-recovery gauntlet.

This task must use short-prompt live development tasks to expose failure stages, transplant missing mechanisms into rightful owners, and rerun the same tasks until the hard gates pass.

This is not readiness, metadata, entry count, dry-run-only, document-only, or blocker reporting work.

Do not use subagents.

## Required Tools

Use Serena MCP before broad grep for symbol, owner, call-chain, and context navigation.

Use Spec-Driven Develop plugin to keep goal, constraints, implementation plan, test plan, and acceptance gates explicit.

These tools are required parts of the workflow.

## Core Rule

A blocker is work to fix in this task.

Do not treat blockers as completion. Only safety, license, or missing user-provided credentials may stop the task. If one of those hard limits prevents a gate, mark NOT COMPLETE and do not commit or push.

## Main Path

All tasks must run through the product task loop:

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

Use the local documentation playbook only as navigation, then inspect the mature local implementation for concrete task-loop code paths. Documentation notes alone are not enough.

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

Use SP023 through SP030 outcomes as evidence.

## Live Task Batch

Run short prompts. Do not hand-feed exact file names unless the task explicitly tests known-file behavior.

The batch must include:

- single-file edit
- coordinated edit
- failed-check repair
- rollback recovery
- package-script impact
- owner or context task
- report or artifact task
- resume or continuation task

## Failure Stage Work

For every failed or partial task, classify the failing stage:

- goal
- context
- plan
- request
- provider turn
- action
- patch quality
- apply
- verification
- repair
- artifact validation
- continuation
- proof
- verdict

For the top failing stages, inspect mature local code paths, transplant the needed mechanism into rightful owners, and rerun the same tasks.

## Hard Gates

Do not claim completion unless all pass:

1. At least 8 explicit opt-in live tasks execute through the product task loop.
2. At least 5 live tasks complete with task proof after fixes.
3. At least 3 write-capable tasks perform reviewed disposable workspace apply plus post-apply verification.
4. At least 1 debug or repair task completes.
5. At least 1 coordinated edit completes.
6. At least 1 artifact or report task completes.
7. At least 1 continuation or context task completes.
8. Manual correction is zero for at least 3 completed write tasks.
9. Any remaining manual correction becomes an automated rule or a failing gate.
10. Deterministic and live paths still share runtime logic.
11. Terminal truth remains evidence/result owned.

If any gate fails, fix rightful owners and rerun. Do not replace completion with blocker reporting.

## Live Provider Coverage

Cover all of these:

- primary success
- fallback configured but skipped when primary succeeds
- forced primary failure triggering fallback through the same task loop

Fallback outcomes must pass redaction, proof, verification, and verdict rules.

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

Use only existing explicit gates and disposable or isolated state.

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

Missing proof stays partial or not-proven. Report-safe surfaces must redact transcripts, provider output, command output, edit text, patch bodies, hidden reasoning, secrets, tokens, headers, and private paths.

## Documentation

After every hard gate passes, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured live recovery outcomes and transplanted mechanisms. Do not append progress logs.

## Validation

Run focused validation for changed owners, including task loop, live execution, primary and fallback behavior, provider request and response, tool policy, edit, dry-run, apply, verification, repair, artifact workflow, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Run explicit live commands through existing gates.

## Final Report

Report live tasks, complete/partial/failure outcomes, failure stages before and after, fixes made after failed gates, manual correction count, adopted code paths, owner domains changed, primary/fallback results, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

Commit only after every hard gate passes. After commit, one push attempt is allowed. If push fails, do not retry.

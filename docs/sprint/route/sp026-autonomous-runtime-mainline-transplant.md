# SP026 Autonomous Runtime Mainline Transplant

## Goal

Turn the unified task progression owner into the real product task loop.

SP025 connected deterministic and explicit live paths through one ordered progression. This task must go further: inspect the mature local implementation and public docs already named in sprint docs, identify concrete task-loop code paths, and adopt, port, or implement the equivalent locally.

This is not another wrapper, case expansion, script adapter, metadata pass, proof-only change, event pass, or documentation-only change.

Do not use subagents.

## Core Direction

The product task loop must own this sequence:

short prompt
-> task state
-> context assembly
-> request shaping
-> provider turn
-> tool, edit, or artifact action
-> observation
-> verification
-> retry or repair
-> proof
-> verdict

Deterministic and explicit opt-in live modes must call this same runtime. The only allowed difference is model-output source.

## Four-Level Component Adoption

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Prefer isolated source adoption or structured port when legal, narrow, and safe. Behavior-only alignment is allowed only when the code cannot be adopted or ported safely, and the reason must be recorded.

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

Use SP023, SP024, and SP025 outcomes as evidence.

## Required Code-Path Extraction

Inspect the mature local implementation and public docs already named in sprint docs for concrete task-loop code paths:

- input handling
- task state
- context assembly
- request shaping
- provider turn handling
- tool/action loop
- observation handling
- verification transition
- retry or repair transition
- artifact transition
- continuation transition
- final verdict transition
- host or script invocation pattern

The final work must name the concrete behaviors adopted or ported. Notes alone are not enough.

## Required Implementation

Create or strengthen the product task runtime so it calls existing rightful owners:

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
- scripts only as thin callers

Scripts may prepare inputs, invoke the runtime, and print safe results. Scripts must not own primary task behavior.

## Hard Outcomes

Do not claim completion unless all pass:

1. At least six deterministic cases run through the product task runtime.
2. At least six explicit opt-in live or live-ready entries run through the same runtime.
3. At least four live entries execute through existing gates if safe.
4. At least three live entries reach complete or useful partial with task proof.
5. At least two write-capable entries reach dry-run through the same runtime.
6. At least one write-capable entry reaches reviewed isolated apply plus post-apply verification if safe.
7. Existing no-write and reviewed-apply safety checks remain passing.
8. Scripts are thin callers.
9. Deterministic and live paths share runtime logic.
10. Terminal truth remains evidence/result owned.

If task behavior stays mainly inside scripts or evaluation fixtures, do not claim completion.

## Valid Proof

Valid proof examples:

- code task has relevant verification after final change
- debug task has failure, bounded repair, and post-repair verification
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild
- live no-write task has provider call, safe context, no mutation, redaction, and task-relevant proof
- live write task has dry-run, explicit review authority, isolated apply, changed-file accounting, and post-apply verification

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- dry-run only
- review authority only
- apply without verification
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

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if needed
- docs/sprint/component-adoption-log.md

Rewrite priorities from measured mainline outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including product task runtime, live execution, provider request and response, tool policy, edit/dry-run/apply if touched, verification, repair, artifact workflow, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Live provider execution is allowed only through existing explicit opt-in gates and only if safe.

## Final Report

Report extracted code paths, adoption modes, owner domains changed, shared deterministic/live runtime evidence, live outcomes, write outcomes, script thinness, blockers, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

After commit, one push attempt is allowed. If push fails, do not retry.

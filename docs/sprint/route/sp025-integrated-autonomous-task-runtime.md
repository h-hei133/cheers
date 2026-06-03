# SP025 Integrated Autonomous Task Runtime

## Goal

Build a unified autonomous task runtime.

The project now has deterministic task capability, opt-in live no-write execution, and reviewed live write apply checks. The next task is to connect these into one product runtime instead of keeping task behavior mainly inside evaluation cases or verification scripts.

This is not a script, smoke, metadata, status, proof-only, event-only, or documentation-only task.

Do not use subagents.

## Core Direction

The target product runtime is:

short prompt
-> task state
-> context packet
-> plan
-> request packet
-> provider turn
-> tool, edit, or artifact action
-> observation
-> verification
-> repair or retry
-> proof
-> verdict

Deterministic and explicit opt-in live modes must share this runtime. The only allowed difference is the model-output source.

## Four-Level Component Adoption

Use the four-level adoption model:

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

Use SP020, SP021, SP022, SP023, and SP024 outcomes as evidence.

## Required Extraction

Inspect the mature local implementation and public docs already named in sprint docs for concrete task-loop behavior:

- task state progression
- context assembly
- request shaping
- provider turn handling
- tool/action loop
- observation carry-forward
- verification transition
- repair or retry transition
- artifact transition
- final verdict transition
- script or host invocation pattern

Do not stop at notes. Convert findings into local product code.

## Required Implementation

Create or strengthen one rightful runtime owner for autonomous task progression.

It must connect existing owners:

- context
- planning
- provider request and response
- tools and policy
- edit and dry-run or apply
- verification
- repair
- artifacts
- evidence and result
- host or evaluation
- scripts only as thin callers

Scripts may call the runtime. Scripts must not contain primary task behavior.

## Hard Gates

Do not claim completion unless all pass:

1. At least five deterministic task cases run through the unified runtime.
2. At least four explicit opt-in live or live-ready entries run through the unified runtime.
3. At least two live no-write entries complete or reach useful partial.
4. At least one write-capable entry reaches dry-run or reviewed isolated apply through the same runtime.
5. Existing no-write and reviewed-apply safety checks remain passing.
6. Complete outcomes have task-relevant proof and fake-complete controls.
7. Verification scripts are thin callers, not owners of task behavior.
8. Deterministic and live paths share runtime logic.
9. Terminal truth remains evidence/result owned.
10. Unsafe content remains redacted.

If deterministic and live paths still use separate task logic, do not claim completion.

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
- validation selected but not run
- repair attempted
- dry-run only
- review authority only
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

Rewrite priorities from measured runtime outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including unified runtime, provider request and response, tool policy, edit/dry-run/apply if touched, verification, repair, artifact workflow, host/evaluation, scripts, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

Live provider execution is allowed only through existing explicit opt-in gates and only if safe.

## Final Report

Report extracted behavior, adoption modes, shared deterministic/live paths, script thinness, owner domains changed, outcomes, blockers, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

After commit, one push attempt is allowed. If push fails, do not retry.

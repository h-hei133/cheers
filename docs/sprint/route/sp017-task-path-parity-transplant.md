# SP017 Task Path Parity Transplant

## Goal

Directly transfer mature task path behavior into this project and convert partial task bench outcomes into complete outcomes.

SP016 improved task assessment from failure to partial results, but the remaining dominant blocker is completion proof missing. This task must close that gap by inspecting the mature local implementation and public docs already named in sprint docs, adopting or porting concrete task path behavior, and implementing code that improves existing task cases.

This task is not complete if it only adds more labels, receipts, projections, status text, docs, or diagnostic detail.

Do not use subagents. The main worker must inspect, decide, implement, validate, and report.

## Required Three-Step Method

Step 1: Extract concrete task path behavior.

Inspect mature local implementation and public docs already named in sprint docs. Focus on how work moves from short prompt to useful result, not on broad architecture. Extract exact behavior for context selection, task request shaping, tool choice, verification execution, repair or correction, artifact validation, continuation freshness, and proof handoff.

Step 2: Adopt or port.

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating naming and content constraints. If that is not possible, use structured port or behavior-only alignment.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Step 3: Implement outcome improvement.

Write local code in rightful owners. The proof is task bench outcome improvement, not model completeness.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP016 task outcomes as product evidence.

## Target Cases

Improve at least four existing partial task cases to complete.

Priority cases:

- failed-check-repair
- rollback-recovery
- pathless-workspace-question
- source-report
- structured-artifact
- resume-from-context

The improved set must include:

- one debug or repair case
- one artifact or report case
- one continuation or context case
- one coding or workspace case

If fewer than three cases become complete, do not claim completion. Produce a blocker report instead.

## Required Implementation Areas

Inspect and change only rightful owners needed to complete the target cases:

- context selection
- planning execution
- provider request packet
- tool strategy
- verification execution
- artifact workflow
- repair loop
- runtime evaluation task bench
- evidence
- result
- host output if required
- replay and surface only if needed to expose proof facts

Do not add unrelated product layers.

## Completion Proof Requirements

A case can become complete only when it has task-relevant proof.

Valid proof examples:

- coding task has relevant verification run after final change
- debug task reproduces failure, applies bounded repair, then passes relevant verification
- report task has source receipts, scope check, content validation, and proof verdict
- structured artifact has schema or format validation and proof verdict
- continuation task proves freshness or rebuilds valid context before continuing

Invalid proof examples:

- provider output only
- tool executed
- artifact file exists
- validation selected but not run
- repair attempted
- host output emitted
- status rendered
- label changed from partial to complete

## Required Tests

Add or update tests proving:

- before and after outcomes for all target cases
- at least four cases complete
- adopted or ported behavior is covered by local owner tests
- completion is caused by behavior, not relabeling
- completion proof is task-relevant
- remaining partial cases name exact blockers
- evidence/result owns complete verdict
- unsafe content remains redacted

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become success by themselves:

- context selected
- plan created
- request packet shaped
- tool chosen
- tool executed
- verification selected
- verification attempted
- repair attempted
- artifact created
- artifact corrected
- host outcome emitted
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven or partial.

## Safety And Scope

Do not:

- use subagents
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

During development, product file names and product content must not contain process wording, comparison wording, provenance wording, or outside project names. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Rewrite priorities based on measured outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench tests
- context and planning tests
- provider request tests if touched
- tool policy tests if touched
- verification execution tests
- repair loop tests
- artifact workflow tests
- host evaluation tests if touched
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

## Completion Gates

Do not claim completion unless all gates pass:

1. Mature task path behavior is inspected and converted into concrete local code.
2. Four-level adoption decisions are recorded for concrete behavior used.
3. At least four target cases become complete.
4. The completed cases cover debug or repair, artifact or report, continuation or context, and coding or workspace.
5. Completion is proven by task-relevant evidence, not relabeling.
6. Terminal truth remains evidence/result owned.
7. Report-safe surfaces redact unsafe content.
8. Sprint docs are updated from measured outcomes.
9. Focused validation and diff checks pass.
10. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report behavior inspected, adoption mode used, owner domains changed, cases before and after, cases converted to complete, cases still partial, remaining blockers, files changed, tests added or updated, docs updated, validation commands and outcomes, final git status, commit hash, and push status.

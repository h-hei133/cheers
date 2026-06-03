# SP016 Autonomous Task Outcome Transplant

## Goal

Directly transfer autonomous task-completion capability into this project and improve existing task bench outcomes.

This is an outcome-first implementation task. It must inspect the mature local implementation and public docs already named in sprint docs, identify how mature task work is actually driven, then port, adopt, or implement the pieces needed to make current failed, partial, blocked, or not-proven task cases improve.

This task is not complete if it only adds new diagnostic models, status fields, event projections, receipts, surface text, or docs. The main proof is improved task case outcomes.

## Capability Target

The completed capability must support this lane:

short prompt
-> workspace discovery
-> context packet
-> task plan
-> provider request shaping
-> tool strategy
-> action
-> verification execution
-> failure diagnosis
-> repair or artifact correction
-> rerun verification
-> outcome classification
-> top blocker update
-> evidence/result truth boundary

The goal is to move task cases from failed, partial, blocked, or not-proven toward partial or complete without weakening truthfulness.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating this task's naming and content constraints. If required notices or copied files would require disallowed names or content, do not copy source. Use structured port or behavior-only alignment instead.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, provenance wording, or outside project names.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP014 and SP015 outcomes as product evidence. Current code, tests, command output, and safe runtime evidence remain the source of truth.

## Required Mature Capability Extraction

Inspect the mature local implementation and public docs for task-driving behavior, not just infrastructure shape.

Extract and use behavior for:

- workspace discovery
- context selection and expansion
- task prompt shaping
- planning and plan revision
- tool choice strategy
- verification execution
- failure diagnosis
- repair action
- artifact correction
- continuation handling
- progress and blocker reporting

Do not stop at a capability map. Use the extracted behavior to improve current task cases.

## Owner Domains

Inspect at least these owners:

- context
- planning
- provider/request
- provider/response
- tools
- tools/policy
- verification
- repair
- artifacts
- runtime/evaluation
- runtime/api/host
- runtime/loop
- edit
- evidence
- result
- session/replay
- session/presentation
- presentation/surface
- core/shell

Change the rightful owners required to improve task outcomes. Do not add unrelated product layers.

## Required Outcome Targets

Improve at least four existing task cases from SP014 or SP015.

Priority targets:

- failed-check-repair
- rollback-recovery
- source-report
- structured-artifact
- resume-from-context
- pathless-workspace-question

The improved set must include:

- at least one debug or repair case
- at least one artifact, report, or structured-output case
- at least one continuation or context case
- at least one coding or workspace case

Valid improvement examples:

- failed to partial
- failed to complete
- blocked to partial
- not-proven to partial
- not-proven to complete
- partial to complete
- unsupported to blocked with exact missing requirement only if it enables the next batch

If fewer than three cases improve, do not claim completion. Stop with a blocker report explaining why the transfer could not work.

## Allowed Implementation Scope

Allowed work includes:

- workspace discovery and context strategy
- task prompt packet
- tool-use policy
- verification execution
- repair action
- artifact validation and correction
- continuation freshness resolution
- bench runner outcome reporting
- small host or evaluation plumbing required to measure results

Forbidden shortcut:

- only adding fields
- only adding projections
- only adding receipts
- only updating status text
- only updating docs
- only making failure labels more detailed

## Required Tests

Add or update tests that prove outcome improvement.

Required coverage:

- before and after outcome for each improved case
- adopted or ported behavior tested under local owners
- workspace or context improvement tested
- provider prompt or tool strategy improvement tested if touched
- verification execution tested
- repair or artifact correction tested
- evidence/result truth tested
- redaction tested
- top blocker update tested

The test suite must prove that improved outcomes are caused by behavior, not by relabeling.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- workspace found
- context selected
- plan created
- provider request shaped
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

Missing proof stays not-proven.

## Safety And Scope

Do not:

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

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md if adoption decisions changed

Rewrite priorities based on measured case outcomes. Do not append progress logs.

The docs must distinguish:

- cases improved
- cases still failing
- adopted or ported behavior
- remaining blockers
- whether the current project should continue as product layer, engine boundary, or mixed direction

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench tests
- context and planning tests
- provider request or response tests if touched
- tool policy tests if touched
- verification and repair tests
- artifact tests
- host or evaluation tests
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests unless an existing explicit opt-in gate is intentionally selected and safe.

## Completion Gates

Do not claim completion unless all gates pass:

1. Mature task-driving behavior is inspected and converted into concrete local implementation.
2. Four-level adoption decisions are recorded for concrete behavior used.
3. At least four existing failed, partial, blocked, or not-proven task cases improve.
4. The improved cases cover debug or repair, artifact or report, continuation or context, and coding or workspace work.
5. Fewer than three improved cases means no completion claim.
6. Improved outcomes are proven by behavior changes, not relabeling.
7. Terminal truth remains evidence/result owned.
8. Report-safe surfaces redact unsafe content.
9. Sprint docs are updated from measured outcomes.
10. Focused validation and diff checks pass.
11. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report owner domains inspected, owner domains changed, adoption mode used and why, behavior adopted or ported, task cases before and after, cases improved, cases still failing, top blockers before and after, files changed, tests added or updated, negative and redaction controls, sprint docs updated, remaining weak areas, whether the direction still looks viable, validation commands and outcomes, final git status, commit hash, and push status.

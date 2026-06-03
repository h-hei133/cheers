# SP022 Autonomous Development Capability Transplant

## Goal

Aggressively transplant autonomous development capability into this project.

This task must inspect the mature local implementation and public docs already named in sprint docs, extract concrete task-driving behavior, then adopt, port, or implement it locally across the whole task path.

This task is not complete if it only adds models, labels, fields, status text, projections, proof records, docs, or one-off cases.

Do not use subagents.

## Required Outcome

The project must become visibly better at short-prompt autonomous work.

The target path is:

short prompt
-> workspace understanding
-> context assembly
-> task plan
-> request packet
-> tool strategy
-> action
-> verification
-> diagnosis
-> repair or artifact correction
-> proof
-> verdict
-> measured outcome

## Four-Level Component Adoption

Use the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed for narrow self-contained code only when license and notice requirements can be satisfied without violating naming and content constraints. If not, use structured port or behavior-only alignment.

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

Use SP020 and SP021 outcomes as evidence.

## Required Extraction

Inspect mature task-driving behavior for:

- workspace map and owner discovery
- related-file selection
- test and script discovery
- context packet construction
- prompt/request shaping
- tool choice policy
- task planning and revision
- verification execution
- failure diagnosis
- repair loop
- artifact/report/data workflow
- continuation freshness
- progress and blocker reporting
- bench and script execution

Do not stop at notes. Convert findings into local code.

## Implementation Scope

Allowed owner areas:

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
- evidence
- result
- session
- presentation only when needed for user-visible blockers
- scripts for repeatable task checks

Do not add unrelated product layers.

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

Existing explicit live gates may be used only when safe.

## Hard Outcome Gates

Do not claim completion unless all pass:

1. Existing complete task cases remain complete.
2. At least six new short-prompt task cases are added.
3. At least eighteen deterministic task cases are complete total.
4. At least four pathless workspace or context cases are complete.
5. At least three debug or repair cases are complete.
6. At least five artifact, report, or data cases are complete.
7. At least two continuation or resume cases are complete.
8. At least two opt-in no-write live cases pass or reach useful partial with exact proof if existing safe gates allow execution.
9. Every complete case has task-relevant proof and fake-complete negative controls.
10. If any gate cannot pass, continue improving. If blocked by safety or missing owner, produce a hard blocker report and do not claim completion.

## Valid Proof

Valid proof examples:

- code task has relevant verification after final change
- debug task has failed check, bounded repair, and post-repair verification
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild
- live no-write task has provider call, safe context, no mutation, redaction, and task-relevant answer proof

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- validation selected but not run
- repair attempted
- host output emitted
- status rendered
- relabeling

## Allowed Aggressive Work

Allowed:

- replace weak local task-path code
- structured-port mature task behavior
- adopt narrow source components when legal and safe
- add integrated task workflow behavior
- add repeatable scripts
- expand tests aggressively
- update proof owners if too narrow
- remove or bypass weak local paths when rightful owners replace them

Do not preserve weak architecture merely because it exists.

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

Rewrite priorities from measured outcomes. Do not append progress logs.

## Validation

Run focused validation for changed owners, including task bench, context, planning, provider request if touched, tool policy if touched, verification, repair, artifact workflow, host/evaluation, evidence/result, redaction, anti-false-success gate, result contract gate if needed, build if contracts/types/scripts changed, and git diff checks.

## Final Report

Report extracted behavior, adoption modes, owner domains changed, cases before and after, complete counts, live outcomes, hard blockers if any, files changed, tests, docs, validation commands, final git status, commit hash, and push status.

After commit, one push attempt is allowed. If push fails, do not retry.

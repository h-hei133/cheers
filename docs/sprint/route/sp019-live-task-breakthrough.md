# SP019 Live Task Breakthrough

## Goal

Push audited task paths from deterministic completion toward explicit opt-in live task execution.

This task is not another readiness, status, event, replay, or proof-field pass. It must make no-write or low-risk task cases executable through existing explicit gates where safe, or produce exact hard blockers that identify the missing owner and required fix.

Do not use subagents.

## Core Principle

The project has proven deterministic task paths and audited proof controls. The next goal is live task usefulness.

The task must answer:

- Which audited task cases can run with a real provider through an explicit gate?
- Which are blocked by provider readiness, auth readiness, manual review, write safety, verification, artifact validation, or continuation freshness?
- Which blocker can be fixed now without weakening safety?
- What live outcome is observed?

Readiness alone is not completion.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating naming and content constraints. If that is not possible, use structured port or behavior-only alignment.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Product code names, runtime fields, user-visible output, product file names, and product content must not contain process wording, comparison wording, source-history wording, or outside project names.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use SP017 and SP018 audited task proof and live readiness as product evidence.

## Target Cases

Start with no-write or low-risk cases:

- pathless-workspace-question
- source-report
- resume-from-context
- structured-artifact only if sandbox-safe
- live-provider-triage

Write-capable cases may only enter dry-run or manual-review readiness unless existing explicit gates safely allow them:

- single-file-edit
- coordinated-edit
- failed-check-repair
- rollback-recovery

## Required Live Path

Implement or strengthen the path:

task case
-> audited task proof requirements
-> live readiness check
-> provider and auth readiness
-> safe context packet
-> task-shaped request packet
-> allowed tool policy
-> verification or artifact validation plan
-> explicit opt-in gate
-> live execution or exact blocker
-> host/evaluation outcome
-> evidence/result truth boundary
-> updated blockers

## Required Behavior

The task must support:

- ready
- executed
- complete
- partial
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
- continuation stale
- provider output insufficient
- redaction blocked

For every live or live-ready case, record:

- task case id
- safe or unsafe class
- explicit gate used or missing
- provider readiness
- auth readiness
- allowed tool and write policy
- request packet status
- validation plan
- live outcome or hard blocker
- evidence/result status
- redaction status
- next fix

## Required Execution Rule

At least three no-write or low-risk cases must become live-ready with exact requirements.

At least two cases must execute through an existing explicit opt-in gate if safe.

If no case can execute, do not claim completion. Produce a hard blocker report that names the exact missing owner, config, gate, or safety requirement. Generic skipped or blocked is not acceptable.

## Allowed Fixes

Allowed work includes:

- provider/auth readiness plumbing
- explicit opt-in gate connection
- task request packet improvement
- context packet improvement
- tool policy for no-write tasks
- verification or artifact validation readiness
- host/evaluation live outcome reporting
- redaction checks
- exact blocker reporting

Do not add unrelated product layers.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become success by themselves:

- live readiness ready
- provider selected
- auth readiness present
- request packet shaped
- provider called
- tool executed
- artifact created
- verification attempted
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
- print, summarize, copy, clean, or modify private provider material
- enable provider defaults
- run live provider outside an existing explicit opt-in gate
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

Rewrite priorities from live outcomes and hard blockers. Do not append progress logs.

The docs must distinguish:

- deterministic audited complete
- live-ready
- live-executed
- live-complete
- live-partial
- blocked
- unsafe
- skipped with exact blocker
- remaining live task weakness

## Validation

Run focused validation for changed owners.

Expected validation includes:

- live readiness tests
- provider request tests
- host/evaluation tests
- task bench tests
- verification or artifact tests if touched
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

Live provider execution is allowed only through existing explicit opt-in gates and only if safe. If unavailable, validation must prove exact blocker reporting.

## Completion Gates

Do not claim completion unless all gates pass:

1. At least three no-write or low-risk cases are live-ready with exact requirements.
2. At least two cases execute through an existing explicit opt-in gate if safe, or a hard blocker report proves the exact missing gate/config owner.
3. Generic skipped or blocked results are eliminated.
4. Write-capable cases remain dry-run, manual-review, blocked, or unsafe unless safe gates already exist.
5. Terminal truth remains evidence/result owned.
6. Report-safe surfaces redact unsafe content.
7. Sprint docs are updated from live outcomes.
8. Focused validation and diff checks pass.
9. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report live cases, live-ready cases, executed cases, skipped or blocked cases with exact blockers, write-case status, owner domains changed, files changed, tests added or updated, docs updated, validation commands and outcomes, final git status, commit hash, and push status.

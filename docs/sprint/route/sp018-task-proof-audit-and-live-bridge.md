# SP018 Task Proof Audit And Live Bridge

## Goal

Audit the SP017 task-complete outcomes and add a safe bridge toward opt-in live task triage.

SP017 improved deterministic task outcomes. This task must prove those complete outcomes are real task-relevant completions, not fixture relabeling, host output, status text, artifact existence, provider output, or unchecked success flags.

This task must also prepare a default-off live-readiness bridge so the same task paths can later be exercised with real providers through existing explicit gates.

Do not use subagents.

## Required Method

1. Audit task proof.

For every complete task case, identify the exact task-relevant proof facts that make it complete.

2. Add negative controls.

For every proof class, remove or invalidate the required proof and prove the case downgrades to partial, failed, blocked, or not-proven.

3. Add live-readiness bridge.

Map each task case to ready, blocked, skipped, unsupported, or unsafe for opt-in live triage. Do not run live providers by default.

4. Update priorities.

Rewrite task priorities from audited outcomes, not labels.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Direct source adoption is allowed only for narrow self-contained code when license and notice requirements can be satisfied without violating naming and content constraints. If that is not possible, use structured port or behavior-only alignment.

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

Use SP017 outcomes as product evidence, but do not trust complete labels until audited.

## Target Cases

Audit all complete cases from SP017:

- single-file-edit
- coordinated-edit
- failed-check-repair
- pathless-workspace-question
- source-report
- structured-artifact
- resume-from-context

Keep rollback-recovery partial unless it gains real post-repair proof.

## Required Proof Audit

For each complete case, record:

- task kind
- required proof
- actual proof source
- verification or validation result
- evidence/task input
- result/task verdict
- what would downgrade completion
- redaction status
- live-readiness status

Valid proof examples:

- code task has relevant verification after final change
- debug task has failed check, bounded repair, and post-repair verification
- report task has source receipts, scope check, content validation, and verdict
- structured artifact has schema or format validation and verdict
- continuation task has freshness proof or valid context rebuild

Invalid proof examples:

- provider output only
- tool execution only
- artifact existence only
- validation selected but not run
- repair attempted
- host output emitted
- status rendered
- fixture label set to complete

## Required Negative Controls

Add tests that prove fake completion is rejected.

At minimum cover:

- code case with missing verification
- debug case with missing post-repair verification
- report case with missing source receipt
- structured artifact with invalid schema or format
- continuation case with stale context
- host output without task proof
- artifact existence without validation

Each control must downgrade the case and preserve exact blockers.

## Required Live Bridge

Add safe live-readiness facts for task cases.

The bridge must distinguish:

- ready
- blocked
- skipped
- unsupported
- unsafe
- missing provider config
- missing auth readiness
- unsupported task path
- verification unavailable
- artifact validation unavailable
- continuation stale
- manual review needed

Live bridge rules:

- default-off
- explicit opt-in only
- no manual provider secret inspection
- no private provider material printed, summarized, copied, cleaned, or modified
- skipped live triage is acceptable when blockers are explicit
- live behavior is not required for validation

## Owner Domains

Inspect and change only rightful owners needed:

- evidence/task
- result/task
- runtime/evaluation/task
- verification/execution
- artifacts/workflow
- repair/loop
- context/selection
- runtime/api/host if live readiness must surface there
- session/replay or presentation only if proof facts must be safely visible

Do not add unrelated product layers.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become success by themselves:

- context selected
- plan created
- request packet shaped
- tool chosen
- tool executed
- verification attempted
- repair attempted
- artifact created
- artifact corrected
- live readiness ready
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
- docs/sprint/component-adoption-log.md if adoption decisions changed

The docs must distinguish:

- audited deterministic task completion
- cases still partial
- fake-complete controls
- live-readiness blockers
- remaining proof gaps
- remaining live task weakness

Do not append progress logs. Rewrite stale priorities from audited outcomes.

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench tests
- task proof tests
- result verdict tests
- negative control tests
- verification execution tests
- artifact workflow tests
- repair loop tests
- host or live-readiness tests if touched
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or artifact types change
- rtk git diff --check
- rtk git diff --cached --check

## Completion Gates

Do not claim completion unless all gates pass:

1. Every complete SP017 case has audited task proof.
2. At least seven negative controls reject fake completion.
3. Rollback-recovery remains partial unless real proof is added.
4. Live-readiness bridge exists and remains default-off.
5. Live triage is either safely gated or explicitly skipped with blockers.
6. Terminal truth remains evidence/result owned.
7. Report-safe surfaces redact unsafe content.
8. Sprint docs are updated from audited outcomes.
9. Focused validation and diff checks pass.
10. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report audited cases, proof source for each complete case, fake-complete controls, rollback-recovery status, live-readiness status, owner domains changed, files changed, tests added or updated, docs updated, remaining blockers, validation commands and outcomes, final git status, commit hash, and push status.

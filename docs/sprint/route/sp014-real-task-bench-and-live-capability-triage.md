# SP014 Real Task Bench And Live Capability Triage

## Goal

Build a real task bench and live capability triage loop.

This is a reality-check task. It must measure whether the agent can complete useful work, where it fails, and what must be fixed next. It must not become another trusted-runtime surface expansion.

Trusted runtime behavior remains necessary, but it is not enough. This task must expose the gap between safe runtime lanes and real task completion.

This task is not complete if it only adds another deterministic runtime case, only updates docs, only adds a status field, only adds a serializer, or only proves isolated helper behavior.

## Capability Target

The completed capability must support this lane:

task case
-> workspace fixture
-> short user prompt
-> host or evaluation run
-> provider, tool, edit, artifact, or continuation path
-> task-relevant verification
-> outcome classification
-> failure attribution
-> top blocker summary
-> updated task-capability plan

The output must help answer:

- Can the agent complete the task?
- How much prompt detail did it require?
- Did it find the right context?
- Did it choose useful tools?
- Did it verify the result?
- Did it recover from failure?
- Did it falsely claim completion?
- What is the next highest-impact blocker?

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

For this task, prefer structured port or behavior-only alignment for task case schema, task rubrics, host summaries, live triage classification, and failure taxonomy.

Direct source adoption is allowed only when license and notice requirements can be satisfied without violating this task's naming and content constraints. If required notices or copied files would require disallowed names or content, do not copy source. Use structured port or behavior-only alignment instead.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Do not put process wording, comparison wording, provenance wording, or outside project names into product code names, runtime fields, user-visible output, product file names, or product content.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/task-capability-map.md
- docs/sprint/task-capability-gap-plan.md
- docs/sprint/component-adoption-log.md

Use docs as planning material only. Current code, tests, command output, and safe runtime evidence remain product evidence.

## Owner Domains

Inspect at least these owners:

- runtime/evaluation
- runtime/api/host
- runtime/events
- runtime/loop
- provider/request
- provider/response
- tools
- edit
- verification
- repair
- evidence
- result
- context
- planning
- session/replay
- session/presentation
- presentation/surface
- core/shell

Change only the owner domains required to build bench and triage capability. Do not start broad feature work unless a tiny low-risk fix is required to make bench output usable.

## Required Task Bench

Add a real task bench model with at least these case groups:

1. Coding edit
   At least two cases. Include one single-target edit and one multi-target edit.

2. Debug repair
   At least two cases. Include one failing test or failing verification case and one repair or rollback case.

3. Repository or workspace understanding
   At least one case where the prompt does not name the exact target file.

4. Docs or report task
   At least one case that produces a non-code written output or summary with source and scope expectations.

5. Data or artifact task
   At least one case that produces a structured output, data result, or artifact-like deliverable.

6. Continuation or resume task
   At least one case that requires prior session or compacted state to continue.

Each case must define:

- case id
- task kind
- short user prompt
- workspace or fixture setup
- allowed tools and allowed writes
- success rubric
- expected verification
- expected diff or artifact
- expected evidence/result condition
- expected outcome class
- failure attribution categories
- redaction expectations

## Outcome Classification

The bench must classify each run as one of:

- complete
- partial
- failed
- blocked
- skipped
- unsupported
- not-proven

The classification must be task-relevant. Provider call completion, tool execution, file write, artifact existence, host output, event emission, replay, surface rendering, or CLI status is not task success.

## Failure Attribution

Every non-complete result must include one or more failure categories:

- goal unclear
- missing user input
- context not found
- wrong context selected
- context insufficient
- planning weak
- tool strategy weak
- provider output insufficient
- provider failure
- edit failure
- verification not selected
- verification failed
- repair failed
- artifact invalid
- continuation stale
- authority missing
- unsupported capability
- environment issue
- redaction or safety block
- unknown

The bench must produce a top blocker summary from actual case outcomes.

## Live Capability Triage

Add an explicit live triage lane only if existing safe opt-in gates already support it.

Live triage must:

- remain default-off
- use explicit opt-in only
- use clean or isolated runtime state
- avoid manual provider secret inspection
- avoid printing, summarizing, copying, cleaning, or modifying private provider material
- classify skipped live cases as skipped with blockers
- never be required for normal validation

If safe live triage cannot run, the task must still complete with deterministic cases and a clear skipped-live report.

## Allowed Fixes

This task may fix:

- bench schema gaps
- host or evaluation summary gaps
- failure classification gaps
- redaction reporting gaps
- one small low-risk blocker that prevents the bench from producing useful evidence

This task must not launch broad feature work. If bench results show context, planning, provider prompting, artifact, or debug-loop weakness, record it as a blocker and update future priorities.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- bench case accepted
- provider called
- tool executed
- diff produced
- artifact created
- verification selected
- verification skipped
- host output emitted
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
- bypass sanctioned provider, host, session, tool, edit, execution, evidence, or result owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process wording, comparison wording, provenance wording, or outside project names. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/task-capability-gap-plan.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md if adoption decisions changed

Rewrite stale priorities based on measured blockers. Do not append progress logs.

The docs must distinguish:

- measured real task ability
- deterministic-only task ability
- skipped live triage
- top blockers
- next highest-impact batches
- current trusted runtime abilities that still do not prove task completion

## Validation

Run focused validation for changed owners.

Expected validation includes:

- task bench model tests
- runtime evaluation tests
- host API tests if host output changes
- provider/tool/edit/artifact exercised-lane tests as applicable
- evidence/result tests
- redaction tests
- anti-false-success gate
- result contract gate if terminal result shapes change
- package build if imports, contracts, runtime-facing types, host envelopes, or scripts changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests unless an existing explicit opt-in gate is intentionally selected and safe. Live triage is optional and must be skipped with blockers if unsafe or unavailable.

## Completion Gates

Do not claim completion unless all gates pass:

1. Real task bench model exists.
2. At least eight task cases exist across the required groups.
3. Outcomes include complete, partial, failed, blocked, skipped, and not-proven coverage in tests or fixtures.
4. Each case has task-relevant rubric and verification expectations.
5. Non-complete cases include failure attribution.
6. Top 3 blockers are produced from actual case results.
7. Live triage is either safely gated or explicitly skipped with blockers.
8. No synthetic or deterministic case is represented as broad real task ability.
9. Terminal truth remains evidence/result owned.
10. Report-safe surfaces redact unsafe content.
11. Sprint docs are updated by editing stale claims.
12. Focused validation and diff checks pass.
13. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report owner domains inspected, owner domains changed, adoption mode used and why, task bench implemented, task case groups, outcome classes covered, live triage status, top blockers, fixes made, files changed, negative and redaction controls, sprint docs updated, remaining weak areas, why terminal truth still belongs to evidence/result, validation commands and outcomes, final git status, commit hash, and push status.

# SP013 Task Capability Direction And Plan

## Goal

Shift the project from trusted runtime expansion toward trusted task completion.

This task is documentation and planning focused. Do not modify product code unless harmless inspection or validation requires it. The goal is to extract task-completion capability patterns from the mature local implementation and public documentation already named in sprint docs, compare them against this project, and produce an aggressive implementation direction for making the agent actually complete work.

Trusted behavior remains the innovation baseline, but trust alone is not useful if the agent cannot complete tasks. The next phase must focus on reliable task delivery across coding, software work, summaries, data analysis, document generation, slides, and future general agent workflows.

## Required Output Documents

Create or update these docs under docs/sprint:

1. docs/sprint/task-capability-map.md

Describe the capability model for an agent that can complete tasks. Cover coding and non-coding work. Include goal understanding, context acquisition, planning, tool strategy, execution, verification, debugging, recovery, continuation, artifact generation, reporting, and user collaboration.

2. docs/sprint/task-capability-gap-plan.md

Compare the current project against that capability model. Mark what is proven, partially proven, synthetic-only, live-provider weak, missing, or intentionally deferred. Group the next work into large implementation batches. Merge capabilities that should ship together.

3. docs/sprint/current-capability-summary.md

Update only claims affected by the new assessment. Do not overstate current ability. Separate trusted runtime capability from actual task completion capability.

4. docs/sprint/project-gap-and-priority-plan.md

Rewrite stale priorities if needed. The plan must become task-completion driven rather than infrastructure-completion driven.

5. docs/sprint/sprint-working-index.md

Register new durable docs and update status descriptions.

## Required Extraction Areas

Inspect current project docs and code first. Then inspect the mature local implementation and public docs named in the sprint docs for task-completion behavior.

Extract patterns for:

- goal and intent handling
- ambiguity handling and user collaboration
- repository or workspace discovery
- context selection and context expansion
- planning and plan revision
- tool choice strategy
- parallel read and safe mutation strategy
- debugging and failure diagnosis
- verification selection
- retry and recovery policy
- session continuation and compaction use during real tasks
- provider prompting and response shaping
- command or reusable capability behavior
- artifact workflows for documents, slides, data, and reports
- non-interactive host usage for automation
- evaluation cases that reflect real task completion
- product surfaces that help users understand progress and blockers

## Capability Separation

The docs must clearly distinguish:

1. Trusted runtime capability

The agent can act safely, preserve evidence, avoid false success, redact unsafe details, and report not-proven states.

2. Task completion capability

The agent can understand goals, find context, plan, execute, validate, recover, and deliver useful results without requiring overly detailed prompts.

3. Product workflow capability

The agent can support CLI, host, docs, artifacts, sessions, automation, and user interaction in a useful way.

4. Live execution capability

The agent works with real providers and real tasks, not only deterministic or synthetic fixtures.

## Planning Requirements

The new plan must be aggressive.

Do not create tiny batches that only add one field, one projection, one surface section, or one helper. Combine capabilities that must work together for a user-visible task.

Each proposed batch must include:

- goal
- task value
- owner domains
- implementation scope
- mature behavior to extract or port
- adoption mode from the four-level model
- tests and real-task checks
- completion gates
- forbidden shortcuts
- expected failure signals
- whether it improves trusted runtime, task completion, product workflow, or live execution

The plan must include at least these large directions:

- real task bench and live-provider capability triage
- repository or workspace intelligence and context strategy
- planning and tool-use policy
- live debug and repair loop
- artifact workflow capability for non-code tasks
- user collaboration and ambiguity handling
- provider prompting and response shaping
- product workflow and automation hardening
- optional product-layer or engine-boundary decision

## Four-Level Component Adoption

Keep the adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

For task-completion behavior, prefer structured port or behavior-only alignment unless a component is self-contained and license or notice requirements can be satisfied without violating naming/content constraints.

Every adoption proposal must update docs/sprint/component-adoption-log.md if it recommends a concrete component or behavior port.

Do not put process wording, comparison wording, provenance wording, or outside project names into product code names, runtime fields, user-visible output, product file names, or product content.

## Boundaries

Do not run live providers.

Do not manually read provider secret directories.

Do not modify product code except for harmless inspection or validation.

Do not add browser automation, external tool server behavior, dynamic loading, command allowlist expansion, arbitrary writer behavior, broad SDK server behavior, or new product execution paths.

Do not claim current task capability exists unless current code, tests, live runs, or completed evidence prove it.

## Validation

Because this is documentation-first, validation should include:

- consistency review across sprint docs
- removal or rewriting of stale priorities
- path sanity where practical
- rtk git diff --check
- rtk git diff --cached --check if staged

If product code changes unexpectedly, run focused tests and build.

## Completion Gates

Do not claim completion unless:

1. Task capability map exists.
2. Task capability gap plan exists.
3. Existing sprint docs are updated and stale infrastructure-first priorities are rewritten.
4. Trusted runtime capability and task completion capability are clearly separated.
5. Large future batches are aggressive and merge related capabilities.
6. Four-level adoption guidance is preserved.
7. Current live-provider weakness and real-task weakness are stated honestly.
8. Validation and diff checks pass.
9. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report docs created or updated, stale claims removed, mature task-capability areas extracted, current proven task abilities, current weak areas, aggressive future batches, adoption recommendations, validation commands and outcomes, final git status, commit hash, and push status.

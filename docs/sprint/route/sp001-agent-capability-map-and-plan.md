# SP001 Agent Capability Map And Plan

## Goal

Start a new sprint chapter focused on full capability acquisition and planning.

This task is not an implementation task. Do not modify product code unless needed only to inspect current behavior through tests or type checks. The goal is to build a durable sprint knowledge base under docs/sprint that captures the complete mature agent capability system, compares it against this project, and creates an aggressive but bounded development plan.

This work should replace the previous one-small-slice rhythm. The expected output is a complete capability map and a practical execution plan for bringing this project closer to a mature agent runtime across all major capability areas.

## Required Output Documents

Create or update documents under docs/sprint.

Required documents:

1. docs/sprint/current-capability-summary.md
   Summarize what this project has already absorbed and implemented so far. Include the recent end-to-end lane, continuation-aware request handoff, verification and repair readiness, product completion consumer, tool outcome to next action, event projection, replay-safe carry-forward, product surface, and evidence/result truth boundary.

2. docs/sprint/mature-agent-capability-map.md
   Build a complete capability map from the mature local implementation and public documentation named in the existing blueprint. Cover all major runtime capabilities, not just the parts already used.

3. docs/sprint/project-gap-and-priority-plan.md
   Compare this project against the mature capability map. Group gaps by priority and development batch. The plan should be aggressive enough to meaningfully increase speed, but still respect this project ownership and truthfulness rules.

4. docs/sprint/sprint-working-index.md
   A short index that explains what each sprint document is for, which documents are current, which obsolete or duplicate sections were removed, and what should be updated after future work.

You may create additional docs under docs/sprint only if they clearly reduce complexity. Prefer editing, merging, deleting, or rewriting over endless appending.

## Required Coverage

The mature capability map must cover:

- product lifecycle from user input to final result
- interactive CLI behavior
- non-interactive or machine-readable mode
- session creation, resume, branching, continuity, and summaries
- compaction or context reduction
- turn loop and multi-turn runtime behavior
- provider and model abstraction
- provider request preparation and blockers
- tool registration, tool calling, tool results, and tool policy
- command system or reusable capability boundary
- event stream and runtime events
- terminal and product presentation
- extension or package-like capability model
- configuration and project setup
- permission and execution boundary
- verification, repair, failure, and recovery behavior
- truthfulness and false-success prevention
- packaging and distribution shape
- testing and validation strategy
- areas this project should intentionally not copy

## Existing Project Summary Requirements

The current project summary must include:

- TypeScript product runtime and control plane
- evidence/result terminal truth ownership
- Agent Loop governed runtime substrate
- context and planning substrate
- provider request boundary
- continuation-aware request handoff
- end-to-end turn lane
- tool outcome next action
- runtime event projection
- replay-safe carry-forward
- product surface rendering
- verification and repair readiness
- not-proven claim preservation
- current missing areas

## Planning Requirements

The priority plan must include:

- immediate sprint batches
- medium-term runtime capability batches
- large future capability areas
- owner domains likely involved
- validation expectations
- risks and anti-goals
- what can be done aggressively
- what must remain conservative because of safety, secrets, execution, or truthfulness

Each batch must include:

- goal
- user-facing value
- owner domains
- expected files or areas
- required tests
- forbidden shortcuts
- completion condition

Completion conditions must be strict. A batch cannot be considered done if it only adds a field, only updates presentation, only writes docs, or leaves the runtime path unproven when the batch claims behavior.

## Editing Policy

This sprint knowledge base is living material.

Do:

- update existing sections when new understanding replaces old understanding
- delete obsolete duplicated sections
- merge overlapping plans
- rename sprint docs if names are unclear and no external contract depends on them
- keep documents concise but substantial
- keep the index current

Do not:

- append endlessly without pruning
- create transient progress logs
- preserve outdated claims for history
- create product code names or runtime fields from process wording
- use outside project names in product code, filenames, runtime fields, or user-visible output
- turn sprint docs into proof that product behavior exists

## Inspection Requirements

Inspect the existing sprint and build documents first, especially the capability blueprint created previously.

Inspect the target repository current implementation enough to validate the already-completed capability summary.

Then inspect the mature local implementation and public documentation named in the blueprint to cover parts not yet understood.

Use the mature implementation and docs for capability extraction only. Do not copy code, type names, file names, runtime fields, user-visible wording, layout, or architecture wholesale.

## Tooling Requirements

Use semantic MCP navigation for current project ownership and symbol checks.

Use parallel subagents aggressively:

- one for summarizing already completed project capabilities
- one for mature implementation capability extraction
- one for public documentation capability extraction
- one for gap and priority planning
- one for truthfulness, safety, and validation constraints

Use the planning plugin only as decomposition discipline. Do not start a separate workflow system, tracker, issue or milestone flow, archive, or external process.

## Boundaries

Do not run real provider.

Do not manually read provider secret directories.

Do not modify product code unless needed for harmless inspection or validation.

Do not add browser automation, external tool server behavior, dynamic plugin loading, broad SDK or RPC server behavior, command allowlist expansion, or writer behavior.

Do not move terminal truth away from evidence/result in any recommendation.

Do not claim a capability exists unless current code or prior completed work proves it.

## Validation

Because this is documentation-first, validation should include:

- markdown review for consistency and duplicate removal
- path and link sanity where practical
- git diff --check
- git diff --cached --check if staged
- no build required unless product code changes

If product code is changed unexpectedly, run focused tests and build before committing.

## Final Report

Report:

- sprint docs created or updated
- obsolete or duplicate content removed
- mature capability areas covered
- current project capabilities summarized
- major gaps identified
- recommended aggressive batches
- areas intentionally not copied
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit after the sprint knowledge base is internally consistent. After commit, one push attempt is allowed. If push fails, do not retry.

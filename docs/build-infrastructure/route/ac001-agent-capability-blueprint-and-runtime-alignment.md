# AC001 Agent Capability Blueprint And Runtime Alignment

## Goal

This is a large capability-alignment task.

The goal is to first study the mature local agent implementation and its public documentation deeply enough to produce a capability blueprint document, then use that blueprint to align this repository against the missing high-value runtime capabilities in one larger implementation pass.

This is not a one-file slice and not a narrow projection task. The expected outcome is:

1. a written capability blueprint derived from the mature implementation and documentation
2. a gap analysis against the current target repository
3. a prioritized implementation batch
4. concrete runtime improvements across multiple rightful owner domains
5. focused validation proving the implemented behavior

## Required Sources

Target repository:

/home/wang/projects/coding-agents

Mature local implementation:

/home/wang/projects/pi

Public documentation:

https://pi.dev/docs/latest

Inspect the target repository first enough to understand current owners and existing capability surfaces. Then inspect the mature implementation and documentation deeply enough to build a real capability blueprint.

The mature implementation and documentation are read-only. Do not copy source code, type names, file names, runtime field names, user-visible wording, folder layout, or architecture wholesale. Extract capability patterns and product behavior only.

## Required Blueprint Document

Create a new document:

docs/build-infrastructure/agent-capability-blueprint.md

The document must be concise but substantial. It must not be a transient progress log. It should become a working blueprint for future implementation.

The document must include:

- capability map of the mature agent system
- lifecycle model from user input to final result
- session and continuation model
- tool call and tool result model
- model/provider boundary model
- event stream and product surface model
- compaction or context reduction model
- extension, command, or reusable capability model
- package or distribution model if relevant
- truthfulness and failure reporting model
- comparison against this repository
- missing capabilities grouped by priority
- recommended implementation batches

Important naming rule for the blueprint and all development artifacts:

Do not put process-history wording, comparison wording, study wording, or names of outside codebases into product file names, product type names, runtime fields, user-visible output, or durable product content. The blueprint may describe capability patterns, but should not make product code depend on provenance.

## Required Implementation Batch

After writing the blueprint, implement a larger batch of improvements in this repository.

Do not stop after a tiny isolated change. Select a batch that materially improves parity with the mature capability model while staying inside current architecture boundaries.

The batch should include at least three connected improvements across at least three rightful owner domains.

Candidate areas:

- session continuation and resume semantics
- next-turn loop decision behavior
- tool result to runtime action behavior
- event stream behavior facts
- context compaction or context handoff readiness
- command or reusable capability registration seam
- provider request preparation boundary
- terminal or product surface status clarity
- verification or repair behavior continuation
- result and evidence projection integrity

Pick the batch after the blueprint and gap analysis. The selected batch must be internally coherent and should move a real user-facing runtime path forward.

## Strong Boundaries

Do not implement everything.

Do not:

- build a full autonomous agent in one task
- copy implementation code
- copy architecture names or public wording
- add dynamic external plugin loading
- add browser automation
- add external MCP behavior
- add SDK or RPC server behavior unless it is selected as a bounded internal seam
- add real provider calls
- read provider secrets
- broaden command allowlists
- add new writer behavior unless required by the selected batch and already supported by existing permission boundaries
- hide behavior in compatibility shims
- weaken tests
- mass-rebaseline snapshots
- move terminal truth out of evidence/result

## Architecture Rules

TypeScript remains the product runtime and control plane.

Use rightful owner domains. Likely domains include:

- runtime
- session
- turn
- context
- planning
- tools
- provider
- policy
- evidence
- result
- verification
- repair
- presentation

Compatibility and entrypoint surfaces should stay thin unless their public contract truly owns coordination.

If a capability in the mature system is grouped differently, preserve this repository's owner boundaries.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- model output
- provider call
- tool call attempt
- tool result existence
- event emission
- session carry-forward
- continuation readiness
- compaction summary
- command registration
- presentation rendering
- repair proposal
- repair authority
- repair apply without post-repair verification

Skipped, blocked, partial, failed, unknown, and not-proven states must remain visible.

Every implemented capability must preserve missing proof instead of converting it into success-like status.

## Tooling Requirements

Use semantic MCP navigation for focused owner discovery, symbol lookup, references, and diagnostics before broad text search.

Use parallel subagents aggressively:

- one for mature implementation and documentation capability extraction
- one for target repository current capability map
- one for gap analysis and batch selection
- one for truthfulness, architecture, and validation risks
- one for tests and validation surface

Use the spec decomposition plugin only as task planning discipline. Do not start a full external workflow, tracker, issue or milestone flow, archive, or extra process system.

## Suggested Execution Plan

1. Read project rules.
2. Inspect target owners and current capability surfaces.
3. Inspect the mature implementation and documentation.
4. Write the capability blueprint.
5. Produce a gap matrix inside the blueprint.
6. Select one coherent multi-domain implementation batch.
7. Implement the batch.
8. Add or update focused tests.
9. Run focused validation and build when required.
10. Commit and perform one push attempt.

## Validation

Run focused validation matching touched files and behavior.

Expected validation may include:

- runtime loop tests
- session continuation or replay tests
- turn bundle tests
- tool result tests
- event projection and stream tests
- provider request boundary tests
- context or compaction tests if touched
- presentation tests if output changes
- verification or repair tests if touched
- result or evidence tests if terminal projection is touched
- build for packages/ts-shell when imports, contracts, or runtime-facing ownership changed
- git diff --check
- git diff --cached --check

Do not run live provider tests.

Classify any failing validation before changing implementation or tests.

## Final Report

Report:

- blueprint document created
- mature capability areas inspected
- target owner domains inspected
- gap categories found
- selected implementation batch and rationale
- files changed
- behavior implemented
- remaining missing proof or not-proven claims
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit the change. After commit, one push attempt is allowed. If push fails, do not retry.

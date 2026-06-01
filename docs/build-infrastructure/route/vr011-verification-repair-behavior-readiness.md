# VR011 Verification Repair Behavior Readiness

## Goal

Build the first behavior-facing readiness layer for the verification and repair chain.

This task must not expand product surface, replay packet rendering, or completion packet projection. It must identify and connect the minimum runtime-facing entry points needed for this chain:

verification failed
-> repair required
-> repair proposal
-> explicit authority
-> repair apply
-> post-repair verification
-> verdict

The expected outcome is a small, test-backed behavior readiness path that shows how the runtime can move from failed verification facts into repair-needed behavior without claiming repair success early.

## Current Baseline

The previous work added a higher-level product completion consumer. That consumer is observation-only and does not own terminal truth.

VR011 must build on that state without moving terminal truth away from evidence/result ownership.

## Required Boundaries

- Evidence/result remains the only owner of terminal success, failure, partial, blocked, stopped, and not-proven status.
- Runtime loop or policy code may decide next action, but it must not upgrade status to success.
- Product surface may render facts only.
- Session replay may carry safe facts only.
- Repair proposal is not repair success.
- Repair apply without post-repair verification is not repair success.
- Failed, blocked, skipped, partial, unknown, and not-proven states must stay visible.

## Required Audit

First inspect the current target implementation and identify existing owners for:

- verification result facts
- failed verification classification
- repair required facts
- repair proposal facts
- repair authority facts
- repair apply observation facts
- post-repair verification facts
- verdict candidate and result projection
- loop next-action or policy decision seams
- existing tests that already cover any of these facts

Use focused semantic navigation and parallel subagents where helpful. Avoid broad repository reading unless focused navigation cannot answer ownership or caller questions.

Do not inspect outside codebases for this task unless a concrete blocker remains after target implementation inspection.

## Implementation Scope

Implement the smallest behavior readiness connection that can be proven with focused tests.

Allowed work:

- add or extend a rightful owner under runtime, policy, verification, repair, evidence, result, or session if that owner already matches the responsibility
- add a small behavior readiness model if no current owner can safely express the chain
- connect failed verification facts to a repair-required next-action candidate
- preserve proposal, authority, apply, post-repair verification, and verdict as explicit separate states
- expose missing proof as not-proven facts
- add negative controls that prove no success is inferred from proposal, authority, apply, render, packet, or carry-forward
- update tests close to the touched owner domains

Forbidden work:

- do not implement full automatic repair generation
- do not call a real provider
- do not add new writer behavior
- do not broaden command allowlists
- do not add browser, MCP external tool, SDK, RPC, or extension runtime behavior
- do not perform schema migration unless the current code proves it is required
- do not move terminal truth into runtime loop, session, presentation, or adapter code
- do not create product files or product content containing process-title wording, cross-project wording, or outside project names
- do not add business logic to compatibility shims

## Design Requirements

The behavior readiness path should answer:

1. When verification fails, what fact proves that repair is required?
2. What fact distinguishes repair-required from repair-proposed?
3. What fact proves explicit authority exists?
4. What fact proves apply was attempted?
5. What fact proves post-repair verification ran and passed or failed?
6. What fact blocks terminal success when any required step is missing?
7. What next action should be exposed when the chain is incomplete?

If existing models already express these states, prefer wiring and tests over new types.

If new types are required, keep names domain-based and short. Let folders carry context.

## Validation

Run focused validation matching touched files.

Expected validation includes, as applicable:

- focused tests for verification or repair behavior facts
- focused tests for runtime loop or policy next-action behavior if touched
- focused tests for result/evidence terminal projection if touched
- focused tests for session replay only if safe carry-forward is touched
- focused tests for product surface only if rendering changes are made
- build for packages/ts-shell if imports, owners, or runtime-facing contracts change
- git diff --check

Do not run live provider tests.

Do not claim validation passed unless each command actually ran and passed. Classify any failure as product behavior drift, stale expectation, harness/setup drift, obsolete scenario, future capability expectation, environment/flaky issue, or unrelated pre-existing failure.

## Final Report

Report:

- owner domains inspected
- files changed
- behavior readiness chain implemented
- which parts remain not proven
- why terminal truth is still owned by evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

Commit the change. After commit, one push attempt is allowed. If push fails, do not retry.

# SP005 Complete Code Mutation Recovery Runtime

## Goal

Build the complete code mutation and recovery runtime.

This is a major capability-system task. It must turn the current provider and tool loop into a safe coding action path by proving mutation authority, stale-read protection, snapshot or restore planning, apply observation, task-relevant verification, rollback or recovery decision, repair eligibility, post-repair verification, events, replay, product surface, CLI/session status, and evidence/result verdict behavior.

This task is not complete if it only adds a writer flag, only adds an edit projection, only adds a rollback model, only adds display text, only writes docs, or only proves isolated helpers.

## Capability Target

The completed capability must support this controlled lane:

user turn input
-> synthetic provider tool call
-> tool policy
-> mutation authority decision
-> stale-read check
-> snapshot or restore plan
-> apply attempt through existing sanctioned edit or execution boundary
-> apply observation
-> task-relevant verification planning
-> verification result
-> rollback or repair recovery decision
-> optional repair apply observation
-> post-repair verification
-> result-owned verdict
-> runtime events
-> replay-safe carry-forward
-> product surface
-> CLI/session status envelope

Synthetic provider and deterministic fixtures may drive the lane. Do not run live providers.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- edit
- edit/result
- edit/multifile
- runtime/execution
- tools
- tools/policy
- turn
- runtime/loop
- runtime/events
- provider/response
- verification
- repair
- evidence
- result
- session/replay
- session/presentation
- presentation/surface
- core/shell

Change at least seven rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/edit
- packages/ts-shell/src/runtime/execution
- packages/ts-shell/src/tools
- packages/ts-shell/src/tools/policy
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/verification
- packages/ts-shell/src/repair
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- nearby owner tests

## Required Runtime Behavior

Implement a complete mutation recovery lane with these properties:

1. Mutation requests require explicit authority facts.
2. Dry-run, preview, permission-pending, denied, blocked, approved, attempted, applied, failed, rolled-back, repair-proposed, repair-applied, verified, and not-proven states remain distinct.
3. Stale-read protection runs before mutation authority is consumed.
4. Snapshot or restore planning exists before mutation is attempted.
5. Apply attempts use existing sanctioned edit or execution boundaries.
6. Apply observation is not success.
7. Verification planning is task-relevant and separate from apply observation.
8. Verification skipped, blocked, not-run, failed, or incomplete cannot become success.
9. Failed verification can produce rollback-needed, repair-needed, or await-user next action.
10. Rollback or restore observation is explicit and cannot hide the original failure.
11. Repair proposal, repair authority, repair apply, and post-repair verification remain separate.
12. Result-owned verdict is the only complete path.
13. Events, replay, product surface, and CLI/session status consume the same owner facts.
14. Redaction excludes raw old text, new text, raw command output, raw provider output, secrets, and patch bodies from report-safe surfaces.

## Required State Coverage

Tests must cover at least these states:

- mutation denied
- mutation permission pending
- stale-read blocked
- snapshot unavailable
- apply attempted but failed
- apply succeeded but verification not run
- verification failed after apply
- rollback required
- rollback succeeded but task still not complete
- repair proposed only
- repair applied without post-repair verification
- post-repair verification failed
- post-repair verification passed and result verdict complete
- raw edit text redacted from replay and presentation
- synthetic provider tool call to mutation lane remains non-success until result proof

## Required Integration Tests

Add at least three integration tests:

1. Happy recovery lane: synthetic provider requests a controlled mutation, authority exists, stale-read passes, apply observation exists, verification fails, repair or rollback path runs, post-repair verification passes, and result-owned verdict completes.

2. Blocked mutation lane: authority missing, stale-read stale, or snapshot unavailable blocks mutation; events, replay, product surface, and CLI/session status show blocker; terminal success remains false.

3. Apply-only negative lane: mutation applies but verification is missing or failed; no surface claims success; result remains incomplete or failed; missing proof remains visible.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- synthetic provider request
- mutation request
- authority granted
- stale-read passed
- snapshot created
- apply attempted
- apply succeeded
- rollback attempted
- rollback succeeded
- verification planned
- verification command exit zero without result proof
- repair proposed
- repair authorized
- repair applied
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add arbitrary writer behavior outside existing sanctioned edit or execution boundaries
- bypass ExecutionService or existing edit owners
- hide behavior in compatibility shims
- make terminal text the runtime API
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven controlled mutation and recovery runtime
- still unproven broad parallel mutation if not completed
- still unproven live provider behavior
- still unsupported dynamic execution areas
- still unproven storage-backed branch and compaction runtime if not completed

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- edit owner tests
- runtime execution tests if touched
- tool policy and dispatch tests
- provider synthetic lane tests
- runtime loop tests
- runtime event tests
- session replay tests
- CLI/session status tests
- product surface tests
- verification and repair tests
- evidence/result verdict tests
- anti-false-success gate
- package build if imports, contracts, or runtime-facing types changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Controlled mutation lane exists.
2. Authority, stale-read, snapshot or restore planning, apply observation, verification, rollback or repair, post-repair verification, and result verdict are connected.
3. At least three integration tests prove happy recovery, blocked mutation, and apply-only negative lanes.
4. At least fourteen required states are covered by tests.
5. At least seven owner domains are changed or justified as already compliant.
6. Events, replay, product surface, and CLI/session status consume the same owner facts.
7. Terminal truth remains evidence/result owned.
8. Raw edit text and unsafe details are redacted from report-safe surfaces.
9. No live provider or secret access occurs.
10. Sprint docs are updated by editing stale claims.
11. Focused validation and diff checks pass.
12. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- mutation recovery lane implemented
- states covered
- integration tests added
- files changed
- negative controls added
- redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

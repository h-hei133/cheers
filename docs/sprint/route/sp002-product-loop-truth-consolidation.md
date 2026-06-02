# SP002 Product Loop Truth Consolidation

## Goal

Make the current product loop status story coherent, audited, and hard to regress.

This is a large implementation batch. It must consolidate the runtime loop trajectory, completion packet, runtime events, replay-safe carry-forward, product surface, and evidence/result verdicts into one verified product path.

The task is not complete if it only adds a field, only changes rendering, only writes docs, only updates one unit test, or only creates a helper that is not used by the product path.

## Why This Matters

The sprint plan identifies product loop truth consolidation as the first immediate batch. The current loop substrate is broad, but it is not yet proven as the complete product path owner. Product status can only be considered trustworthy when the same fixture proves that every layer preserves the same status without upgrading incomplete work into success.

## Required Starting Point

Read these sprint docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/mature-agent-capability-map.md
- docs/sprint/project-gap-and-priority-plan.md

Use these docs as planning material, not as product evidence. Current code and tests remain the source of truth.

## Owner Domains

Inspect at least these owner domains:

- runtime/loop
- runtime/events
- session/replay
- presentation
- evidence
- result
- tools
- turn
- provider/request
- verification
- repair

Change at least five rightful owner domains unless the final report proves one inspected domain already satisfies the required product path without modification.

Likely implementation areas include:

- packages/ts-shell/src/runtime/loop/trajectory.ts
- packages/ts-shell/src/runtime/loop/completionPacket.ts
- packages/ts-shell/src/runtime/loop/finalization.ts
- packages/ts-shell/src/runtime/events/projection.ts
- packages/ts-shell/src/runtime/events/stream.ts
- packages/ts-shell/src/session/replay/state.ts
- packages/ts-shell/src/presentation/surface/model.ts
- packages/ts-shell/src/evidence/projection/repair/verdict.ts
- packages/ts-shell/src/result/projection/repair/verdict.ts
- nearby owner tests

## Required Product Path Matrix

Create or consolidate a single product path matrix that covers at least these states:

- result-owned complete proof
- failed verification
- repair required
- repair proposed only
- repair authority only
- repair applied without post-repair verification
- post-repair verification failed
- blocked request preparation
- blocked or failed tool outcome
- partial or stopped loop
- waiting for user action
- missing proof

For every state, the matrix must define:

- loop trajectory status
- completion packet status
- event projection facts
- replay-safe carry-forward facts
- product surface status
- evidence/result terminal verdict
- next action
- not-proven claims
- terminalSuccessClaim behavior

## Required Implementation

Implement the matrix through real owner code and tests.

Required behavior:

1. Result-owned complete proof is the only path that can produce terminal success.
2. Every partial, blocked, failed, stopped, waiting, missing-proof, proposal-only, authority-only, or apply-only state remains non-success.
3. Runtime loop can report control state and next action, but cannot own terminal truth.
4. Runtime events project facts and never upgrade success.
5. Replay carries only safe facts and never raw transcript, secret, raw provider output, patch text, or command output.
6. Product surface renders the same owner facts without reinterpretation.
7. Evidence/result verdicts remain the terminal proof boundary.
8. The same product path fixture must feed at least runtime loop, events, replay, presentation, and evidence/result tests.
9. Sprint docs must be updated after implementation to remove stale gaps and record the new proven capability.

## Required Tests

Add or update focused tests that prove the full product path matrix.

Required test coverage:

- one full product path fixture for complete proof
- one full product path fixture for missing proof
- one full product path fixture for blocked request or blocked tool outcome
- one full product path fixture for repair proposal only
- one full product path fixture for repair apply without post-repair verification
- one full product path fixture for post-repair failed verification
- replay-safe carry-forward tests for safe facts only
- event projection tests for non-success states
- product surface tests that match event/replay/result facts
- evidence/result tests proving terminal success only with complete proof
- anti-false-success gate if terminal wording or result path changes

Do not weaken assertions. Do not mass-rebaseline snapshots. If an existing test is stale, classify it and update it to be stricter under the current contract.

## Sprint Doc Update

After product code and tests are complete, update the sprint docs:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if status or update rules changed

Use editing, deletion, and replacement where needed. Do not append stale progress logs.

The docs must distinguish:

- newly proven product loop truth consolidation
- still unproven CLI envelope
- still unproven branch and compaction runtime
- still unproven host contract
- still unsupported dynamic execution areas

## Strict Non-Goals

Do not:

- call a real provider
- read provider secret directories
- add browser automation
- add external tool server behavior
- add dynamic loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add new writer behavior
- move terminal truth out of evidence/result
- make terminal text the runtime API
- hide behavior in compatibility shims
- claim success from event emission, replay, presentation, request readiness, tool outcome, repair proposal, authority, or apply-only state

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Validation

Run focused validation for every changed owner domain.

Expected validation includes:

- runtime loop tests
- completion packet or finalization tests
- runtime event projection and stream tests
- session replay tests
- product surface tests
- evidence/result verdict tests
- tool or provider request tests if touched
- anti-false-success gate when applicable
- package build if imports, contracts, or runtime-facing types changed
- git diff --check
- git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Product path matrix exists in code or tests.
2. At least five owner domains were changed or justified as already compliant.
3. Complete proof is the only terminal success path.
4. At least six non-success states are proven non-success across loop, events, replay, presentation, and evidence/result.
5. Replay-safe facts are proven safe.
6. Sprint docs are updated by editing stale claims, not appending logs.
7. Focused validation and diff checks pass.
8. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- product path matrix states covered
- files changed
- behavior implemented
- negative controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

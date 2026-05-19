# Route 145: Session substrate seam extraction

## Goal

Extract stable Session / Continue substrate seams now that the package baseline is green.

Route 144 closed the package-level baseline:

- full `runMvpIntegratedFlow.test.ts`: `151 passed`
- `packages/ts-shell` package sweep: `2051 passed / 1 skipped`

That means Route 145 should stop being failure-driven and return to architecture-driven modularization.

Route 145 owns the next high-value central module: `SessionManager.ts`.

This route should extract pure or near-pure session seams while preserving behavior:

- transcript/event codecs
- session summary projection
- continue/replay evidence projection
- current-session metadata projection
- compact/checkpoint summary projection
- recovery/reentry status projection where safe

This is a substrate cleanup route, not a schema migration.

## Expected outcome

By the end of Route 145:

1. `SessionManager.ts` has less inline codec/projection/summary construction.
2. Session persistence behavior is unchanged.
3. Transcript/event file format is unchanged.
4. `/continue`, replay, compact, approval memory, and current-session behavior remain stable.
5. Extracted helpers have focused tests.
6. Package-level green baseline remains green.
7. Future SessionManager work has clearer seams for codec, projection, replay, and persistence.

## Required inputs

Read:

- `docs/architecture/module-backlog.md`
- `docs/architecture/session-manager-boundary.md`
- `docs/architecture/continuation-lineage-cleanup.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/runmvp-package-closeout.md`
- `docs/architecture/policy-result-boundary.md`
- `docs/architecture/capability-contract.md` if present in repo

Use Route 144 package green baseline as the safety gate.

## Reference scan

Use references only for session/event/replay/compact boundaries.

Primary:

- `/home/wang/projects/source-claudecode`
- `/home/wang/projects/opencode`
- `/home/wang/projects/OpenHands`
- `/home/wang/projects/gemini-cli`

Secondary:

- `/home/wang/projects/inspect_ai`
- `/home/wang/projects/mini-swe-agent`

Budget:

- ClaudeCode: max 10 files
- opencode: max 10 files
- OpenHands: max 8 files
- gemini-cli: max 8 files
- Inspect AI + mini-swe-agent: max 8 files total

Focus:

- session resume / compact / restore
- transcript event encoding
- message/event persistence
- current-session selection
- replay-safe summaries
- durable status projection
- recovery/reentry surfaces
- test patterns for session continuity

Do not study browser/edit/provider internals unless a session helper directly touches their evidence summaries.

## Files

Likely touched:

- `packages/ts-shell/src/session/SessionManager.ts`
- existing session helpers:
  - `durableStatusProjection.ts`
  - `currentSessionSelection.ts`
  - `sessionReplayBuilder.ts`
  - approval memory codec/projection files if present
- session tests:
  - `SessionManager.test.ts`
  - current-session / replay / compact / approval memory tests if present

Likely new files:

- `packages/ts-shell/src/session/sessionEventCodec.ts`
- `packages/ts-shell/src/session/sessionSummaryProjection.ts`
- `packages/ts-shell/src/session/sessionContinuationProjection.ts`
- `packages/ts-shell/src/session/sessionCompactProjection.ts`
- `packages/ts-shell/src/session/sessionMetadataProjection.ts`
- `packages/ts-shell/src/session/sessionProjection.test.ts`
- `docs/architecture/session-substrate-seams.md`

Optional, only if clean:

- `packages/ts-shell/src/session/sessionPaths.ts`
- `packages/ts-shell/src/session/sessionRecoveryProjection.ts`

Avoid creating many one-function files. Prefer cohesive helpers.

## Implementation tasks

### 1. Baseline and ownership audit

Before code changes, inspect `SessionManager.ts`.

Create `docs/architecture/session-substrate-seams.md`.

Classify current inline responsibilities:

- directory/path helpers
- state persistence
- metadata persistence
- transcript append/read
- transcript/event construction
- current-session state
- compact/checkpoint summaries
- replay/recovery snapshots
- continue/replay evidence
- approval memory
- CLI-facing summaries
- durable status

For each, mark:

- keep in `SessionManager`
- extract now
- extract later
- do not move

### 2. Extract event codec seam

Add `sessionEventCodec.ts` if safe.

It should own pure encode/decode or construction helpers for transcript/session events.

Candidate helpers:

- lifecycle event construction
- query event construction
- transcript event normalization
- event timestamp/id defaults
- backwards-compatible event parse guards

Rules:

- no persistence schema change
- no event field removal
- no transcript ordering change
- no hidden/raw data expansion

### 3. Extract summary projection seam

Add `sessionSummaryProjection.ts`.

It should own pure projections such as:

- CLI-facing session summary
- list/resume summary
- project/session display facts
- terminal classification summary where not already owned by `durableStatusProjection`
- compact summary display where safe

Rules:

- no CLI wording drift unless tests assert the current surface
- no durable status behavior change
- no persistence behavior change

### 4. Extract continuation projection seam

Add `sessionContinuationProjection.ts`.

It should align with Route 142's continuation contract.

It may own:

- replay-safe evidence summary
- stopped-session continuation surface
- previous target summary
- verification hint summary
- lineage-safe transcript summary
- missing evidence reason projection

Rules:

- no raw DOM
- no raw file dumps
- no secrets
- no schema migration
- no behavior change to `/continue`

### 5. Extract compact/checkpoint projection seam

Add `sessionCompactProjection.ts` if clearly safe.

It may own:

- compact continuity summary projection
- checkpoint retention summary
- compact handoff display facts
- post-compact recovery summary

Rules:

- no compact trigger change
- no retention policy change
- no transcript truncation behavior change

### 6. Extract metadata/current-session projection seam

Add `sessionMetadataProjection.ts` if clearly safe.

It may own:

- current session display facts
- active project/session metadata projection
- missing/stale current-session reason
- reentry status summary

Rules:

- no current-session selection behavior change
- no session file layout change
- no root trust behavior change

### 7. Update SessionManager call sites

Replace inline construction with helpers.

Allowed:

- mechanical extraction
- type cleanup
- focused tests
- removing duplicated projection blocks

Not allowed:

- persistence format rewrite
- schema migration
- lock/retry behavior changes
- replay behavior changes
- compact behavior changes
- CLI behavior changes
- provider/browser/edit behavior changes

### 8. Tests

Add focused tests for extracted helpers.

Required coverage:

- event codec preserves existing event shape
- unknown/legacy event parse stays compatible
- session summary preserves key fields
- continuation projection is replay-safe
- continuation projection excludes raw DOM/file dumps/secrets
- compact projection preserves current summary fields if extracted
- metadata projection preserves current-session status if extracted
- durable status projection remains stable
- `SessionManager.test.ts` still passes

### 9. Full baseline validation

Because Route 144 made package green, Route 145 should protect that.

Run:

- focused new session projection tests
- `SessionManager.test.ts`
- continuation/replay/session tests touched by extraction
- full `runMvpIntegratedFlow.test.ts`
- package-level `packages/ts-shell` test sweep if feasible

If package sweep becomes red, classify and fix only extraction-caused drift.

### 10. Documentation and backlog update

Update:

- `docs/architecture/session-substrate-seams.md`
- `docs/architecture/module-backlog.md`

Route 146 recommendation should be based on what remains.

Likely next candidates:

- Tool / policy / result contract unification
- Session event vocabulary hardening
- CLI/core split preparation
- Provider readiness parity map
- Capability contract adoption across edit/browser/session

## Boundaries

Hard boundaries:

- no provider/model live calls
- no browser feature work
- no edit/patch feature expansion
- no SessionManager schema migration
- no transcript file format change
- no compact retention behavior change
- no current-session selection behavior change
- no CLI UX redesign
- no package dependency changes
- no broad SessionManager rewrite
- no broad runMvp rewrite
- no hiding failures behind skips
- no commit or push

## Validation

Run:

- focused session helper tests
- `rtk npm run test -w packages/ts-shell -- src/session/SessionManager.test.ts`
- continuation/replay/session tests touched by extraction
- `rtk npm run test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts`
- `rtk npm run test -w packages/ts-shell` if feasible
- `rtk npm run verify:edit-capability-closeout`
- `rtk npm run verify:result-contract`
- `rtk npm run build -w packages/ts-shell`
- `rtk git diff --check`
- `rtk git status --short --branch`

If full package sweep is not feasible, state why and run the strongest focused substitute.

## Final report

Include:

1. What changed
2. Before/after SessionManager responsibility map
3. Extracted session seams
4. Event/summary/continuation/compact behavior preservation
5. Tests and package baseline result
6. Redaction and replay-safety guarantees
7. Remaining risks
8. Route 146 recommendation
9. Proposed commit message

Do not commit or push.

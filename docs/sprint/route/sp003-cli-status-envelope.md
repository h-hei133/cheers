# SP003 CLI Status Envelope

## Goal

Build a unified CLI and session status envelope that consumes the proven product loop truth facts and renders them consistently through terminal-facing surfaces.

This is a large implementation batch. It must align CLI-facing status, session presentation, product surface, and runtime event facts for the same product path states without making terminal text the runtime API.

The task is not complete if it only changes wording, only adds a display section, only updates snapshots, or only wires one extra field.

## Why This Matters

The product loop truth matrix is now proven across loop, events, replay, surface, evidence, and result. The next gap is that CLI and session UX can still be narrower than the runtime fact model.

Users should be able to see next action, blockers, request readiness, replay carry-forward, tool outcome, verification or repair state, missing proof, and terminal verdict in one coherent terminal-facing status envelope.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- cli
- core/shell
- session/presentation
- presentation
- runtime/events
- runtime/loop
- session/replay
- evidence
- result
- tools
- provider/request
- verification
- repair

Change at least four rightful owner domains unless the final report proves one inspected domain already satisfies the needed behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/cli
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/session/replay
- nearby owner tests

## Required Status Envelope

Create or consolidate a terminal-facing status envelope that is derived from owner facts, not from terminal wording.

The envelope must represent:

- terminal verdict from evidence/result
- control status from runtime loop
- next action
- request preparation status and blockers
- continuation readiness status
- replay carry-forward status
- tool outcome status
- verification and repair status
- missing proof
- not-proven claims
- safe redacted details
- user-action-needed state
- blocked or failed state
- complete proof state

The envelope must be consumed by CLI or session-facing rendering and must remain consistent with product surface and runtime event facts.

## Required Product States

Use the existing product truth matrix where practical. Cover at least these states:

- complete proof
- blocked request preparation
- failed tool outcome
- missing proof
- repair proposal only
- repair apply without post-repair verification
- post-repair verification failed
- partial or stopped loop
- waiting for user action

For each state, tests must prove:

- CLI or session-facing status shows the same owner facts as product surface
- terminal text does not reinterpret success
- event emission is not success
- replay carry-forward is not success
- request readiness is not success
- tool outcome is not task success
- proposal or apply-only repair is not success
- missing proof stays visible

## Required Implementation

Implement a real status envelope and connect it to at least one existing terminal or session-facing product path.

Required behavior:

1. The CLI or shell-facing consumer receives structured status facts rather than recomputing truth from prose.
2. Product surface and terminal-facing status use the same owner facts for the same fixture.
3. The envelope includes next action, blockers, and missing proof when present.
4. Complete proof is the only terminal success path.
5. Non-success states must remain visibly non-success.
6. Redaction boundaries are preserved.
7. No raw transcript, provider secret, raw provider output, patch text, or command output is rendered through the envelope.
8. The implementation must not perform a broad CLI rewrite.
9. The implementation must not make terminal text a stable machine API.

## Required Tests

Add or update focused tests that prove the envelope through actual owner paths.

Required test coverage:

- one complete proof fixture
- one blocked request fixture
- one failed tool outcome fixture
- one missing proof fixture
- one repair proposal-only fixture
- one repair apply-only fixture
- one waiting-for-user or stopped-loop fixture
- product surface and terminal-facing status agree on owner facts
- terminal-facing rendering does not upgrade success
- redaction-sensitive markers are excluded
- evidence/result remains the terminal truth owner

Run CLI or shell rendering tests with representative stopped, blocked, not-proven, and verified repair cases.

Do not weaken assertions. Do not mass-rebaseline snapshots. If snapshots must change, explain the product contract change and make assertions stricter, not looser.

## Sprint Doc Update

After code and tests are complete, update these docs:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses or update rules changed

Edit stale claims directly. Do not append progress logs.

The docs must mark CLI Status Envelope as proven only if terminal-facing status and product surface render the same owner facts for the same fixture with no success upgrade.

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
- make terminal text the runtime API
- move terminal truth out of evidence/result
- let CLI, shell, session, event, replay, request readiness, tool outcome, repair proposal, or apply-only state claim success
- hide behavior in compatibility shims
- perform a broad CLI rewrite

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Validation

Run focused validation for every changed owner domain.

Expected validation includes:

- CLI or shell rendering tests
- session presentation tests if touched
- product surface tests
- runtime event tests if event facts are consumed or changed
- replay tests if carry-forward facts are consumed or changed
- runtime loop tests if trajectory facts are consumed or changed
- evidence/result verdict tests if terminal truth wording or status mapping changes
- anti-false-success gate if any success-related output changes
- package build if imports, contracts, or runtime-facing types changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. A structured status envelope exists and is used by a terminal or session-facing path.
2. At least four owner domains are changed or explicitly justified as already compliant.
3. At least seven product states are covered by tests.
4. Product surface and terminal-facing status agree on owner facts for the same fixture.
5. Complete proof is the only terminal success path.
6. Non-success states stay visibly non-success.
7. Redaction-sensitive raw content is excluded.
8. Sprint docs are updated by editing stale claims, not appending logs.
9. Focused validation and diff checks pass.
10. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- status envelope behavior implemented
- product states covered
- files changed
- negative controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

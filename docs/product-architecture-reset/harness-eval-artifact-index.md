# Test Support And Evaluation Index

Updated 2026-09-30 after the scenario support migration. Paths below are
relative to `packages/ts-shell/src/`.

## Current Ownership

Fixtures, subprocess runners, assertions, and scenario reports belong to
`test-utils/`. Product code imports its own runtime domains and must not import
test support. The former core support directory has been removed.

| Family | Current owner | Boundary |
|---|---|---|
| Agent scenarios | `test-utils/scenarios/` | Scenario fixtures, runner, assertions, and reports. |
| CLI scenarios | `test-utils/cli/` | Subprocess setup, runner, assertions, and reports. |
| Browser scenarios | `test-utils/browser/` | Support grouped by execution, network, cache, replay, healing, receipt, runtime, and skills. |
| Browser evaluation | `eval/browser/` | Existing benchmark model, runner, and report; retained for evaluation consumers. |
| Opt-in browser smoke | `browser/smoke/` | Runtime configuration, runner, and report used by the CLI smoke command. |

## Import And Evidence Rules

- Internal test support has no public import compatibility contract. The
  migration updated its consumers without keeping unused re-export shims.
- Keep product runtime and evaluation ownership distinct from scenario setup.
  Do not add a second runtime implementation to support a test.
- Run focused scenario tests and build after moving a support family. Path-only
  changes must preserve behavior and assertions.
- Keep provider, network, persistence, and write opt-ins explicit. Local fixture
  success does not prove a live provider, browser launch, or authorized write.

The migration and validation evidence is recorded in
[Phase 17 decisions](../../.wiki/features/phase-17-decisions.md), section 8.9.

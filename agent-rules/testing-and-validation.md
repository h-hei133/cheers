# Testing And Validation

Validation must match the change.

## Focused Validation

- Run focused validation tied to touched files and behavior.
- Do not default every round to full-repository validation.
- Broaden validation only when touched files cross core boundaries, focused tests cannot cover the risk, or the task explicitly classifies baseline health.
- If only markdown files change, do not run build/tests.
- Do not run live provider unless the task explicitly requires real-provider evidence.

## Trigger-Based Validation

- CLI flag changes: run focused CLI tests.
- Runtime route behavior changes: run focused runMvp/runtime route tests.
- Result or session surface changes: run focused result/session tests.
- Workspace writer policy changes: run workspace write route tests, mutation-lane rejection regression, and build.
- Permission, approval, or write-decision behavior changes: run focused permission/write-gate tests.
- Provider-facing routes or smoke scripts: run syntax checks, readiness preflight, and relevant isolated real-provider gate when appropriate.
- Contract shape changes: run tests that validate producer and consumer semantics.
- Default rejection behavior changes: run the mutation-lane rejection regression.

## Baseline Discipline

Capability contracts are the source of truth for expected behavior. Tests are evidence for those contracts, not automatically the source of truth.

Classify failing tests before changing implementation or tests:

- `product behavior drift`: implementation no longer satisfies the current contract.
- `stale expectation`: test asserts an older contract.
- `harness/setup drift`: harness no longer matches the runtime path.
- `obsolete scenario`: scenario no longer represents a supported or meaningful contract.
- `future capability expectation`: test describes desired future capability, not current supported behavior.
- `environment/flaky issue`: failure depends on environment, network, provider, timing, or external configuration.

## Test Changes

- Do not pass tests by weakening assertions.
- Do not use broad skips as a shortcut.
- Do not silently delete scenarios.
- Do not mass-rebaseline terminal text or snapshots.
- Rebaselined tests should become more precise under the current contract, not looser.

## Validation Claims

- Do not claim validation passed unless the command actually ran and passed.
- Distinguish failures introduced by the current change from unrelated pre-existing failures.
- Distinguish product failures from provider, network, config, and environment failures.
- Restore audit/history residue before finalizing.

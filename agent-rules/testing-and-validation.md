# Testing And Validation

Validation must match the change.

## Concurrency And OOM Prevention

WSL2 has bounded memory. Running multiple heavy Node/TypeScript/Vitest processes simultaneously exhausts RAM and triggers the Linux kernel OOM-Killer (`Killed` / exit 137).

1. **Strict Process-Level Mutual Exclusion**: NEVER run compilation, test, or verification commands (`tsc`, `vitest`, `npm run build*`, `npm run test*`, `npm run verify:*`, `normproof`) concurrently via parallel tool calls, background jobs (`&` / `async`), or concurrent subagents. At most ONE heavy verification process may run at any time; chain sequential steps with `&&`.
2. **Batch Target Files in One Invocation**: When validating multiple test files, pass all target paths into a single `vitest run <fileA> <fileB>` command rather than spawning separate `vitest` processes in a loop. When running larger suites in memory-constrained environments, cap worker concurrency (e.g. `--poolOptions.threads.maxThreads=2` or `--no-file-parallelism`).
3. **Fast-Fail Serial Tiering**: Order `&&` chains from lightest to heaviest so failures short-circuit before spawning heavy processes:
   - **Tier 1 (Sub-second static checks)**: `npm run verify:import-cycles && npm run check:config-consumers && npm run check:declarations && npm run check:node-floor && npm run verify:docs-drift:strict`
   - **Tier 2 (Focused unit/integration tests)**: single batched `vitest run <focused-files>`
   - **Tier 3 (Build / structural graph)**: `npm run build` / `normproof judge`
4. **Subagent Verification Ban**: Delegated subagents (`task`) must NEVER execute `build`, `vitest`, `verify:*`, or `normproof` mid-flight. Subagents only investigate or edit their assigned slice; the main agent runs verification serially once after integrating all slices.

## Focused Validation

- Run focused validation tied to touched files and behavior.
- Do not default every round to full-repository validation.
- Broaden validation only when touched files cross core boundaries, focused tests cannot cover the risk, or the task explicitly classifies baseline health.
- If only markdown files change, do not run build/tests (except `npm run verify:docs-drift:strict` when editing rule or index markdown files).
- Live provider interaction is permitted when validating provider-facing behavior, interactive flows, or end-to-end capabilities.
## Trigger-Based Validation

- CLI flag changes: run focused CLI tests.
- Runtime execution or turn behavior changes: run focused runtime/turn tests.
- Result or session surface changes: run focused result/session tests and the result contract gate when applicable.
- Workspace writer policy changes: run workspace write authority tests, mutation-lane rejection regression, and build.
- Permission, approval, or write-decision behavior changes: run focused permission/write-gate tests.
- Provider-facing adapters or smoke scripts: run syntax checks, readiness preflight, and relevant isolated provider tests when appropriate.
- Contract shape changes: run tests that validate producer and consumer semantics.
- Default rejection behavior changes: run the mutation-lane rejection regression.
- File movement, import path changes, or owner-domain layout changes: run focused tests for moved modules, import compatibility tests or direct import checks where available, and build.
- Compatibility shim changes: run tests that cover both the new owner path and any old path that remains supported.

## Structure And Import Validation

Structure changes must prove that behavior did not change unless the task explicitly includes behavior changes.

For file placement, naming, or import-only changes:

- keep old supported imports working through thin compatibility exports when compatibility is required
- update tests or nearby product imports to use the rightful owner path when safe
- run focused tests for the affected owner domains
- run build to catch unresolved imports and circular dependency errors
- do not rebaseline behavior snapshots just because files moved
- do not change output wording, terminal status, result truthfulness, provider behavior, session behavior, or tool behavior unless explicitly scoped

A passing build is not enough when a moved module owns runtime behavior. Run the focused tests for that owner domain.

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
- Do not hide behavior changes inside file movement or naming work.

## Validation Claims

- Do not claim validation passed unless the command actually ran and passed.
- Distinguish failures introduced by the current change from unrelated pre-existing failures.
- Distinguish product failures from provider, network, config, and environment failures.
- Distinguish import/layout failures from behavior failures.
- Restore audit/history residue before finalizing.

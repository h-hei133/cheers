# Reset Route F: Session And CLI Presentation Split

## Goal

Reduce CLI/session/runtime coupling through product facades and session-owned transcript/continuation APIs.

This route does not redesign UI. It clarifies ownership: CLI presents and collects intent; session persists transcript and continuation; result/evidence determines truth.

For this route, "product facade" means a stable product boundary, not
necessarily a new `packages/ts-shell/src/product/*` directory. Prefer the final
domain owner for the seam: CLI presentation under entrypoints/app/CLI, session
facts under `session`, result/verdict facts under the existing result owner, and
turn invocation through the current turn compatibility facade. Do not create
broad new `src/product/session` or `src/product/presentation` buckets unless the
route documents them as temporary compatibility shims with a named final
migration target.

Expected final status: `COMPLETE`.

## Scope

Allowed:

- CLI invocation facade adjustments
- session presentation fact facade
- continuation/transcript API cleanup
- compatibility shims around current SessionManager/sessionRuntime/cli paths
- focused CLI/session tests

Not allowed:

- full CLI rewrite
- full SessionManager rewrite
- session schema migration without explicit plan
- provider/edit behavior changes
- hiding not-proven claims for UX polish

## Required Subagents

1. CLI boundary subagent
   - inspect CLI entrypoints, runtime invocation, approval bridge, command surfaces.
2. Session boundary subagent
   - inspect SessionManager, sessionRuntime, continuation, compact, transcript.
3. Result/evidence presentation audit subagent
   - ensure CLI/session do not create success.

## Phases

### Phase 1: CLI/session responsibility audit

Map current responsibilities:

- CLI args/mode parsing
- approval prompting
- runtime invocation
- product turn execution
- session persistence
- transcript/compact/continue
- result rendering

Identify coupling that can be reduced by facade/shim.

Classify any new seam as final-domain or temporary compatibility. If temporary,
state the final owner it is preparing for.

### Phase 2: Session presentation facts

Create or strengthen session-owned APIs for:

- transcript facts
- continuation facts
- compact summary facts
- stopped/partial/not-proven facts
- pending authority facts

Do not change session schema unless explicitly planned.

### Phase 3: CLI product invocation facade

Make CLI invoke product turn/runtime through a clearer facade.

Do not move business semantics into CLI.

### Phase 4: Rendering separation

Ensure CLI/session presentation consumes result/evidence facts rather than reconstructing capability truth.

### Phase 5: Compatibility tests

Cover:

- CLI print/default paths
- session continuation truth
- partial/stopped not upgraded
- approval/authority display remains truthful

## Completion Criteria

This route is `COMPLETE` only if:

- CLI/runtime/session responsibilities are clearer through facades or APIs
- SessionManager concentration is reduced by a safe seam, or a clear seam is established
- CLI does not own capability success semantics
- session does not upgrade verdicts
- existing CLI/session tests pass
- no schema migration occurred without a plan

## Validation

Run as applicable:

- CLI entry tests
- session lifecycle tests
- session durability / continuation tests
- result/session parity tests
- result contract
- build if TS product code changed
- diff check and status

## Stop Conditions

Stop if:

- session schema migration becomes necessary
- CLI behavior changes without product-path tests
- session continuation truthfulness changes
- result/evidence semantics drift

## Final Checkpoint Report

Report:

1. Final status
2. CLI boundary changes
3. Session boundary changes
4. Presentation/result truthfulness changes
5. Compatibility shims
6. Tests run
7. Remaining CLI/session debt
8. Whether safe to continue to Reset Route G

## Next Route

Continue to:

`reset-route-g-scripts-package-surface-grouping.md`

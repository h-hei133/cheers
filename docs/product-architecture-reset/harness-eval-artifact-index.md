# Harness And Eval Artifact Index

This index re-owns the visible `packages/ts-shell/src/core/harness/` surface for
Phase 2 Goal 3. It is an ownership and compatibility index, not a feature plan.

## Current Judgment

Status: RE-OWNED IN PLACE.

`packages/ts-shell/src/core/harness/` remains in its current path for
compatibility. The directory is classified as dev/eval harness plus focused
product-adjacent test support. It must not be treated as product runtime truth
or route-history readiness.

## Artifact Families

| Family | Example files | Current owner | Disposition |
|---|---|---|---|
| Agent scenario harness | `agentScenario*.ts`, `agentCliScenario*.ts` | Dev/eval harness | Keep in place; import-compatible move later only with focused tests. |
| Browser transaction evidence | `browserTxn*.ts`, `browserTrace.test.ts`, `browserScore.test.ts` | Browser/evidence harness | Keep in place; covered by `verify:browser-txn-gate`. |
| Browser runtime scenario fixtures | `browserRuntimeMvpScenarioFixtures.ts`, `browserRuntimeAdapterFixtures.ts` | Browser eval harness | Keep route-era labels as provenance. |
| Browser eval benchmark model | `browserEvalBenchmarkModel.ts`, `browserEvalBenchmarkRunner.ts`, `browserEvalBenchmarkReport.ts` | Eval benchmark harness | Keep in place until a browser/eval namespace move preserves imports. |
| Playwright closeout/runtime tests | `pwRuntime.test.ts`, `pwReal.test.ts`, `pwCloseout.test.ts`, `pwMcp.test.ts` | Browser harness tests | Keep default-safe; no live provider or public-web default. |
| Public read-only smoke config | `browserPublicReadOnlyWebSmokeConfig.ts` | CLI smoke config adapter | Keep in place for compatibility; default remains controlled and opt-in. |

## Compatibility Rules

- Do not move the whole harness directory as one block.
- Preserve old import paths before moving any subfamily.
- Keep focused harness gates green for moved subfamilies.
- Do not let local fixture, browser, MCP, or smoke evidence become a default
  product success claim.
- Keep Route221 active evidence infrastructure outside this cleanup; it is not
  part of this harness re-ownership.

## Product Boundary Finding

The harness directory still sits under `core`, which is not the final physical
shape. That is recorded as remaining debt instead of being hidden by a broad
move. The safe next physical step is a subfamily move, such as browser eval
benchmark files behind an import-compatible shim, after the browser/runtime
owner surface is selected.

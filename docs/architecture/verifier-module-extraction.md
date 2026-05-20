# Verifier Module Extraction

Route: `docs/agent-routes/route159-verifier-module-facades.md`

## Boundary

This route is a behavior-preserving owner-module extraction for the real-user
capability verifier surface.

Hard boundaries:

- no verifier flag, marker, JSON report field, or exit-code semantic changes
- no dry-run, include-real, real-provider opt-in, or external MCP behavior
  changes
- no scenario deletion, hidden skips, or expectation weakening
- no product source behavior changes
- no package script or dependency changes
- no real-provider config reads outside existing explicit opt-in verifier paths

`scripts/verify-real-user-capabilities.mjs` is already a thin compatibility
entrypoint. It only imports `scripts/verify/index.mjs`, so it stays acceptable
as the public verifier shim. The true concentration point is
`scripts/verify/index.mjs`, which owns option parsing, suite/case planning,
real-provider safety validation, execution dispatch, result/report projection,
and residue/report closeout.

## Responsibility Migration Table

| Current code block / responsibility | Current owner file | True owner module | Target facade or file | Migration decision | Reason | Validation required | Risk |
|---|---|---|---|---|---|---|---|
| public `verify-real-user-capabilities.mjs` entrypoint | `scripts/verify-real-user-capabilities.mjs` | Harness / Eval Engineering | keep as compatibility entrypoint | leave in compatibility entrypoint | It is already a 3-line import shim and should not grow. | `node --check`, verifier commands | accidental public entrypoint drift |
| tier/suite values, `--tier`, `--case`, `--suite`, boolean flag parsing | `scripts/verify/index.mjs` | Harness / Eval Engineering | `verifierCliModule.mjs` | extract now | CLI/options facts are verifier availability and compatibility facts, not orchestration. | boundary test, verifier dry-run commands | flag, alias, or invalid-exit drift |
| all cases, metadata, tier/suite selection, skipped case projection | `scripts/verify/index.mjs` plus `cases.mjs` | Harness / Eval Engineering | `verifierCaseModule.mjs` | extract now | Case planning should be module-owned while case definitions stay in `cases.mjs`. | boundary test, tier/suite commands | scenario deletion or hidden skip drift |
| invalid selection checks and `--include-real` suite restriction | `scripts/verify/index.mjs` | Harness / Eval + Provider / Model Engineering | `verifierSafetyModule.mjs` | extract now | Opt-in safety facts should be named and testable before execution. | boundary test, include-real dry-run | real-provider opt-in drift |
| provider env loading and generated real-provider config | `scripts/verify/index.mjs` | Provider / Model + Harness / Eval Engineering | defer | This logic touches opt-in config sourcing and should move only with dedicated redaction/config characterization. | include-real dry-run, readiness commands if touched | provider config or redaction drift |
| command runner subprocess capture | `scripts/verify/run.mjs` | Harness / Eval Engineering | existing `run.mjs` | facade existing module | Already isolated as a runner; this route does not change execution lists. | verifier commands | timeout/status drift if changed |
| result/failure normalization | `scripts/verify/result.mjs` plus index helpers | Harness / Eval + Result Surface Engineering | existing result module; defer deeper split | leave current complex classifiers | Existing classifiers are intertwined with many smoke paths; moving them now risks report drift. | result-contract, verifier commands | false failure classification |
| dry-run/list plan report shape and final JSON report assembly | `scripts/verify/index.mjs`, `report.mjs` | Harness / Eval Engineering | `verifierReportModule.mjs` | extract now | Report shape and exit-code inputs are verifier-owned evidence surfaces. | boundary test, verifier commands | report field or marker drift |
| isolated audit path helpers and repo audit residue classification | `scripts/verify/residue.mjs` | Harness / Eval Engineering | existing residue module; facade through report/safety docs | facade existing module | Residue helpers are already separate; no behavior change needed. | diff/status guard | deleting user files if broadened |
| special real-provider and apply-patch smoke bodies | `scripts/verify/index.mjs` | Harness / Eval plus owning capability modules | defer | Large case bodies mix fixtures, provider redaction, and route-specific assertions; move only under dedicated case-family routes. | existing verifier commands | smoke behavior drift |
| `main()` top-level verifier flow | `scripts/verify/index.mjs` | Harness / Eval composition root | keep calling facades | leave as readiness composition root | It should order early self-tests, plan printing, provider preflight, execution, report write, and exit. | full Tier 3 verifier commands | exit/report ordering drift |

## Facade Ownership

- `verifierCliModule.mjs`: Harness / Eval owner for public verifier options,
  tier/suite values, aliases, and boolean flag availability.
- `verifierCaseModule.mjs`: Harness / Eval owner for selected case planning,
  tier/suite projection, skipped-case projection, and list/dry-run plan report
  inputs.
- `verifierSafetyModule.mjs`: Harness / Eval plus Provider / Model owner for
  selection safety validation and include-real opt-in constraints.
- `verifierReportModule.mjs`: Harness / Eval owner for config/preflight/final
  report object construction and unhandled failure report shape.

## What Remains In verifier/index.mjs

`scripts/verify/index.mjs` remains responsible for:

- creating run id, paths, runner, registry, and existing compatibility constants
- ordering early self-test/smoke flags
- invoking existing real-provider and candidate smoke bodies
- provider env contract lifecycle and cleanup ordering
- provider preflight ordering
- scenario execution loops
- terminal marker emission order
- process exit ordering

## Final Classification

After Route 159, `scripts/verify-real-user-capabilities.mjs` is acceptable as a
thin compatibility entrypoint. `scripts/verify/index.mjs` is still a large but
acceptable Harness / Eval readiness composition root for this route if Tier 3
validation passes. It should not regain direct CLI parsing, suite/case planning,
selection safety checks, or top-level report object construction.

The next central file recommendation moves to `resultMapper.ts`, because the
major control-plane composition roots and the verifier readiness surface have
owner-module classifications, while terminal truthfulness remains the shared
contract every capability must satisfy.

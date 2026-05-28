# Package Script And Entrypoint Audit

## Summary

Root `package.json` has 176 scripts. `packages/ts-shell/package.json` has 6
scripts.

The root script surface mixes product commands, product verification, evidence
gates, route-history compatibility commands, dev demos, and live-provider
opt-in gates in one namespace. This is confusing but not a Phase 3 runtime
concentration blocker.

No package script behavior was changed by this audit.

## Root Script Classification

Automated classification from current root `package.json`:

| Category | Count | Notes |
| --- | ---: | --- |
| product command | 11 | setup, doctor, dev/start delegation, audit/status helpers |
| product verification | 95 | build/test/release/product/provider verification aliases |
| live-provider opt-in | 1 | `start:live:interactive` by name; other real-provider scripts classify as verification because they are gates |
| evidence gate / route-history compatibility | 67 | route gates and route-history aliases |
| dev demo | 2 | route207 demo aliases |

Important examples:

- Product command: `bootstrap`, `setup`, `doctor`, `dev`, `start`.
- Product verification: `build`, `test`, `verify:cli-entry`,
  `verify:result-contract`, `verify:workspace-safety`.
- Evidence gate: `verify:evidence:route221-anti-false-success-gate`,
  `verify:evidence:artifacts`, `verify:evidence:inspector`.
- Route-history compatibility: `verify:route-history:route205-*` through
  `verify:route-history:route228-*`, plus direct `verify:route*` aliases.
- Live-provider opt-in: `start:live:interactive` and real-provider verifier
  names that remain explicit opt-in gates.
- Dev demo: `demo:route207`, `demo:route-history:route207`.

## Workspace Package Script Classification

`packages/ts-shell/package.json` scripts:

| Script | Classification | Command |
| --- | --- | --- |
| `build` | product verification | `tsc -p tsconfig.build.json` |
| `dev` | product command | `tsx watch src/entrypoints/cli.tsx` |
| `start` | product command | `tsx src/entrypoints/cli.tsx` |
| `test` | product verification | `vitest run` |
| `test:gate:golden-main-path` | product verification | focused CLI baseline gate |
| `test:watch` | product verification | `vitest` |

The package-local script surface is small and acceptable.

## Entrypoint Audit

`packages/ts-shell/src/entrypoints/cli.tsx` is 24 lines and is now a genuine
executable compatibility shim. It:

- imports `process`
- imports `runCliProcess`
- imports `handleCliFatalError`
- passes process globals and console writers into `runCliProcess`
- delegates fatal error formatting and exit behavior

`packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` is 8 lines and is
now a genuine compatibility re-export shim.

## Script Cleanup Recommendation

Script cleanup should be a later grouped route, not part of this audit. It can
be done safely if it preserves behavior through compatibility aliases and does
not change live-provider opt-in semantics.

Recommended grouping:

- define stable product command groups
- define stable evidence gate groups
- move route-history aliases behind explicit `verify:route-history:*`
- keep direct `verify:route*` aliases temporarily with deprecation notes
- keep live-provider gates explicit and opt-in


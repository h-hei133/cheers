# Verifier Decomposition

Route: `docs/agent-routes/route135-verifier-decomposition.md`

## Scope

Route 135 decomposes `scripts/verify-real-user-capabilities.mjs` into a
compatibility entrypoint plus focused Harness Engineering modules under
`scripts/verify/`. This route is behavior-preserving: product runtime,
browser/edit capability, CLI UX, provider/auth core, `SessionManager.ts`, and
`runMvpIntegratedFlow.ts` are out of scope.

## Baseline Responsibility Ledger

Before Route 135, `scripts/verify-real-user-capabilities.mjs` owned all of
these responsibilities directly:

| Responsibility | Baseline owner | Route 135 target |
|---|---|---|
| CLI argument parsing | monolithic script globals | compatibility entrypoint plus orchestration |
| environment probing | monolithic script globals and provider env helpers | `scripts/verify/env.mjs` for verifier paths, Node/npm/RTK availability, and residue path facts; provider env behavior remains unchanged in orchestration |
| scenario/case definitions | monolithic arrays and selection helpers | `scripts/verify/cases.mjs` owns scenario definitions, registry metadata, selection, suite membership, skip metadata |
| subprocess command execution | local `run()` helper | `scripts/verify/run.mjs` command runner |
| result normalization | provider readiness and failure summarizers | `scripts/verify/result.mjs` shared status/failure summary vocabulary |
| capability lifecycle mapping | implicit in reports and output markers | Route 131 lifecycle vocabulary documented here; runtime report shape kept stable |
| reporting | local JSON write helper and report assembly | `scripts/verify/report.mjs` report writer boundary; assembly stays in orchestration |
| residue detection / cleanup notes | audit helpers inside script | `scripts/verify/residue.mjs` audit path cleanup and residue detection helpers |
| exit-code decision | main control flow | `scripts/verify/index.mjs` orchestration keeps existing exit semantics |
| project-specific assumptions | spread through script | kept in orchestration unless a helper can preserve behavior mechanically |

## Route 131 Alignment

The decomposition follows the Route 131 rule that modules are responsibility
boundaries, not folder moves. The verifier now exposes clearer lifecycle
owners:

| Lifecycle stage | Route 135 module |
|---|---|
| availability | `env.mjs` and existing provider env contract in `index.mjs` |
| policy | existing opt-in and workspace policy checks, unchanged |
| planning | `cases.mjs` selection, skip, and suite metadata |
| execution | `run.mjs` subprocess receipt |
| observation/evidence | existing scenario assertions, unchanged |
| result mapping | `result.mjs` failure/status summarizers |
| report | `report.mjs` JSON writer |
| cleanup/redaction | `residue.mjs` plus existing redaction helpers, unchanged |

## Reference Constraints Used

Bounded reference scan only informed structure:

- Inspect AI: scorer/log split supports keeping scorer/result/report concepts
  separate from execution.
- mini-swe-agent: environment runner shape supports a compact command-result
  boundary.
- opencode and gemini-cli: typed tool/runner contracts support explicit
  execution metadata and policy separation.
- OpenHands: event storage notes reinforce durable evidence/report boundaries.
- ClaudeCode: tool orchestration reinforces keeping execution order separate
  from tool-specific policy and result surfaces.

No reference implementation code was copied.

## Decomposition Result

New module boundaries:

- `scripts/verify/index.mjs`: orchestration entrypoint and compatibility logic.
- `scripts/verify/cases.mjs`: scenario definitions, derived Route 135 case
  descriptor fields, case registry, metadata, tier/suite selection.
- `scripts/verify/env.mjs`: verifier path, Node/npm/RTK availability, and
  generated-residue path facts.
- `scripts/verify/run.mjs`: subprocess runner with stable cwd, env, timeout,
  stdout/stderr, and exit-code receipt.
- `scripts/verify/result.mjs`: failure category list, provider readiness status,
  and aggregate failure exit decision.
- `scripts/verify/report.mjs`: JSON report writer.
- `scripts/verify/residue.mjs`: isolated audit log path cleanup and repository
  audit residue detection.
- `scripts/verify/orchestration.mjs`: top-level async entrypoint wrapper.

The legacy `scripts/verify-real-user-capabilities.mjs` remains the package
script entrypoint and delegates to `scripts/verify/index.mjs`.

## Behavior Preservation

Preserved surfaces:

- Existing CLI flags and package script path.
- Existing output markers and report path.
- Existing report/list metadata surface; Route 135 descriptor fields are kept
  on internal case objects rather than added to stable output by default.
- Existing provider opt-in/default-skip behavior.
- Existing dry-run/list behavior.
- Existing failure exit codes: pass `0`, product failure `1`, provider network
  `2`, config failure `3`.
- Existing redaction helpers and real-provider home boundary.
- Existing audit cleanup behavior; non-generated files are not auto-deleted.

## Next Recommendation

Next route should be Route 132: Agent Loop Responsibility Ledger. Route 135
reduced harness concentration without changing product behavior, so the next
architecture step can map `runMvpIntegratedFlow.ts` before any source
extraction.

# Live Evidence Ledger

This ledger separates live-provider, fake-provider, default-safe, focused-test, scaffold, and not-proven evidence. It records what was proven and what was not.

| Area / Route / Gate | Evidence type | Provider called? | Apply happened? | Verification happened? | Workspace mutated? | Mutation scope | Result | Source marker or command | Confidence |
|---|---|---:|---:|---:|---:|---|---|---|---|
| Route 199 anchored provider smoke | live-provider-called + live-provider-no-write | true | false | false | false | none | valid exact anchored no-write provider output | User-observed Route 199 evidence; `scripts/verify-real-provider-anchored-smoke.mjs`; `scripts/real-provider-smokes/anchoredSmokeRunner.ts` markers `provider-called=true`, `output-validation`, `anchor-quality`, `no-write=true` | high for no-write provider-called smoke |
| Route 200 real provider task loop | live-provider-no-write stopped | false | false | false | false | none | task-loop-stopped | User-observed Route 200 evidence; `scripts/verify-real-provider-task-loop-mvp.mjs`; `scripts/real-provider-smokes/taskLoopRunner.ts`; `realTaskLoopResult.ts` | high that this is not a task-loop success |
| Provider readiness default | default-safe-skip | false | false | false | false | none | skip unless opt-in | `scripts/verify-real-provider-readiness-smoke.mjs` prints default skip / `real-provider-home-read=false` | high for default-safe behavior |
| Provider readiness classification | focused-unit-tests | false unless opt-in | false | false | false | none | classifies missing-key/config/unsupported/auth/network | `providerReadiness.ts`; provider readiness tests; classification self-test path | medium-high |
| Anchored provider fake-ready boundary | fake-ready-boundary | true in fake-ready runner path | false | false | false | none | provider-called path reaches calibration without real credentials | `verify-real-provider-anchored-smoke.mjs` marker `live-smoke-fake-ready-provider-called`; `anchoredSmokeRunner.ts` fakeReady branch | high for wiring, not live provider |
| Anchored proposal runtime | fake-provider | true for fake provider | false | false | false | none | no-write anchored proposal/eval/scorecard | `anchoredProposalRuntime.ts`; `verify-context-planning.mjs` | medium-high |
| Single-file selected-workspace update | focused-unit-tests / synthetic gate | false | true in explicit synthetic route | post-write readback | true in isolated fixture | one existing selected-workspace file | supported MVP mutation boundary | `workspaceWriteRoute.ts`; `singleFileUpdateApply.ts`; `scripts/verify/cases.mjs` case `synthetic-selected-workspace-single-file-update` | high for synthetic isolated path |
| Single-file Add File create | focused-unit-tests / synthetic candidate | false | true in explicit candidate route | post-write readback | true in isolated fixture | one new selected-workspace file | candidate only | `singleFileCreateApply.ts`; `scripts/verify/cases.mjs` case `synthetic-selected-workspace-single-file-create` | medium-high for candidate path |
| Exactly-two-file update | focused-unit-tests / synthetic candidate | false | true in explicit candidate route | per-file readback | true in isolated fixture | exactly two existing files | candidate only, no atomic rollback claim | `twoFileUpdateApply.ts`; `scripts/verify/cases.mjs` case `synthetic-selected-workspace-two-file-update` | medium-high for candidate path |
| Two-file partial failure | focused-unit-tests / synthetic candidate | false | partial | partial/failed | true for first file in isolated fixture | exactly two existing files with second failure | stopped, partial-mutation-failed | `scripts/verify/cases.mjs` case `synthetic-selected-workspace-two-file-update-partial-failure`; `targetSetEditRoute.ts`; `proposalHunkSetRoute.ts` | medium-high |
| Multi-file update planning dry-run | focused-unit-tests / synthetic no-write | false | false | false | false | wouldChange two files | planning/preflight no-write | `scripts/verify/cases.mjs` case `synthetic-selected-workspace-multi-file-update-planning` | high for no-write planning only |
| Context planning | focused-unit-tests | false | false | false | false | none | deterministic context packet/graph/plan-quality evidence | `scripts/verify-context-planning.mjs`; `contextPacket.ts`; `contextGraph.ts`; `agentPlan.ts`; `planQuality.ts` | high for deterministic no-write surface |
| Result contract | focused + synthetic CLI | false | no write in result-contract fixture | no write | false | none | terminal/result markers stable for selected scenarios | `scripts/verify-result-contract.mjs` | medium-high |
| Deterministic release meta | default-safe-skip + deterministic gate | false | synthetic only by sub-gates | synthetic only by sub-gates | isolated only | bounded deterministic | `broadReleaseReady=false` | `scripts/verify-release-deterministic.mjs` | high for deterministic meta, not broad release |
| MCP local execution | focused/local deterministic | false | false | false | false | none | local fixture execution/taxonomy | `scripts/verify-mcp-local-execution.mjs`; `core/mcp/errorTaxonomy.ts` | medium-high for local fixture only |
| External user-configured MCP | not-proven | unknown | unknown | unknown | unknown | unknown | not claimed | No external MCP gate in Route 201 | high not-proven |
| Browser live/public runtime | not-proven | false | false | not run | false | none | not claimed in Route 201 | Browser modules inspected only at summary level; no browser gate run | high not-proven |

## Required Route 199 Record

| Field | Value |
|---|---|
| provider kind | `openai-compatible` |
| adapter approved | `true` |
| provider called | `true` |
| output validation | `valid-exact-single-target` |
| anchor quality | `exact-ready` |
| no-write | `true` |
| mutation authority | `not-granted` |
| raw provider output | `excluded` |

Route 199 is live provider-called evidence for a no-write anchored provider smoke. It is not live apply evidence.

## Required Route 200 Record

| Field | Value |
|---|---|
| live task-loop opt-in | `true` |
| real provider smoke opt-in | `true` |
| provider called | `false` |
| anchor quality | `none` |
| apply | `not-run` |
| verification | `not-run` |
| mutation scope | `none` |
| status | `task-loop-stopped` |

Route 200 is not a live task-loop success. It currently proves stopped/no-write reporting for the task-loop surface, not provider invocation, apply, or verification.

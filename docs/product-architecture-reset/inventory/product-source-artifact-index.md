# Product Source Artifact Index

Current-state source artifact index for Reset Route A. This file identifies
product-runtime, test, harness, and route-era source surfaces without renaming or
moving them.

## Source Counts

| Surface | Count |
|---|---:|
| `packages/ts-shell/src` TS/TSX files | 1304 |
| `packages/ts-shell/src` test files | 520 |
| Route/history-keyword source paths under `packages/ts-shell/src` | 22 |
| `packages/ts-shell/src/core/harness` files | 91 |
| `packages/rust-core/src` files | 3 |
| `contracts/` files | 22 |

## Source Artifact Families

| Path or pattern | Category | Current role | Product exposure risk | Future target category | Migration phase | Preserve provenance | Compatibility needs | Notes and uncertainty |
|---|---|---|---|---|---|---|---|---|
| `packages/ts-shell/src/entrypoints/cli.tsx` | product-runtime | CLI entry and composition root. | Medium; central file still wires runtime concerns. | App/CLI presentation facade. | Phase F after B-E. | No | Focused CLI tests before changes. | Do not grow during reset; no Route A edit. |
| `packages/ts-shell/src/session/SessionManager.ts` | product-runtime | Session lifecycle, persistence, replay, compact/continue, approval memory. | High; large concentration file. | Session store/transcript/continuation facades. | Phase F after turn kernel facade. | No | Session compatibility and durability tests. | Do not rename or split in Route A. |
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` | product-runtime / inspect-further | Main agent turn/runtime composition path. | High; stale `Mvp` name and large product concentration. | Product turn kernel facade plus compatibility shim. | Phase E after evidence/provider/edit facades. | No | Characterization coverage before rename/extraction. | Route-era name but current runtime path. |
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts` | product-test | Large characterization and runtime route test. | Medium; test name follows stale runtime name. | Product turn kernel tests after facade. | Phase E after facade. | Yes for characterization | Keep until replacement tests prove parity. | Product test and route-proof history overlap. |
| `packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts` | product-runtime / evidence-report | Edit capability readiness manifest. | Medium; `closeout` is historical naming in product-facing source. | Edit capability manifest/readiness API. | Phase D after edit facade. | Yes if evidence fields are consumed | Keep import-compatible shim before rename. | Current semantics may be durable despite name. |
| `packages/ts-shell/src/orchestration/controlledMultifileProofChain.ts` | dev-harness / evidence-report / inspect-further | Route206 proof-chain/evidence machinery under orchestration. | High; proof code lives in product namespace. | Evidence history or dev harness namespace. | Phase D/G after classification and aliases. | Yes | Preserve evidence markers and tests. | Highest uncertainty source item. |
| `packages/ts-shell/src/orchestration/providerExactPatchContract.ts` | product-runtime | Provider exact patch contract. | Medium; contains Route214 wording/markers. | Provider/proposal contract facade. | Phase C. | No for text; yes for report compatibility | Focused provider/proposal tests before edits. | Durable contract, not quarantine candidate by itself. |
| `packages/ts-shell/src/orchestration/planningRuntimeProductProposal.ts` | product-runtime / compatibility-alias | Product planning/proposal path with Route217/218 modes or request IDs. | Medium | Provider/proposal facade with compatibility adapters. | Phase C. | Yes for mode strings | Preserve compatibility request IDs until callers move. | Route markers may be compatibility names. |
| `packages/ts-shell/src/orchestration/verificationCommandPlan.ts` | product-runtime / eval-benchmark | Verification command planning with route benchmark command references. | Medium | Verification facade plus evidence command grouping. | Phase D/G. | Yes for historical commands | Keep old package aliases until grouped commands exist. | Source references package route scripts. |
| `packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts` | product-runtime / eval-benchmark | Capability boundary projection with route command references. | Medium | Product evidence/verdict projection. | Phase B/G. | Yes for current evidence labels | Keep route labels until evidence facade owns them. | Route labels may encode evidence provenance. |
| `packages/ts-shell/src/orchestration/toolEcosystemCapabilityRoute.ts` | product-runtime / evidence-report | Tool ecosystem capability route with default route label. | Medium | Tool/browser/MCP receipt-to-evidence facade. | Phase B/D. | Yes | Preserve Route227G distinctions. | Do not overclaim external-live readiness. |
| `packages/ts-shell/src/core/harness/**` | dev-harness / eval-benchmark / product-test | Browser/agent scenario harness, fixtures, reports, benchmark models. | High; harness lives under `core`. | Dev/eval harness namespace. | Phase G after product facades. | Yes | Keep tests and fixture imports stable. | 91 files; route labels preserve provenance. |
| `packages/ts-shell/src/core/harness/browserRuntimeMvpScenarioFixtures.ts` | dev-harness / eval-benchmark | Browser runtime MVP scenario fixtures. | Medium | Browser eval fixtures. | Phase G. | Yes | Preserve scenario IDs. | `Mvp` name is historical, but fixture provenance matters. |
| `packages/ts-shell/src/core/harness/browserEvalBenchmark*.ts` | eval-benchmark | Browser eval benchmark model/runner/report. | Medium | Browser eval namespace. | Phase G. | Yes | Preserve reports. | Eval surface, not product runtime. |
| `packages/ts-shell/src/core/harness/pwCloseout.test.ts` | product-test / dev-harness | Playwright closeout test. | Medium | Browser eval/product test split. | Phase G. | Yes if proving route closeout | Reclassify before rename. | Test name is route-era. |
| `packages/ts-shell/src/core/context/browserRuntimeGauntletManifest.ts` | product-runtime / dev-harness / inspect-further | Runtime-adjacent browser gauntlet manifest. | Medium | Browser runtime or eval manifest after review. | Phase D/G. | Yes if used as evidence | Determine product vs eval owner before move. | `gauntlet` suggests route/eval history. |
| `packages/ts-shell/src/core/context/projectMemoryCandidate*.ts` | product-runtime | Project memory candidate extraction/surface/quality. | Low | Product memory/context surface. | Keep. | No | None. | `candidate` is durable product vocabulary here; do not quarantine solely by keyword. |
| `packages/ts-shell/src/test-utils/**` and `packages/ts-shell/src/session/__tests__/**` | product-test / dev-harness | Test helpers and session tests. | Low to medium | Product test support. | Keep; classify in Phase G if needed. | No | Keep imports. | Not route-history by path. |
| `packages/rust-core/src/*` | product-runtime | Rust native executor candidate: executor, lib, daemon. | Low | Opt-in execution boundary runtime. | Keep. | No | Contract alignment tests. | No route-era filenames found. |
| `contracts/*`, `contracts/tests/*` | product-runtime / product-test | Cross-runtime protocol, generated/runtime types, contract tests. | Low | Contracts boundary. | Keep; final audit may verify drift. | No | Keep TS/Rust/Python alignment. | No route-era filenames found. |

## Route-Keyword Source Paths

Observed route/history-keyword paths under `packages/ts-shell/src`:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.ts`
- `packages/ts-shell/src/orchestration/patchResult/editCapabilityCloseoutManifest.test.ts`
- `packages/ts-shell/src/orchestration/controlledMultifileProofChain.ts`
- `packages/ts-shell/src/orchestration/providerAnchorCandidate.ts`
- `packages/ts-shell/src/orchestration/providerAnchorCandidate.test.ts`
- `packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.ts`
- `packages/ts-shell/src/orchestration/patchResult/boundedApplyPatchCandidate.test.ts`
- `packages/ts-shell/src/orchestration/patchResult/editCompatibilityGauntlet.test.ts`
- `packages/ts-shell/src/core/harness/browserRuntimeMvpScenarioFixtures.ts`
- `packages/ts-shell/src/core/harness/browserRuntimeMvpScenarioExamples.test.ts`
- `packages/ts-shell/src/core/harness/browserRuntimeGauntletScenarios.test.ts`
- `packages/ts-shell/src/core/harness/browserEvalBenchmarkModel.ts`
- `packages/ts-shell/src/core/harness/browserEvalBenchmarkRunner.ts`
- `packages/ts-shell/src/core/harness/browserEvalBenchmarkReport.ts`
- `packages/ts-shell/src/core/harness/pwCloseout.test.ts`
- `packages/ts-shell/src/core/context/browserRuntimeGauntletManifest.ts`
- `packages/ts-shell/src/core/context/projectMemoryCandidate.ts`
- `packages/ts-shell/src/core/context/projectMemoryCandidateExtractor.ts`
- `packages/ts-shell/src/core/context/projectMemoryCandidateExtractor.test.ts`
- `packages/ts-shell/src/core/context/projectMemoryCandidateQuality.ts`
- `packages/ts-shell/src/core/context/projectMemoryCandidateSurface.ts`

## Source Inventory Findings

- TypeScript contains the mixed product/runtime/harness/history surface; Rust
  and `contracts` are comparatively clean.
- `candidate` is not automatically route history; treat it as product vocabulary
  unless paired with route/evidence/proof naming.
- Source route markers should not be renamed until product facades and
  characterization tests prove behavior and result truthfulness are preserved.

## Disposition Summary

| Source family | Disposition | Reason |
|---|---|---|
| `entrypoints/cli.tsx` | keep | Product CLI composition root; shrink later through facades. |
| `session/SessionManager.ts` | keep | Product session owner; split only in Phase F. |
| `orchestration/runMvpIntegratedFlow.ts` | keep | Current runtime path despite stale name; facade before rename. |
| `runMvpIntegratedFlow.test.ts` | keep | Characterization coverage for current runtime path. |
| `editCapabilityCloseoutManifest.ts` | inspect further | Product readiness semantics under route-era name. |
| `controlledMultifileProofChain.ts` | inspect further | Proof/evidence code under product namespace. |
| Provider/proposal route-marker files | keep | Durable product contracts with compatibility markers. |
| Verification route-command references | alias | Keep old package aliases until grouped commands exist. |
| `core/harness/**` | move later | Dev/eval harness should move only after product facades and import review. |
| Browser gauntlet/MVP harness files | inspect further | Product-vs-eval owner must be decided before moves. |
| `projectMemoryCandidate*.ts` | keep | `candidate` is product vocabulary here. |
| `packages/rust-core/src/*` | keep | Clean native-executor-candidate product surface. |
| `contracts/*` | keep | Cross-runtime semantic boundary. |

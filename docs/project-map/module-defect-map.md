# Module Defect Map

This file records current defects and missing modules. It does not include fixes or next steps.

## Module Defects By Module

| Defect id | Affected modules | Description | Evidence/source | Severity | Defect type | Current impact | What is not proven |
|---|---|---|---|---|---|---|---|
| D-AGENT-001 | Agent Loop | `runMvpIntegratedFlow.ts` remains a 10649-line composition root covering prompt classification, context, provider, edit, verification, repair, browser, and result handoff. | `rtk wc -l`; `runMvpIntegratedFlow.ts` imports and dispatch branches | high | architecture | High change risk and route-specific coupling. | That all new capability branches can be safely composed without drift. |
| D-AGENT-002 | Agent Loop, Edit / Patch | Older direct mutation branch still exists in the main loop beside newer bounded edit routes. | `runMvpIntegratedFlow.ts` around `executeFileMutationBranch`; `mutationExecution.ts`; `fencedEditRoute.ts` | high | architecture | Multiple mutation paths can diverge in authority, stale-read, verification, and result behavior. | That every real prompt uses the newest bounded route. |
| D-CLI-001 | CLI / UX | `cli.tsx` remains an 821-line entrypoint with runtime bootstrap, mode dispatch, slash commands, MCP, approval, and session bridge wiring. | `rtk wc -l`; `cli.tsx` import list and interactive loop | medium | architecture | Entry-specific behavior drift remains possible. | That all CLI modes preserve identical result/session/approval semantics. |
| D-SESSION-001 | Session / Continue | `SessionManager.ts` remains a 2659-line persistence/continuity root. | `rtk wc -l`; `SessionManager.ts` methods for current sessions, snapshots, compact, approvals, recovery | high | architecture | Compact/replay/persistence changes have broad blast radius. | That long-session live-provider replay is stable outside focused gates. |
| D-PROVIDER-001 | Provider Smoke / Dry-run | Route 199 and Route 200 have materially different closure levels but similar "real provider" naming. | Route 201 inputs; `verify-real-provider-anchored-smoke.mjs`; `verify-real-provider-task-loop-mvp.mjs` | blocking for claim accuracy | evidence | Mislabeling Route 200 would create a false live task-loop success claim. | Provider-called/apply/verification in Route 200. |
| D-READ-001 | Read / Context Discovery | Read intent and target recovery are still prompt/regex dependent. | `readInspectIntent.ts`; `targetResolution.ts`; `runMvpIntegratedFlow.ts` intent branches | medium | capability | Vague or semantic requests can under-discover context. | Reliable semantic target discovery. |
| D-GRAPH-001 | Context Graph / Code Graph | Context graph is deterministic and budgeted but heuristic. | `contextDiscovery.ts`; `contextBudget.ts`; `contextGraph.ts` | medium | capability | Missing imports/call-sites can pass silently as omitted/low confidence. | Semantic dependency/call graph completeness. |
| D-PLAN-001 | Analysis / Plan Quality | Planning facts exist as deterministic projections but "think/decide" ownership remains split with Agent Loop. | `agentPlan.ts`; `planQuality.ts`; `taskLifecycleActivation.ts`; `runMvpIntegratedFlow.ts` | high | architecture | Plan readiness can be hard to interpret across routes. | A single owner for all planning decisions. |
| D-EDIT-001 | Edit / Patch | Candidate write surfaces are bounded but not broad apply_patch. | `workspaceWriteRoute.ts`; `scripts/verify/cases.mjs` candidate cases | accepted | capability | Broad/fuzzy/delete/move/AST/arbitrary mutations remain unsupported. | Broad refactor execution. |
| D-EDIT-002 | Edit / Patch, Snapshot / Recovery | Partial failure can leave changed files and requires explicit inspection/recovery; no automatic rollback. | `targetSetEditRoute.ts`; `proposalHunkSetRoute.ts`; candidate partial failure case | accepted | safety | Partial mutation is truthful but operationally manual. | Atomic transaction rollback. |
| D-VERIFY-001 | Verification / Runtime | Low-risk verification logic remains embedded in the Agent Loop. | `runMvpIntegratedFlow.ts` low-risk verification branch; `verificationModule.ts` | medium | architecture | Verification semantics are split between module and central loop. | Fully module-owned verification lifecycle. |
| D-REPAIR-001 | Repair Loop | Repair planning is no-write/review-required; no automatic repair execution. | `editRepairPlanner.ts`; `verificationRepairLoop.ts` | accepted | capability | Repair is safe but not autonomous. | Automatic provider-backed repair apply. |
| D-HARNESS-001 | Harness / Eval | Verifier layer is broad and mixes deterministic gates, dry-runs, fake provider, live-provider opt-in, descriptor, and release meta evidence. | `scripts/verify/index.mjs`; `scripts/verify/cases.mjs`; `verify-release-deterministic.mjs` | high | evidence | Gate names can be overread without case metadata. | That a single gate implies broad product readiness. |
| D-BROWSER-001 | Browser | Browser evidence is summarized only in Route 201 and no browser gate was run here. | `browserModule.ts`; Route 201 hard rule not to run browser gates | accepted | evidence | Browser claims remain summary-level in this map. | External/public live browser readiness. |
| D-MCP-001 | MCP | Local deterministic MCP error taxonomy is not external/user-configured MCP readiness. | `core/mcp/errorTaxonomy.ts`; `verify-mcp-local-execution.mjs`; `verify-mcp-error-taxonomy.mjs` | medium | evidence | External MCP behavior must not be claimed from local fixtures. | User-configured external MCP server readiness. |

## Cross-Module Defects

| Defect id | Affected modules | Description | Evidence/source | Severity | Defect type | Current impact | What is not proven |
|---|---|---|---|---|---|---|---|
| D-XMOD-001 | Agent Loop, Result Surface, Session / Continue | Many capabilities generate evidence/result text before generic result/session mapping. | `runMvpIntegratedFlow.ts`; `resultSurfaceModule.ts`; `resultMapper.ts`; `sessionRuntime.ts` | high | architecture | New branches can bypass truthfulness conventions. | Uniform lifecycle result object across every capability. |
| D-XMOD-002 | Provider, Proposal, Edit, Harness | Provider proposal exact-ready, proposal review, and apply-ready are separate states but easy to collapse. | `realProviderProposalDryRun.ts`; `providerAnchoredProposal.ts`; `editProposalApply.ts` | high | safety | False mutation authority claim risk. | Live provider output directly producing verified workspace apply. |
| D-XMOD-003 | Read, Analyze, Plan, Edit | Read -> analyze -> plan -> edit chain has deterministic evidence, but semantic understanding and autonomous planning remain bounded. | `contextPacket.ts`; `analysisBriefCalibration.ts`; `planQuality.ts`; `runMvpIntegratedFlow.ts` | medium | capability | Good local facts can still miss task-relevant semantics. | Broad reliable codebase reasoning. |
| D-XMOD-004 | Harness, Docs, Result Surface | Evidence labels are numerous and not inherently comparable. | `capability-recipes.md`; verifier markers; Route 201 evidence levels | high | evidence | A focused or default-safe pass can be mistaken for live runtime readiness. | Broad release readiness from deterministic gates alone. |

## Missing Or Implicit Modules

| Defect id | Affected modules | Description | Evidence/source | Severity | Defect type | Current impact | What is not proven |
|---|---|---|---|---|---|---|---|
| D-MISS-001 | Analysis / Plan Quality | No single "planning owner" module owns all think/plan/decide decisions. | Planning files plus `runMvpIntegratedFlow.ts` decision branches | high | architecture | Planning behavior is distributed. | Unified plan lifecycle boundary. |
| D-MISS-002 | Policy | No universal policy outcome vocabulary across approval, workspace, command, provider, browser, and MCP. | `capability-contract.md`; policy modules listed in atlas | medium | architecture | Cross-capability policy mapping is repeated. | Common policy contract across all capabilities. |
| D-MISS-003 | Runtime Receipt | Runtime receipts exist but command/browser/MCP/provider/edit receipts are not fully uniform. | `runtimeReceipt.ts`; `toolRuntimeModule.ts`; browser and MCP modules | medium | architecture | Result/session consumers still interpret capability-specific receipts. | Shared receipt projection for every runtime. |
| D-MISS-004 | Live Task Loop | Live provider-called apply/verification task loop is missing. | Route 200 observed `provider-called=false`, `apply=not-run`, `verification=not-run` | blocking for live task-loop claim | capability | Cannot claim live provider task-loop success. | Live provider task-loop apply and verification. |

## Overgrown Facades Or Composition Roots

- `runMvpIntegratedFlow.ts`: 10649 lines; central turn composition plus route-specific logic.
- `SessionManager.ts`: 2659 lines; central session persistence, recovery, compact, continuity, approval memory, current session registry.
- `cli.tsx`: 821 lines; process entrypoint plus slash/session/MCP/approval/interactive surfaces.
- `scripts/verify/index.mjs`: large verifier entrypoint with decomposed helpers but still broad real-user capability orchestration.

## Evidence / Reporting Defects

- Route 199 is live provider-called no-write evidence; Route 200 is stopped before provider call, apply, and verification.
- Deterministic release meta gate can prove deterministic bounded readiness markers but not broad release readiness.
- Candidate mutation synthetic cases can prove isolated fixture behavior but not arbitrary project mutation.
- Local deterministic MCP can prove local fixture execution/taxonomy but not external user MCP.
- Focused tests can prove local contract behavior but not broad integrated runtime coverage.

## Fake / Live / Default-Safe Evidence Confusion

- `fake-provider`: deterministic fake provider proposal/runtime coverage.
- `fake-ready-boundary`: fake-ready provider boundary that exercises provider-called wiring without real credentials.
- `default-safe-skip`: opt-in gates intentionally avoid provider/browser/external/mutation execution by default.
- `live-provider-called`: Route 199 only in this freeze.
- `not-proven`: Route 200 live task-loop apply/verification and broad release.

## Read -> Analyze -> Plan -> Edit Chain Defects

| Defect id | Affected modules | Description | Evidence/source | Severity | Defect type | Current impact | What is not proven |
|---|---|---|---|---|---|---|---|
| D-CHAIN-001 | Read / Context, Analysis | Context is deterministic and budgeted; semantic completeness is not guaranteed. | `contextDiscovery.ts`; `contextBudget.ts`; `analysisBriefCalibration.ts` | medium | capability | Analysis may be under-evidenced despite valid packets. | Semantic enough-context detection. |
| D-CHAIN-002 | Plan / Plan Quality, Edit / Patch | Plan readiness and edit authority are intentionally separate, but both can mention target/readiness. | `agentPlan.ts`; `planQuality.ts`; `workspaceWriteRoute.ts` | high | safety | Misreadiness can lead to unsafe claims if not mapped. | Plan as write authorization. |
| D-CHAIN-003 | Provider, Proposal, Edit | Provider exact-ready no-write proposal must still pass review/selection/apply route. | `realProviderProposalDryRun.ts`; `editProposalApply.ts` | high | safety | Provider output cannot directly mutate. | Direct provider-generated mutation. |
| D-CHAIN-004 | Edit, Verification, Repair | Partial failure and failed verification route to repair proposals, not automatic repair. | `targetSetEditRoute.ts`; `verificationRepairLoop.ts`; `editRepairPlanner.ts` | medium | capability | Recovery remains explicit/manual. | Automatic repair loop. |

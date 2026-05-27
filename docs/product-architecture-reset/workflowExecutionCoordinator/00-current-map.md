# Current Map

Audited file:

```text
packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
```

Current size and shape:

| Fact | Current value |
| --- | --- |
| Lines | 3282 |
| Import declarations | 51 |
| Runtime wrapper | `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`, 8 lines, re-exports runtime entrypoints and types |
| Focused runtime test | `packages/ts-shell/src/runtime/workflowExecutionCoordinator.test.ts`, one read-path compatibility test |
| Legacy characterization suite | `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`, broad suite still importing the old wrapper path |

## Imports By Owner

| Owner area | Imports used by coordinator | Current meaning |
| --- | --- | --- |
| Node/runtime | `fs`, `path`, observability logger/counts | Runtime setup and local stale-read checks. |
| Config/provider | `RuntimeProvider`, auth config, `runProviderDraftStage` | Runtime option shape and provider draft stage handoff. |
| Sandbox/tools | `SandboxEnforcer`, `ToolDispatcher`, `dispatchRuntimeTool`, provenance collector | Runtime tool dispatch and approval/provenance plumbing. |
| Runtime | `buildIntegratedFlowEnvironment` | Legitimate runtime environment setup. |
| Planning | `runPlanningRuntimeStage`, `buildWorkflowTaskPlan`, continuity extraction/rebind | Runtime delegates to planning but still consumes many planning details. |
| Context | read delivery, read window fingerprint, repo explain delivery | Context/read presentation logic is used directly inside execution branches. |
| Provider/proposal | provider draft and anchored proposal stage | Stage delegation; acceptable if coordinator only sequences. |
| Edit | apply-patch bridge, mutation instruction planner, discovery/fenced/target-set edit routes, workspace authority | Too much edit/write authority composition remains inside runtime execution. |
| Verification/policy | command intent policy, command stage, verification planning/projection/retry | Verification semantics partly delegated but low-risk readback semantics are inline. |
| Repair | cross-file repair planning | Repair strategy is partly inline in the runtime loop. |
| Evidence/result | freshness, turn evidence, result contract projection | Evidence/result owned modules exist, but the coordinator still assembles truth inputs. |
| Browser | browser module plan executor | Browser-specific branch is delegated but runtime still owns branch selection. |
| Session/continuity | runtime handoff projection and continuity state types | Runtime consumes continuity, but many prompt follow-up predicates remain local residue. |

Product import boundary check: `workflowExecutionCoordinator.ts` does not import docs, scripts, dev-history, or route report artifacts.

## Public Exports

| Export | Lines | Role | Audit classification |
| --- | ---: | --- | --- |
| `ApplyPatchRuntimeRouteOptions` re-export | 157 | Compatibility type export. | Compatibility glue. |
| `MvpIntegratedFlowOptions` | 159-183 | Legacy-compatible product turn input. | Compatibility glue; keep until a product-named input fully replaces it. |
| `runMvpIntegratedFlow` | 185-246 | Non-stream public entrypoint: optional apply-patch bridge, environment setup, runner creation, orchestrator run, metrics, close. | Valid runtime coordination plus legacy naming residue. |
| `streamMvpIntegratedFlow` | 249-308 | Stream public entrypoint with apply-patch terminal stream parity. | Valid runtime coordination plus legacy naming residue. |

## Major Local Symbols And Regions

| Lines | Symbol or region | Current responsibility | Density note |
| ---: | --- | --- | --- |
| 1-157 | Imports and compatibility type export | Pulls in runtime, planning, context, edit, verification, repair, evidence, result, browser, provider, proposal, policy, sandbox, tools. | High coupling surface. |
| 159-183 | `MvpIntegratedFlowOptions` | Legacy input contract for product turn runtime. | Name is stale but contract is active. |
| 185-246 | `runMvpIntegratedFlow` | Non-stream orchestration entrypoint and lifecycle cleanup. | Reasonable coordinator code. |
| 249-308 | `streamMvpIntegratedFlow` | Stream entrypoint and lifecycle cleanup. | Reasonable coordinator code. |
| 311-491 | `createIntegratedRunner` | Role-level runner for planner/coder/reviewer, continuity merge, task planning, chat/provider branch, execution handoff. | Mostly runtime coordination, but chat/provider drafting and reflective-state output should be treated as stage handoff boundaries. |
| 493-498 | `WorkflowExecutionResult` | Local result shape for execution stage. | Runtime adapter shape; can stay or move with stage executor. |
| 500-564 | `executeWorkflowTaskPlan` setup and first stage delegates | Initializes accumulators, evidence, provenance, git pre-run, freshness, planning runtime stage, anchored proposal stage. | Mixed coordination and evidence assembly. |
| 565-786 | Discovery edit and fenced edit activation | Builds discovery request, plans discovery, asks permission, creates workspace authority, runs target-set/fenced routes, projects results. | Edit/write domain composition in wrong owner. |
| 788-849 | Blocked plan handling and context planning packet | Initializes cross-file state, handles blocked reason, context planning bundle, blocked outcome projection. | Result/context policy mixed into runtime. |
| 851-859 | Browser plan branch | Delegates to browser module. | Valid coordination if branch selection stays thin. |
| 861-913 | Reopen and verify hint evidence | Adds continuation/reopen evidence and verify hints. | Evidence truth assembly in runtime; extraction candidate. |
| 915-1135 | Inspect-first/read-file branch | Reads target, captures protected snapshots, builds read delivery, optional context graph planning, projects read result. | Context/read delivery and result truth are inline. |
| 1137-1160 | Write protected snapshot pre-capture | Reads protected files before write. | Write/verification safety behavior; should move with edit verification preflight. |
| 1162-1233 | `inspect-files` branch | Glob `.ts`, deliver inspect result or failure. | Context inspection route should own. |
| 1235-1435 | `repo-explain` branch | Glob/read candidates, target selection, missing/ambiguous target result, diagnosis metadata. | Context/repo explain domain logic in wrong owner. |
| 1437-1806 | Write/edit primary planning and blockers | Cross-file noop, fenced/replace/rename extraction, repair replan, stale-transform handling, mutation instruction resolution, instruction failure projection. | Edit and repair strategy in wrong owner. |
| 1808-1909 | Primary mutation branch | Permission scope evidence, stale-read guard callback, mutation dispatch, accumulator mutation. | Runtime dispatch is valid; write authority and mutation route assembly should move. |
| 1911-2053 | Low-risk rename and secondary writes | Reads/edits additional files and applies secondary writes. | Edit/refactor and secondary write domain logic in wrong owner. |
| 2055-2337 | Cross-file repair execution | Reads linked targets, patch generation, permission scope, mutation dispatch, degradation/remaining-target calculation, evidence markers. | Repair strategy and partial-truth semantics in wrong owner. |
| 2339-2359 | Mutation summary reconciliation and direct command stage | Reconciles mutation results, delegates direct command. | Coordination plus result aggregation. |
| 2361-2859 | Verification planning and execution | Low-risk verification readback, content/unchanged/consistency semantics, command verification retry/projection, skipped/not-requested projection. | Verification semantics in wrong owner; largest post-edit truthfulness risk. |
| 2861-2941 | Final result contract assembly | Adds repair fallback, calls result contract projection with capability plan and receipts. | Result/evidence handoff should be facaded. |
| 2944-3108 | Prompt follow-up predicates and key term extraction | Correction, answer repair, verify continuation, weak repair, temporal successor, cross-file cue checks. | Planning/continuation residue; not used by this file after extraction. |
| 3129-3279 | Continuation transform helpers, mutation guard, target-resolution guard, path normalization | Parses transform evidence, collects transforms, narrows mutation instruction failure, target-resolution mutation blocker. | Planning/repair/evidence helpers; mostly extraction candidates or deprecated residue. |

## Current Consumers

Serena reference scan:

| Consumer | Meaning |
| --- | --- |
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts` | Legacy public import path wrapper. Must remain compatible. |
| `packages/ts-shell/src/turn/turnFacade.ts` | Product turn facade currently delegates through old compatibility export. |
| `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts` | Main characterization suite for legacy path and truthfulness behavior. |
| `packages/ts-shell/src/runtime/workflowExecutionCoordinator.test.ts` | Focused coordinator smoke coverage. |
| Browser harness and observability tests | Indirect runtime consumers through the old path. |
| Fenced edit and lifecycle tests | Adjacent compatibility and write-boundary coverage. |


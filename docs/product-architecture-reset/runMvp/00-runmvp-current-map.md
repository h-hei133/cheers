# runMvp Current Map

Current file:

```text
packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
```

Current size observed during this planning route:

```text
10599 lines
```

The file is not a single flow anymore. It is a legacy runtime container for
turn entrypoints, environment setup, planning, continuation recovery, edit
execution, verification, read delivery, evidence notes, and terminal result
projection.

## Top-Level Imports And Exports

| Lines | Symbols or imports | Current responsibility | Current owner smell |
|---:|---|---|---|
| 1-3 | `crypto`, `fs`, `path` | Hashing, direct file reads, path safety, edit/read helpers. | Mixed shared/runtime/edit/context concerns. |
| 4-24 | runtime config, MCP, PW runtime, sandbox, dispatcher | Environment setup for turn execution. | Turn/runtime setup is embedded in legacy flow. |
| 25-61 | role draft, workflow git, browser, command boundary, continuation, result projection | Capability modules consumed directly. | Legacy file composes many domain internals. |
| 62-160 | read/inspect, planning runtime, lifecycle, anchored proposal, verification, edit patch, handoff projection, tool runtime, target resolution | Planning and execution routes. | The file is acting as turn kernel and route registry. |
| 161-189 | workflow planner and result types | Shared plan/result contracts. | Domain contracts are used from orchestration paths. |
| 191-222 | `MvpIntegratedFlowOptions`, `ApplyPatchRuntimeRouteOptions` export | Legacy public API. | Must remain compatible until consumers migrate. |

## Entrypoints And Runtime Setup

| Lines | Symbol | Current responsibility | Notes |
|---:|---|---|---|
| 224-293 | `runMvpIntegratedFlow` | Applies optional apply_patch runtime route, builds runtime config, MCP snapshot, sandbox enforcer, dispatcher, integrated runner, orchestrator, metrics. | Public legacy async result entrypoint. |
| 295-361 | `streamMvpIntegratedFlow` | Same runtime setup, but emits query stream and special apply_patch terminal stream. | Public legacy stream entrypoint. |
| 363-381 | `runApplyPatchRuntimeRouteIfRequested` | Compatibility path for explicit apply_patch runtime route. | Edit/policy boundary hidden in entrypoint file. |
| 383-408 | `readWorkspaceFile`, `pathStaysInsideWorkspace` | Workspace-contained file read helper for no-write apply_patch runtime. | Belongs with edit/policy workspace authority. |
| 410-423 | `readAnchoredProposalCurrentContent` | Reads current content for anchored proposal lifecycle activation. | Provider/proposal adapter helper. |
| 425-606 | `createIntegratedRunner` | Builds role runner for planner, coder, reviewer; merges inline continuity; calls task planning and execution; handles chat/provider draft. | This is the current turn kernel. |

## Planning Cluster

| Lines | Symbols | Current responsibility | Notes |
|---:|---|---|---|
| 607-668 | `WorkflowTaskIntentSignals`, `FreshnessObservability`, `WorkflowExecutionResult`, read window types | Local planning/execution contracts. | These should become typed turn/context/repair contracts. |
| 670-2540 | `buildWorkflowTaskPlan` | Main intent classifier, target resolver, continuation router, repair/verify object builder, read/write/run/browser task selector, blocked reason producer. | Largest planning hotspot. Must be split by product domain, not helper buckets. |
| 2541-2557 | `shouldBuildContextPlanningSurface`, `removeNegatedMutationInstructions` | Context-planning activation and mutation intent cleanup. | Context/planning ownership. |
| 2559-2699 | `extractWorkflowTaskIntentSignals` | Prompt signal extraction for read, inspect, edit, verify, continuation, diagnosis, execution, unsupported commands. | Planning intent parser. |
| 2700-3221 | inline continuity and low-level prompt helpers | Extracts context seed state, path targets, read filters, verification commands, file refs, and content snippets. | Mostly context/planning with some edit/verification leaves. |
| 3222-3325 | `buildFreshnessObservability` | Produces freshness/staleness evidence from continuity and plan. | Evidence/context boundary. |
| 3326-4052 | repair and continuation target recovery helpers | Single-file repair context, cross-file repair candidates, degraded reopen, retention of remaining failures. | Repair/session/context ownership. |

## Execution Cluster

| Lines | Symbols | Current responsibility | Notes |
|---:|---|---|---|
| 4053-4091 | `appendSingleFileEditRepairObservability` | Adds repair observability evidence to execution evidence rows. | Evidence/repair bridge. |
| 4092-6688 | `executeWorkflowTaskPlan` | Main runtime executor. Initializes evidence/notes, dispatches planning runtime, lifecycle, anchored proposal, discovery/fenced edit, blocked outcome, browser, read/inspect/repo explain, mutation, cross-file repair, verification, result handoff. | Largest execution hotspot. Should become turn stage pipeline. |

## Delivery And Projection Helpers

| Lines | Symbols | Current responsibility | Notes |
|---:|---|---|---|
| 6689-7414 | `buildReadTaskDelivery`, `buildSingleGroundedDelivery` | Read, summarize, explain, line-window, filtered output, evidence markers. | Context/read delivery plus result projection. |
| 7415-7594 | `mergeGroundedRepairConstraints`, inspect/explain/purpose IO delivery, content summaries | Grounded read/explain delivery and summaries. | Context/result delivery. |
| 7595-7865 | follow-up cue classifiers | Correction, answer repair, execution correction, verify continuation, weak seed carryover, temporal successor, cross-file cues, local explain cues. | Planning/continuation parser. |
| 7871-8583 | line count, read window, fragment reanchor, fingerprint helpers | Read continuation window recovery and selective reanchor. | Context/session continuation. |
| 8584-9133 | grounded repair instruction/stage parsing and mode detection | Normalizes grounded answer repair and staged read delivery. | Repair/context planning. |
| 9134-9238 | verify command detection, low-risk refactor secondary writes, file refs, stable ids | Verification command selection and edit prompt parsing. | Verification/edit/shared split. |
| 9239-9637 | fenced/replace/transform parsing and local block inference | Patch/edit transform extraction. | Edit/proposal boundary. |
| 9643-10517 | mutation target selection, mutation instruction resolution, low-risk generated content, scoped replace, line-scoped repair, mutation failure classification, line delta | Edit planning and mutation instruction generation. | Edit domain. |
| 10518-10599 | truncation, path normalization, prompt path target, execution intent | Shared string/path helpers and planning intent helpers. | Shared/context/planning split. |

## Current Consumers

Serena reference inspection found the public entrypoints consumed by:

- `packages/ts-shell/src/turn/turnFacade.ts`
- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts`
- `packages/ts-shell/src/orchestration/fencedEditRuntimeActivation.test.ts`
- `packages/ts-shell/src/orchestration/anchoredProposalRuntime.test.ts`
- `packages/ts-shell/src/orchestration/taskLifecycleActivation.test.ts`
- `packages/ts-shell/src/observability/traceContext.e2e.test.ts`
- `packages/ts-shell/src/core/harness/browser*.test.ts`

The compatibility path must preserve both direct legacy imports and the current
product turn facade until tests and CLI/session callers are migrated.

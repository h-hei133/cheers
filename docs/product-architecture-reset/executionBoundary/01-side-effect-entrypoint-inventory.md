# Side-Effect Entrypoint Inventory

This inventory is based on current source inspection. It records sanctioned owner areas and current exceptions; it is not a request to migrate every caller in one route.

## Command And Process Execution

Sanctioned command/process owners:

- `packages/ts-shell/src/runtime/execution/executionService.ts`: TypeScript execution boundary used by core tool calls.
- `packages/ts-shell/src/daemon/client.ts`: transitional adapter for TS-local execution and optional Rust daemon execution.
- `packages/ts-shell/src/core/mcp/client.ts`: MCP stdio process client.
- `packages/ts-shell/src/workflow/gitContext.ts`: git context probe.
- `packages/ts-shell/src/core/context/browserSkillExecutionExecutor.ts`: browser skill runner process owner.
- `packages/ts-shell/src/core/context/browserExternalRunnerProcess.ts`: external browser runner process owner.
- `packages/ts-shell/src/core/context/browserRuntimeProcessAdapter.ts`: browser runtime process adapter.
- `packages/ts-shell/src/core/commands/openaiAccountAuth.ts` and `packages/ts-shell/src/core/commands/browserAuthOnboarding.ts`: browser-opening auth/onboarding helpers.

The core tool registry no longer imports `child_process` directly; command tools route through the execution service.

## Writable File-System Side Effects

Sanctioned write/delete/mkdir/rename owners include:

- `packages/ts-shell/src/runtime/execution/executionService.ts`: generic text read/write/list operations for tool adapters.
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`: workspace write authority with stale-read and path-boundary checks.
- `packages/ts-shell/src/orchestration/patchApplication/*`: low-level patch application.
- `packages/ts-shell/src/orchestration/patchResult/*Route.ts` and `*Lane.ts`: legacy patch/result route coordination where already justified.
- `packages/ts-shell/src/edit/*RuntimeStage.ts` and `packages/ts-shell/src/edit/multifile/*`: current edit-domain mutation callers.
- `packages/ts-shell/src/session/store/*`, `packages/ts-shell/src/session/transcript/*`: durable session persistence.
- `packages/ts-shell/src/core/context/browserReceiptCache*`, `browserSelfHealingManifestPatchWriter.ts`, and `projectMemoryLocalStore.ts`: browser receipt/cache and project-memory stores.
- `packages/ts-shell/src/sandbox/auditTrail.ts`, `packages/ts-shell/src/config/runtimeConfig.ts`, and `packages/ts-shell/src/core/context/startupWarmContextHealth.ts`: explicit local runtime state/audit/config writers.

New file mutation logic should prefer the owning edit/session/browser/config/cache module rather than adding direct writable `fs` calls in unrelated modules.

## Apply Patch And Workspace Mutation

Current owners:

- `packages/ts-shell/src/edit/applyPatchRuntimeBridge.ts`
- `packages/ts-shell/src/orchestration/mutationRoutingProjection.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceWriteRoute.ts`
- `packages/ts-shell/src/orchestration/patchResult/multiFileWriteRoute.ts`
- `packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceCreateRoute.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceDeleteRoute.ts`
- `packages/ts-shell/src/orchestration/patchResult/workspaceMoveRoute.ts`

These routes must preserve explicit dry-run, preview, permission-pending, denied, approved-for-write, write-success, and verification states.

## Browser, MCP, And Network Side Effects

MCP side effects are owned by `packages/ts-shell/src/core/mcp/*` and surfaced through `ToolRuntime`.

Browser process side effects are owned under `packages/ts-shell/src/core/context/browser*` runtime modules. Public web and external-network browser paths remain gated by their own policy, manifest, receipt, and egress surfaces.

Runtime network side effects are concentrated in:

- `packages/ts-shell/src/model-adapters/providerFetch.ts`
- provider adapters under `packages/ts-shell/src/model-adapters/providers/`
- auth/connect/model command runtimes under `packages/ts-shell/src/core/commands/`
- browser public/external-network modules under `packages/ts-shell/src/core/context/`

This route does not change provider defaults or live-provider behavior.

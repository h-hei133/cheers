# Pi Deep Audit Uncovered Patterns

BI006 is a documentation-only audit. It does not authorize product code,
route runners, verify scripts, package scripts, JSON capability reports, new
dependencies, dynamic plugin execution, provider default enablement, session
schema migration, or ExecutionService bypass.

## Inputs And Inspection Status

- Current project: `/home/wang/projects/coding-agents`
- Pi reference project: `/home/wang/projects/pi`
- Serena status: available and used on both repositories
- Pi official docs status: internet access was available and checked

Pi official docs checked:

- `https://pi.dev/docs/latest/extensions`
- `https://pi.dev/docs/latest/sessions`
- `https://pi.dev/docs/latest/session-format`
- `https://pi.dev/docs/latest/compaction`
- `https://pi.dev/docs/latest/rpc`
- `https://pi.dev/docs/latest/json`
- `https://pi.dev/docs/latest/sdk`
- `https://pi.dev/docs/latest/packages`
- `https://pi.dev/docs/latest/providers`
- `https://pi.dev/docs/latest/models`

Serena current-project inspection covered:

- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/turn/turnSnapshot.ts`
- `packages/ts-shell/src/evidence/runtimeSavePoint.ts`
- `packages/ts-shell/src/runtime/execution/executionService.ts`
- `packages/ts-shell/src/runtime/events/runtimeEventProjection.ts`
- `packages/ts-shell/src/runtime/resources/staticResourceProjection.ts`
- `packages/ts-shell/src/session/sessionTreeProjection.ts`
- `packages/ts-shell/src/core/tools/registry.ts`
- `packages/ts-shell/src/core/shell/sessionRuntime.ts`
- `packages/ts-shell/src/core/shell/sessionFutureTurnProjection.ts`
- `packages/ts-shell/src/provider/providerDraftStage.ts`
- `packages/ts-shell/src/planning/planningRuntimeStage.ts`
- `packages/ts-shell/src/context/readRuntimeStage.ts`
- targeted searches for provider hooks and session branch/compaction terms

Serena Pi inspection covered:

- `packages/agent/src/harness/agent-harness.ts`
- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/harness/types.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/session-manager.ts`
- `packages/coding-agent/src/core/resource-loader.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- `packages/coding-agent/src/core/package-manager.ts`
- `packages/coding-agent/src/core/model-registry.ts`
- `packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- `packages/coding-agent/src/modes/rpc/jsonl.ts`
- `packages/coding-agent/src/core/tools/file-mutation-queue.ts`
- `packages/coding-agent/src/modes/interactive/components/tool-execution.ts`
- `packages/coding-agent/src/core/export-html/tool-renderer.ts`
- `packages/ai/src/api-registry.ts`
- `packages/ai/src/env-api-keys.ts`

## What BI001 To BI005 Already Covered

BI001 created the first Pi pattern map and roadmap. It classified Pi ideas by
local owner domain and rejected direct copying of Pi package names, dynamic
resource discovery by default, provider default enablement, and ExecutionService
bypass.

BI002 implemented the first runtime boundary layer:

- `turn/turnSnapshot.ts` provides a frozen, report-safe turn snapshot.
- `runtime/runtimePhase.ts` provides a runtime phase vocabulary.
- `evidence/runtimeSavePoint.ts` provides an evidence-only save point that does
  not claim terminal success.
- `runtime/workflowExecutionCoordinator.ts` consumes the snapshot/save-point
  shape at the runtime seam.

BI003 implemented the execution and tool-result layer:

- `runtime/execution/executionService.ts` remains the execution boundary.
- `runtime/execution/executionErrorTaxonomy.ts` classifies command outcomes.
- `runtime/execution/executionReceipt.ts` projects report-safe receipts.
- `core/tools/registry.ts` emits split tool `content` and `details`.

BI004 implemented projection-only session and event infrastructure:

- `session/sessionTreeProjection.ts` projects the current linear session path
  and explicitly marks branch support as not proven.
- `runtime/events/runtimeEventProjection.ts` projects host-neutral runtime
  observations from snapshots, receipts, save points, result facts, session
  projection, and static resources.
- CLI/session surfaces only summarize safe facts.

BI005 implemented a static resource contract experiment:

- `runtime/resources/staticResourceDescriptor.ts` describes safe static
  resources, provider metadata, extension-like manifests, and package metadata.
- `runtime/resources/staticResourceProjection.ts` projects explicit in-memory
  resources only.
- Dynamic discovery, package loading, plugin execution, and provider default
  enablement remain disabled and represented as not-proven claims.

## Uncovered Pi Pattern Audit

| Pattern | Pi evidence | Local status | Why it matters | Route? |
|---|---|---|---|---|
| Extension lifecycle and hook boundary | Pi `AgentSession` binds extensions, `ExtensionRunner` emits lifecycle events, `ExtensionAPI` supports tools, commands, providers, UI, shortcuts, and message renderers; docs describe extension loading and APIs. | Only static extension-like metadata exists. No executable extension lifecycle, no runtime hook API, no extension state owner. | This is the largest remaining Pi pattern because it externalizes workflow without putting everything into core. It is also the highest safety risk. | Yes, but first route must be contract/lifecycle-only and default-disabled. |
| Tool hook and permission interception | Pi tool call/result event types can block or patch tool calls/results; agent loop supports before/after tool execution. | Local tools already use permission context and ExecutionService; no general hook boundary exists. | A hook boundary could centralize policy interception, but it can also mutate success, evidence, or tool content if not constrained. | Yes, after extension lifecycle has a non-executable hook contract. |
| Session branch, compaction, and context rebuilding | Pi `SessionManager` has parent ids, leaf ids, branch/fork operations, compaction entries, branch summaries, and `buildSessionContext`. Docs cover sessions/session-format and compaction. | Local `sessionTreeProjection.ts` is schema-neutral and linear-path only. Compaction modules exist, but branch support and branch summaries are not primary session state. | Branch-aware context rebuild is needed before extension state or SDK hosts can reason about alternate leaves. | Yes, separate from extension routes because persistence/replay risk differs. |
| SDK, RPC, and JSON event stream | Pi has `sdk.ts`, RPC mode, JSONL reader/writer, and docs for SDK/RPC/JSON mode. | Local runtime event projection exists, but no SDK/RPC host contract. CLI remains the only real product host. | A programmatic host boundary avoids making terminal text the runtime API. | Yes, after event projection is stable and before external host promises. |
| Provider/model registry with compatibility flags | Pi `ModelRegistry` has provider configs, model overrides, compatibility schemas, request auth resolution, registered providers, and docs for providers/models. | Local provider draft/readiness exists and BI005 added provider metadata only. No broad local model registry or compatibility flag owner. | Compatibility flags prevent provider-specific branching from spreading through runtime code. | Yes, but default-off and metadata-first. |
| Package/resource governance | Pi `DefaultPackageManager` resolves package resources, manifests, npm/git/local sources, filters, and packages docs. | Local static resource projection forbids package loading and dynamic discovery. | Package governance is necessary before any resource ecosystem can be adopted safely. | Yes, as governance/audit before any install/load behavior. |
| UI rendering and message renderer boundary | Pi separates TUI components, tool execution rendering, extension message renderers, and export-html renderers. | Local CLI/session surfaces render safe text summaries; no renderer registry or UI package target. | Renderer boundaries prevent runtime facts from being shaped by terminal display code. | Yes, but as a boundary design route, not a TUI adoption route. |
| Resource loading beyond static descriptors | Pi `DefaultResourceLoader` discovers skills, prompts, themes, extensions, context files, and package resources. | Local BI005 is explicit in-memory static projection only. | Future resource loading needs provenance, redaction, opt-in, and owner boundaries. | Delay until governance and extension lifecycle contracts exist. |
| Steering, follow-up, and next-turn delivery modes | Pi `AgentHarness` has `steer`, `followUp`, `nextTurn`, queue modes, and queue update events. | Local session future-turn injection and prompt barriers exist, but no explicit delivery-mode model. | This clarifies user input semantics during active runs and across next turns. | Yes, after session/context rebuild route. |
| Compaction and branch summary strategy | Pi has compaction preparations, compaction entries, branch summaries, and before-compact/tree hooks. | Local compact projections and retention planners exist, but summaries are not branch-aware truth boundaries. | Summaries improve continuity, but can be mistaken for evidence or terminal success. | Yes, grouped with session branch route. |
| Extension state persistence and branch-aware rebuild | Pi extensions participate in session lifecycle and can observe branch/tree events. | No local extension state exists. Branch support is not proven. | Without branch-aware state, extensions can leak state across leaves or stale contexts. | Delay until both extension contract and branch projection exist. |
| Parallel and sequential tool execution safety | Pi agent loop supports sequential and parallel tool execution. | Local tool execution is permission-oriented; mutation routes already have stricter write authority and stale-read checks. | Read-only parallelism can help, but mutation parallelism risks write conflicts and false evidence ordering. | Experiment only, read-only first. |
| Per-file mutation queue/write conflict prevention | Pi has `file-mutation-queue.ts` in coding tools. | Local edit/write routes have authority, stale-read, and workspace write boundaries, but no named general per-file queue owner. | It can prevent simultaneous writes to the same file when concurrent tool paths exist. | Delay until parallel tool execution is scoped. |
| Provider request hooks and per-request auth refresh | Pi `AgentHarness` exposes before-provider request/payload hooks and `ModelRegistry.getApiKeyAndHeaders`. | Local search found provider request retry and provider stages, but no general provider request hook API. Real provider remains explicit opt-in. | Needed for SDK/extension providers and auth refresh, but dangerous around secrets. | Delay until provider/model registry route. |
| Runtime host separation between CLI, SDK, tests, and future UI | Pi separates agent harness, SDK, RPC, TUI, and core session runtime. | Local CLI/session runtime consumes projections; tests call runtime directly, but there is no host contract. | Host separation reduces CLI coupling and prepares future SDK/UI without output drift. | Yes, after SDK/RPC event route. |

## Adopt, Delay, Reject Summary

Adopt now:

- Extension lifecycle and non-executable hook boundary.
- Session branch/compaction/context rebuild projection.
- Programmatic runtime API and JSON event stream contract.
- Provider/model registry with compatibility flags.
- Tool permission interception as a constrained policy boundary.

Delay:

- Resource loading beyond static descriptors.
- Package installation or package loading.
- Extension state persistence and branch-aware rebuild.
- Parallel tool execution beyond read-only experiments.
- Per-file mutation queues until concurrency exists.
- Provider request hooks until model registry and auth boundaries are explicit.
- Runtime host separation beyond CLI until event stream contract is stable.

Reject now:

- Direct Pi package/file naming.
- TUI package adoption as a route goal.
- Dynamic plugin execution.
- Provider default enablement.
- Session schema migration as the first branch route.
- ExecutionEnv copied as a second side-effect path.

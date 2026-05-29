# Build Infrastructure Owner Domain Map

Status: BI017 closeout.
Date: 2026-05-29.

## Owner Domains

| Owner domain | Owns | Must not own | Known compatibility exceptions |
|---|---|---|---|
| `runtime` | Product runtime boundaries, workflow coordination seams, host-neutral runtime facts | Provider secrets, presentation truth, session schema migrations by convenience | `workflowExecutionCoordinator` remains current product composition owner. |
| `runtime/loop` | Agent loop contract, loop infrastructure map, loop trajectory projection | Current product loop replacement, provider streaming, tool execution expansion | Local contract/spine only; not a new runtime island. |
| `runtime/events` | Host-neutral runtime event projection and JSON event stream projection | Terminal truth, UI rendering, SDK/RPC server behavior | JSON stream is projection-only. |
| `runtime/execution` | Execution receipts, execution policy metadata, command/file side-effect boundary shapes | Direct product success, tool policy ownership, provider auth | Receipts can be consumed by tools/result/evidence. |
| `runtime/resources` | Static resource descriptors, package inventory, package/resource governance metadata | Package install/load, dynamic discovery, plugin execution | Static metadata can reference provider/resource descriptors. |
| `runtime/extensions` | Extension lifecycle event and hook policy contracts | Executable plugin runtime, dynamic imports, provider/tool success rewriting | Hook outcomes are policy observations only. |
| `turn` | Frozen turn snapshot and turn-boundary facts | Execution side effects, provider calls, terminal verdicts | None for BI closeout. |
| `session` | Session lifecycle, active path/tree projection, continuation/compaction projections | Runtime truth ownership, provider/tool execution, route history logic | `SessionManager` remains a rightful domain manager. |
| `context` | Context rebuild projection and report-safe context policy | Raw transcript dumps, unsafe file contents, tool/resource details by default | None for BI closeout. |
| `tools` | Tool result split, before-tool policy decision, after-tool annotation, blocked result projection | ExecutionService internals, terminal success, provider auth | Existing core/tool compatibility paths may consume tool projections. |
| `provider` | Provider/model registry metadata, compatibility flags, auth status projection | Real provider default enablement, private config reads, provider-called success | Provider readiness display can consume metadata. |
| `policy` | Permission, hook, package, and safety policy vocabulary when needed | Side effects, product loop orchestration, compatibility shim logic | Some policy state is projected through tools/resources/extensions owners. |
| `presentation` | Product surface view model and terminal message rendering | Runtime facts, verdict ownership, provider/tool/session success decisions | `core/shell` CLI adapter delegates to presentation. |
| `evidence` | Save points, verdict facade, evidence rows, not-proven truthfulness | Provider calls, tool execution, UI formatting | Historical report verdict compatibility is isolated. |
| `result` | Result truth adapters, workflow/runtime result projections, terminal truth mapping | Runtime execution, provider metadata ownership, UI styling | Query-level result mapper remains generic. |
| `core/shell` | Shell/session host adapter, CLI session runtime seam, readiness/session display consumption | Feature policy, provider/tool success, runtime loop replacement | `cliSessionProductSurface` is an adapter; it should delegate to presentation. |

## Product Code Versus Docs-only By Domain

Product code domains:

- `runtime`, `runtime/loop`, `runtime/events`, `runtime/execution`,
  `runtime/resources`, `runtime/extensions`
- `turn`
- `session`
- `context`
- `tools`
- `provider`
- `policy`
- `presentation`
- `evidence`
- `result`
- `core/shell`

Docs-only domains:

- BI001 architecture planning documents.
- BI006 deep audit documents.
- BI017 closeout and roadmap documents.

## Compatibility Exceptions

Compatibility surfaces must remain delegate-only or history-only:

- `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts`
- legacy route-history verifier scripts and package commands
- older harness provenance labels covered by `core/harness` compatibility notes
- historical docs under `docs/build-infrastructure`, `docs/dev-history`, and
  other history/reference folders

These exceptions are not permission to add new business logic to compatibility
shims.

## Boundary Rules For Future Routes

- Product loop integration should consume the loop spine; it should not move
  product orchestration into presentation or compatibility shims.
- Provider work must stay default-off and explicit opt-in.
- Tool work must keep before-tool policy, execution receipt, result details, and
  evidence/verdict separate.
- Session work must not migrate durable schema as a side effect of projections.
- Presentation work must render owner facts and not become the fact owner.

# Agent Loop Infrastructure Connection Map

Status: BI017 closeout.
Date: 2026-05-29.

## Reading This Map

Statuses:

- `connected`: represented in the BI016 loop integration map or trajectory.
- `projection-only`: represented as safe metadata or projection, not behavior.
- `contract-only`: represented as a boundary or policy contract.
- `not-proven`: visible as unsupported or unproven.
- `deferred`: intentionally left for a future product route.

## Connection Map

| Infrastructure | Owner domain | Current surface | Loop status | Notes |
|---|---|---|---|---|
| Prompt input | `runtime/loop` | `AgentLoopContractInput.prompt`, trajectory prompt summary | connected | Prompt is summarized and report-safe; it is not task success. |
| Turn snapshot | `turn` | `RuntimeTurnSnapshot`, `createRuntimeTurnSnapshot` | connected | Snapshot id, session id, turn, provider mode, and phase can appear in loop events. |
| Runtime phase | `turn`, `runtime` | snapshot `phase`, save point `phase` | connected | Phase is observational and does not prove completion. |
| Model/provider boundary | `runtime/loop` | `AgentLoopContractModelResponseBoundary` | contract-only | Model output is a claim. Real provider streaming is deferred. |
| Provider/model metadata | `provider` | `ProviderRegistryProjection`, model descriptors, compatibility flags | projection-only | Default enablement remains disabled; provider-called is not success. |
| Resource/package metadata | `runtime/resources` | static resource projection, package inventory projection | projection-only | No package install, load, script execution, network lookup, or dynamic discovery. |
| Extension lifecycle | `runtime/extensions` | lifecycle event and hook descriptor contracts | contract-only | Executable extension lifecycle remains deferred. |
| Hook policy | `runtime/extensions`, `tools`, `policy` | extension hook policy outcome and tool interception policy | contract-only | Hooks cannot rewrite success or bypass authority. |
| Tool policy | `tools`, `policy` | `ToolBeforePolicyDecision` | connected | Before-tool policy is observable in trajectory and runtime events. |
| Tool result details | `tools` | `createCommandToolResultSplit`, report-safe details | connected | Tool result details are report-safe; tool success remains not-proven unless separately evidenced. |
| Execution receipt | `runtime/execution` | `RuntimeExecutionReceiptProjection` | connected | Exit status is captured but command exit zero is not terminal success. |
| Save point | `evidence` | `RuntimeEvidenceSavePoint` | connected | Evidence-only save point preserves not-proven claims. |
| Next turn | `runtime/loop`, `session`, `context` | pending next-turn facts in loop projection | connected | Prepared next turn is not proof of task success. |
| Session active path | `session` | `SessionTreeProjection.activePathProjection` | projection-only | Current storage-backed branching remains not-proven. |
| Context rebuild | `context` | `SessionContextRebuildProjection` | projection-only | Rebuild excludes raw transcript, tool details, and resource details. |
| Runtime events | `runtime/events` | `RuntimeProjectionEvent` | connected | Events are host-neutral observations. |
| JSON event stream | `runtime/events` | `JsonRuntimeEventStreamEntry` | connected | JSON-safe projection, not an SDK/RPC server. |
| Product surface rendering | `presentation` | `ProductSurfaceViewModel`, terminal renderer | connected | Renderer formats facts but is not the fact owner. |
| Result truthfulness | `result`, `evidence` | result facts, verdict facade, terminal truth adapters | connected | Evidence/verdict/result remain terminal truth owners. |
| Product loop replacement | `runtime/loop` future seam | BI016 trajectory and infrastructure map | not-proven | Current product loop is not replaced. |
| Real provider streaming | `provider`, model adapter future route | none enabled by BI routes | deferred | Requires explicit opt-in and redaction gates. |
| Real product tool batch execution | `tools`, `runtime/execution`, product loop future route | contract and receipts only | deferred | Current trajectory observes; it does not execute product tool batches. |

## Loop Spine Summary

The BI016 loop spine can connect existing infrastructure in a single safe
trajectory:

prompt input -> turn snapshot -> phase -> provider boundary observation ->
tool policy/tool result/receipt observations -> save point -> next turn facts ->
session/context projections -> runtime events -> JSON stream -> product surface
summary -> result/not-proven facts.

This is intentionally not a replacement for `workflowExecutionCoordinator`,
`ShellSessionRuntime`, or `SessionManager`.

## Truthfulness Rule

None of the following can become terminal success through the loop map,
trajectory, event stream, or product surface:

- provider metadata
- provider called
- tool allowed
- tool result observed
- command exit zero
- execution receipt observed
- save point observed
- next turn prepared
- session projected
- context rebuilt
- product surface rendered
- event emitted

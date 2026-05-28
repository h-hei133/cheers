# Pi Pattern Adoption Matrix

This matrix classifies Pi architecture patterns for this project. It is not an
implementation plan for copying Pi. Product code remains unchanged in BI001.

Allowed classifications:

- adopt now
- adapt later
- reject
- already covered
- needs experiment

## Matrix

| Pi pattern | Classification | Local project problem it solves | Local owner domain | Target module area | Expected benefit | Route-era pollution risk | Evidence / inspection source | Recommended phase |
|---|---|---|---|---|---|---|---|---|
| Small core plus extension/resource model | adapt later | Current project has many capability-specific surfaces, but dynamic discovery is deliberately blocked. A resource model would need a safety envelope first. | Runtime / Resources, Policy, CLI / UX | Future `runtime/resources` or existing context/resource-adjacent owner, not `utils` or product shims | Gives skills/prompts/extensions a bounded owner instead of ad hoc startup injection | High if implemented as broad discovery or startup magic | Pi `DefaultResourceLoader`, `ExtensionAPI`; local search found explicit no dynamic skills/MCP discovery markers | Resource contract route after harness snapshot route |
| AgentHarness above low-level loop | adopt now | Current `workflowExecutionCoordinator` still composes turn execution, environment, provider/tool/edit/browser branches, and result handoff. | Runtime / Turn, Agent Loop | New owner-owned turn runtime planning under `runtime` and `turn`; existing `workflowExecutionCoordinator` remains composition root | Creates a stable boundary for mutable run config, frozen turn inputs, queues, and save points | Medium if named after Pi or placed in compatibility/product route files | Pi `AgentHarness`; local `workflowExecutionCoordinator`, `turnFacade` | BI002 harness and turn snapshot design route |
| Frozen turn snapshot | adopt now | Runtime options, continuity state, provider mode, browser status, planning mutation options, and tool/runtime context are passed through large option bags. | Turn, Runtime, Session / Continue | `packages/ts-shell/src/turn` plus runtime handoff types | Prevents mid-turn mutation ambiguity and gives evidence a stable turn input record | Medium if it becomes a generic helper or captures provider secrets | Pi `AgentHarness/createTurnState`; local `MvpIntegratedFlowOptions`, `ProductTurnContext` | First implementation route |
| Save point after tool/result batch | adopt now | Current command/edit/verification/browser stages produce evidence, but there is no single named checkpoint for flushing session/evidence before the next model turn. | Runtime, Session / Continue, Evidence, Result Surface | Runtime turn boundary plus Session persistence projection | Gives a precise place to flush safe evidence, refresh next-turn state, and preserve truthfulness | Medium if it is allowed to imply write success or provider success | Pi `prepareNextTurn` and `flushPendingSessionWrites`; local `sessionRuntime`, evidence ledger, verification stage | First or second implementation route |
| Explicit phase model | adopt now | Current shell/runtime has state machine behavior, but structural operations such as continue, compact, retry, and future branch navigation are not expressed as one shared phase vocabulary. | Runtime, Session / Continue, CLI / UX | `runtime` phase type consumed by session and CLI hosts | Blocks unsafe overlapping structural operations without boolean sprawl | Low to medium if phases are overbroad or used to bypass result truthfulness | Pi `AgentHarnessPhase`; local `ShellStateMachine`, `SessionManager`, continuation runtime | First implementation route with snapshot |
| Steering, follow-up, next-turn delivery modes | adapt later | Current continuation and prompt barriers exist, but user message delivery modes are not a product gap until interactive runtime routes need them. | CLI / UX, Runtime, Session / Continue | Interactive command router and session runtime | Clarifies mid-run input semantics | Medium if it changes current CLI behavior or session schema prematurely | Pi `steer`, `followUp`, `nextTurn`; local interactive command router and continuation surfaces | After harness phase model |
| Low-level agent loop separated from harness | already covered | Current architecture cleanup made `workflowExecutionCoordinator` the real flow owner and compatibility wrapper thin. Further split should be risk-driven. | Agent Loop, Runtime | Existing runtime workflow coordinator | Avoids regrowing product shims | Medium if another generic loop abstraction is added without repeated fields | Local `runMvpIntegratedFlow` re-export and runtime coordinator; Pi `agent-loop.ts` | No immediate route by itself |
| Tool runtime hooks before/after call | adapt later | Local tools already enforce permission and ExecutionService, but hookable pre/post tool mutation can conflict with evidence truthfulness. | Tool, Policy, Result Surface | `core/tools`, runtime receipt projection | Could support policy auditing and result patching after a stable contract exists | High if hooks can rewrite success, content, or details without verdict rules | Pi `beforeToolCall`, `afterToolCall`; local `createCoreToolRegistry`, runtime receipts | Later Tool / Policy contract route |
| Sequential vs parallel tool execution mode | needs experiment | Current tool dispatch is permission-oriented; parallel mutation risks stale reads and write ordering. | Tool, Runtime, Edit / Patch, Verification | Tool dispatcher experiment harness, not production default | May improve read-only parallelism while keeping mutation sequential | High for mutation queue and evidence ordering | Pi `executeToolCalls`; local tool registry and edit workflow runtime | Read-only tool experiment route |
| Tool result content/details split | adopt now | Current results carry evidence and metadata but capability-specific branches still build user-facing text close to execution. | Tool, Runtime, Result Surface, Session / Continue | Runtime receipt/result summary projection | Preserves model-facing text separately from structured report/session evidence | Low if details are redacted and not treated as success | Pi `AgentToolResult`; local runtime receipt, result mapper, session terminal state | Tool/result projection route |
| Event stream as host-neutral runtime surface | adapt later | Current `QueryEvent` and CLI streaming exist, but SDK/RPC host separation is not first-class. | Runtime Events, CLI / UX, Session / Continue | Existing `core/query/events.ts`, CLI runtime invocation bridge | Lets CLI be one host over a stable event stream | Medium if it changes terminal output or transcript semantics | Pi `AgentEvent`, event bus, RPC mode; local `QueryEvent`, `streamMvpIntegratedFlow` | After turn snapshot/save point |
| Session tree with active leaf | adapt later | Local SessionManager persists transcripts, snapshots, replay, and continuity, but not a primary tree/leaf branch model. | Session / Continue | Session schema-neutral tree projection first; no schema migration initially | Supports branch/fork/compact reasoning without overloading linear transcript state | High if it changes schema or replay semantics too early | Pi `SessionManager`, `SessionTreeEntryBase`, `leafId`; local `SessionManager` | Session design route, schema-neutral first |
| Append-only JSONL session entries | already covered | Local sessions already use append-style transcript JSONL plus metadata/state files. | Session / Continue | Existing session transcript store | Existing durability model is sufficient for now | Low | Local `SessionManager` header comments and transcript methods; Pi session manager | No adoption needed |
| Branch summary and compaction entries | adapt later | Current compact/replay exists, but branch summary is not a current product route. | Session / Continue, Result Surface | Compact continuity and future tree projection | Improves branch navigation and recovery summaries | Medium if summaries become unverified success evidence | Pi compaction and branch summary entries; local compact continuity modules | After session tree projection |
| Resource loader for skills/prompts/themes/extensions | adapt later | Local project deliberately blocks dynamic discovery in product surfaces. | Runtime / Resources, Policy, CLI / UX | New resource contract docs first; no automatic startup injection | Gives future resources a sanctioned owner | High if default discovery is enabled | Pi `DefaultResourceLoader`; local "no dynamic MCP/skills discovery" markers | Resource contract route after policy envelope |
| Provider abstraction and registry | already covered | Local provider/model surfaces exist and real provider remains opt-in. | Provider / Model | Existing provider readiness, model adapters, provider draft stage | Preserve opt-in classification and redaction | High if Pi custom provider behavior is copied into default path | Pi `apiProviderRegistry`, `ModelRegistry`; local provider stages and model adapters | No immediate broad route |
| Per-request auth resolution | adapt later | Local provider gates are strict; per-request auth can help but must preserve no manual private config access. | Provider / Model, Policy | Provider readiness and CLI runtime invocation | Better request scoping without default enablement | High around secrets and provider config | Pi `getApiKeyAndHeaders`, `env-api-keys`; local provider readiness and CLI runtime invocation | Provider policy route only with explicit scope |
| ExecutionEnv with FileSystem and Shell | adapt later | Local `ExecutionService` already owns execution; Pi's env split can inform facade shape but must not bypass it. | Runtime / Execution | `runtime/execution` around ExecutionService, not new shell/fs helpers | Clarifies file vs shell capability while retaining authority metadata | Medium if a second side-effect path is introduced | Pi `ExecutionEnv`, `NodeExecutionEnv`; local `ExecutionService` | ExecutionService facade route |
| Result-style low-level errors | adopt now | Local runtime command failures and receipt facts exist, but low-level file/shell errors can be normalized more consistently. | Runtime / Execution, Result Surface | ExecutionService result/error projection | Improves failure classification without changing execution behavior | Low if purely projection-level and covered by result tests | Pi `Result`, `ExecutionError`, `FileError`; local runtime receipt and terminal truth | Runtime receipt/error taxonomy route |
| SDK and UI adapter separation | adapt later | Local CLI is thinner now, but SDK/RPC host separation is not yet an immediate product goal. | CLI / UX, Runtime Events, Session / Continue | CLI bootstrap, runtime event stream, future SDK host | Keeps runtime independent from CLI output | Medium if it destabilizes CLI compatibility | Pi `sdk.ts`, `rpc-mode.ts`, TUI package; local `cliProcessRunner`, stream bridge | After event stream stabilization |
| TUI separated from runtime package | reject for now | Current project does not have Pi's TUI package architecture as a target. | CLI / UX | None in this planning cycle | Avoids package split churn | High because it would be structural churn without product need | Pi `packages/tui`; local CLI/renderer surfaces | Reject until UI becomes route objective |
| Extension/package model as workflow carrier | needs experiment | Could keep workflow out of core, but current project has strong no dynamic discovery constraints. | Runtime / Resources, Policy, Tool | Experiment-only extension manifest and static fixture | Tests whether package resources can be safe and deterministic | High if it becomes plugin runtime by default | Pi extension API and package examples; local context/sidebar blocked markers | Offline experiment route only |

## Adopt-Now Pattern Requirements

Each adopt-now pattern must stay inside an owner domain and must not create
route-numbered product files or compatibility-shim logic.

### AgentHarness Above Low-Level Loop

- Local owner domain: Runtime / Turn and Agent Loop.
- Target module area: `packages/ts-shell/src/runtime` and
  `packages/ts-shell/src/turn`.
- Expected benefit: one explicit boundary for mutable runtime config, frozen turn
  input, queues, and save-point handoff.
- Risk: it could become a generic orchestration dumping ground.
- Validation approach: focused unit tests for snapshot immutability, phase
  transitions, and preserved `workflowExecutionCoordinator` output shape.

### Frozen Turn Snapshot

- Local owner domain: Turn, Runtime, Session / Continue.
- Target module area: `packages/ts-shell/src/turn` plus runtime handoff types.
- Expected benefit: stable evidence of what a model/tool turn actually used.
- Risk: snapshot could capture secrets or raw file content.
- Validation approach: redaction-focused tests, snapshot field tests, and
  existing result-contract coverage.

### Save Point After Tool/Result Batch

- Local owner domain: Runtime, Session / Continue, Evidence, Result Surface.
- Target module area: runtime turn boundary plus session persistence projection.
- Expected benefit: clear flush/refresh point before the next model turn.
- Risk: save point might be confused with write success.
- Validation approach: tests proving save point records only evidence and does
  not upgrade terminal status without Result Surface verdict.

### Explicit Phase Model

- Local owner domain: Runtime, Session / Continue, CLI / UX.
- Target module area: runtime phase type and shell/session consumers.
- Expected benefit: safer blocking of overlapping prompt, compact, retry, and
  continue operations.
- Risk: phase vocabulary could become too broad and duplicate state machines.
- Validation approach: focused state transition tests and no CLI output drift.

### Tool Result Content/Details Split

- Local owner domain: Tool, Runtime, Result Surface, Session / Continue.
- Target module area: runtime receipt and result summary projections.
- Expected benefit: separates model-facing text from structured, redacted
  session/report evidence.
- Risk: details could be overtrusted as success evidence.
- Validation approach: Result Surface tests that details remain evidence-only
  unless terminal truthfulness rules accept them.

### Result-Style Low-Level Errors

- Local owner domain: Runtime / Execution and Result Surface.
- Target module area: `runtime/execution` and runtime receipt projection.
- Expected benefit: sharper classification of file/shell/daemon failures without
  changing execution semantics.
- Risk: error classes could duplicate existing runtime receipts.
- Validation approach: focused ExecutionService tests and result mapper tests for
  failure classification.

# Build Infrastructure Next Product Roadmap

Status: MTB001 audit update.
Date: 2026-06-01.

## Transition

The initial build-infrastructure sequence is closed. The next route should be a
real product feature route, not another general infrastructure route, unless a
specific product blocker proves a missing owner boundary.

## Recommended Immediate Task

### MTB002 Safe Model Tool Batch Handoff And Non-Executed Result Messages

Goal:

- Consume completed model-boundary facts from the previous block.
- Produce an explicit report-safe tool batch handoff with normalized call ids,
  malformed/unsupported/unknown classification, argument redaction status,
  before-tool policy requirement, authority requirement, dispatch eligibility,
  execution not-run status, and not-proven claims.
- Prepare non-executed tool result messages for blocked, authority-required,
  unsupported, unknown, malformed, and not-dispatched calls.
- Project runtime events, JSON stream entries, save-point ids, next-turn bundle
  inputs, and product surface state without executing tools or changing
  terminal truth.

Reason for the sharpened order after CP006, PS001, and the tool handoff audit:

- CP006 made context discovery, acquisition, planning, handoff, memory, and
  continuation facts visible without success upgrades.
- PS001 found that provider adapters, assistant accumulation, tool-call
  extraction, Agent Loop contract, runtime events, JSON stream, and product
  surface already have useful pieces, but no coherent product-safe seam consumes
  CP facts into model request preparation and streaming response handling.
- The model-tool audit found that extraction, dispatch planning, policy
  decisions, ExecutionService receipts, tool result messages, save points,
  next-turn bundles, runtime events, JSON stream, and product surface already
  have useful contract/projection pieces. The immediate missing dependency is a
  safe handoff fact that keeps extracted tool call, planned batch, policy
  allowed, authority requested, receipt observed, result message prepared,
  save point created, and surface rendered distinct from task success.

Owner domains:

- `turn`
- `tools`
- `runtime/loop`
- `runtime/events`
- `runtime/execution` as authority and receipt boundary only
- `evidence`
- `result`
- `presentation`, `core/tools`, and `core/shell` as consumers only

Existing infrastructure to reuse:

- CP006 context planning summary
- model response boundary
- assistant response accumulator
- tool-call extraction batch
- tool interception policy decisions
- tool batch dispatch plan/result detail projections
- tool result message projection
- ExecutionService and execution receipts
- Agent Loop contract, loop infrastructure map, and trajectory projection
- turn snapshots
- evidence-only save points and next-turn bundles
- runtime events and JSON event stream
- product surface view model and terminal renderer
- result/evidence truthfulness surfaces

First implementation grouping after this audit:

- explicit model-boundary-to-tool handoff facts
- normalized tool batch plan with malformed/unsupported/unknown classifications
- before-tool policy and authority projection
- not-dispatched/non-executed tool result details and messages
- tool handoff observations in trajectory/runtime events and JSON stream
- save point and next-turn bundle ids from safe tool result message facts
- visible not-proven claims in product surface if rendered
- result truthfulness tests proving tool observations do not change verdict

Forbidden shortcuts:

- do not replace `workflowExecutionCoordinator` in one rewrite
- do not make `ShellSessionRuntime` the product loop owner
- do not enable real provider config by default
- do not call real providers or manually read private provider config
- do not execute fallback
- do not execute tools, expand command allowlists, change edit behavior, change
  verification behavior, or change repair behavior
- do not turn tool-call-extracted, tool-batch-planned, policy-allowed,
  authority-requested, execution-receipt-observed, command-exit-zero,
  tool-result-message-prepared, save-point-created, or rendered output into
  success
- do not add package loading, dynamic plugin execution, SDK/RPC, TUI, browser
  paths, or new dependencies

Validation expectations:

- tool handoff tests for source model boundary ids, normalized call ids,
  malformed/unsupported/unknown statuses, redaction, and not-proven propagation
- before-tool policy and authority projection tests
- non-executed tool result message tests
- runtime loop trajectory/event tests if observations change
- JSON stream observation-only/redaction tests if events change
- save-point and next-turn bundle tests if ids or pending facts change
- product surface rendering tests if rendered facts change
- result-contract gate if terminal/result behavior is touched
- build for touched package if product code changes
- diff/status hygiene

Expected product value:

- A completed model response can hand off tool intent to the loop as safe,
  policy-aware, authority-aware, non-executed facts that can be saved and
  prepared for a future turn without bypassing ExecutionService or
  manufacturing success.

Planning details:

- `docs/build-infrastructure/provider-streaming-model-boundary-audit.md`
- `docs/build-infrastructure/provider-streaming-model-boundary-roadmap.md`
- `docs/build-infrastructure/model-tool-batch-handoff-audit.md`
- `docs/build-infrastructure/model-tool-batch-handoff-roadmap.md`

## Prior Completed Baseline

PL002 completed the former immediate route:

- coordinator-level loop trajectory observation
- pass-through on `AgentExecutionOutput` and `OrchestrationResult`
- result mapper pass-through without terminal truth changes
- shell terminal state consumption from `query.completed`
- product surface rendering of loop trajectory sections

This baseline is observation-only. It does not implement model response
accumulation, model-driven tool batches, tool result messages, next-turn
semantics, verification/repair handoff inside the loop, or product loop
replacement.

CP006 later added product-surface context and planning facts. PS001 added the
provider/model boundary plan. The tool handoff audit uses those facts as the
required upstream dependency for model-to-tool handoff.

## Subsequent Product Routes

### MTB003 Sanctioned Tool Dispatch Receipt Observation

Goal:

- Dispatch eligible tool-call batches through sanctioned tool/runtime execution
  boundaries only when policy permits, authority is proven, and the dispatch
  seam is explicitly scoped.

Owner domains:

- `tools`
- `runtime/execution`
- `runtime/loop`
- `policy`
- `evidence`
- `result`

Existing infrastructure to reuse:

- tool interception decisions
- execution receipts
- tool result split
- runtime events
- result/evidence truth adapters

Forbidden shortcuts:

- no command allowlist expansion
- no dynamic plugin/package execution
- no tool success as task success
- no edit behavior changes by convenience

Validation expectations:

- before-tool allow/deny tests
- execution receipt tests
- tool result message tests
- abort/cancellation tests
- no-success-from-tool tests

Expected product value:

- Tool calls can produce redacted execution receipts and result details without
  turning tool success into task success.

### PL006 Save Point, Prepare-Next-Turn, Steering And Follow-Up

Goal:

- Make save point placement, prepare-next-turn, steering delivery, and follow-up
  delivery explicit loop phases.

Owner domains:

- `evidence`
- `turn`
- `runtime/loop`
- `session`
- `context`
- `core/shell`

Existing infrastructure to reuse:

- evidence-only save points
- active path projection
- context rebuild projection
- shell session runtime cancellation and terminal surfaces

Forbidden shortcuts:

- no session schema migration
- no next-turn-prepared success
- no queue reordering that hides user intent

Validation expectations:

- save point tests
- queue ordering tests
- next-turn not-success tests
- session runtime consumer tests

Expected product value:

- The loop can continue from owner facts instead of merely reporting pending
  facts.

### PL007 Verification And Repair Handoff Inside Loop

Goal:

- Make verification failure and repair handoff explicit loop phases with
  original failure preservation and re-verification.

Owner domains:

- `verification`
- `repair`
- `runtime/execution`
- `evidence`
- `result`
- `presentation`

Existing infrastructure to reuse:

- execution receipts
- save points
- result/evidence truth adapters
- product surface verification section
- repair facade projections

Forbidden shortcuts:

- no selected-not-run success
- no broad skip or weak assertion rebaseline
- no verification passed claim without a passed command
- no repair proposal or repair apply as success without re-verification

Validation expectations:

- task-relevant verification tests
- repair-to-success tests
- original-failure preservation tests
- result truthfulness tests
- focused command receipt tests

Expected product value:

- Users can trust whether a coding task was actually verified.

### PL008 Session Context Rebuild And Continuation Loop Hardening

Goal:

- Feed continuation/resume turns from safe session active path and context
  rebuild facts.

Owner domains:

- `context`
- `session`
- `runtime/loop`
- `evidence`
- `result`

Existing infrastructure to reuse:

- active path projection
- context rebuild projection
- turn snapshots
- save points

Forbidden shortcuts:

- no raw transcript dumps
- no unsafe file contents in reports
- no context success without evidence

Validation expectations:

- context projection tests
- continuation handoff tests
- redaction tests

Expected product value:

- Better continuation without leaking unsafe content or hidden reasoning.

### PL009 Product Loop Adapter Consolidation

Goal:

- Consolidate proven PL004-PL008 phases into the local CLI product loop adapter
  without replacing owner domains or growing compatibility shims.

Owner domains:

- `runtime`
- `runtime/loop`
- `core/shell`
- phase-specific owners from PL004-PL008

Existing infrastructure to reuse:

- coordinator observation baseline
- proven model/tool/next-turn/verification/session phase surfaces
- runtime events and product surface

Forbidden shortcuts:

- no broad rewrite of `workflowExecutionCoordinator`
- no compatibility shim business logic
- no SDK/RPC/TUI/browser expansion

Validation expectations:

- end-to-end CLI product loop tests
- coordinator/session runtime regression tests
- result-contract gate
- package build

Expected product value:

- The CLI path uses a coherent loop adapter instead of separate observations and
  staged handoffs.

### CP002 Repo Intelligence, Context Discovery, And Target Ranking Upgrade

Goal:

- Start the Context and Planning Quality Block by hardening bounded repository
  discovery, candidate omission accounting, target ranking, ambiguity handling,
  missing discovery facts, and PL009 feature-contract linkage.

Owner domains:

- `orchestration` repo intelligence and context engine
- `runtime/loop` feature integration contract
- `presentation` only if new report-safe sections are needed

Existing infrastructure to reuse:

- `repoIntelligence`
- `contextEngine`
- `contextGraphPlanning`
- `planningRuntime`
- PL009 product loop adapter and feature contract

Forbidden shortcuts:

- no provider calls
- no edit/apply behavior changes
- no persistent index service
- no SDK/RPC/TUI/MCP/plugin/package-loading expansion
- no target ranking success without evidence

Validation expectations:

- repo intelligence tests
- context engine tests
- target ranking and ambiguity tests
- missing facts tests
- Agent Loop feature contract tests
- product surface tests only if rendered output changes

Expected product value:

- Vague or pathless tasks produce clearer, evidence-backed discovery and target
  selection facts before later planning or edit routes consume them.

### PL010 Optional JSON Host Or SDK Route

Goal:

- Expose the stable local loop through a host-neutral JSON/API surface only if a
  product need is proven.

Owner domains:

- `runtime/events`
- future host owner
- `core/shell` adapter if needed

Existing infrastructure to reuse:

- JSON event stream
- host-neutral runtime events
- stable local loop adapter

Forbidden shortcuts:

- no default network server
- no broad public API promises
- no auth lifecycle by accident

Validation expectations:

- API/stream contract tests
- cancellation tests
- redaction tests

Expected product value:

- External consumers can observe or drive the stable loop without changing CLI
  truth semantics.

## Deferred Product Routes

### Live Provider Beyond Tiny Controlled Tasks

Goal:

- Expand live provider use through explicit opt-in, clean status, and precise
  failure attribution.

Owner domains:

- `provider`
- `runtime/loop`
- `runtime/events`
- `evidence`
- `result`

Existing infrastructure to reuse:

- provider registry metadata
- model compatibility flags
- loop provider boundary
- runtime events
- product surface provider section

Forbidden shortcuts:

- no default real provider enablement
- no manual private config reads
- no provider-called success
- no raw provider output in reports

Validation expectations:

- fake-provider tests first
- explicit opt-in readiness gates
- redaction tests
- isolated live smoke only when route explicitly allows it

Expected product value:

- Safer progression from deterministic product loops to controlled real model
  behavior.

### Repair Loop Through Real CLI Path

Goal:

- Route repair attempts through the real CLI coding loop with evidence and
  re-verification.

Owner domains:

- `repair`
- `verification`
- `runtime/execution`
- `evidence`
- `result`
- `presentation`

Existing infrastructure to reuse:

- execution receipts
- verification evidence
- product surface repair/verdict sections
- result truth adapters

Forbidden shortcuts:

- no repair proposal as repair success
- no repair apply without re-verification
- no hidden original failure

Validation expectations:

- repair-to-success tests
- original failure preservation tests
- result-contract gate

Expected product value:

- Repair becomes a trustworthy product workflow rather than a best-effort note.

### Multi-file Product Coding Path

Goal:

- Make multi-file edits a first-class product path with authority, receipts,
  stale-read checks, and evidence.

Owner domains:

- `edit`
- `runtime/execution`
- `tools`
- `verification`
- `evidence`
- `result`
- `session`

Existing infrastructure to reuse:

- execution receipts
- tool result details
- session projections
- evidence-only save points
- result truthfulness

Forbidden shortcuts:

- no broad write authority from prompt text
- no stale-read bypass
- no success from apply without relevant verification

Validation expectations:

- guarded write tests
- multi-file edit tests
- relevant verification tests
- recovery/repair tests

Expected product value:

- The agent becomes useful on realistic coding tasks involving multiple files.

### Browser And External Tool Product Path

Goal:

- Productize browser/external tool paths only after the local CLI coding loop is
  stable.

Owner domains:

- browser/runtime owner where applicable
- `runtime/execution`
- `tools`
- `policy`
- `evidence`
- `result`
- `presentation`

Existing infrastructure to reuse:

- tool policy
- execution receipts
- runtime events
- product surface summaries
- evidence/result truthfulness

Forbidden shortcuts:

- no public browser automation by default
- no raw DOM/page content in receipts or reports
- no external tool success without evidence

Validation expectations:

- controlled browser/tool transaction tests
- redaction tests
- no default external execution

Expected product value:

- External capability becomes useful without weakening the local safety and
  evidence model.

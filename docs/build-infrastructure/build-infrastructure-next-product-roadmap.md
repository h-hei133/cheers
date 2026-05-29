# Build Infrastructure Next Product Roadmap

Status: BI017 closeout.
Date: 2026-05-29.

## Transition

The initial build-infrastructure sequence is closed. The next route should be a
real product feature route, not another general infrastructure route, unless a
specific product blocker proves a missing owner boundary.

## Recommended Immediate Route

### Real CLI Coding Loop Integration

Goal:

- Integrate the agent loop spine into the real CLI coding path without replacing
  the current product loop wholesale.
- Use the loop trajectory as an observation and handoff surface for real CLI
  coding turns.

Immediate seam from PL001 audit:

- `workflowExecutionCoordinator` should be the primary emission seam for loop
  trajectory observations because it already sees the current product turn,
  task-plan stages, provider mode, runtime events, execution receipts, save
  point boundary, and result contract.
- `ShellSessionRuntime` and presentation should consume/render those
  observations only after owner-domain facts exist; they should not become loop
  fact owners.

Owner domains:

- `runtime`
- `runtime/loop`
- `runtime/events`
- `runtime/execution`
- `tools`
- `provider`
- `session`
- `context`
- `presentation`
- `evidence`
- `result`
- `core/shell` as host adapter only

Existing infrastructure to reuse:

- loop infrastructure map and trajectory projection
- provider/model registry metadata
- tool interception decisions
- execution receipts
- tool result details
- evidence-only save points
- session active path projection
- context rebuild projection
- runtime events and JSON event stream
- product surface view model and terminal renderer
- result/evidence truthfulness surfaces

First implementation grouping:

- coordinator-level trajectory observation
- provider/model metadata attachment when already available
- tool policy, tool result split, and execution receipt attachment when already
  produced by current stages
- save point, session active path, and context rebuild projection attachment
- runtime event and JSON event stream projection
- product surface rendering with visible not-proven claims
- result truthfulness tests proving observation does not change verdict

Forbidden shortcuts:

- do not replace `workflowExecutionCoordinator` in one rewrite
- do not make `ShellSessionRuntime` the product loop owner
- do not infer write authority from prompt text
- do not turn provider-called, tool-result observed, command exit zero, or
  rendered output into success
- do not enable real provider config by default
- do not add package loading, dynamic plugin execution, SDK/RPC, TUI, or new
  dependencies

Validation expectations:

- focused CLI/product loop tests
- runtime loop trajectory tests
- tool interception and execution receipt tests
- session/context projection tests
- product surface rendering tests
- result-contract gate if terminal/result behavior is touched
- build for touched package if product code changes
- diff/status hygiene

Expected product value:

- A real CLI path can show what happened in a coding turn with safe facts,
  receipts, session context, and evidence without overclaiming success.

## Subsequent Product Routes

### Verification Runtime Dispatch And Evidence

Goal:

- Make verification dispatch more task-relevant and evidence-backed in the real
  CLI coding path.

Owner domains:

- `verification`
- `runtime/execution`
- `evidence`
- `result`
- `presentation`

Existing infrastructure to reuse:

- execution receipts
- save points
- result/evidence truth adapters
- product surface verification section

Forbidden shortcuts:

- no selected-not-run success
- no broad skip or weak assertion rebaseline
- no verification passed claim without a passed command

Validation expectations:

- task-relevant verification tests
- result truthfulness tests
- focused command receipt tests

Expected product value:

- Users can trust whether a coding task was actually verified.

### Context And Planning Quality Hardening

Goal:

- Improve planning/context selection for real coding tasks using existing
  session and context projections.

Owner domains:

- `context`
- `session`
- `runtime`
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
- planning handoff tests
- redaction tests

Expected product value:

- Better task understanding without leaking unsafe content or hidden reasoning.

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

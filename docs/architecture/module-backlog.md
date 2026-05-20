# Module Backlog

Route: `docs/agent-routes/route149-module-roadmap-reset.md`

This backlog is now module-first. It records completed consolidation work and
candidate route families; it is not a fixed feature queue.

Use these documents before starting a route:

- `docs/architecture/module-roadmap-reset.md`
- `docs/architecture/control-plane-atlas.md`
- `docs/architecture/capability-contract.md`
- `docs/agent-routes/module-route-template.md`

Every future route must name its owner module, lifecycle stage, cross-module
inputs and outputs, product behavior boundary, validation gate, and stop
conditions before implementation.

## Completed Consolidation Routes

### Routes 135-136: Verifier Decomposition And Atlas

- Route 135 decomposed the real-user capability verifier behind a compatibility
  entrypoint while preserving flags, markers, report fields, exit codes,
  redaction, dry-run, dirty-repo guard, and real-provider opt-in behavior.
- Route 136 consolidated the control-plane atlas and module ledgers, naming
  Agent Loop, CLI / UX, Session / Continue, Permission / Policy, Result
  Surface, Provider / Model, Tool, Runtime, and Harness / Eval ownership.

### Routes 137-139: Agent Loop Baseline And Dispatch

- Route 137 extracted flow result/evidence projection helpers from
  `runMvpIntegratedFlow.ts`.
- Route 138 repaired the streamed-result handoff/tool-approval baseline and
  extracted `flowDispatch.ts`.
- Route 139 swept focused and broad control-plane baselines, repaired command
  intent drift, and classified remaining broad runMvp failures before further
  extraction.

### Routes 140-142: Read, Verification, And Continuation Contracts

- Route 140 defined read/list/inspect/repo-explain no-write contracts and
  added focused owners for read intent, continuation target, and repo-explain
  evidence.
- Route 141 moved verification selection, retry, skipped/not-requested, and
  command verification projection into named helpers.
- Route 142 extracted continuation, lineage, rebase, and projection helpers
  while preserving session schema and provider/browser/edit boundaries.

### Routes 143-144: Edit Expectation And Green Baseline

- Route 143 defined current bounded write/edit expectations and moved broad
  refactor, batch edit, discovery edit, and vague generated-content success
  expectations into future capability routes.
- Route 144 closed the remaining full `runMvpIntegratedFlow.test.ts` failures
  and swept the `packages/ts-shell` package baseline green.

### Routes 145-147: Substrate And Contract Unification

- Route 145 extracted Session / Continue substrate seams without schema,
  transcript, compact, CLI, provider, browser, edit, dependency, or broad
  runMvp changes.
- Route 146 introduced the Tool / Policy / Result receipt vocabulary and
  transcript-safe projection helpers.
- Route 147 defined future edit expansion contracts for broad refactor,
  multi-file discovery edit, and broader fenced replacement without enabling
  broad edit execution.

### Route 148: Edit / Patch Module Boundary

- Route 148 added an Edit / Patch module facade over current and future edit
  helpers, plus module-owned manifest, preview/evidence, precondition, and
  result projection helpers.
- Current bounded write/edit execution remains delegated to existing routes.
- Broad refactor, multi-file discovery edit, broader fenced replacement, and
  rollback/snapshot remain preview/precondition states, not executable paths.

### Route 149: Module Roadmap Reset

- Route 149 resets the next-roadmap decision around module ownership, lifecycle
  stage, risk, and product value.
- It removes the stale implication that Edit / Patch must continue next merely
  because Routes 147-148 discussed edit contracts.
- It adds `docs/architecture/module-roadmap-reset.md` as the module status and
  phase-ordering source for the next planning cycle.

### Route 150: Runtime Receipt Contract

- Route 150 adds `core/runtime/runtimeReceipt.ts` and
  `core/runtime/runtimeReceiptProjection.ts` as the Runtime-owned receipt seam
  over Route 146 Tool / Policy / Result vocabulary.
- Existing command, sandbox escalation/denial, browser runtime status/cleanup,
  and MCP process/protocol failure paths attach projected receipt metadata
  without changing execution behavior, CLI output, schema, browser/edit/provider
  capability, Rust protocol, or dependencies.
- `docs/architecture/runtime-receipt-contract.md` records the field contract,
  lifecycle mapping, redaction rules, integrated call sites, and validation
  gate.

## Module-First Route Rule

Future routes must state:

- owning module
- lifecycle stage touched
- cross-module inputs
- cross-module outputs
- product behavior boundary
- validation gate
- stop conditions

Feature work is allowed only when it enters through a module-owned contract.
Edit expansion enters through Edit / Patch; browser planner work enters through
Browser; provider readiness enters through Provider / Model; CLI work enters
through CLI / UX.

## Candidate Route Families

### Phase A: Control-Plane Kernel Hardening

Recommended when reducing cross-module coupling is more valuable than adding
capability scope.

| Candidate | Primary module | Goal | Validation shape |
|---|---|---|---|
| Agent Loop dispatch extraction v2 | Agent Loop | Move one more pure dispatch/projection decision out of `runMvpIntegratedFlow.ts` without changing behavior. | focused dispatch/runMvp tests; build if source changes |
| Agent Loop receipt-consumer thin wiring | Agent Loop, Runtime, Result Surface | Adopt Runtime Receipt projection at one existing result/session handoff without changing truthfulness or schema. | focused receipt/runMvp/result-contract tests |
| Workspace / File Context contract | Workspace / File Context, Edit / Patch | Consolidate root, target, read/write authority, stale-read, and post-write verification vocabulary. | docs-only diff/status or focused workspace/patch tests if source changes |
| CLI / core split preparation | CLI / UX, Session / Continue | Move display/session-switch preparation behind a CLI-owned boundary without changing UX. | focused CLI tests; no schema/provider changes |

### Phase B: Capability Module Expansion

Recommended only when the owning module already defines inputs, outputs,
preconditions, result projection, and validation.

| Candidate | Primary module | Goal | Stop condition |
|---|---|---|---|
| Edit / Patch thin integration | Edit / Patch, Result Surface | Adopt the module facade at one thin classification/projection handoff. | no new write execution |
| Edit snapshot / rollback substrate | Edit / Patch, Runtime | Define snapshot/rollback preconditions and receipts before broad edit execution. | no rollback execution unless explicitly routed |
| Multi-file discovery candidate selection | Edit / Patch, Workspace / File Context | Produce bounded candidate sets and confirmation requirements. | no mutation by discovery |
| Browser controlled planner v2 | Browser, Agent Loop | Improve controlled planner contracts only if browser becomes product priority. | no public web or default browser action expansion |

### Phase C: Gate And Release Architecture

Recommended when confidence, reporting, or release-readiness truthfulness is the
blocker.

| Candidate | Primary module | Goal | Validation shape |
|---|---|---|---|
| Harness / gate taxonomy | Harness / Eval | Classify gates as product path, deterministic, opt-in real, dry-run, self-test, docs-only, or report-only. | diff/status plus touched verifier self-tests |
| Eval report schema | Harness / Eval, Result Surface | Normalize report fields and markers without changing product routes. | report self-tests and result-contract where relevant |
| Provider readiness parity | Provider / Model, Harness | Align runtime provider classification with readiness scripts and default-skip behavior. | classification self-test; real-provider live gate only by explicit opt-in |
| Capability lifecycle adoption report | Capability Contract Architecture | Audit which modules implement lifecycle stages and where gaps remain. | docs-only diff/status |

## Decision Criteria

Choose the next route by evidence, not route number:

- Which module owns the highest current coupling or user-facing risk?
- Which lifecycle stage is missing, duplicated, or too close to a large file?
- Which runtime path, result surface, or gate improves?
- Which focused validation already exists or can be added narrowly?
- Which stop condition prevents provider/browser/edit/schema/CLI/dependency
  expansion?

If these answers are weak, pick a contract route instead of a feature route.

## Current Default Recommendation

The best default next route is `Agent Loop receipt-consumer thin wiring` in
Phase A if runtime receipt adoption should continue.

Rationale: Route 150 now provides a Runtime-owned receipt/projection seam and
safe metadata at high-value command, sandbox, browser, and MCP paths. The next
value is a single consumer handoff that proves the seam reduces Result Surface
or Agent Loop coupling without changing `resultMapper.ts` truthfulness,
session schemas, CLI UX, provider behavior, browser scope, edit execution, Rust
protocol, or dependencies.

If the user explicitly chooses mutation work next, select `Edit / Patch thin
integration` and keep it to one module-owned handoff with no new broad write
behavior.

## Persistent Boundaries

Do not use this backlog to justify broad source refactors. A route is valid
only when it reduces a user-facing runtime blocker or a named cross-layer
concentration point with focused evidence.

Unless a route explicitly opens the boundary, do not add provider behavior,
read or print real-provider config, expand browser execution, broaden edit
execution, change schemas, change CLI behavior, change dependencies, or change
default gates.

# Agent Loop Turn Kernel

Route: `docs/agent-routes/route152-agent-loop-turn-kernel.md`

## Scope

Route 152 extracts a small Agent Loop turn-kernel seam from
`runMvpIntegratedFlow.ts`. The seam consumes module-owned contracts and projects
turn summaries, receipt aggregation, and result handoff shape without changing
provider, browser, edit/write, runtime, permission, workspace, stale-read, CLI,
schema, or dependency behavior.

New helpers:

- `packages/ts-shell/src/orchestration/turnCapabilityPlan.ts`
  - owns compact capability path summaries: turn kind, capability area, module
    owner, target label, verification expectation, continuation lineage marker,
    and mutation classification
- `packages/ts-shell/src/orchestration/turnReceiptAggregation.ts`
  - owns safe aggregation of tool, runtime, verification, continuation, and
    evidence summaries
- `packages/ts-shell/src/orchestration/turnKernel.ts`
  - composes capability plan plus receipt aggregation and delegates final result
    handoff to existing result projections

The kernel is not a new planner framework and does not execute tools.

## Current Responsibility Map

| `runMvpIntegratedFlow.ts` block | Route 152 decision | Owner |
|---|---|---|
| intent classification | keep in main loop for now | Agent Loop |
| read/inspect routing | extract later except target summaries | Workspace / File Context |
| verification planning | keep in existing planner | Verification / Result Surface |
| continuation activation | consume evidence only | Session / Continue |
| edit expectation handling | keep module contract owner | Edit / Patch |
| browser transaction handoff | extract later only after browser priority returns | Browser |
| tool dispatch handoff | aggregate receipt/evidence summaries only | Tool / Agent Loop |
| provider diagnostic handoff | keep existing projection | Provider / Model |
| workspace target projection | consume existing target summaries | Workspace / File Context |
| runtime/tool receipt consumption | aggregate summaries | Runtime / Tool |
| result/evidence/transcript projection | centralize final handoff wrapper | Result Surface / Agent Loop |

## Integrated Call Sites

`runMvpIntegratedFlow.ts` now delegates the final command and mutation result
handoff through `projectTurnResultHandoff`. That helper:

- builds a `TurnCapabilityPlan`
- aggregates safe receipt/evidence context
- calls the existing command or mutation result projection
- returns the original `RuntimeOutcomeProjection` shape with an additional
  internal `turn` summary

The existing terminal output, resultMapper classification, coding result,
verification state, evidence arrays, and change-set attribution remain owned by
their previous modules.

## Contract Rules

The turn kernel may record facts but must not decide policy. Permission,
workspace authority, stale-read, provider readiness, browser runtime status, and
write authorization remain with their owning modules.

Turn receipt aggregation is transcript-safe:

- raw DOM/HTML is sanitized
- raw file dumps are not accepted as turn evidence
- provider config paths and private real-provider-home paths are redacted
- token, API key, cookie, password, authorization, and private-key-like text is
  redacted through runtime receipt projection

The kernel result state is a summary, not a terminal truthfulness owner.
`resultMapper.ts`, runtime outcome projection, and shell result assembly remain
the source of user-visible status.

## Preservation

Preserved:

- command success remains completed
- command/policy blocked remains stopped
- edit/write result shape remains owned by mutation projections
- read/inspect remains no-write
- verification skipped/not-requested behavior remains unchanged
- continuation evidence remains replay-safe
- package scripts and CLI/schema/dependency surfaces are unchanged

Not changed:

- no provider/model live calls
- no browser feature expansion
- no edit/runtime execution expansion
- no permission or workspace-authority changes
- no stale-read bypass
- no broad `runMvpIntegratedFlow.ts` rewrite

## Next Route

Recommended Route 153: CLI / core split preparation. It is the next Phase A
candidate that reduces control-plane coupling without expanding runtime
capability scope.

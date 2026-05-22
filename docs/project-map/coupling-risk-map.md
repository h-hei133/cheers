# Coupling Risk Map

## Composition Roots

- `runMvpIntegratedFlow.ts` is the largest active coupling point. It still composes prompt classification, read/context planning, browser, provider anchored runtime, edit execution, direct mutation, low-risk verification, command verification, repair continuity, and result construction.
- `SessionManager.ts` is the largest persistence coupling point. It owns session metadata, transcript, current session selection, recovery snapshots, compact continuity, approval memory, mutation continuity, and prompt continuity.
- `cli.tsx` remains the largest entrypoint coupling point. It wires mode dispatch, slash commands, session switching, MCP control, permission commands, approval bridge, and prompt execution.

## Large Facades

- `readInspectModule.ts` is a broad facade over read intent, context packet, context graph, Agent Plan, Plan Quality, and harness failure taxonomy.
- `editPatchModule.ts` is a broad facade over expectation contracts, discovery edit, generated/provider proposals, fenced route, target-set route, hunk-set route, snapshot, and recovery.
- `scripts/verify/index.mjs` is decomposed behind `scripts/verify/*` modules but still orchestrates many real-user capability branches.

## Verifier Growth

The verifier layer contains focused gates, synthetic suites, candidate mutation suites, dry-run safety paths, real-provider descriptors, report writers, and residue handling. This creates evidence precision but also increases claim drift risk. A gate pass must be read with its evidence type and selected tier/suite/case.

## Provider Path Split

Provider readiness, provider proposal dry-run, anchored provider smoke, and real provider task-loop smoke are separate paths:

- readiness can pass without a coding proposal
- anchored smoke can call provider and produce exact-ready no-write output
- task-loop smoke can still stop before provider call/apply/verification
- fake-ready can exercise provider-called wiring without real credentials

This split is necessary for safety, but it is the highest evidence-label risk.

## Task-Loop Not Using Provider Boundary

Route 200 observed state is `provider-called=false`, `anchor-quality=none`, `apply=not-run`, `verification=not-run`, `status=task-loop-stopped`. The task-loop modules can represent later states, but current live evidence does not prove them.

## Exact Anchor Safety Vs Capability Tension

Exact anchors protect against broad/fuzzy provider mutation. The same safety boundary means many useful generated/provider outputs remain review-only, stopped, or no-write. Exact-ready is a handoff/readiness label, not write authority.

## Result Surface / Session Parity Drift

`resultMapper.ts`, `sessionRuntime.ts`, `sessionStateSurface.ts`, `stoppedSessionContinuity.ts`, and `compactContinuitySummary.ts` are the truthfulness chain. Any capability that bypasses coding-result fields, changed/failed/planned files, verification status, or actionable blockers can drift into false terminal output or weak `/continue` context.

## Fake / Live / Default-Safe Evidence Confusion

The project uses all of these evidence forms:

- live provider-called no-write: Route 199
- live provider stopped/no-write: Route 200 observed state
- fake provider: deterministic provider proposal/runtime tests
- fake-ready boundary: provider-called wiring with fake-ready provider home
- default-safe skip: no opt-in paths
- focused unit tests: module-local contracts
- scaffold-only: descriptors/manual docs/facades

Without explicit labels, these are easy to collapse into an incorrect readiness claim.

## Documentation Overload

The docs tree contains many route docs, design docs, active architecture docs, and foundation docs. `docs/ACTIVE_CONTEXT.md` and `docs/DOC_STATUS.md` reduce load, but historical docs can still look current unless verified against code/tests.

## Route Completion Ambiguity

Route names often describe intended capability surfaces. Current truth must come from code, focused tests, scripts, and user-observed live evidence. Route 199 closed a live no-write provider boundary. Route 200 did not close a live provider-called apply/verification task loop.

## System-Level Coupling Risks

| Risk | Coupled modules | Current evidence | Current impact |
|---|---|---|---|
| False live success claim | Provider Smoke, Task Lifecycle, Harness, Result Surface | Route 199/200 distinction in Route 201; smoke scripts | Highest readiness-claim risk |
| False write authority | Provider, Proposal, Plan Quality, Edit | `mutationAuthority:not-granted` markers; apply route requirements | Safety risk if ignored |
| Partial mutation misreported | Edit, Verification, Result, Session | `targetSetEditRoute.ts`, `proposalHunkSetRoute.ts`, result/session tests | User-facing trust risk |
| Context readiness overclaim | Read/Context, Analyze, Plan, Provider | context packet/graph/plan quality tests | Planning quality risk |
| Local fixture overclaim | MCP, Browser, Harness | local MCP/browser deterministic gates | Integration readiness risk |
| Compact/replay drift | Session, Result, Edit, Verification | continuity and compact modules/tests | Long-session risk |

# Module Roadmap Reset

Route: `docs/agent-routes/route149-module-roadmap-reset.md`

## Scope

Route 149 resets the roadmap after Routes 135-147 moved the project from
feature-first cleanup into module-governed development. Route 148 also landed
an Edit / Patch module facade before this reset, so the current roadmap treats
Edit / Patch as a module candidate rather than the automatic next feature.

This is a planning and architecture synchronization route. It changes no
product code, provider behavior, browser behavior, edit execution, schemas,
CLI behavior, dependencies, or test expectations.

## What Changed After Routes 135-147

| Route | Module impact | Current evidence |
|---|---|---|
| 135 | Harness verifier decomposition | `scripts/verify-real-user-capabilities.mjs` delegates to focused `scripts/verify/` modules while preserving flags, markers, redaction, and opt-in behavior. |
| 136 | Control-plane atlas | `control-plane-atlas.md` names the TS control-plane modules and concentration points. |
| 137 | Agent Loop projection extraction | Browser/result/evidence projection helpers moved out of `runMvpIntegratedFlow.ts`. |
| 138 | Agent Loop dispatch seam | `flowDispatch.ts` owns a dispatch/reentry seam and repaired command-result drift. |
| 139 | Control-plane baseline sweep | Command/policy/result drift was classified and repaired; remaining runMvp reds were made explicit. |
| 140 | Read / inspect contract | Read/list/repo-explain no-write behavior gained named helper owners and stopped false fallback behavior. |
| 141 | Verification planner cleanup | Verification selection, retry, skipped/not-requested, and result projection gained named owners. |
| 142 | Session continuation cleanup | Continuation, lineage, rebase, and replay projection helpers reduced mixed session/loop logic. |
| 143 | Edit expectation contract | Current write/edit support was defined as bounded target plus concrete content; future edit expectations were stopped. |
| 144 | runMvp/package closeout | Full `runMvpIntegratedFlow.test.ts` and `packages/ts-shell` package sweep became green. |
| 145 | Session substrate seams | Transcript codecs, summary, continuation, compact, and metadata projections moved out as schema-preserving helpers. |
| 146 | Tool / Policy / Result contract | Shared lifecycle receipt and transcript-safe result projection vocabulary were introduced. |
| 147 | Future Edit expansion contract | Broad refactor, discovery edit, and broader fenced replacement became future-only contracts, not executable writes. |

Route 148 then gave Edit / Patch a module facade over current and future edit
contracts. That strengthens the module map, but it does not change the Route
149 decision: future work should be selected by module risk and product value,
not by the last capability touched.

## Module-First Development Rule

Future routes must name these before implementation:

- owning module
- lifecycle stage touched
- cross-module inputs
- cross-module outputs
- product behavior boundary
- validation gate
- stop conditions

Feature work is valid only when it enters through a module-owned contract.

Examples:

- Edit expansion enters through Edit / Patch module contracts, not directly
  through `runMvpIntegratedFlow.ts`.
- Browser planner work enters through the Browser module, not ad hoc Agent Loop
  branches.
- Provider readiness enters through Provider / Model contracts and isolated
  gates, not CLI startup convenience logic.
- CLI changes enter through CLI / UX ownership, not scattered display edits.

## Module Inventory

| Module | Current state | Route evidence | Owner files / seams | Strongest contract | Biggest risk | Next valid route type |
|---|---|---|---|---|---|---|
| Agent Loop | Stabilized baseline, still high coupling | Routes 137-144 | `runMvpIntegratedFlow.ts`, `flowDispatch.ts`, flow projection helpers | dispatch/projection seams plus green runMvp baseline | absorbing new feature logic | dispatch extraction v2 or receipt-consumer thin wiring |
| Session / Continue | Mature substrate seams, schema preserved | Routes 142, 145 | `SessionManager.ts`, `sessionEventCodec.ts`, `sessionSummaryProjection.ts`, `sessionContinuationProjection.ts` | transcript/reentry/continuation projection contracts | accidental schema or replay drift | schema-neutral projection route only |
| Tool | Stronger lifecycle vocabulary | Routes 138, 141, 146 | `core/tools/*`, `toolPolicyResult.ts`, `toolResultProjection.ts`, registry/runtime seams | Tool / Policy / Result receipt | capability-specific result interpretation in loop | runtime/tool receipt integration |
| Permission / Policy | Explicit but distributed | Routes 139, 143, 146 | approval, command allowlist, browser policy, workspace authority modules | shared policy status/reason vocabulary | prompt text implying authority | policy reason normalization or audit projection |
| Result Surface | Truthfulness baseline is strong | Routes 137-146 | `resultMapper.ts`, `sessionRuntime.ts`, capability result projectors | no false success; stopped/error classification | capability branches constructing user text near execution | generic capability-result projection |
| Edit / Patch | Module facade exists; broad execution blocked | Routes 143, 147, 148 | `editExpectationContract.ts`, `futureEditContract.ts`, `editPatchModule.ts`, `patchResult/*` | bounded edit expectation plus future-only manifests | inferring broad write readiness | thin module integration or bounded fenced route only after explicit selection |
| Browser | Controlled runtime/eval mature but not current priority | Browser closeout routes and atlas docs | `core/context/browser*`, `core/harness/browser*` | opt-in controlled runtime, trace/report/redaction | public-web or action expansion drift | planner v2 only if product priority returns |
| Workspace / File Context | Strong write authority pieces, no single contract | Routes 140, 143, 147, 148 | read/inspect helpers, `patchResult/workspaceAuthority.ts`, stale-read/write gates | workspace authority and stale-read boundaries | split read/write target vocabulary | Workspace / File Context contract |
| Runtime | Execution paths exist; shared receipt missing | Routes 144, 146 | daemon/sandbox/runtime context, Rust execution plane, browser runtime status | command/runtime result projection plus sandbox preflight | capability-specific receipt shapes | Runtime receipt contract |
| CLI / UX | Helper split improved; entrypoint still high-touch | Route 136 atlas and Route 144 closeout | `cli.tsx`, `cliArgs.ts`, mode runners, slash registry | mode dispatch and approval bridge boundaries | adding policy/session behavior in entrypoint | CLI/core split preparation |
| Provider / Model | Opt-in/readiness boundary preserved | Routes 136, 144, 146 | provider credentials/readiness, model adapters, provider outcome projection | real-provider opt-in and readiness classification | leaking provider config or changing defaults | provider readiness parity map |
| Harness / Eval | Real-user verifier decomposed; taxonomy uneven | Routes 135, 144-147 | `scripts/verify/*`, verifier entrypoints, browser eval harness | deterministic markers and opt-in gates | gate names and report markers drifting | Harness / gate taxonomy |
| Capability Contract Architecture | Lifecycle vocabulary exists and is being adopted | Routes 131, 136, 145-148 | `capability-contract.md`, module docs, route template | lifecycle stage table and module-owned contracts | docs becoming separate from code reality | adoption report or template hardening |

## Next Route Families

### Phase A: Control-Plane Kernel Hardening

1. Agent Loop dispatch extraction v2.
2. Runtime receipt contract.
3. Workspace / File Context contract.
4. CLI / core split preparation.

Use Phase A when the next route should reduce cross-module coupling before
adding capability scope.

### Phase B: Capability Module Expansion

1. Edit / Patch module thin integration.
2. Edit snapshot / rollback substrate.
3. Multi-file discovery candidate selection.
4. Browser controlled planner v2, only if product priority returns to browser.

Use Phase B only when a module contract already owns inputs, outputs,
preconditions, result projection, and validation. Edit is allowed here, but it
is not automatically next.

### Phase C: Gate And Release Architecture

1. Harness / gate taxonomy.
2. Eval report schema.
3. Provider readiness parity.
4. Capability lifecycle adoption report.

Use Phase C when the blocker is confidence, reporting, or release-readiness
truthfulness rather than runtime implementation.

## Decision Criteria

Pick the next route by answering:

- Which module owns the risk?
- Which lifecycle stage is currently missing or too coupled?
- Which user-facing path or validation surface improves?
- Which existing green gate protects the change?
- Which stop condition prevents scope expansion?

If those answers are unclear, choose a contract or inventory route instead of a
feature route.

## What Should Not Be Done Next

- Do not continue Edit / Patch only because Routes 147-148 discussed edit.
- Do not add broad edit, rollback, fuzzy patch, discovery mutation, browser
  public-web action, provider live behavior, schema changes, CLI redesign, or
  dependency changes through a roadmap reset.
- Do not grow `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or `cli.tsx` with
  new policy or capability logic when a module contract should own it.
- Do not use harness-only success as a substitute for product-route evidence.

## Recommended Next Route

The strongest next default is Phase A: Runtime Receipt Contract.

Reason: Tool / Policy / Result already provides lifecycle vocabulary, but
runtime execution paths still project capability-specific receipts. A shared
runtime receipt contract can reduce Agent Loop and Result Surface coupling
without enabling provider, browser, or edit expansion.

If product priority explicitly returns to mutation, choose Edit / Patch Thin
Integration instead, limited to one projection/classification handoff and no
new write execution.

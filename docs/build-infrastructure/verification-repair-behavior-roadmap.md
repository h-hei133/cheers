# Verification Repair Behavior Roadmap

Status: VR001 roadmap.
Date: 2026-06-01.

This roadmap starts the Verification And Repair Behavior block after the
Context and Planning, Provider/Model Boundary, and Model Tool Runtime blocks.
It keeps verification and repair inside owner domains and connects them to the
Agent Loop spine without changing command execution, repair apply, or terminal
truth in the audit task.

## Recommended Implementation Sequence

| Task | Implements | Defers | Owner domains | Validation expectations | Completion criteria |
|---|---|---|---|---|---|
| VR002 Verification Result Boundary In Agent Loop | Consume task-relevant verification intent/result facts through the existing loop verification boundary; project selected/not-run/blocked/dispatched/passed/failed/timed-out/cancelled/relevance facts; carry runtime receipt ids, relevance, coverage, failure class, repair eligibility, not-proven claims, runtime events, JSON stream entries, save point ids, and product surface sections. | Command allowlist expansion, new verification execution behavior, repair apply, post-repair rerun, CLI behavior changes. | `verification`, `runtime/loop`, `runtime/events`, `evidence`, `result`, `presentation`; `tools`/`runtime/execution` as receipt consumers only. | Verification command plan/result tests, task-relevant verification tests, loop contract/trajectory tests, runtime event/JSON stream tests, save point tests, product surface tests, result truthfulness tests. | Agent Loop can observe task-relevant verification facts without turning intent, selection, dispatch, exit zero, or surface rendering into success. |
| VR003 Repair Required And Proposal Observation Boundary | Derive repair-required handoff only from failed task-relevant verification; preserve original failure; project repairability, proposal-only/readiness, authority-required, no-automatic-repair, and continuation facts into loop/events/surface. | Automatic provider repair, repair apply, hunk execution changes, post-repair success path. | `repair`, `verification`, `runtime/loop`, `runtime/events`, `evidence`, `presentation`; `edit` as future handoff owner only. | Repair handoff/proposal tests, verification-repair context/planner tests, loop trajectory/event tests, product surface tests, result no-success tests. | Failed verification can create visible repair-required/proposal facts while original failure remains visible and mutation stays not-run. |
| VR004 Repair Apply Observation And Post-Repair Verification Contract | Consume externally supplied edit-owner apply observations and require same-command or equivalent post-repair verification before repair verdict candidate can be success-shaped. | New apply execution, broad repair automation, command allowlist expansion, CLI loop replacement. | `repair`, `edit`, `verification`, `evidence`, `result`, `runtime/loop`, `presentation`. | Repair iteration tests, edit handoff tests, post-repair verification tests, claim ledger/verdict tests, surface tests. | Repair apply and post-repair verification are separate facts; repair apply alone cannot produce success. |
| VR005 Verification Repair Product Closeout | Consolidate verification/repair loop observations into the product path and result truth surfaces after earlier tasks prove owner facts. | SDK/RPC/TUI/MCP/browser/plugin/package-loading surfaces, session schema migration unless separately scoped. | `runtime/loop`, `verification`, `repair`, `evidence`, `result`, `presentation`, CLI/session as consumers. | Focused product path tests, result-contract tests, event/JSON stream tests, product surface tests, build if product code changes. | Users can see a trustworthy verification/repair chain with original failure, repair facts, post-repair verification, and verdict inputs preserved. |

## Owner Domains

- `verification`: intent normalization, command selection, task relevance,
  coverage, authority requirement, dispatch through existing runtime/tool
  boundary, result classification, failure taxonomy, repair eligibility.
- `repair`: repair-required handoff, proposal observation, apply observation,
  original failure preservation, post-repair verification requirement.
- `runtime/loop`: phase order, injected verification boundary consumption,
  trajectory projection, save point and next-turn linkage.
- `runtime/events`: observation-only runtime events and JSON event stream.
- `evidence`: save point, claim ledger, not-proven propagation, verdict inputs.
- `result`: terminal truth and no-success guardrails.
- `presentation`: product surface rendering only.
- `tools` and `runtime/execution`: existing receipt/dispatch owners only when
  verification dispatch is explicitly authorized.
- `edit`: future apply owner; repair must not bypass it.

## Files Likely To Inspect Or Change

Likely source files:

- `packages/ts-shell/src/verification/result/boundary.ts`
- `packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts`
- `packages/ts-shell/src/verification/command/plan.ts`
- `packages/ts-shell/src/verification/command/result.ts`
- `packages/ts-shell/src/verification/result/failure/classifier.ts`
- `packages/ts-shell/src/verification/verificationFacade.ts`
- `packages/ts-shell/src/repair/handoff/boundary.ts`
- `packages/ts-shell/src/repair/iteration/projection.ts`
- `packages/ts-shell/src/orchestration/verificationRepairContext.ts`
- `packages/ts-shell/src/orchestration/verificationRepairPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationRepairResult.ts`
- `packages/ts-shell/src/runtime/loop/contract.ts`
- `packages/ts-shell/src/runtime/loop/trajectory.ts`
- `packages/ts-shell/src/runtime/events/projection.ts`
- `packages/ts-shell/src/runtime/events/stream.ts`
- `packages/ts-shell/src/evidence/savepoint/model.ts`
- `packages/ts-shell/src/evidence/projection/claim/ledger.ts`
- `packages/ts-shell/src/evidence/verdictFacade.ts`
- `packages/ts-shell/src/presentation/surface/model.ts`

Likely focused tests:

- `packages/ts-shell/src/verification/command/*.test.ts`
- `packages/ts-shell/src/verification/result/*.test.ts`
- `packages/ts-shell/src/verification/taskRelevantVerificationRoute.test.ts`
- `packages/ts-shell/src/verification/verificationFacade.test.ts`
- `packages/ts-shell/src/repair/handoff/*.test.ts`
- `packages/ts-shell/src/repair/iteration/projection.test.ts`
- `packages/ts-shell/src/orchestration/verificationRepair*.test.ts`
- `packages/ts-shell/src/runtime/loop/contract.test.ts`
- `packages/ts-shell/src/runtime/loop/trajectory.test.ts`
- `packages/ts-shell/src/runtime/events/projection.test.ts`
- `packages/ts-shell/src/runtime/events/stream.test.ts`
- `packages/ts-shell/src/evidence/savepoint/model.test.ts`
- `packages/ts-shell/src/evidence/projection/claim/ledger.test.ts`
- `packages/ts-shell/src/evidence/verdictFacade.test.ts`
- `packages/ts-shell/src/presentation/surface/model.test.ts`

## What Can Be Combined In One Task

VR002 can safely combine:

- verification intent to loop verification-boundary consumption
- task relevance, coverage, authority, selected/not-run, dispatch, result,
  timeout/cancel/block/fail/pass facts
- receipt-backed evidence ids and failure classification
- repair eligibility as a fact, not repair execution
- runtime event and JSON stream projection for verification facts
- save point id propagation for verification intent/result ids
- product surface rendering of verification boundary facts
- result/evidence tests proving no success upgrade

These changes belong together because the safety risk is the same: keeping
intent, command selection, dispatch, runtime outcome, task relevance, and
verdict input distinct.

## What Must Be Deferred

- automatic repair execution
- broad command allowlist expansion
- new verification scripts or aliases
- fallback execution
- provider calls or provider prompt changes
- tool execution changes
- edit/apply behavior changes
- post-repair command rerun execution
- session schema migration
- SDK/RPC/TUI/MCP/browser/plugin/package-loading surfaces
- product loop replacement
- compatibility shim growth
- product surface or result mapper success upgrades

## Validation Plan

For docs-only tasks:

- `git diff --check`
- `git status --short --branch`

For VR002 product implementation:

- focused verification command plan/result tests
- task-relevant verification selection/coverage/relevance tests
- verification failure classification tests
- Agent Loop contract and trajectory tests for verification boundary facts
- runtime event and JSON stream tests for observation-only status
- save point tests for verification ids and not-proven claims
- product surface tests for verification facts
- result/evidence truth tests proving no success from intent, selection,
  dispatch, exit zero, tool execution, or surface rendering
- package build only if product TypeScript changes require it

For later repair tasks:

- repair required/proposal/apply/post-repair projection tests
- original failure preservation tests
- claim ledger/verdict tests
- focused product path tests around repair continuation

## Completion Criteria

The block is close to target when:

- verification intent, command selection, dispatch, result, relevance,
  coverage, failure class, and repair eligibility are distinct loop facts
- selected-not-run, blocked, cancelled, timed out, irrelevant, failed, partial,
  and not-proven states remain visible
- repair-required/proposal/apply/post-repair facts preserve original failure
- repair proposal and repair apply cannot claim success without post-repair
  verification
- runtime events and JSON stream remain redacted and observation-only
- save point and next-turn facts carry ids and not-proven claims, not raw output
- product surface renders verification/repair facts without becoming a verdict
- result/evidence owners are the only terminal success gate

## Next Task Name

VR002 Verification Result Boundary In Agent Loop.

Goal:

- Wire task-relevant verification result facts into the Agent Loop verification
  boundary as observation and verdict-input facts, preserving authority,
  relevance, coverage, receipt evidence, failure class, repair eligibility, and
  not-proven claims.

Non-goals:

- no new command execution behavior
- no command allowlist expansion
- no repair apply
- no post-repair rerun
- no CLI behavior change
- no success claim outside result/evidence verdict rules

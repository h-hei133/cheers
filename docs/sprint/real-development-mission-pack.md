# SP045 Real Development Mission Pack

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: define the SP045 real development mission set, baseline weaknesses,
same-mission rerun outcomes, and adoption decisions. These missions must prove
normal runtime development behavior, not catalog inclusion or proof-boundary
projection alone.

## Mission Set

| ID | Category | Normal runtime behavior exercised | Completion evidence |
|---|---|---|---|
| RD-01 | Ambiguous owner discovery | discover owner, read owner, then edit selected target | Runtime does not edit before discovery/read resolves the owner. |
| RD-02 | Cross-module feature | edit source plus dependent callsite and verify both changed files | Source and dependent target are changed, accounted, and verified. |
| RD-03 | Test-impact verification | changed source selects and runs targeted test candidate | Verification target includes the impacted test, not only the source file. |
| RD-04 | Failed-test repair | failed verification leads to diagnosis, changed repair strategy, and re-verification | Repair does not repeat the same failed action and rechecks after repair. |
| RD-05 | API/type contract dependent update | contract change updates implementation and typed dependent target | Contract, implementation, and dependent usage stay in changed-file accounting. |
| RD-06 | Semantic artifact validation | artifact claims require matching source and verification evidence | Artifact completes only when each claim has semantic evidence. |
| RD-07 | Continuation completion | pending verification is restored and completed after reentry | Pending action resumes, verifies changed target, and completes with proof. |
| RD-08 | Tool failure recovery | failed tool result refines next action and prevents terminal success | Runtime requests recovery context or repair, and remains not-proven until proof. |

## Required Baseline Record

Run the same mission diagnostics before and after product changes:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts
```

For each weak mission, record the weak phase, owner domain, missing runtime
behavior, gap class, mature source area inspected, and introduction decision.

## Initial Weakness Record

Baseline command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts
```

Baseline result: 5 failed diagnostics, 73 passed.

| Mission | Weak phase | Owner domain responsible | Missing runtime behavior | Gap class | Mature capability area inspected | Four-level introduction decision |
|---|---|---|---|---|---|---|
| RD-03 | verification selection | planning/execution, verification/execution, core/query/runtime | Source changes did not promote impacted test files into selected verification targets or coverage. | verification | Pi agent loop tool-result turn ordering; extension result reducer; local verification owner | Structured port plus local dependency use. |
| RD-04 | repair strategy | repair/loop, tools/policy, core/query/runtime | Two failed repair decisions with different signatures could stay repair-eligible instead of requesting renewed discovery. | repair | Pi tool feedback and retry-safe durable recovery policy | Structured port. |
| RD-05 | dependent update graph | planning/action, context/selection | Contract change graph did not attach impacted verification target or explicit dependent update semantics. | plan | Pi loop turn/tool-result ordering and local action graph owner | Structured port. |
| RD-08 | tool failure feedback | tools/policy, core/query/runtime | Failed read feedback could continue to edit instead of renewed discovery. | tool/context | Pi tool_result reducer and error result propagation before final turn messages | Structured port. |
| RD-02/RD-03 | changed-target coverage | verification/execution, core/query/runtime | Changed-file coverage ignored impacted verification targets. | verification/proof | Local verification coverage model plus Pi durable turn result shape | Dependency use plus structured port. |

## Rerun Record

Same command after product changes: 8 files passed, 79 diagnostics passed.

| Mission | Rerun outcome |
|---|---|
| RD-01 | Passed through normal runtime owner discovery tests; search/read precedes edit. |
| RD-02 | Passed; multi-file source and dependent changes are accounted and verified. |
| RD-03 | Improved and passed; impacted test path is selected before completion and coverage requires it. |
| RD-04 | Improved and passed; two failed repair decisions exhaust retry and request discovery before re-verification. |
| RD-05 | Improved and passed; contract, implementation, consumer, and impacted verification node stay distinct. |
| RD-06 | Passed; artifact claim evidence remains semantic and claim-specific. |
| RD-07 | Passed; continuation restores pending verification and completes with proof. |
| RD-08 | Improved and passed; failed read feedback selects renewed discovery before edit or terminal result. |

Completion accounting:

- Mission count: 8.
- Normal runtime coverage: RD-01, RD-02, RD-03, RD-04, RD-06, RD-07, RD-08 exercise `QueryEngine` normal runtime behavior; RD-05 exercises the owner action graph consumed by planning/runtime.
- Improved missions: RD-02/RD-03, RD-04, RD-05, RD-08, and changed-target coverage improved; count 5.
- Completed after changes: all 8 diagnostics pass.
- Cross-module/multi-file completions: RD-02 and RD-05.
- Failed test repair completion: RD-04.
- Repeated repair strategy change: RD-04.
- Continuation completion: RD-07.
- Semantic artifact validation: RD-06.
- Normal runtime feedback updates next action and task proof: RD-03, RD-04, RD-08.
- Stop-not-proven boundary remains covered by existing normal runtime proof-gap diagnostics in the same command.

## Introduction Decisions

| Capability | Dependency use | Structured port | Isolated source adoption | Decision |
|---|---|---|---|---|
| Tool feedback reduction before next action | No compatible package boundary in this repo. | Pi hook/result reducer shape maps to local tool policy and runtime observation owners. | Not needed; current local event/result types differ. | Structured port. |
| Durable continuation completion | No compatible package boundary in this repo. | Pi durable pending-work recovery maps to local session continuation and runtime seed facts. | Not needed; local session schema differs. | Structured port. |
| Changed-target verification selection | Existing local verification owners provide typed coverage and command selection. | Extend local execution/selection models inside current owners. | Not needed. | Dependency use plus structured port. |
| Multi-step repair strategy | Existing repair owner can classify repeated repair and diagnostic context. | Extend local repair strategy/observation facts. | Not needed. | Dependency use plus structured port. |

## Playbook And Source Inputs

Playbook files used:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `source/packages/agent/README.md`
- `source/packages/agent/docs/durable-harness.md`
- `source/packages/agent/docs/hooks.md`
- `source/packages/coding-agent/docs/extensions.md`
- `source/packages/coding-agent/docs/compaction.md`

Mature source areas inspected after target owner discovery:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/session/session.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/agent-session-runtime.ts`

## Live Acceptance Attempt

Command:

```bash
rtk env PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/sp045-live-catalog HOME=/tmp/private-agents-test/sp045-live-catalog-home USERPROFILE=/tmp/private-agents-test/sp045-live-catalog-home PRIVATE_AGENTS_LIVE_TASK_CATALOG=docs/sprint/development-capability-catalog.json npm run verify:live-task-execution
```

Observed result: product live catalog entries mostly completed, but the hard
gate did not pass because provider/fallback coverage was classified as external
provider/network/config noise.

Observed safe fields:

- `liveEntryCount=8`
- `executedCount=7`
- `completedWithTaskProofCount=7`
- `completedWriteTaskProofCount=3`
- `reviewedDisposablePostApplyProofCount=3`
- `debugOrRepairComplete=true`
- `manualCorrectionCount=0`
- `reportRedaction=pass`
- `read-only-provider.outcome=provider-network-inconclusive`
- `anchored-provider.outcome=passed`
- `anchored-provider-forced-fallback.outcome=config-or-skip`
- `anchored-provider-forced-fallback.primaryFailureClass=provider-network`
- `anchored-provider-forced-fallback.fallbackOutcome=inconclusive`
- `providerFallbackCoveragePassed=false`
- `hardGateStatus=not-passed`

Expected pass fields for closeout:

- `hardGateStatus=passed`
- `executedCount=8`
- `completedWithTaskProofCount>=8`
- `completedWriteTaskProofCount>=3`
- `debugOrRepairComplete=true`
- `providerFallbackCoveragePassed=true`
- `manualCorrectionCount=0`
- `reportRedaction=pass`

Manual retest evidence accepted for closeout:

- `hardGateStatus=passed`
- `executedCount=8`
- `completedWithTaskProofCount=8`
- `completedWriteTaskProofCount=3`
- `reviewedDisposablePostApplyProofCount=3`
- `debugOrRepairComplete=true`
- `providerFallbackCoveragePassed=true`
- `manualCorrectionCount=0`
- `reportRedaction=pass`
- read-only provider passed
- anchored provider passed
- forced fallback passed
- selected workspace apply passed

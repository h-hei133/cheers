# SP054 Three Sprint Capability Push Plan

This plan defines exactly three aggressive next sprints. They are not closeout, catalog, liveRun, evaluation, documentation, or proof-only work. Each sprint must change normal product runtime behavior in owner domains and must be validated by diagnostics that exercise the behavior.

## Sprint 1: Execution Harness And Tool Feedback Deepening

Main capability target: turn runtime actions into concrete, typed execution batches with ordered tool-result ingestion and richer feedback for the next runtime decision.

Why this is one of the top three priorities: the audit found the largest gap at the `QueryEngine`/`AgentRunner` seam. The project has action policy and authority guards, but it does not yet have a mature normal-runtime harness comparable to the stronger local project's tool batch loop, hook points, save points, and tool-result sequencing.

Product owners to change:

- `packages/ts-shell/src/core/query/runtime`
- `packages/ts-shell/src/tools/dispatch`
- `packages/ts-shell/src/tools/policy`
- `packages/ts-shell/src/core/tools`
- `packages/ts-shell/src/verification/command`
- `packages/ts-shell/src/core/query/runtime/observation.ts`

Stronger local project areas to inspect:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/tools/bash.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/tools/edit.ts`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/agent-harness.md`

Four-level introduction decision:

| Level | Decision |
|---|---|
| Dependency use | Reject. The current runtime contracts, proof model, and tool runtime are local TypeScript owners. |
| Structured port | Use. Port the behavior shape: batch planning, per-tool feedback, save-point-style ingestion, and ordered result reduction. |
| Isolated source adoption | Reject unless a tiny pure helper is separately justified; source names and runtime fields must not be copied. |
| Behavior-only alignment | Use for broad harness semantics where local ownership differs. |

Implementation expectations:

- Add a runtime-owned action execution batch model for read/search/verify/repair/artifact action families.
- Preserve per-tool result details that are safe: tool id, action kind, covered files, truncated flag, exit status class, failure class, affected paths, and redaction status.
- Ingest batch results into runtime observations before the next action decision.
- Keep `ExecutionService` or existing tool runtime boundaries for side effects; do not introduce ad hoc process or filesystem writes.
- Preserve action authority gates before and after execution.
- Do not move success ownership out of `evidence/task` and `result/task`.

Non-substitutable completion gates:

- At least six diagnostics exercise normal `QueryEngine` plus concrete execution seam behavior, not evaluation-only helpers.
- Diagnostics must prove ordered result ingestion, failed tool feedback changing next action, batch partial failure, targeted verification handoff, unsafe action blocking, and stop-not-proven when no safe action remains.
- Existing SP052/SP053 runtime authority diagnostics still pass.
- Build passes for `packages/ts-shell`.
- Truthfulness gates pass if result/evidence contracts change.
- `git diff --check` passes.

Anti-shortcut rules:

- A receipt alone is not completion.
- A mission count is not completion.
- A live catalog pass is not completion.
- A test that bypasses `QueryEngine` and the execution seam is not completion.
- A new event surface without product action consumption is not completion.
- A result that hides tool failure behind success is not completion.

Validation commands:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "runtime authority|tool feedback|execution batch|stop-not-proven"
rtk npm run test -w packages/ts-shell -- src/tools/dispatch/dispatcher.test.ts src/tools/policy/strategy.test.ts src/core/tools/runtime.test.ts
rtk npm run test -w packages/ts-shell -- src/verification/command/runner.test.ts src/verification/taskRelevantVerificationRoute.test.ts
rtk npm run build -w packages/ts-shell
rtk npm run verify:evidence:result-contract
rtk npm run verify:evidence:route221-anti-false-success-gate
rtk git diff --check
```

Live provider blocked behavior: live provider is not required for this sprint. If an optional live gate is run and fails only as provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, report blocked with the exact retest command, expected pass fields, observed provider failure class, why this is not a product runtime failure, current git status, and whether changes are uncommitted. Do not retry live repeatedly.

Expected visible capability gain: normal runtime will react to real tool feedback instead of treating execution as a black-box agent output. Failures, partial tool success, and targeted verification results will directly affect the next action.

Requirement coverage:

| Requirement | Completion evidence |
|---|---|
| Execution seam deepening | Normal runtime tests show action batches executed and ingested. |
| Tool feedback maturity | Observations include safe structured result details and affect next action. |
| Anti-false-success | Evidence/result gates still block success without proof. |
| Owner-domain-first | Behavior lives in runtime/tools/verification owners, not scripts or catalog. |

## Sprint 2: Long Task State And Repair Depth

Main capability target: make long-running task state and repair/debug iteration durable enough to survive continuation, replay, and compaction while changing repair strategy from failure evidence.

Why this is one of the top three priorities: the audit found continuation and repair behind the stronger local project. Current replay and compact injection are conservative and proof-safe, but they do not yet form a durable autonomous task ledger, and repair remains shallow compared with real debugging loops.

Product owners to change:

- `packages/ts-shell/src/session/continuation`
- `packages/ts-shell/src/session/replay`
- `packages/ts-shell/src/core/context/compact/injection`
- `packages/ts-shell/src/core/query/runtime/state.ts`
- `packages/ts-shell/src/core/query/runtime/taskState.ts`
- `packages/ts-shell/src/repair/iteration`
- `packages/ts-shell/src/repair/handoff`
- `packages/ts-shell/src/verification`
- `packages/ts-shell/src/evidence/task`
- `packages/ts-shell/src/result/task`

Stronger local project areas to inspect:

- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/session/session.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/session-manager.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/compaction/compaction.ts`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`

Four-level introduction decision:

| Level | Decision |
|---|---|
| Dependency use | Reject. Session, replay, proof, and repair owners are local product contracts. |
| Structured port | Use. Port durable save-point, pending-write, file-operation carry-forward, and recovery-boundary shapes. |
| Isolated source adoption | Reject for session and compaction logic because local session contracts differ. |
| Behavior-only alignment | Use for conservative recovery policies and non-idempotent tool-call handling. |

Implementation expectations:

- Add a durable task-state projection carrying pending action, proof gap, changed files, verified/unverified files, failure categories, repair attempts, and next verification plan.
- Ensure replay and compact injection can restore that task-state projection only when safety/quality checks pass.
- Make repair iteration consume failure output and prior attempts, avoid repeated identical repairs, and switch to discovery when evidence indicates missing context.
- Require post-repair targeted verification for every changed repair file.
- Preserve not-proven status when continuation state is stale, incomplete, or unsafe.

Non-substitutable completion gates:

- At least six diagnostics cover replay restore, compact injection, stale continuation rejection, repeated repair avoidance, context-missing repair-to-discovery switch, and post-repair targeted verification.
- At least two diagnostics simulate multi-turn work with changed files and pending proof gap.
- At least one diagnostic simulates compaction/replay after a failed verification and proves the next action is safe.
- Evidence/result terminal truth remains unchanged.
- Build passes for `packages/ts-shell`.
- `git diff --check` passes.

Anti-shortcut rules:

- A compact summary string alone is not durable task state.
- Replay-restored facts are not success.
- A repair proposal is not repair success.
- Repair apply without post-repair verification is not success.
- Repeating the same failed repair cannot count as progress.
- A skipped stale continuation cannot be hidden as complete.

Validation commands:

```bash
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts src/session/continuation/*.test.ts src/core/context/compact/injection/*.test.ts -t "task state|proof gap|stale|compact|replay"
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "continuation|repair|post-repair|missing context"
rtk npm run test -w packages/ts-shell -- src/repair/iteration/projection.test.ts src/repair/handoff/readiness.test.ts src/verification/taskRelevantVerificationRoute.test.ts
rtk npm run build -w packages/ts-shell
rtk npm run verify:evidence:result-contract
rtk git diff --check
```

Live provider blocked behavior: live provider is not required. If optional live execution is used and fails only for provider-network/config/auth/unreachable after all non-live gates pass, mark blocked only under the active goal rules and report the exact retest command, expected pass fields, observed provider failure class, why this is not a product runtime failure, current git status, and whether changes are uncommitted.

Expected visible capability gain: the agent can stop and resume a hard development task with known pending work, changed files, failure evidence, repair history, and next verification action instead of restarting from an unsafe or vague summary.

Requirement coverage:

| Requirement | Completion evidence |
|---|---|
| Long-task carry-forward | Replay/compact diagnostics restore task-state projection safely. |
| Repair depth | Repair diagnostics prove changed strategy and discovery switch. |
| Verification after repair | Targeted rerun diagnostics prove changed repair files. |
| Anti-false-success | Missing or stale continuation remains not-proven. |

## Sprint 3: Real Unseen Development Gauntlet

Main capability target: force the runtime through real unseen development tasks in disposable workspaces with actual edits, targeted verification, repair, artifact proof, continuation, and result verdicts.

Why this is one of the top three priorities: SP044-SP053 improved product behavior, but broad autonomous development remains under-proven. The next plan must force real capability rather than another curated catalog, proof fallback, or acceptance report.

Product owners to change:

- `packages/ts-shell/src/core/query/runtime`
- `packages/ts-shell/src/context`
- `packages/ts-shell/src/planning`
- `packages/ts-shell/src/tools`
- `packages/ts-shell/src/edit`
- `packages/ts-shell/src/verification`
- `packages/ts-shell/src/repair`
- `packages/ts-shell/src/artifacts`
- `packages/ts-shell/src/session`
- `packages/ts-shell/src/evidence/task`
- `packages/ts-shell/src/result/task`
- Runtime evaluation may consume behavior but must not own new behavior.

Stronger local project areas to inspect:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/tools/*`
- `/home/wang/projects/pi/packages/coding-agent/src/core/session-manager.ts`
- `/home/wang/projects/pi/packages/coding-agent/src/core/compaction/*`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/README.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/observability.md` only if telemetry gaps block diagnosis.

Four-level introduction decision:

| Level | Decision |
|---|---|
| Dependency use | Reject. The gauntlet must prove this product runtime, not embed another harness. |
| Structured port | Use only for behavior patterns that fill gaps discovered in Sprints 1 and 2. |
| Isolated source adoption | Reject unless a tiny source-independent helper is required and reviewed. |
| Behavior-only alignment | Use for task design and maturity bar, not code or naming. |

Implementation expectations:

- Create 5 to 7 disposable unseen development tasks that are not recycled from SP044-SP053 and require real source edits.
- At least three tasks must require multi-file edits.
- At least two tasks must force failing verification followed by repair and targeted rerun.
- At least one task must force artifact creation with claim-evidence validation.
- At least one task must force continuation or compaction/replay carry-forward.
- At least one task must force missing-context discovery before edit.
- Implement product fixes only in rightful owners when the gauntlet exposes a product-runtime failure.

Non-substitutable completion gates:

- All unseen tasks complete with evidence/result-owned verdicts or remain explicitly not-proven with exact missing proof.
- At least five tasks exercise normal runtime plus execution seam, not evaluation-only replay.
- At least three tasks include actual write evidence and post-write verification.
- At least two tasks include repair from failure output and post-repair targeted verification.
- At least one task includes artifact claim-evidence binding.
- No task can pass from provider-called, receipt-only, selected-not-run, fake/focused/default evidence, or catalog metadata.
- Build, focused owner tests, truthfulness gates, and diff check pass.

Anti-shortcut rules:

- Catalog completion is not completion.
- Live hard-gate status is not completion without product-runtime evidence.
- Owner count is not completion.
- Mission count is not completion.
- Test-only behavior without product runtime is not completion.
- Report redaction is necessary but not sufficient.
- Forced fallback coverage is not task proof.

Validation commands:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/tools/policy/strategy.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/repair/iteration/projection.test.ts src/artifacts/workflow/model.test.ts
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts src/core/context/compact/injection/*.test.ts
rtk npm run build -w packages/ts-shell
rtk npm run verify:evidence:result-contract
rtk npm run verify:evidence:route221-anti-false-success-gate
rtk git diff --check
```

Optional live acceptance, only after non-live gates pass and with explicit opt-in:

```bash
PRIVATE_AGENTS_ENABLE_LIVE_PROVIDER=1 \
PRIVATE_AGENTS_LIVE_MODE=1 \
PRIVATE_AGENTS_LIVE_TASK_CATALOG=docs/sprint/development-capability-catalog.json \
PRIVATE_AGENTS_LIVE_TASK_PROFILE=broad \
rtk npm run verify:live-task-execution
```

Live provider blocked behavior: if the optional live command fails only with provider-network, provider-config, provider-auth, or provider-unreachable after non-live gates pass, report blocked with the exact retest command, expected pass fields, observed provider failure class, why this is not a product runtime failure, current git status, and whether changes are uncommitted. If it fails for product-runtime reasons, fix the product owner and rerun focused non-live validation before another live attempt.

Expected visible capability gain: the product can handle fresh development tasks end to end: discover owners, edit, execute tools, verify, repair, validate artifacts, carry pending state, and produce honest terminal verdicts.

Requirement coverage:

| Requirement | Completion evidence |
|---|---|
| Real unseen tasks | Disposable workspace tasks are new and require actual edits. |
| Runtime behavior | Tasks exercise normal runtime and execution seam. |
| Repair and verification | Failed checks drive repair and targeted rerun. |
| Artifact proof | Artifact claims bind to source and verification evidence. |
| Long task state | At least one task crosses continuation or compaction/replay safely. |

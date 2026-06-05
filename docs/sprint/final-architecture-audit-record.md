# SP050 Final Architecture Audit Record

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: lock the autonomous development lane after SP049 by checking owner
boundaries, duplicated truth paths, and acceptance gates against current code.

## Summary

Audit result: product fix required for replay-restored transition cycle
identity. Other reviewed policy, proof, verification, artifact, evaluation, and
live acceptance paths are closed with diagnostic-backed owner evidence.

Product fix:

- `core/query/runtime/state`: replay-derived handoff transition identities now
  keep the same reason-qualified signature used by normal runtime cycle
  control.

Focused diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts -t "reason-qualified transition"
```

Observed result: 1 test passed.

## Playbook And Source Inputs

Playbook files used:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/extensions.md`

Mature source areas inspected after target owner inspection:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/session/session.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/compaction/compaction.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/compaction/branch-summarization.ts`

Introduction decision: no dependency use was available for local runtime
transition identity. No structured port or isolated source adoption was needed.
The replay fix is behavior-only alignment with the durable-boundary rule:
resume from durable facts, and preserve enough identity to avoid repeating an
already observed transition.

## Concrete Findings

### Finding 1: replay-restored cycle identity lost transition reason

Owner inspected: `core/query/runtime/state`, `core/query/runtime/transitions`,
`session/replay`.

Current boundary: `continueQuery` owns transition signatures as
`from->to:reason`; replay state rebuild owns durable continuation inputs.

Risk found: `createQueryRuntimeStateFromSeed` reconstructed
`visitedTransitions` as `from->to`, so a completed-turn replay could miss a
previous same-reason transition. This weakened bounded transition cycle control
after resume while normal runtime remained reason-qualified.

Product fix: `deriveQueryContextFromTranscript` now reconstructs
reason-qualified transition signatures using the same normalized reason shape.

Diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts -t "reason-qualified transition"
```

Remaining risk: low. Replay identity now matches normal runtime transition
identity.

Closure status: closed with product fix.

### Finding 2: legacy verification receipt facade remains a bounded compatibility risk

Owner inspected: `verification/verificationFacade`,
`verification/taskRelevantVerificationRoute`, `evidence/task`, `result/task`,
`runtime/evaluation/task`.

Current boundary: normal runtime and task evaluation reduce proof through
`evidence/task` and `result/task`. The verification facade still emits a
legacy `ProductVerdict` receipt for compatibility diagnostics.

Risk found: the facade is not the final task verdict owner and must not grow
new runtime truth. Current consumers keep it as verification receipt metadata;
evaluation and live progression call `result/task` explicitly.

Product fix: no code fix in SP050. A broad facade removal would exceed the
high-impact audit-fix policy, and the normal runtime task verdict path is
already owner-correct.

Diagnostics:

```bash
rtk rg -n "ownerCalls|result/task|evidence/task" packages/ts-shell/src/runtime/evaluation/task/model.test.ts packages/ts-shell/src/runtime/evaluation/task/liveRun.test.ts
rtk npm run test -w packages/ts-shell -- src/verification/taskRelevantVerificationRoute.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts
```

Remaining risk: medium. Do not add new terminal truth logic to the legacy
verification receipt facade; future cleanup can move receipt projection behind
the result owner when compatibility allows.

Closure status: diagnostic-backed no-fix closure for SP050.

### Finding 3: tool policy recovery paths are already owner-local

Owner inspected: `tools/policy`, `repair/loop`, `core/query/runtime/policy`,
`core/query/runtime/observation`.

Current boundary: runtime policy composes observations and planning facts;
`tools/policy` chooses the next action among read, search, edit, verify,
repair, artifact, continue, or stop-not-proven.

Risk found: no unresolved duplicated policy path for repair repetition or stale
tool observations. Diagnostics prove failed repair switches to discovery, failed
search rediscovers before mutation, and failed artifact output collects source
evidence before repeating artifact generation.

Product fix: none required.

Diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/tools/policy/strategy.test.ts src/repair/loop/model.test.ts src/core/query/runtime/engine.test.ts -t "repeated repair|failed search|failed artifact|missing context|repair strategy"
```

Remaining risk: low. Runtime owns wiring; tool policy owns action choice.

Closure status: diagnostic-backed no-fix closure.

### Finding 4: artifact claim validation remains source and verification aware

Owner inspected: `artifacts/workflow`, `evidence/task`,
`core/query/runtime/proof`.

Current boundary: artifact workflow owns claim-evidence receipts; evidence/task
owns task proof; result/task owns terminal verdict.

Risk found: no unresolved artifact success shortcut. Diagnostics reject
duplicate claim evidence, mismatched source/verification evidence, artifact
presence without validation, and changed artifact output without changed-file
verification proof.

Product fix: none required.

Diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/core/query/runtime/engine.test.ts -t "artifact"
```

Remaining risk: low.

Closure status: diagnostic-backed no-fix closure.

### Finding 5: live fallback acceptance remains acceptance-only

Owner inspected: `runtime/evaluation/task/liveRun`, live catalog script output
surface, `docs/sprint/development-capability-catalog.json`.

Current boundary: live catalog consumes safe gate receipts and task proof
metadata; it does not become task-success owner. Provider calls, fallback
status, live gate pass, and catalog inclusion are explicitly not task success.

Risk found: no unsafe fallback proof path. Tests prove primary success,
fallback skipped on primary success, forced primary provider-network fallback,
owner-receipt safe fallback, and exact missing proof when no safe fallback
source exists.

Product fix: none required.

Diagnostic:

```bash
rtk npm run test -w packages/ts-shell -- src/runtime/evaluation/task/liveRun.test.ts
```

Remaining risk: provider availability is external and must remain classified
separately from product runtime failures.

Closure status: diagnostic-backed no-fix closure.

## Audit Areas

| Area | Owner inspected | Current boundary | Evidence | Closure |
|---|---|---|---|---|
| QueryEngine and runQueryLoop | `core/query/runtime/engine`, `core/query/runtime/loop` | Loop and wiring only; delegates action policy, observation, proof projection, and result mapping. | `engine.ts`, `loop.ts`, `engine.test.ts` cycle/proof-gap diagnostics. | Closed. |
| AgentRunner | `orchestration/types` | Execution boundary is a function receiving role, runtime action, shared context, and transcript; QueryEngine does not own provider/tool implementation. | `AgentRunner` type and QueryEngine constructor dependency. | Closed. |
| Tool action policy | `tools/policy/strategy` | Primary next-action owner, consumed by runtime policy. | `strategy.test.ts` repair, stale search, artifact recovery diagnostics. | Closed. |
| Dependent action graph | `planning/action/graph` | Owns dependent target facts, changed-file intents, and dependency reasons. | `graph.test.ts`, `taskRelevantVerificationRoute.test.ts` dependent target diagnostics. | Closed. |
| Verification | `verification/taskRelevantVerificationRoute`, `verification/verificationStage`, `verification/execution` | Consumes graph and changed-file facts; does not own final task verdict in normal evaluation/runtime paths. | `taskRelevantVerificationRoute.test.ts`, `verificationStage.test.ts`, `runtime/evaluation/task/model.test.ts`. | Closed with legacy facade risk noted. |
| Session replay | `session/replay/builder`, `core/query/runtime/state` | Builds durable runtime seed and observation facts without creating success. | Replay proof-fact diagnostic plus SP050 transition identity fix. | Closed with product fix. |
| Artifact workflow | `artifacts/workflow/model` | Owns artifact receipt and claim-evidence validation only. | `model.test.ts`, `proof.test.ts`, artifact runtime diagnostics. | Closed. |
| Evidence task proof | `evidence/task/proof` | Normalizes proof items and missing proof; not terminal success owner. | `proof.test.ts`, `core/query/runtime/proof.ts`. | Closed. |
| Result task verdict | `result/task/verdict` | Reduces complete proof to terminal classification and not-proven claims. | `verdict.test.ts`, runtime/evaluation owner-call diagnostics. | Closed. |
| Evaluation task | `runtime/evaluation/task/model` | Consumes product owners through deterministic loop and records owner calls. | `model.test.ts` owner-call checks and task proof/verdict steps. | Closed. |
| Live catalog | `runtime/evaluation/task/liveRun`, `scripts/verify-live-task-execution.ts` | Acceptance-only, default-off, opt-in, redacted gate consumer. | `liveRun.test.ts` catalog/fallback/redaction diagnostics. | Closed. |
| Transition cycle control | `core/query/runtime/transitions`, `core/query/runtime/state` | Reason-qualified transition signatures allow distinct progress and stop same-reason repeats. | `engine.test.ts` reason-distinct diagnostic; SP050 replay regression. | Closed with product fix. |

## Duplicated Path Check

- Policy: no competing policy path found; runtime policy composes and
  delegates to `tools/policy`.
- Proof: normal runtime and evaluation route proof through `evidence/task`.
- Result: normal runtime and evaluation task verdict route through
  `result/task`; legacy product-verdict facade remains compatibility metadata.
- Verification: verification owns command relevance, coverage, and receipt; it
  does not own normal task verdict.
- Artifact: artifact workflow owns receipt validation; task proof still requires
  evidence and result verdict.
- Continuation: replay seed carries input facts only and now preserves cycle
  identity.
- Live acceptance: live catalog remains default-off and acceptance-only with
  explicit non-success claims.

## Validation Ledger

Passed non-live gates:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/planning/action/graph.test.ts src/planning/execution/model.test.ts src/context/selection/model.test.ts src/verification/execution/model.test.ts src/repair/loop/model.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/session/replay/builder.test.ts
```

Observed result: 15 files passed, 172 tests passed.

```bash
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts src/core/query/runtime/engine.test.ts -t "reason-qualified transition|reason-distinct|replay-restored continuation"
```

Observed result: 2 files passed, 3 tests passed.

```bash
rtk npm run test -w packages/ts-shell -- src/core/shell/recovery.repeated-handoff-cleanup.test.ts src/core/shell/recovery.repeated-handoff-direct-resolution.test.ts
```

Observed result: 2 files passed, 2 tests passed.

```bash
rtk npm run build -w packages/ts-shell
```

Observed result: passed.

```bash
rtk npm run verify:evidence:result-contract
```

Observed result: passed.

```bash
rtk npm run verify:evidence:route221-anti-false-success-gate
```

Observed result: passed.

```bash
rtk git diff --check
```

Observed result: passed.

External live catalog gate attempted:

```bash
rtk env PRIVATE_AGENTS_LIVE_TASK_EXECUTION=1 PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY=1 PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY=1 PRIVATE_AGENTS_REAL_HOME=/home/wang/.private-agents-real PRIVATE_AGENTS_TEST_ROOT=/tmp/private-agents-test/sp050-live-catalog HOME=/tmp/private-agents-test/sp050-live-catalog-home USERPROFILE=/tmp/private-agents-test/sp050-live-catalog-home PRIVATE_AGENTS_LIVE_TASK_CATALOG=docs/sprint/development-capability-catalog.json npm run verify:live-task-execution
```

Observed safe fields:

- `live-task-profile=catalog`
- `live-task-catalog=development-capability-catalog`
- `live-task-catalog-entry-count=8`
- `live-task-execution-opt-in=true`
- `private-config-manual-read=false`
- `raw-provider-output=excluded`
- `read-only-provider.outcome=passed`
- `anchored-provider.outcome=config-or-skip`
- `anchored-provider.primaryFailureClass=provider-network`
- `anchored-provider.fallbackOutcome=inconclusive`
- `anchored-provider-forced-fallback.outcome=config-or-skip`
- `anchored-provider-forced-fallback.primaryFailureClass=provider-network`
- `anchored-provider-forced-fallback.fallbackAttempted=true`
- `anchored-provider-forced-fallback.fallbackOutcome=inconclusive`
- `selected-workspace-apply.outcome=passed`
- `executedCount=1`
- `completedWithTaskProofCount=1`
- `completedWriteTaskProofCount=0`
- `reviewedDisposablePostApplyProofCount=0`
- `debugOrRepairComplete=false`
- `providerFallbackCoveragePassed=false`
- `manualCorrectionCount=5`
- `reportRedaction=pass`
- `hardGateStatus=not-passed`

Failure class: provider network/config acceptance blocker. This is not a
confirmed product runtime failure because the read-only provider and selected
workspace apply passed, redaction passed, no mutation/apply safety checks
remained safe, and the failed anchored gates reported provider-network primary
classification with config-or-skip/inconclusive fallback.

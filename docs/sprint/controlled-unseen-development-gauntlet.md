# SP053 Controlled Unseen Development Gauntlet

Purpose: define unseen realistic development tasks that force normal runtime
execution authority, not only proof or receipt hardening.

These tasks are not recycled from SP044 through SP052. Prior sprint tasks already
covered owner discovery, stale read recovery, changed-file accounting, targeted
verification receipts, repair strategy switching, continuation facts, artifact
claim evidence, and terminal proof boundaries. The new pressure here is that the
runtime execution seam must actively constrain unsafe execution before or during
the runner turn.

## Introduction Decision

- Dependency use: not used. The local runtime already owns QueryEngine,
  AgentRunner, action policy, observations, proof, repair, artifacts, and result
  reduction.
- Structured port: not used as a new port. Adding another execution or proof
  path would duplicate existing owner boundaries.
- Isolated source adoption: not used. Copying external harness or hook code
  would import foreign naming and create parallel architecture.
- Behavior-only alignment: selected. The mature pattern is explicit action
  authority at the harness boundary. Locally that maps to `core/query/runtime`
  constraining the existing `AgentRunner` call while reusing the current tool
  policy, observation, proof, repair, artifact, and result owners.

## Unseen Tasks

| Task | Scenario | Stressors | Required runtime behavior | Complete signal | Weak signal |
|---|---|---|---|---|---|
| UG-01 | Permission policy contract change touches the policy contract, implementation, consumer, and focused test. The runner attempts an edit while runtime still requires owner discovery. | non-obvious owner discovery; multi-file edit dependency; API contract update; callsite/test impact; runtime action mismatch risk; tool failure recovery; targeted verification; changed-file accounting; final proof | The execution seam blocks the unsafe edit before mutation, records a typed failed edit observation, redirects to discovery, then allows edit and targeted verification only after owner context exists. | Search/read precede mutation after the blocked edit; all changed permission targets are verified before terminal success. | Edit executes from stale or missing context; blocked edit is reported only as proof metadata; terminal success follows provider text. |
| UG-02 | Scheduler API type update affects a worker and dependent test. After edits, the runner tries a generic verification command while runtime requires the changed worker test. | cross-file edit dependency; type contract update; callsite/test impact; targeted verification execution; failed verification repair; re-verification of failed changed file; changed-file accounting; final proof | The execution seam rejects generic verification for known targets, preserves safe failure reason, then requires focused verification for the changed worker and dependent test. | Generic verification does not satisfy proof; repair and post-repair verification cover the failed changed target. | Broad command or provider summary counts as verification; missing changed target remains hidden. |
| UG-03 | Billing calculation repair follows a focused verification failure whose safe reason says owner context is missing. The runner attempts repair directly. | non-obvious owner discovery; failed verification requiring repair; changed repair strategy; missing-context recovery; tool failure observation; targeted verification; re-verification of failed changed file; final proof | Runtime redirects repair to discovery before repair execution, then permits repair only after refreshed billing owner context, followed by targeted re-verification. | The next action after missing-context failure is search/read, not repair; repaired target cannot complete until focused verification covers it. | Repair repeats without new context; repair proposal or recovered status counts as success. |
| UG-04 | A resumed report task has a changed source and artifact output pending validation. The runner tries to complete from artifact text and metadata only. | continuation recovery; artifact claim-source-verification evidence; multi-file source/output change; targeted verification; changed-file accounting; stale observation recovery; final proof | Artifact execution is rejected unless claim evidence binds to source evidence and verification evidence. Continuation keeps pending proof safe until changed source and output are verified. | Artifact completion requires source-bound and verification-bound claim evidence plus changed-file verification. | File existence, marker text, generic metadata, or continuation presence counts as artifact proof. |

## Diagnostic Mapping

| Requirement | Diagnostic |
|---|---|
| Discovery-required runtime action blocks unsafe edit at the execution seam. | `core/query/runtime/engine.test.ts` - `blocks a pending edit at runtime authority when discovery is required` |
| Targeted verification action blocks generic verification. | `core/query/runtime/engine.test.ts` - `blocks generic verification at runtime authority when targeted verification is required` |
| Missing-context repair redirects to discovery before repair execution. | `core/query/runtime/engine.test.ts` - `redirects missing-context repair to discovery before repair execution` |
| Failed execution creates typed observation and changes next runtime action. | `core/query/runtime/engine.test.ts` - blocked edit diagnostic plus existing failed tool observation diagnostic |
| Repaired target requires post-repair verification coverage. | `core/query/runtime/engine.test.ts` - `execution loop trial requires post-repair verification receipt before repair proof completes` |
| Metadata-only runtime action is rejected as insufficient execution proof. | `core/query/runtime/engine.test.ts` - `rejects metadata-only artifact completion at runtime authority` |

## Current Result

Focused diagnostics passed after the execution-seam product change:

```text
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "runtime authority|missing-context repair|failed tool observation|post-repair verification"
```

Full QueryEngine owner suite passed:

```text
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts
```

Focused changed-owner and adjacent consumer suite passed:

```text
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/tools/policy/strategy.test.ts src/repair/loop/model.test.ts src/artifacts/workflow/model.test.ts src/session/replay/builder.test.ts src/evidence/task/proof.test.ts src/result/task/verdict.test.ts src/runtime/evaluation/task/model.test.ts src/runtime/evaluation/task/liveRun.test.ts
```

Build and truthfulness gates passed:

```text
rtk npm run build -w packages/ts-shell
rtk npm run verify:evidence:result-contract
rtk npm run verify:evidence:route221-anti-false-success-gate
```

# SP051 Parity Development Trial

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: define and prove unseen realistic development tasks that push the
normal runtime lane beyond SP048-SP050 closeout coverage.

## Baseline Inputs

- `docs/sprint/hard-mission-gauntlet.md`
- `docs/sprint/real-development-mission-pack.md`
- `docs/sprint/final-development-acceptance-record.md`
- `docs/sprint/final-real-task-trial.md`
- `docs/sprint/final-gap-closure-record.md`
- `docs/sprint/final-architecture-audit-record.md`

## Unseen Trial Tasks

| ID | Task | Stressors | Owners stressed | Complete evidence |
|---|---|---|---|---|
| PT-01 | Billing rule execution-boundary mismatch: locate billing rule owners, edit source and focused test, then reject a terminal verification claim when the runner performs an edit while runtime staged verification. | non-obvious owner discovery; multi-file edit; dependent focused test; staged execution boundary; targeted verification; changed-file accounting; result verdict | `core/query/runtime`, `orchestration/types`, `evidence/task`, `result/task` | Runtime stops not-proven with staged-action proof missing instead of completing from mismatched output. |
| PT-02 | Invoice summary typed verification failure: update invoice summary and test, observe a failed verification tool result that reports missing fixture owner context, then rediscover before repair. | owner discovery; cross-file edit; focused verification; failed verification; typed tool feedback; changed repair strategy; changed-file accounting | `core/query/runtime`, `tools/policy`, `repair/loop`, `verification/execution` | Turn after failed verification chooses discovery before repair when failure evidence says context is missing. |
| PT-03 | Renewal artifact continuation: resume pending artifact verification for a report and source change, collect source and verification receipts, and block shallow artifact completion until claims bind to both. | continuation; artifact proof; report output; source claim evidence; verification receipt; changed-file accounting | `core/query/runtime`, `artifacts/workflow`, `evidence/task`, `result/task`, `session/replay` | Final proof completes only after resumed action, changed report verification, and claim-specific source plus verification receipts. |
| PT-04 | Command coverage dependent verification: select a focused check after a dependent code change and keep verification partial when command execution receipts do not cover the changed source target. | dependent update; test impact; verification execution; command coverage; changed-file accounting; result input boundary | `planning/action`, `planning/execution`, `verification/execution`, `evidence/task` | Passed selection is not enough; command execution coverage must include changed targets before result input is eligible. |

## Difficulty Review

These tasks are harder than SP048 because they add execution-boundary
consistency and typed command/tool feedback on top of SP048's contract repair,
stale observation recovery, and continuation artifact proof. PT-01 and PT-02
are multi-file normal-runtime tasks. PT-02 covers failed verification, changed
strategy, and rediscovery before repair. PT-03 covers continuation plus artifact
claim evidence. PT-04 pushes verification execution beyond selection into
command coverage.

They are not recycled from SP044-SP050: no prior task checked staged action
consistency between `runtimeAction` and `lastActionResultSeed`, no prior task
used a typed verification tool failure reason to prefer discovery before
repair, and no prior verification owner diagnostic required command execution
coverage for changed targets.

## Initial Trial Run

Command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/verification/execution/model.test.ts src/repair/loop/model.test.ts -t "parity trial|command execution|verification failure evidence"
```

Initial result: failed before product changes. Four diagnostics failed.

| Task | Observed outcome | Weak phase | Root gap | Owner domain | Mature source area inspected | Introduction decision | Planned product fix |
|---|---|---|---|---|---|---|---|
| PT-01 | Failed. Runtime completed even when staged action was `verify` and output last action was `edit-file`. | execution-boundary proof | Runtime action constrained the runner input but result reduction did not require explicit staged-action consistency. | `core/query/runtime`, `evidence/task`, `result/task` | Pi hook event result semantics and tool-result finalization. | Structured port into local proof owners; no dependency or source adoption fit. | Add conditional staged-action proof and terminal blocker. |
| PT-02 | Failed. Runtime chose `repair` after verification tool failure reported missing owner context. | typed tool feedback and repair strategy | Tool result failure reason was reduced to generic failure, and policy matched only exact `missing context` wording. | `core/query/runtime/observation`, `tools/policy`, `repair/loop` | Pi tool execution result messages and hook result patching. | Structured port; no isolated source adoption. | Preserve safe failure reason, detect missing-plus-context variants, and route to discovery. |
| PT-04 | Failed. Verification execution returned passed when selected check passed but command coverage omitted the changed source target. | verification execution proof | Verification execution did not consume command execution coverage when available. | `verification/execution` | Pi tool result messages with typed `isError` and details. | Behavior-only alignment inside local verification owner. | Add optional command execution coverage receipts. |

PT-03 was designed in this record as the continuation/artifact parity task. It
will use the artifact and replay owner regressions plus the final focused owner
suite for pass/fail evidence.

## Product Upgrades

- `core/query/runtime/events`: tool-result events can carry a safe failure
  reason without raw provider or tool output.
- `core/query/runtime/observation`: failed tool observations now preserve
  sanitized failure reason and can reduce failed last-action seeds beyond
  verification-only failures.
- `tools/policy`: missing-context feedback is prioritized before generic repair
  and recognizes missing-plus-context wording.
- `repair/loop`: verification failure history that says context is missing now
  switches to discovery instead of generic repair.
- `verification/execution`: optional command execution receipts can keep a
  passed selection partial when changed targets are not covered.
- `evidence/task` and `core/query/runtime/proof`: staged-action consistency is
  a conditional proof item when runtime sees an explicit conflicting
  last-action seed.
- `core/query/runtime/loop`: terminal success is blocked by staged-action proof
  gaps.

## Focused Rerun

Command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts src/verification/execution/model.test.ts src/repair/loop/model.test.ts -t "parity trial|command execution|verification failure evidence"
```

Observed result: 3 files passed, 4 diagnostics passed.

## Reference Inputs

Playbook files:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/extensions.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/hooks.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`

Mature source areas inspected after target owner inspection:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/session/session.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/compaction/compaction.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/compaction/branch-summarization.ts`

Four-level introduction: dependency use was not available for these local
runtime contracts; structured port fit event result semantics and durable
fact reduction; isolated source adoption was not needed; behavior-only
alignment was limited to command coverage and staged-action proof semantics.

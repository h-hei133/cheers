# SP052 Execution Loop Trial

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: define and record unseen execution-loop tasks that force normal runtime
action, AgentRunner output, typed tool feedback, verification receipts, repair
strategy, continuation durability, artifact proof, task proof, and result
verdict to behave as one product mainline.

## Baseline Inputs

- `docs/sprint/hard-mission-gauntlet.md`
- `docs/sprint/real-development-mission-pack.md`
- `docs/sprint/final-development-acceptance-record.md`
- `docs/sprint/final-real-task-trial.md`
- `docs/sprint/final-gap-closure-record.md`
- `docs/sprint/final-architecture-audit-record.md`
- `docs/sprint/parity-development-trial.md`

## Unseen Trial Tasks

| ID | Task | Stressors | Owners stressed | Complete evidence |
|---|---|---|---|---|
| EL-01 | Pricing discount command receipt coverage: discover pricing owners, edit source and focused test, receive an AgentRunner verification summary that says passed, but only a safe command receipt for the test file is observed. | owner discovery; multi-file edit; dependent focused test; typed tool receipt; targeted verification execution; changed-file accounting; result proof | `core/query/runtime`, `verification/execution`, `evidence/task`, `result/task` | Runtime proof remains partial with `changed-file-verification-complete` missing and terminal success is blocked. |
| EL-02 | Report artifact claim binding: produce an artifact from a changed source and report output, with generic source and verification strings that are not bound to source paths or verification receipts. | artifact claim evidence; source binding; verification receipt binding; changed output; final proof; anti-false-success | `artifacts/workflow`, `core/query/runtime`, `evidence/task`, `result/task` | Artifact validation reports `claim-evidence-missing`; generic marker strings cannot prove source or verification claims. |
| EL-03 | Fresh-only replay pending lifecycle: resume an unsafe replay with turn-pairing drift and stale pending verification lifecycle. | continuation recovery; stale pending work; durable replay; typed lifecycle state; pending action safety; final proof boundary | `session/replay`, `core/query/runtime/state`, `core/query/runtime/policy` | Replay truth boundary records `fresh-only`; active runtime state drops stale pending tools and approvals. |
| EL-04 | Schedule repair post-validation receipt: after a focused verification failure, a repair summary reports recovered and verification passed, but no post-repair verification action or command coverage receipt is observed. | failed verification; repair; changed repair strategy; post-repair validation; re-verification receipt; result verdict | `core/query/runtime`, `repair/loop`, `verification/execution`, `evidence/task`, `result/task` | Task proof remains partial with `repair-post-validation` missing until a post-repair verification receipt exists. |

## Difficulty Review

These tasks are harder than SP051 because they do not stop at staged action
consistency or typed failure fallback. They require the execution loop to join
AgentRunner action, tool-result receipts, changed-file accounting, artifact
claim evidence, replay safety, repair recovery, verification execution, task
proof, and verdict reduction. EL-01 and EL-04 prove execution-boundary behavior
through normal `QueryEngine` and `AgentRunner` fixtures. EL-01 and EL-04 are
multi-file tasks. EL-04 includes failed verification, repair, and missing
re-verification proof. EL-03 covers continuation durability, and EL-02 covers
artifact proof.

They are not recycled from SP044 through SP051. Prior trials checked command
coverage in the verification owner and staged action consistency in runtime
proof, but did not require normal runtime proof to consume safe command
coverage receipts. Prior artifact tasks checked mismatched strings and changed
output verification, but did not require source claims to bind to workspace
source paths and verification claims to bind to verification receipts. Prior
replay tests restored pending facts, but did not ensure `fresh-only` replay
drops unsafe active lifecycle. Prior repair tests preserved original failure,
but did not require post-repair validation to be a distinct observed receipt.

## Initial Trial Run

Initial focused diagnostics were added before product fixes and failed for the
intended product reasons.

| Task | Initial outcome | Weak phase | Root gap | Owner domain | Mature source area inspected | Four-level introduction decision | Planned product fix |
|---|---|---|---|---|---|---|---|
| EL-01 | Failed. Runtime accepted optimistic `verifiedFiles` even when the safe command receipt covered only the test file. | runtime proof from execution receipts | `tool.result` could not carry covered files, observation did not preserve command coverage, and proof ignored command receipts. | `core/query/runtime`, `verification/execution` | Pi typed `toolResult` messages and agent loop tool-result flow. | Structured port into local runtime events and proof; no dependency or source adoption fit. | Add safe command coverage receipts and consume them in changed-file proof. |
| EL-02 | Failed. Generic `source receipt` and `verification receipt` strings proved artifact claims. | artifact validation | Claim evidence used lexical matching without checking source paths or verification receipt identity. | `artifacts/workflow` | Pi tool result details and app-owned validation boundary. | Structured port of typed receipt binding into local artifact owner. | Bind source claims to workspace source paths and verification claims to verification evidence. |
| EL-03 | Failed. `fresh-only` replay still copied stale pending tool lifecycle into active runtime state. | continuation durability | Replay safety downgraded the truth boundary but state restoration kept stale pending tools. | `core/query/runtime/state`, `session/replay` | Pi durable harness recovery policy for unfinished tool calls. | Structured port of conservative recovery boundary; no source adoption. | Drop active pending lifecycle when replay resets to fresh entry. |
| EL-04 | Failed. Repair completion could use passed verification summary as post-repair validation even when the last action was repair and no post-repair verify receipt existed. | repair proof | Runtime proof collapsed repair post-validation into generic `verification.status`. | `core/query/runtime/proof`, `repair/loop` | Pi typed tool-result flow and durable recovery notes. | Structured port into local proof projection. | Require post-repair verify action or command coverage receipt for repair post-validation. |

## Product Upgrades

- `core/query/runtime/events`: safe `tool.result.coveredFiles` can carry
  verification command coverage without raw output.
- `core/query/runtime/observation`: successful verification tool results now
  preserve command coverage receipts.
- `core/query/runtime/proof`: changed-file verification and repair
  post-validation proof consume observed command coverage instead of trusting
  optimistic summary fields alone.
- `core/query/runtime/state`: `fresh-only` replay drops stale active lifecycle
  while preserving replay truth-boundary evidence.
- `artifacts/workflow`: artifact claim evidence now binds source claims to
  workspace source paths and verification claims to verification evidence.

## Focused Reruns

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "execution loop trial keeps command receipt coverage"
rtk npm run test -w packages/ts-shell -- src/artifacts/workflow/model.test.ts
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts -t "does not continue stale pending lifecycle"
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "requires post-repair verification receipt"
```

Observed during development: all four focused reruns passed after product
changes.

## Reference Inputs

Playbook files:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/session-format.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/coding-agent/docs/compaction.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/hooks.md`
- `/home/wang/projects/pi-docs-playbook/source/packages/agent/docs/durable-harness.md`

Mature source areas inspected after target owner inspection:

- `/home/wang/projects/pi/packages/agent/src/agent-loop.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`

Four-level introduction summary: no dependency use was available for these
local runtime contracts. Structured port fit typed tool-result coverage,
durable recovery policy, and receipt-bound artifact validation. Isolated source
adoption was not needed because local owner contracts differ and the fixes are
small. Behavior-only alignment was limited to local proof semantics where Pi
does not own this repository's verification or artifact domain truth.

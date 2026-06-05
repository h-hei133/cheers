# SP049 Final Gap Closure Record

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: record final closure packets for the five remaining gaps from
`docs/sprint/final-real-task-trial.md`.

## Summary

SP049 closes both P0 gaps with product changes and closes all three P1 gaps
with either existing product behavior proved by stronger diagnostics or narrow
owner-consumed product changes.

Product owner changes:

- `planning/action`: explicit owner-ranked dependent target facts and impacted
  verification targets in the workflow action graph.
- `verification`: task-relevant command planning and workflow verification stage
  consume dependent target facts instead of only changed path lists.
- `session/replay`: durable replay seeds now carry runtime observation facts
  derived from paired persisted outputs.
- `orchestration/workflowTaskPlanner`: plan contract can carry dependent target
  facts into the action graph builder.

Mature source inspected:

- `/home/wang/projects/pi-docs-playbook/README.md`
- `/home/wang/projects/pi-docs-playbook/AGENTS.md`
- `/home/wang/projects/pi-docs-playbook/usage/task-reading-matrix.md`
- `/home/wang/projects/pi/packages/agent/src/harness/session/session.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/compaction/compaction.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/branch-summarization.ts`
- `/home/wang/projects/pi/packages/agent/src/harness/agent-harness.ts`

Reference conclusion: Pi provides useful durable session and compaction
lineage mechanics, but no mature verification-dependency graph to adopt.
Dependent verification remains native to this repository's planning and
verification owners. Replay durability uses structured-port alignment with
Pi's typed durable branch/rebuild invariants.

## Closure Packet 1: Dependent Verification Graph Completeness

Current weakness: SP048 proved a composite dependent repair path, but the graph
still represented dependencies mainly as ordered paths and reason strings.

Owner domains inspected: `planning/action`, `verification`, `edit/runtime`,
`edit/write/runtime`, `core/query/runtime`, `evidence/task`, `result/task`.

Mature source area inspected: Pi session tree and branch reconstruction showed
typed lineage facts, but no verification graph semantics.

Four-level decision: dependency use not available; structured port not
available for verification semantics; isolated source adoption not appropriate;
behavior-only alignment for typed lineage shape inside native owners.

Product owner responsible: `planning/action` plus `verification`.

Diagnostic added or strengthened:

- `workflowActionGraph projects owner-ranked dependent targets with impacted verification targets`
- `taskRelevantVerificationRoute includes owner-ranked dependent verification targets in command planning`
- `runWorkflowVerificationStage uses dependent target impacted verification in execution accounting`
- `verification execution model does not let a global pass hide an unverified dependent impacted target`

Product fix: `WorkflowActionGraph` now has `dependentTargets` with `ownerRole`,
`rank`, `reason`, and `impactedVerificationTargets`; verification command
planning and workflow verification stage fold those facts into changed-file and
verification accounting.

Regression commands:

```bash
rtk npm run test -w packages/ts-shell -- src/planning/action/graph.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/verification/execution/model.test.ts
```

Architecture debt risk: low. The graph owner owns dependent planning facts;
verification consumes them without moving terminal truth.

Final closure status: closed with product fix.

## Closure Packet 2: Continuation Proof Durability

Current weakness: SP048 direct seed observations could restore pending proof,
but replay or persisted input did not explicitly carry observation facts into
the runtime seed.

Owner domains inspected: `session/replay`, `core/query/runtime/state`,
`core/query/runtime/observation`, `core/query/runtime/policy`, `artifacts/workflow`.

Mature source area inspected: Pi session JSONL tree, compaction summaries, and
durable harness recovery model.

Four-level decision: dependency use not available; structured port of durable
paired-output reconstruction and branch-safe fact carry-forward; isolated source
adoption not needed; behavior-only alignment limited to non-success replay
facts.

Product owner responsible: `session/replay`.

Diagnostic added or strengthened:

- `session replay builder restores pending proof facts from persisted replay outputs into runtime observations`
- `QueryEngine uses replay-restored continuation proof facts for normal runtime targeted verification`

Product fix: replay-built runtime seeds now include observation facts derived
from paired persisted turn outputs. Runtime state still merges those facts
through the existing durable-replay truth boundary; missing persisted proof
remains not-proven.

Regression commands:

```bash
rtk npm run test -w packages/ts-shell -- src/session/replay/builder.test.ts src/core/query/runtime/engine.test.ts -t "pending proof facts|replay-restored continuation"
```

Architecture debt risk: low. Replay facts are continuation input only, not
verification proof, mutation authority, or terminal success.

Final closure status: closed with product fix.

## Closure Packet 3: Stale Tool Observation Recovery

Current weakness: prior diagnostics focused on failed read/edit and repeated
repair; broader tool failure classes needed coverage.

Owner domains inspected: `tools/policy`, `core/query/runtime/observation`,
`core/query/runtime/policy`.

Mature source area inspected: Pi tool-result reduction and durable harness
notes; no source adoption.

Four-level decision: dependency use not available; structured port already
present in local policy; isolated source adoption not needed; behavior-only
alignment proved by diagnostics.

Product owner responsible: `tools/policy`.

Diagnostic added or strengthened:

- `tool strategy rediscovers after failed search observation before mutation`
- `tool strategy collects source evidence after failed artifact observation instead of repeating stale artifact output`

Product fix or no-fix justification: no product fix required for SP049. Current
policy already recovers from failed search and artifact observations without
unsafe mutation or repeated stale artifact output.

Regression commands:

```bash
rtk npm run test -w packages/ts-shell -- src/tools/policy/strategy.test.ts
```

Architecture debt risk: low. Recovery remains in tool policy and runtime
observation owners.

Final closure status: closed with diagnostic-backed sufficient behavior.

## Closure Packet 4: Artifact Claim-To-Source Matching

Current weakness: existing artifact semantics had source/verification mismatch
coverage, but changed artifact output without verification-backed claim evidence
needed explicit closure.

Owner domains inspected: `artifacts/workflow`, `evidence/task`,
`core/query/runtime/proof`.

Mature source area inspected: Pi compaction metadata was useful only as
non-proof source carry-forward; no artifact model adoption.

Four-level decision: dependency use not available; local artifact owner already
has semantic receipts; isolated source adoption not needed; behavior-only
alignment proved by diagnostics.

Product owner responsible: `artifacts/workflow`.

Diagnostic added or strengthened:

- `artifact workflow model keeps changed artifact output not proven without verification-backed claim evidence`

Product fix or no-fix justification: no product fix required for SP049. Current
artifact validation already rejects duplicate receipts, source/verification
mismatches, missing claim evidence, and changed output without selected-passed
verification.

Regression commands:

```bash
rtk npm run test -w packages/ts-shell -- src/artifacts/workflow/model.test.ts
```

Architecture debt risk: low. Claim matching remains in artifact owner and
terminal truth remains in evidence/result.

Final closure status: closed with diagnostic-backed sufficient behavior.

## Closure Packet 5: Transition Cycle Permissiveness

Current weakness: SP048 allowed reason-distinct loops by including handoff
reason in cycle identity, but long normal runs needed a diagnostic proving
repeated same-reason cycles still stop.

Owner domains inspected: `core/query/runtime/transitions`,
`core/query/runtime/loop`.

Mature source area inspected: Pi session lineage and active path reconstruction;
no loop-control source adoption.

Four-level decision: dependency use not available; existing local transition
signature is sufficient; isolated source adoption not needed; behavior-only
alignment proved by diagnostics.

Product owner responsible: `core/query/runtime`.

Diagnostic added or strengthened:

- `QueryEngine allows reason-distinct progress but stops repeated same-reason long-run cycles`

Product fix or no-fix justification: no product fix required for SP049. Current
transition signatures allow legitimate reason-distinct coder/reviewer loops and
stop repeated same edge plus same reason.

Regression commands:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "reason-distinct"
```

Architecture debt risk: low. Cycle detection remains in runtime loop/transition
owners and does not claim task success.

Final closure status: closed with diagnostic-backed sufficient behavior.

## Focused Validation

Focused SP049 owner suite:

```bash
rtk npm run test -w packages/ts-shell -- src/planning/action/graph.test.ts src/verification/taskRelevantVerificationRoute.test.ts src/verification/verificationStage.test.ts src/session/replay/builder.test.ts src/core/query/runtime/engine.test.ts src/tools/policy/strategy.test.ts src/artifacts/workflow/model.test.ts src/verification/execution/model.test.ts
```

Observed result: 8 files passed, 99 tests passed.

Hard gates still pending after this record: full requested SP044/SP045/SP047/SP048
focused suite, build, truthfulness gates, anti-false-success gate, diff check,
and external live catalog.

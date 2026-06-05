# Final Real Task Trial

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: record the final convergence trial for hard realistic development behavior. The trial tasks below are designed to stress normal runtime behavior and identify the remaining highest-value gaps, not to add catalog entries or proof-only cases.

## Baselines

- SP044 hard mission gauntlet: `docs/sprint/hard-mission-gauntlet.md`
- SP045 real development mission pack: `docs/sprint/real-development-mission-pack.md`
- Final development acceptance record: `docs/sprint/final-development-acceptance-record.md`
- External live catalog: `docs/sprint/development-capability-catalog.json`

## Introduction Decisions

| Capability | Dependency use | Structured port | Isolated source adoption | Decision |
|---|---|---|---|---|
| Composite runtime task dispatch | Existing `QueryEngine` and `AgentRunner` boundaries already run normal runtime turns. | Use current runtime action, proof, and observation contracts in their owner domains. | Not needed before trial execution. | Dependency use plus structured port if a gap is proven. |
| Dependent verification and repair targeting | Existing planning, verification, repair, and proof owners already expose focused facts. | Extend local owner behavior only if the trial proves the composite path loses the target. | Not needed before trial execution. | Dependency use first. |
| Continuation artifact proof | Existing continuation seed, artifact receipt, and task proof owners already expose the required state. | Extend local owner behavior only if resumed artifact proof loses changed-file verification or claim binding. | Not needed before trial execution. | Dependency use first. |

## Trial Tasks

| ID | Task | Stressors | Normal runtime path | Complete evidence |
|---|---|---|---|---|
| FT-01 | Contract change with downstream verification repair: update a typed runtime contract, implementation, dependent consumer, and focused verification after an initial dependent check fails. | non-obvious owner discovery; cross-module edit; API/type dependent update; callsite/test impact; targeted verification; failed verification and repair; changed-file accounting; final proof | `QueryEngine` receives `AgentRunner` turns that discover owners, read the dependent contract, edit contract/implementation/consumer, observe a failed dependent verification, repair the consumer, and reverify the failed target. | Final verdict completes only after all changed contract, implementation, consumer, and test targets are accounted and the failed consumer target is reverified after repair. |
| FT-02 | Tool failure, stale discovery, repair strategy switch, and re-verification: recover from stale owner read and failed edit before mutation, then handle failed focused verification by switching strategy and reverifying the failed changed file. | ambiguous owner discovery; tool failure recovery; stale observation recovery; cross-file edit dependency; targeted verification; failed verification and repair; repair strategy change; final proof | `QueryEngine` observes failed read/edit tool results, selects renewed discovery before mutation, edits two targets, observes failed verification, switches from repair to discovery when the repair evidence is context-poor, then re-verifies the failed file. | Failed tool output cannot terminal-complete; runtime selects discovery before another edit; repeated repair is avoided; re-verification targets the failed changed file; final proof is complete. |
| FT-03 | Continuation artifact with semantic claim-evidence consistency: resume pending artifact verification, verify changed source and report output, and complete only when artifact claims bind to source and verification receipts. | continuation recovery; artifact semantic evidence; cross-module edit; callsite/test impact; targeted verification; changed-file accounting; final proof | `QueryEngine` starts from a continuation seed with pending artifact verification; `AgentRunner` receives `continue`, completes verification, and emits claim-specific source and verification receipts for the changed artifact. | Resumed pending action is honored; changed artifact output has post-change verification; claim evidence is semantic and claim-specific; terminal result completes only with proof. |

## Difficulty Review

| Task | Why harder than SP045 | Why proof-only cannot satisfy it | Owners stressed | Gap signal | Complete | Weak or partial |
|---|---|---|---|---|---|---|
| FT-01 | Combines SP045 contract update, cross-module update, failed-check repair, targeted verification, and terminal proof in one run. | Type, consumer, changed-file, and failed-target verification facts must all align before evidence/result can complete. | `core/query/runtime`, `orchestration/types`, `planning/action`, `verification/execution`, `repair/loop`, `evidence/task`, `result/task` | Dependent target missing from verification or repair rechecks the wrong file. | Final runtime verdict is complete after post-repair focused verification covers all changed targets. | Only source verifies; repair repeats; consumer proof is inferred from global pass; terminal success hides an unverified target. |
| FT-02 | Combines SP045 failed read recovery and failed repair behavior with a stale observation and a multi-file edit in one runtime path. | Tool failure and stale owner observations must change the next runtime action before any proof can exist. | `core/query/runtime`, `tools/policy`, `context/selection`, `planning/action`, `verification/execution`, `repair/loop` | Runtime edits after stale/failed discovery, repeats repair, or uses generic verification. | Discovery happens before mutation, repair strategy changes, and final verification targets the failed changed file. | Runtime completes from edit/apply output, skips renewed discovery, or re-verifies the wrong scope. |
| FT-03 | Combines SP045 continuation and artifact missions plus SP047 changed-output proof into one resumed runtime path. | Artifact existence or marker text is insufficient; changed-file verification and claim-specific source/verification receipts are required. | `core/query/runtime/state`, `core/query/runtime/loop`, `artifacts/workflow`, `evidence/task`, `verification/execution`, `result/task` | Resume drops pending action or artifact validation accepts unmatched evidence. | Pending action is continued, changed output is verified, claim evidence binds to source and verification receipts, and verdict completes. | Artifact validates from file existence, changed output remains unverified, or continuation proof is lost. |

Independent sidecar assessment: agreed that the tasks are harder than SP045 only if each remains one composite normal-runtime run instead of isolated owner tests. The likely high-value gaps are dependent verification graph completeness, stale tool observation recovery, repair strategy switching under mixed failures, continuation proof durability, and artifact semantic evidence under changed-file pressure.

## Initial Trial Run

Command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "final real task trial"
```

Initial result: failed before contained product fixes. The trial was useful because it exposed real normal-runtime gaps rather than catalog or provider issues.

| Task | Observed outcome | Weak phase | Root gap | Owner domain | Gap class | Architecture debt or missing capability | Recommended next fix |
|---|---|---|---|---|---|---|---|
| FT-01 | Failed before fix. Runtime discovered and verified, but a plain coding task with failed verification did not switch into repair. | failed-check repair dispatch | `taskKindFor` kept a coding task as coding after failed verification, so repair was unavailable unless the original prompt already said debug or failure. | `core/query/runtime/policy` | dispatch/repair | missing capability | Treat failed verification or failed repair in latest runtime output as debug-repair input for the next action. |
| FT-02 | Failed before fix. Runtime initially recovered stale tool context after policy adjustment, but the final proof stayed not-proven because original failure evidence was not preserved across turns. | result proof after repair | Proof projection only checked the current final output for original failure, not accumulated verification-failure observations. | `core/query/runtime/proof` | proof/result | missing capability | Preserve original verification failure through accumulated runtime observations when repair has recovered and verification passes. |
| FT-03 | Failed before fix. Continuation selected `continue`, but resumed action initially had no changed-file or verification targets from the seed. | continuation target recovery | Runtime seed could not import structured pending observation facts for changed files, verification targets, and artifact claims. | `core/query/runtime/state` | continuation/artifact | missing capability | Allow safe structured observation facts in runtime seed and merge them with replay-derived observations. |

## Final Trial Run

Command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "final real task trial"
```

Result: passed. Three hard composite normal-runtime diagnostics passed after contained owner fixes.

## Product Fixes

- `tools/policy`: tasks with no owner context and planned edit or repair now discover before mutation or repair; first failed verification with repair available chooses repair before generic re-verification, while failed repair still switches to discovery.
- `core/query/runtime/transitions`: transition cycle identity includes the handoff reason, allowing realistic multi-step coder/reviewer loops while preserving repeated same-edge/same-reason cycle detection.
- `core/query/runtime/state`: continuation seeds can carry structured observation facts for pending changed files, verification targets, artifact claims, and pending action.
- `core/query/runtime/policy`: latest failed verification or failed repair promotes the next runtime decision into debug-repair behavior.
- `core/query/runtime/proof`: original failure preservation can be proven from accumulated verification-failure observations, not only the current final turn.

## Ranked Remaining Gaps

1. Dependent verification graph completeness remains the highest-value follow-up area: FT-01 now passes, but richer real tasks may need owner-level dependent target ranking beyond path lists.
2. Continuation proof durability is improved through structured seed observations, but future work should validate persisted seed creation from real replay inputs, not only direct seed injection.
3. Stale tool observation recovery now discovers before unsafe action, but broader tool classes should be checked under normal runtime events.
4. Artifact semantic evidence now passes the resumed composite trial; deeper claim-to-source matching could still be strengthened beyond string-aligned claim evidence.
5. Transition cycle detection now supports reason-distinct multi-step loops; future work should watch for excessive loop permissiveness in long normal runs.

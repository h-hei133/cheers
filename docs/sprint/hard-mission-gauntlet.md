# Hard Mission Gauntlet

Owner: Sprint Knowledge Base / Runtime Capability

Purpose: record the SP044 hard mission set and before/after outcomes for normal runtime autonomous development behavior. These missions are not live catalog entries and do not count provider availability as task success.

## Mission Set

| ID | Category | Runtime path exercised | Required completion evidence |
|---|---|---|---|
| HM-01 | Ambiguous owner discovery | context discovery -> owner selection -> adaptive action | Additional search or read selects owner context before edit or result. |
| HM-02 | Cross-module source and dependent update | context -> planning -> edit observation -> changed-file accounting -> verification | Source and dependent target are both changed and both have post-change proof. |
| HM-03 | Failed verification repair | verification failure -> diagnosis -> repair -> re-verification | Original failure remains visible, repair runs, re-verification passes, verdict is complete. |
| HM-04 | Repeated repair failure | repair failure history -> strategy switch or new discovery | Runtime avoids repeating the same repair and chooses new discovery when context is missing. |
| HM-05 | Artifact claim consistency | artifact evidence -> claim receipts -> result verdict | Every artifact claim has matching evidence before complete proof. |
| HM-06 | Continuation recovery | durable pending action -> continuation -> verification -> proof | Pending action is restored, completed, and reflected in task proof. |
| HM-07 | Tool failure safe action | tool observation -> state update -> adaptive action -> result boundary | Failed tool observation produces a safe next action and cannot terminal-complete without task proof. |
| HM-08 | Proof gap terminal boundary | proof gap -> verify or stop-not-proven -> result verdict | A remaining proof gap cannot become terminal success. |

## Initial Weakness Record

Baseline command:

```bash
rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts
```

| Mission | Weak phase | Owner domain responsible | Missing runtime behavior | Gap class | Mature capability area | Four-level introduction decision | Baseline |
|---|---|---|---|---|---|---|---|
| HM-02 | task proof | evidence/result with verification input | Partial changed-file verification looked complete when verification status was globally passed while one changed target stayed unverified. | proof/result | proof-bearing tool-result details | structured port | failed before change |
| HM-03 | repair proof | verification/repair/evidence/result | Repair completion could terminal-complete from passed post-repair verification even when original failure proof was missing. | repair/proof | typed tool-result reducer and proof details | structured port | failed before change |
| HM-04 | repair strategy | runtime observation/tools policy/repair | Failed repair without explicit missing-context wording repeated repair instead of switching to new discovery. | repair/context | reducer-style dispatch after tool result | structured port | failed before change |
| HM-05 | artifact proof | artifacts/evidence/result/tools | Mismatched claim evidence could pass when each claim had any unique evidence id, and artifact policy repeated artifact generation after missing proof instead of collecting missing evidence. | artifact/proof | proof-bearing result details and reducer-style dispatch | structured port | failed before change |
| HM-06 | continuation proof | session continuation/runtime/evidence | Resumed pending action must remain not-proven when changed files still lack verification. | continuation/proof | save-point rebuild after tool results | structured port | passed baseline |

## Rerun Record

Use the same mission set and command after product changes. Do not replace failed missions with easier missions.

| Mission | Command | Rerun outcome |
|---|---|---|
| HM-02 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "partial changed-file verification"` | Passed after evidence proof required `changed-file-verification-complete`; partial target verification now remains partial and not terminal success. |
| HM-05 | `rtk npm run test -w packages/ts-shell -- src/artifacts/workflow/model.test.ts src/core/query/runtime/engine.test.ts -t "artifact"` | Passed after artifact receipts required claim-specific evidence matching; mismatched source/verification receipts now leave artifact proof missing. |
| HM-05 strategy | `rtk npm run test -w packages/ts-shell -- src/tools/policy/strategy.test.ts -t "collects claim evidence"` | Passed after tool policy changed from repeated artifact action to read/search when claim proof stays missing after an artifact action. |
| HM-05 terminal | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "stops artifact output"` | Passed after runtime loop terminal completion checked task-bearing artifact proof blockers before returning success. |
| HM-07 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "failed tool output"` | Passed after runtime loop blocked terminal success when failed tool-result events had no task proof. |
| HM-03 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "original failure proof"` | Passed after runtime loop blocked terminal repair success when evidence/result verdict still missed repair-specific proof. |
| HM-04 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "repeated repair failure"` | Passed after runtime observation changed failed repair pending action from duplicate repair to discovery. |
| HM-06 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "resumed changed files"` | Passed baseline and after changes; resumed changed files remain not-proven until verification runs. |
| HM-01 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "ambiguous owner discovery"` | Passed as part of the 8-mission normal-runtime set; ambiguous owner discovery reaches search then read with selected owner context. |
| HM-08 | `rtk npm run test -w packages/ts-shell -- src/core/query/runtime/engine.test.ts -t "proof gap without terminal success"` | Passed as part of the 8-mission normal-runtime set; proof gap stops not-proven without terminal success. |

## Completion Accounting

- Mission count: 8 hard missions under `docs/sprint`, all exercised by normal runtime tests in `packages/ts-shell/src/core/query/runtime/engine.test.ts` plus owner-focused artifact, tool policy, verification, evidence, and result tests.
- Improved missions: HM-02, HM-03, HM-04, HM-05, and HM-07 improved after product changes. HM-05 has receipt, strategy, and terminal-boundary improvements.
- Cross-module changed-file accounting: HM-02 keeps source and dependent target incomplete until both changed files have verification proof.
- Failed verification to repair to re-verification: HM-03 preserves original failure and requires repair-specific proof before terminal completion.
- Repeated repair strategy: HM-04 switches failed repair observation to discovery instead of repeating repair.
- Continuation: HM-06 restores pending continuation and keeps changed files not-proven until verification runs; existing continuation completion remains covered by the same runtime suite.
- Artifact consistency: HM-05 validates claim-specific evidence, not generic or mismatched receipts.
- Terminal truth: HM-07 and HM-08 prevent failed tool output and open proof gaps from becoming terminal success.
- Runtime scope: the mission diagnostics call the normal `QueryEngine` and owner models directly; they do not use evaluation-only task catalog entries.

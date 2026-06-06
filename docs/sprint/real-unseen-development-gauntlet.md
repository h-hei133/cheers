# SP057 Real Unseen Development Gauntlet

## Scope

This record uses normal `QueryEngine` runtime with an injected runtime execution
batch executor backed by `ExecutionService` in disposable workspaces. It is not a
catalog, liveRun, evaluation-only, proof-only, or receipt-only record.

Reference input was behavior-only:

- `pi-docs-playbook` README, AGENTS, task matrix, agent harness, durable harness,
  session format, compaction, and hooks docs.
- `/home/wang/projects/pi` target source lookup was limited to agent loop,
  harness/session/compaction, and tool/session tests.

Introduction decision: dependency use, structured port, and isolated source
adoption were rejected because this repository owns the TypeScript runtime,
session, evidence, result, and execution boundaries. Only behavior alignment was
used: durable facts must not become terminal truth, execution feedback must pass
through evidence/result proof, and compaction/continuation facts must stay
structured.

## Tasks

| Task | Coverage | Initial outcome | Weak phase | Product fix | Rerun outcome |
|---|---|---:|---|---|---:|
| Inventory status owner update | missing-context discovery, multi-file write, targeted verify | `stopped_max_turns` | write-intent prompt was treated as workspace understanding/read loop | `core/query/runtime/policy.ts`, `tools/policy/strategy.ts` | `completed` |
| Billing tax repair | multi-file write, failed verification, repair, targeted rerun | `stopped_max_turns` | completed read did not advance to repair/edit action | `tools/policy/strategy.ts`, `core/query/runtime/policy.ts` | `completed` |
| Orders summary artifact | artifact claim-source-verification proof | `completed` | none | none | `completed` |
| Pricing threshold repair | second multi-file failed verification, repair, targeted rerun | `stopped_max_turns` before strategy fix | repair action not selected after context read | `tools/policy/strategy.ts` | `completed` |
| Profile formatter continuation | compact/restored changed files, targeted verification | `completed` | none | none | `completed` |
| Shipping rate selected apply | multi-file write without post-write verification | `stopped_not_proven` | expected negative case | none | `stopped_not_proven`, exact missing proof retained |

Manual correction count: `0`.

## Evidence

Executable diagnostics:

```text
packages/ts-shell/src/core/query/runtime/normalTaskRuntime.test.ts
packages/ts-shell/src/core/query/runtime/engine.test.ts
```

Product fixes:

```text
packages/ts-shell/src/core/query/runtime/loop.ts
packages/ts-shell/src/core/query/runtime/policy.ts
packages/ts-shell/src/core/query/runtime/proof.ts
packages/ts-shell/src/tools/policy/strategy.ts
```

Initial failing diagnostics:

- Execution batch coverage without task proof returned `completed`; fixed to
  `stopped_not_proven` with `execution feedback missing task proof: ...`.
- Write-intent unseen tasks repeatedly selected read until `stopped_max_turns`;
  fixed by write-intent task kind/output kind precedence and read-to-repair
  advancement.

## Requirement Coverage

| Hard gate | Task evidence | Product files changed | Normal runtime path | Execution seam evidence | Verification or repair proof | Why not proof-only | Why not evaluation-only | Remaining risk |
|---|---|---|---|---|---|---|---|---|
| Gauntlet doc exists | this file | n/a | n/a | n/a | n/a | Document records executable evidence only | Not a live/catalog report | Keep status map current if retained |
| 5 to 7 unseen tasks | six tasks above | test owner only | `QueryEngine.submitMessage` | disposable executor | per-task assertions | tasks are runtime scenarios | no catalog model used | synthetic agent runner still supplies summaries |
| Not SP044-SP056 recycled | task names/paths differ | test owner only | normal loop | temp workspace paths | focused assertions | no old route task names | no eval case reuse | similar owner classes by necessity |
| At least 5 executed | six tests pass | test owner only | runtime loop | `ExecutionService` writes/commands | result status assertions | execution required | vitest invokes product path | provider not used |
| At least 4 complete | five complete, one not-proven | loop/policy/proof/strategy | terminal mapper | batch feedback observed | task verdict complete | success needs proof/verdict | no liveRun counter | test runner is deterministic |
| 3 write tasks with post-write verification | inventory, billing, pricing, profile | policy/strategy | edit/repair/verify actions | `writeTextFile`, `runCommand` | verified files asserted | writes not counted alone | no eval-only status | command is safe syntax check |
| 2 repair tasks after targeted rerun | billing, pricing | strategy | repair then verify | repair writes + verify batch | repair recovered, verification passed | repair attempt alone insufficient | no catalog fallback | summaries are synthetic after seam writes |
| Artifact proof | orders summary | artifact model consumed | artifact action | artifact write batch | source and verification evidence | marker/file alone insufficient | no catalog | artifact content not parsed deeply |
| Continuation proof | profile formatter | task-state consumer path | restored seed to verify | verify batch | continuation task complete | restored state not success | no replay-only completion | compact seed is test fixture |
| Manual correction zero | no manual edits inside tasks | n/a | automated test runs | automated executor | automated assertions | no hand correction counted | no report override | external human did not intervene |
| Incomplete remains not-proven | shipping rate | loop/proof guard | terminal blocker | write batch without verify | exact proof gap | write result not success | no eval override | negative case intentionally incomplete |
| Product failures fixed and rerun | red/green commands | loop/policy/proof/strategy | same tests rerun | same executor | passing focused tests | fixes affect runtime path | not metric-only | broader gates still required |
| Coverage table complete | this section | listed above | listed above | listed above | listed above | listed above | listed above | broader validation pending |
| SP044-SP056 regressions | 21 focused files | loop/policy/proof/strategy | runtime/evidence/session/tool paths | execution batch tests included | 236 assertions | regression suite includes truth blockers | not catalog-only | full repo tests not run |
| Build passes | `npm run build -w packages/ts-shell` | TypeScript product owners | compile boundary | n/a | typecheck success | build is supporting evidence | not an evaluator | only TS shell build required |
| Result truthfulness gate | result-contract hard gate | result/evidence consumers | terminal/result mapping | synthetic safe home | gate pass | gate rejects false terminal claims | script validates product contracts | gate writes audit residue, removed |
| Anti-false-success gate | route221 static harness | evidence/result rules | product evidence schema | n/a | gate pass | explicitly rejects fake proof | not live acceptance | static harness only |
| Diff check | `git diff --check` | all changed files | n/a | n/a | whitespace clean | not success evidence alone | n/a | rerun after final staging |
| Live catalog if run | not run | n/a | n/a | n/a | optional for SP057 | no provider proof claimed | live not substituted | provider availability untested |
| Live acceptance if run | not run | n/a | n/a | n/a | optional for SP057 | no live success claimed | live not substituted | manual live not part of closeout |

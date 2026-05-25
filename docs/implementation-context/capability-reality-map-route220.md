# Route220 Capability Reality Map

Route: `docs/agent-routes/route220-capability-reality-map.md`

Status: audit artifact. This file records what Route207-219 actually prove in
the current checkout. It is not a feature plan and does not authorize new
provider calls, default writes, broad apply, fuzzy apply, rollback, or live
provider execution.

## Evidence Rules

- Current code and focused gates outrank route prose.
- A benchmark that exits with `[pass]` can still report route `PARTIAL`; the
  JSON status and counters are the evidence.
- Live-provider proof requires explicit opt-in evidence. Default-safe,
  fake-provider, and fixture runs are not live-provider proof.
- Selected-workspace proof requires explicit selected-workspace authority,
  readback verification, and no provider call during apply.
- Repair proof is split: repair context/proposal, repair apply, and
  re-verification are separate claims.
- Result/session proof preserves truthfulness only when stopped/error states do
  not become success and raw content remains excluded.

## Inventory

| Area | Current owner / gate | Evidence checked | Current reality |
|---|---|---|---|
| Product planning path | `runMvpIntegratedFlow.ts`, `planningRuntimeProductRoute.ts`, `planningRuntimeProductProjection.ts` | Route208-213 scripts and Route220 audit slices | Vague tasks can enter product planning and produce no-write context, handoff, and review surfaces. Apply remains explicit. |
| Exact proposal / proof backend | `planningRuntimeProductExecution.ts`, `planningMutationProofRoute.ts`, Route213-215 scripts | Deterministic/fake-provider exact proposal benchmarks | Exact proposal normalization, anchoring, confirmation, apply, and readback are benchmark-proven for controlled shapes. |
| Live provider exact patch | Route214-217 scripts, `planningRuntimeProductProposal.ts` | Opt-in gates inspected, not run live | Default audit does not prove live provider. Live runs remain explicit and classified separately. |
| Selected workspace apply | Route218 benchmark, `workspaceAuthority.ts`, `planningRuntimeProductExecution.ts` | Route218 default benchmark run | Explicit selected-workspace single-target apply/readback is proven in benchmark shape. It is not default apply. |
| Multi-file per-file evidence | `targetSetEditRoute.ts`, `targetSetEditVerification.ts`, Route218/219 benchmarks | Route218 and Route219 default benchmark runs | Two-file target-set apply/readback and per-file evidence are benchmark-proven with fake/focused proposal sources. |
| Verification command | `verificationCommandPlan.ts`, `verificationCommandRunner.ts`, Route218/219 | Route218 default benchmark run; Route219 default benchmark run | Authorized generic command dispatch is benchmark-proven. Task-relevant focused npm test selection is mostly selected-not-run in Route219 default mode. |
| Verification failure / repair | `verificationFailureClassifier.ts`, `verificationRepair*`, Route218/219 | Route218 and Route219 default benchmark runs | Failure preservation and repair-required/review-required states are proven. Repair apply plus re-verification is not product-proven. |
| Result / session / continue | `resultMapper.ts`, `sessionRuntime.ts`, `SessionManager.ts`, `sessionResultParity.ts`, `continuationEvidenceParity.ts` | Targeted code audit and focused tests referenced by audit slices | Terminal truthfulness and continuation evidence parity are product/focused proven. Product planning memory is still current-turn only. |
| Default safety | Route218/219 default benchmark runs | JSON counters and safety fields | Default mode keeps provider false, apply not-run when no authority, command not-run unless explicit. |

## Capability Matrix

| # | Capability | Label | Evidence | Weakest link / overclaim risk |
|---:|---|---|---|---|
| 1 | Vague task planning | `product-proven` | Product path routes vague tasks into planning/context via `runMvpIntegratedFlow` and product projection evidence. | Planning is no-write unless later explicit authority exists. |
| 2 | Live single-file patch | `partial` | Route216/217/218/219 have opt-in live gates and counters. | Not live-proven in default audit; no live provider was run for Route220. |
| 3 | Deterministic exact proposal | `benchmark-proven` | Route213-215 exact proposal/anchoring/apply contracts use deterministic or fake-provider proposals. | Synthetic exactness is not live provider quality. |
| 4 | Live provider exact proposal | `not-proven` | Live proposal paths are gated by explicit opt-in. Route218/219 default runs reported fake-provider-only or not-requested. | Do not promote code inspection or fake provider to live-provider proof. |
| 5 | Selected workspace authorized apply | `selected-workspace-proven` | Route218 default run: selected workspace single-target apply/readback succeeded with provider false. | It proves explicit authority only, not production default apply. |
| 6 | Multi-file per-file evidence | `benchmark-proven` | Route218 fake target-set and Route219 target-set apply/readback record two changed files and per-file verification. | No broad multi-file, 3+ file, add/delete/move, or live multi-file claim. |
| 7 | Task-relevant verification command | `partial` | Route218 authorized command passed through existing tool runtime. Route219 selected task-relevant commands but default run did not dispatch them. | Focused npm test commands are not broadly product-dispatched. |
| 8 | Verification failure handling | `product-proven` | Result mapping and Route218/219 preserve failed readback as stopped/repair-required, not success. | Command-failure handling remains more focused than broad runtime proof. |
| 9 | Repair proposal | `fake/focused-only` | Route219 repair evidence creates review-required proposal/context and preserves original failure. | Provider is fake-or-opt-in; proposal does not grant mutation authority. |
| 10 | Repair apply | `focused-only` | Focused repair result tests can apply confirmed exact repair hunks through existing hunk-set route. | Product continuation does not yet execute repair apply. |
| 11 | Re-verification after repair | `focused-only` | `verificationRepairResult.ts` can report success with post-apply verification evidence. | Route218/219 default benchmarks do not prove repair apply plus re-verification. |
| 12 | Task-level verdict | `benchmark-proven` | Route219 emits verdict rows, not-proven claims, multi-file evidence, and repair status. | Route219 default status was `PARTIAL`, not `COMPLETE`. |
| 13 | Default safety gates | `benchmark-proven` | Route218/219 default runs report provider false, live opt-in false, no raw provider output, no old/new text printed. | Benchmark safety does not prove every future route surface. |
| 14 | Fallback provider | `partial` | Fallback attempt plumbing exists and is gated; live fallback needs opt-in and eligible failure classes. | No live fallback success was proven in Route220. |
| 15 | Session/result/continue evidence | `product-proven` | `resultMapper.ts`, `sessionRuntime.ts`, and `SessionManager.ts` preserve terminal truthfulness and continuation evidence. | A product-path Route219 continuation through all task verdict fields is still not fully gated. |
| 16 | Context memory / long-session reuse | `partial` | Session continuation can carry context evidence, but product projection states `scope=product-turn; session-continuation=not-wired`. | Do not claim long-session planning memory for Route207-219 product path. |
| 17 | Real task pack success | `partial` | Route219 default run checks six realistic tasks and reports one verified-success row, one multi-file apply/readback, and one repair-required flow. | Live patch evidence, live apply/readback, and live command verification counts were zero in default run. |

## Validation Evidence

| Command | Result | Key evidence | Does not prove |
|---|---|---|---|
| `rtk npm run verify:route219-real-task-quality-benchmark` | Pass, route status `PARTIAL` | `taskCount=6`, `verifiedSuccess=1`, `multiFileAppliedAndVerified=1`, `repairFlowReached=1`, `providerCalled=false`, live counts all `0`, provider safety `realProviderTouched=false`. | Live provider proof, repair apply, repair re-verification, broad production readiness. |
| `rtk npm run verify:route218-real-authorized-coding-benchmark` | Pass, route status `PARTIAL` | `providerStatus=fake-provider-only`, `liveProviderTouched=false`, selected apply `single-target-applied`, authorized command `passed`, repair `repair-continuation-created`, target-set `hunk-set-applied`. | Live provider proof, live target-set proof, completed repair-to-success. |

Final required Route220 validation commands:

| Command | Result | Key evidence |
|---|---|
| `rtk npm run verify:result-contract` | Pass | `result-contract-hard-gate` passed with result mapper, query terminal classification, provider-readiness terminal result, synthetic print, and synthetic replay checks green. |
| `rtk npm run build -w packages/ts-shell` | Pass | `tsc -p tsconfig.build.json` completed successfully. |
| `rtk git diff --check` | Pass | No whitespace or conflict marker issues reported. |
| `rtk git status --short --branch` | Pass after residue cleanup | RTK audit residue from validation was restored; only this Route220 artifact remained uncommitted before commit. |

## Strongest Areas

1. Result truthfulness: stopped/error and insufficient evidence paths are not
   silently promoted to success.
2. Explicit selected-workspace apply: single-target apply/readback is proven
   under explicit authority, with provider-call-during-apply false.
3. Multi-file evidence accounting: target-set benchmarks preserve per-file
   apply/readback status instead of flattening the result.
4. Default safety: default Route218/219 runs do not contact live provider, do
   not apply without authority, and exclude raw provider/patch content.

## Weakest Areas

1. Repair-to-success: current evidence stops at repair-required or focused
   repair result tests; product repair apply plus re-verification is not
   proven.
2. Live provider success rate: Route220 did not run live provider gates, and
   default Route218/219 evidence is fake-provider-only or not-requested.
3. Task-relevant verification: focused commands can be selected, but Route219
   default evidence mostly records selected-not-run rather than passed.
4. Context memory: planning context is current-turn only; long-session
   planning reuse remains partial.

## Known Not-Proven Claims

- Broad/general release readiness.
- Default live-provider execution.
- Default user-workspace mutation from vague task text.
- Live provider multi-file apply.
- Repair apply plus post-repair verification in product continuation.
- Automatic repair, rollback, fuzzy apply, AST patch, broad apply, 3+ file
  write, arbitrary add/delete/move, or atomic transaction.
- Long-session context memory for product planning.
- Fallback provider reliability under real network/provider failure.

## Next Route Recommendation

Priority 1: repair-to-success loop.

Scope: prove one selected-workspace product path from failed verification to
reviewed repair proposal, explicit confirmation, existing exact hunk-set apply,
and runtime-derived re-verification. Keep no automatic repair, no provider call
during apply, no broad writer, no fuzzy/broad apply, and no schema change.

Why first: Route218/219 already prove apply/readback, failure preservation, and
repair-required states, but the highest product gap is that a failed task does
not yet become verified-success through repair.

Priority 2: task-relevant verification dispatch quality.

Scope: close the gap between task-relevant command selection and actual
allowlisted dispatch for focused npm test commands, with explicit runtime
approval and result/session evidence. Do not expand arbitrary shell access.

Why second: Route219 shows selected task-relevant verification commands but
default evidence records them as selected-not-run. A coding agent needs the
right tests to run, not just readback or `node --version`.

Priority 3: opt-in live provider task pack.

Scope: run a narrow explicit live gate over the existing Route219 task pack
using isolated homes and approved provider gate rules. Classify provider,
network, auth/config, fallback, exact patch, apply/readback, and command
verification outcomes. Do not make live provider default.

Why third: live-provider evidence is valuable, but it should come after the
repair and verification gaps are tighter so live runs measure the product loop
rather than known missing steps.

Rejected alternatives:

- Broad multi-file/edit expansion: current two-file target-set evidence is
  enough to identify the next bottleneck; expanding write power would skip the
  repair/verification gap.
- Long-session memory first: context memory is partial, but route evidence
  shows the immediate task completion bottleneck is repair-to-success.
- Fallback provider reliability first: fallback is not useful until the primary
  task loop has a stronger verified-success path.
- UI/interactive review first: review UX matters, but the audit shows the core
  repair and verification semantics need proof before polish.

## Route Execution Rules Learned

- Record route JSON status separately from process exit status.
- Preserve labels for `product-proven`, `selected-workspace-proven`,
  `benchmark-proven`, `fake/focused-only`, `partial`, and `not-proven`; do not
  collapse them into one success label.
- Keep raw provider output, raw patch text, old text, new text, and private
  provider paths out of reports.
- Treat provider-called false and provider-called fake as different from live
  provider proof.
- Treat planned/selected verification commands as different from dispatched and
  passed verification commands.
- Treat repair proposal/review as different from repair apply/reverification.

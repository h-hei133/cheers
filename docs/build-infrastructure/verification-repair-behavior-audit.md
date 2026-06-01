# Verification Repair Behavior Audit

Status: VR001 audit and planning.
Date: 2026-06-01.

## Scope

This is an audit-only task. It does not implement product code, command
aliases, verification scripts, JSON reports, package scripts, dependencies,
provider calls, tool behavior changes, edit/apply changes, verification
execution changes, repair execution changes, command allowlist expansion,
prompt/CLI behavior changes, session schema migration, SDK/RPC/TUI/MCP/browser
or plugin surfaces, product loop replacement, or compatibility shim growth.

Inspection used Serena targeted inspection first. Serena was available. Targeted
`rtk rg` and `rtk sed` reads were used only where whole-file symbol extraction
was too broad, where non-code docs were required, or where shim contents needed
line-oriented confirmation.

No real provider configuration was read, printed, copied, summarized, or
modified. No provider call, tool dispatch, verification command, repair apply,
or test command was run for this audit.

Inspected current source and tests:

- `packages/ts-shell/src/verification/command/plan.ts`
- `packages/ts-shell/src/verification/command/selection.ts`
- `packages/ts-shell/src/verification/command/runner.ts`
- `packages/ts-shell/src/verification/command/result.ts`
- `packages/ts-shell/src/verification/command/stage.ts`
- `packages/ts-shell/src/verification/result/boundary.ts`
- `packages/ts-shell/src/verification/result/failure/classifier.ts`
- `packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts`
- `packages/ts-shell/src/verification/verificationFacade.ts`
- `packages/ts-shell/src/product/verification/verificationFacade.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductVerification.ts`
- `packages/ts-shell/src/orchestration/planningRuntimeProductRepair.ts`
- `packages/ts-shell/src/orchestration/verificationRepairContext.ts`
- `packages/ts-shell/src/orchestration/verificationRepairPlanner.ts`
- `packages/ts-shell/src/orchestration/verificationRepairLoop.ts`
- `packages/ts-shell/src/orchestration/verificationRepairResult.ts`
- `packages/ts-shell/src/repair/iteration/projection.ts`
- `packages/ts-shell/src/repair/handoff/boundary.ts`
- `packages/ts-shell/src/product/repair/repairFacade.ts`
- `packages/ts-shell/src/evidence/verdictFacade.ts`
- `packages/ts-shell/src/evidence/projection/claim/ledger.ts`
- `packages/ts-shell/src/evidence/projection/claimLedgerVerdictProjection.ts`
- `packages/ts-shell/src/evidence/savepoint/model.ts`
- `packages/ts-shell/src/tools/toolHandoff.ts`
- `packages/ts-shell/src/tools/toolBatchDispatch.ts`
- `packages/ts-shell/src/tools/toolOutcomeBundle.ts`
- `packages/ts-shell/src/turn/nextTurnBundle.ts`
- `packages/ts-shell/src/turn/turnSnapshot.ts`
- `packages/ts-shell/src/runtime/loop/contract.ts`
- `packages/ts-shell/src/runtime/loop/reentry.ts`
- `packages/ts-shell/src/runtime/loop/trajectory.ts`
- `packages/ts-shell/src/runtime/events/projection.ts`
- `packages/ts-shell/src/runtime/events/stream.ts`
- `packages/ts-shell/src/runtime/events/jsonEventStream.ts`
- `packages/ts-shell/src/presentation/surface/model.ts`
- Focused tests discovered around these surfaces include
  `verification/command/*.test.ts`, `verification/result/*.test.ts`,
  `verification/taskRelevantVerificationRoute.test.ts`,
  `verification/verificationFacade.test.ts`,
  `orchestration/verificationRepair*.test.ts`,
  `repair/iteration/projection.test.ts`,
  `repair/handoff/*.test.ts`, `evidence/verdictFacade.test.ts`,
  `evidence/projection/claim/ledger.test.ts`,
  `runtime/loop/contract.test.ts`, `runtime/loop/trajectory.test.ts`,
  `runtime/events/projection.test.ts`, `runtime/events/stream.test.ts`,
  `presentation/surface/model.test.ts`, `tools/toolOutcomeBundle.test.ts`,
  and `turn/nextTurnBundle.test.ts`.

## Current Verification Path Map

| Piece | Current path | Classification | Notes |
|---|---|---|---|
| Intent source | CP004/CP006 planning can hand off verification intent; `buildVerificationCommandPlan` consumes agent plan, context packet, graph/impact, plan quality, context sufficiency, analysis gate, task lifecycle, task execution plan, explicit/proposal/edit commands. | Product path plus projection input. | Intent and selected command are not a run. |
| Command selection | `planVerification` chooses explicit allowlisted command, low-risk readback, auto command from changed files, skipped, or unavailable; `buildTaskRelevantCommandPlan` builds task-relevance ladder and coverage facts. | Product path. | Current auto selection still uses conservative placeholders for broad source/test changes. |
| Relevance classification | `taskRelevantVerificationRoute` records relevant/unrelated/not-selected plus coverage and per-file coverage; verification receipt blocks success when relevance or coverage is insufficient. | Product path. | Task relevance is explicit here, not implied by exit code. |
| Authority requirement | `runTaskRelevantVerificationRoute` dispatches only when authority is `explicitly-approved` and approved command matches selected command; `projectVerificationReceipt` records authority. | Product path. | Prompt text cannot grant authority. |
| Dispatch boundary | `runVerificationCommand` and `runDirectCommandStage` dispatch through the existing tool runtime/dispatcher with `AbortSignal`; non-ready plans return not-run results. | Product path through sanctioned tool runtime. | No new ExecutionService bypass is needed. |
| Receipt/result evidence | `buildVerificationCommandResult` projects runtime receipt markers, exit code, timeout/redaction budgets, transcript summary, mutation/provider not-run markers. | Product path evidence. | Runtime receipt exists and exit zero are not terminal task success. |
| Pass/fail/blocked/not-run | `classifyOutcome` maps plan/result states; `CodingVerificationSummary` projects passed/failed/blocked/skipped; `projectVerificationReceipt` maps runtime status and verdict status. | Product path and result facade. | `passed` still must be task-relevant and covered before verdict success. |
| Failure classification | `classifyVerificationCommandFailure` distinguishes missing command, not allowlisted, policy/permission blocked, tool unavailable, timeout, invalid receipt, environment failed, test/build/typecheck/lint failed, unknown. | Product path. | Repair eligibility is explicit and false for environment/policy/invalid receipt classes. |
| Task relevance status | `taskRelevantVerificationRoute` classifies command relevance and coverage; generic command result has selection scope but not full task relevance proof. | Partial product path. | The Agent Loop default verification projection currently remains not-proven. |
| Product surface status | `verificationSection` renders `CodingVerificationSummary`; loop trajectory sections render verification intent/result counts and not-proven claims. | Consumer projection. | Surface rendering is not success. |
| Result/verdict consumption | `projectVerificationReceipt`, `projectProductVerdictFromClaims`, claim ledger projection, and result truth surfaces require claim status before success. | Product/result path. | Existing generic loop default does not promote verification to success. |

Current verification summary: there are two useful verification lines. The
task-relevant path owns selected command, coverage, authority, dispatch, result,
and product verification receipt. The Agent Loop contract owns an observation
boundary that can call an injected `verificationBoundary`, but the default
projection only records planned/not-run facts after save point and next-turn
preparation. The missing product integration is a first-class loop phase that
passes task-relevant verification facts into the loop without relying on legacy
coordinator status or surface text.

## Current Repair Path Map

| Piece | Current path | Classification | Notes |
|---|---|---|---|
| Requirement source | `projectRepairRequiredHandoff` consumes a failed `VerificationResultObservation`; `runPlanningRuntimeProductRepairContinuation` opens repair continuation when command/readback failed. | Projection plus product continuation path. | Repair required is not repair success. |
| Original failure preservation | `RepairRequiredHandoff`, `projectRepairIteration`, `verificationRepairContext`, and repair result evidence carry original-failure preservation markers. | Projection and product evidence. | Must remain visible after any later repaired success. |
| Proposal source | `planVerificationRepairLoop` creates prompt context and accepts raw proposal/fake-or-opt-in provider; `observeRepairProposal` projects source/readiness/apply status. | Product planning path and projection. | Proposal-only provider call is not apply or success. |
| Proposal status | `VerificationRepairPlan` distinguishes missing verification/context/receipt, quality blocked, provider unavailable/opt-in, proposal created, review required, invalid, handoff ready, not needed, unsupported. | Product path. | Review/handoff readiness is not mutation. |
| Authority requirement | Repair plan/result surfaces keep `mutationAuthority: not-granted`; `observeRepairProposal` and `observeRepairApply` expose authority required/unknown. | Product path and projection. | Authority must be explicit and owner-granted later. |
| Apply boundary | Existing repair planning can prepare hunk-set handoff to edit owners, but `runVerificationRepairLoop` itself returns mutation not-run; apply is represented only when an external apply result is supplied to result builder. | Product path plus deferred apply. | Safe boundary is edit owner, not repair planner. |
| Apply observation | `observeRepairApply` and `projectRepairIteration` can record apply observed/success/failure/partial/blocked style facts. | Projection. | Apply observed is not post-repair verification. |
| Post-repair verification | `projectRepairIteration` and `buildVerificationRepairResult` distinguish repair applied from `repair-verification-succeeded` only when post-apply verification status is passed. | Contract/projection; partial product result support. | No automatic post-repair verification loop is wired here. |
| Final verdict candidate | `projectRepairIteration` can produce `verified-success-with-repair` only with proposal, authority, mutation, original failure, and post-repair verification claims. | Product projection. | Claim ledger/result truth should consume, not infer, this. |
| Continuation/next-turn handoff | `verificationRepairResult` adds continuation evidence and next action; loop save point can carry repair handoff/proposal/apply ids. | Product path and Agent Loop consumer. | Continuation fact is not mutation authority. |

Current repair summary: repair is mostly a review-gated proposal and handoff
system with strong no-automatic-repair evidence. It can preserve original
failure, build prompt context from verification/context facts, project repair
required/proposal/apply observations, and surface final repair verdict
candidates. It does not own automatic apply, automatic post-repair verification,
or terminal success.

## Agent Loop Fit

| Loop fact or phase | Current status | Integration fit |
|---|---|---|
| Context and planning output | CP006 exposes context/planning, verification handoff, no-write, missing facts, and not-proven claims. | Ready as input; not authority. |
| Edit and proposal handoff | Edit repair context and proposal handoff preserve proposal/source ids and mutation not-run. | Ready as input/consumer; apply deferred. |
| Model response outcome | Response reentry projects assistant accumulation, extraction readiness, and cycle status. | Dependency; model complete is not verification. |
| Tool outcome bundle | Tool handoff/outcome bundle records dispatch, result messages, receipts, and not-proven claims. | Dependency; tool success is not verification success. |
| Next-turn bundle | `prepareNextTurnBundle` carries safe tool result messages, blocking facts, readiness, and not-proven claims. | Consumer-ready. |
| Verification intent | `projectVerificationIntent` exists and loop default creates planned/not-run intent. | Projection ready; needs product verification owner seam. |
| Verification dispatch | `runVerificationCommand` exists under verification; loop can only call an injected boundary. | Ready behind explicit seam; unsafe as default implicit run. |
| Verification result | `observeVerificationResult` and command result exist. | Ready when backed by receipt/relevance facts. |
| Repair requirement | `projectRepairRequiredHandoff` exists. | Ready only after failed verification observation. |
| Repair proposal | `observeRepairProposal` and repair planner exist. | Ready as proposal-only/review fact. |
| Repair authority | Current facts record required/not-granted/unknown. | Missing owner grant for loop integration; deferred. |
| Repair apply observation | Projection exists; result builder can observe supplied apply result. | Projection only; apply execution deferred. |
| Post-repair verification | Projection/result states exist. | Contract only until same-command re-verification is wired. |
| Verdict candidate | Verification/repair facades and claim ledger exist. | Ready as result/evidence input; not loop-owned success. |
| Save point | Evidence-only save point stores verification/repair ids. | Ready as consumer. |
| Runtime events | Events exist for verification intent/result and repair required/proposal/authority/apply/post-repair. | Projection ready. |
| Product surface | Loop trajectory and coding result sections render verification/repair facts. | Consumer ready. |

## Prior Block Dependency

Verification must consume existing Agent Loop facts rather than bypass them:

- Planning verification intent: consume command candidates, source plan ids,
  context sufficiency, analysis gate, task lifecycle, execution plan, and
  plan-quality facts from CP006.
- Edit handoff facts: attach source proposal/edit transaction ids and changed
  file facts; do not treat edit handoff as applied mutation unless edit owner
  evidence says so.
- Tool outcome facts: consume runtime receipt ids, tool result details, and
  blocking facts only as evidence; tool execution success is not verification
  success.
- Model response cycle facts: consume response status, assistant accumulation,
  tool extraction, and no-tool/partial states only as upstream context; they do
  not prove verification.
- Next-turn facts: carry pending verification/repair ids and blocking facts
  forward without claiming next-turn execution.
- Context sufficiency facts: block or downgrade verification planning when
  required context, analysis quality, or relevance is not proven.
- Not-proven claims: preserve CP, model, tool, edit, and result not-proven
  claims into verification and repair projections.
- Authority and policy facts: require explicit owner authority for command
  dispatch, repair apply, and post-repair verification.

Repair must consume:

- Original verification failure, including verification id, command label,
  failure class, runtime receipts, failed file/hunk summaries, and safe failure
  excerpt.
- Changed target facts from edit/proposal handoff, not raw provider output.
- Failure classification and repair eligibility from verification result.
- Safe context packet and agent plan ids from CP.
- Authority facts, with `mutationAuthority: not-granted` until edit owner
  grants apply.
- A post-repair verification requirement tied to the original or equivalent
  task-relevant verification command.

## Verification Boundary Requirements

The safe verification boundary should be owned by `verification` and consumed
by `runtime/loop`. It must distinguish:

- intent selected
- command selected
- command not selected
- selected not run
- dispatch blocked
- dispatch authorized
- dispatch executed
- passed
- failed
- cancelled
- timed out
- irrelevant command
- task-relevant verification
- readback-only observation
- not-proven

Required fields:

- stable verification intent/result ids
- source turn/model/tool/edit/planning ids
- selected command safe label and command kind
- authority state and approval source
- dispatch status and runtime receipt ids
- relevance and coverage status
- failure class and repair eligibility
- timeout/cancellation/redaction status
- expected evidence and observed evidence ids
- not-proven claims and `terminalSuccessClaim: false`

## Repair Boundary Requirements

The safe repair boundary should be owned by `repair`, with edit/apply delegated
to edit owners and verification rerun delegated back to `verification`. It must
distinguish:

- repair not required
- repair required
- repair blocked
- repair proposal prepared
- repair proposal insufficient
- repair authority required
- repair authority granted
- repair apply not run
- repair apply observed
- repair apply failed
- post-repair verification required
- post-repair verification passed
- post-repair verification failed
- verdict candidate
- not-proven

Required fields:

- source verification failure id and failure class
- original failure preserved flag
- proposal id, source, readiness, and target summary
- authority requirement and authority proof id if granted
- apply observation id/status and changed file ids
- post-repair verification id/status and same-command/equivalent proof
- final repair verdict candidate, not terminal truth
- not-proven claims and `terminalSuccessClaim: false`

## Verdict And Evidence Requirements

Verdict must be owned by result/evidence surfaces, not runtime events or product
surface. Required rules:

- no success without task-relevant verification or accepted equivalent evidence
- no success from verification intent only
- no success from selected-not-run
- no success from readback-only unless the task requires only readback and the
  evidence says so
- no success from repair proposal
- no success from repair apply without post-repair verification
- original failure must remain visible after repair success
- partial, blocked, failed, skipped, cancelled, timed out, irrelevant, or
  not-proven states must remain visible
- command exit zero can support verification evidence only after relevance,
  coverage, authority, and receipt facts are proven
- tool/runtime execution success can support a command-result fact only, not a
  task-success verdict

## Runtime Event And Product Surface Requirements

Runtime events should stay ordered, host-neutral, report-safe, and
observation-only. Existing event support already covers:

- verification intent observed
- verification selected or dispatch observed
- verification result observed
- verification relevance rejected
- repair required
- repair proposal observed
- repair authority required
- repair apply observed
- post-repair verification observed
- original failure preserved

The next implementation should ensure these events receive product verification
and repair facts from a single loop boundary and preserve:

- redaction status
- source ids
- dispatch/result/apply/post-repair statuses
- not-proven claims
- `terminalSuccessClaim: false`

Product surface should render facts only:

- verification selected/dispatch/result/relevance/coverage/failure class
- repair required/proposal/authority/apply/post-repair status
- original failure preservation
- verdict candidate status and remaining not-proven claims
- next action

It must not transform rendered verification/repair sections into success.

## Chosen Implementation Seam

The safest next seam is a `verification` owner boundary consumed by
`runtime/loop` through the existing `verificationBoundary` shape, expanded only
as needed to carry task-relevant verification result and repair handoff facts.

Owner split:

- `verification` owns intent normalization, command selection, task relevance,
  authority requirement, dispatch through existing runtime/tool boundary,
  receipt-backed result classification, and failure classification.
- `repair` owns repair-required handoff, proposal observation, apply
  observation, original failure preservation, and post-repair verification
  requirement facts.
- `runtime/loop` owns phase ordering, save point ids, next-turn ids, and
  observation event projection.
- `runtime/events` owns report-safe event and JSON stream projection.
- `evidence` and `result` own claim ledger and verdict truth.
- `presentation` renders only consumer facts.

First integration should be observation-first: connect product verification
receipt/result facts into the Agent Loop verification phase, then derive repair
required/proposal-only observations when verification failed and repair is
eligible. It should not add new command allowlists, automatic repair apply, or
post-repair rerun execution.

## Rejected Seams

- CLI/session seam: rejected because CLI should remain an invocation and
  rendering adapter, not verification/repair truth owner.
- Compatibility shims: rejected because shims may delegate/re-export only and
  must not grow business logic.
- Product surface renderer: rejected because surface rendering is a consumer,
  not evidence or verdict authority.
- Generic orchestration bucket: rejected because verification and repair have
  clear owner domains.
- Tool dispatcher direct hook from loop: rejected because command dispatch must
  remain behind verification planning, allowlist, authority, and runtime
  receipt facts.
- Edit/apply owner shortcut: rejected because repair planning may hand off
  proposals, but apply authority and mutation evidence belong to edit owners.
- Result/verdict shortcut: rejected because verdict may consume facts but
  cannot manufacture verification or repair events.
- Provider/model seam: rejected because model output and provider proposals are
  upstream inputs only; provider called is not repair or verification success.

## Truthfulness Risks And Guardrails

| Risk | Guardrail |
|---|---|
| Verification intent becomes verification run. | Separate intent, selected, dispatched, and result statuses. |
| Selected command becomes verification pass. | `selected_not_run`/not-run status and not-proven claims remain visible. |
| Command exit zero becomes task success. | Require task relevance, coverage, authority, receipt evidence, and verdict consumption. |
| Tool execution success becomes verification success. | Tool receipt is evidence input only; verification owner must classify it. |
| Readback-only becomes task verification. | Mark as readback-only unless task scope proves readback is sufficient. |
| Repair required becomes repair success. | Repair-required handoff carries `terminalSuccessClaim: false`. |
| Repair proposal becomes repair applied. | Proposal and apply observations use separate ids/statuses. |
| Repair apply becomes post-repair verified. | Final repair success requires post-repair verification status. |
| Post-repair verification omitted but success claimed. | Claim ledger blocks success without post-repair verification. |
| Original failure hidden by final success. | Preserve source failure id/failure class in repair and verdict evidence. |
| Product surface rendered becomes success. | Surface sections are consumer-only and carry not-proven claims. |

## Not-Proven After This Audit

- Verification is not yet a fully integrated Agent Loop product phase.
- Automatic repair execution is not implemented here.
- Post-repair verification is not automatically rerun here.
- The CLI path does not yet have one coherent verification/repair loop phase.
- Surface/event projection does not prove terminal success.

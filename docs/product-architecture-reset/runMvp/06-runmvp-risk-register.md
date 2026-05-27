# runMvp Extraction Risk Register

| Risk | Area | Why it matters | Mitigation | Phase |
|---|---|---|---|---:|
| Stream and non-stream entrypoints drift apart | turn/runtime | Current run and stream paths duplicate setup but differ in emitted events for apply_patch route. | Extract both together and add stream parity assertions before and after move. | 1 |
| apply_patch no-write route changes behavior | edit/policy | Explicit apply_patch runtime route carries no-write and workspace authority semantics. | Move as a bridge first, preserve `ApplyPatchRuntimeRouteOptions`, run fenced/apply_patch tests. | 1 |
| Provider config is consumed on read-only paths | provider/context | No-write inspect in real mode must stay provider-free and must not read real-provider config. | Keep provider draft branch separate from context/read stages; run no-write real-mode tests without live provider. | 2 |
| Planning runtime review-only output becomes success | planning/result | Current planning runtime handoff is stopped/review-only/no-write. | Preserve `planning-runtime-product:review-only-no-write-handoff` evidence and result contract. | 2 |
| Target resolution changes on multi-suffix paths | planning/edit/context | Tests protect `.tsx` and similar paths from truncation and wrong target carryover. | Characterize `promptTargetProjection` before moving; keep target tests focused. | 3 |
| Command blockers become generic read-stage blockers | policy/verification | Phase 2.6-A fixed allowlist blocker preservation. | Keep command intent policy separate and run command blocker tests. | 3,6 |
| Continuation target recovery upgrades stale state | session/repair/context | Rebased/migrated session state can only guide next action, not create success. | Keep continuation modules returning plan facts and blockers; result remains evidence-owned. | 4,5 |
| Read-only delivery claims completion without content | context/result | Read delivery can be satisfied only when grounded output exists. | Preserve `buildReadTaskDelivery` completed flag and result projection semantics. | 4 |
| Stale-read protection is skipped during mutation extraction | edit/policy | Final stale-read before writer is a write safety invariant. | Move stale-read as its own stage and run stale-read blocker tests before merge. | 5 |
| Prompt text implies write authority | edit/policy | AGENTS rules forbid deriving write authorization from prompt text. | Keep `mutationAuthorityGate` explicit and preserve sandbox approval events. | 5 |
| Cross-file repair loses remaining/failed evidence | repair/evidence | Partial repair truth depends on remaining, failed, skipped, and degraded evidence. | Move cross-file repair planning/execution with evidence assertions intact. | 5 |
| Verification not-run/skipped/blocked collapses | verification/result | Anti-false-success requires exact verification status distinction. | Use verification facade and result contract; run Route221 gate in result/evidence phases. | 6,7 |
| One changed file hides another verification failure | verification | Current content/consistency checks keep per-file failures. | Extract content and consistency verification separately with focused tests. | 6 |
| Result projection moves before receipts stabilize | result/evidence | If result extraction happens too early, domain stages may leak old notes as truth. | Extract result/evidence after stage outputs are receipt-shaped. | 7 |
| Redaction weakens during evidence facade adaptation | evidence/result | Provider/raw/runtime details must remain report-safe. | Keep facade projections report-safe and run evidence/verdict tests plus Route221 gate. | 7 |
| Product runtime imports docs/scripts/history | boundary | Target architecture forbids runtime dependence on historical artifacts. | Run import scan after every import move. | 1-8 |
| Legacy tests become the only owner of behavior | testing | The suite is broad and useful, but extraction needs domain ownership tests. | Add focused tests close to each new domain module in implementation routes. | 1-8 |
| Wrapper never shrinks after staged moves | architecture | A route can add shims but leave policy in the old file. | Each phase must report line/responsibility reduction and the remaining local regions. | 8 |

## Highest-Risk Extraction Targets

1. `buildWorkflowTaskPlan`: it mixes prompt parsing, continuation recovery,
   target selection, repair planning, verify planning, command policy, and
   browser/read/edit task choice.
2. `executeWorkflowTaskPlan`: it mixes stage dispatch, write authority,
   mutation execution, verification, repair evidence, and final result
   projection.
3. Verification/content consistency logic inside the mutation branch: it is
   result-truth-sensitive and easy to accidentally convert blocked or failed
   verification into success.
4. Continuation/rebase logic: it preserves task identity across restored,
   compacted, and migrated session facts and must not execute ambiguous work.
5. Provider/proposal handoff: provider-called, proposal-ready, authority, apply,
   and verification evidence must remain distinct.

## Safe Start Recommendation

It is safe to start implementation route 1 only if the first route is limited
to entrypoint/environment extraction with compatibility wrappers and no
behavioral changes. Do not start with `buildWorkflowTaskPlan` or
`executeWorkflowTaskPlan`; those should follow after the wrapper and handoff
stages create stable seams.

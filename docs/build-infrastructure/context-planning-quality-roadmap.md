# Context Planning Quality Roadmap

Status: CP006 block closeout update.

CP002 through CP006 are implemented as report-safe context and planning fact
surfaces. The block now exposes bounded discovery, target ambiguity, omission
accounting, staged context acquisition, planning handoff, memory freshness, and
continuation context through machine facts and product surface sections. This
does not prove full repository understanding, edit/apply authority,
verification success, repair success, provider success, or terminal success.

This roadmap starts the Context and Planning Quality Block after PL009. It
keeps owner domains separate while requiring every context/planning capability
to connect through the Agent Loop feature integration contract.

## Route Sequence

| Route | Implements | Defers | Owner domains | Validation expectations | Completion criteria |
|---|---|---|---|---|---|
| CP002 Repo Intelligence, Context Discovery, And Target Ranking Upgrade | Implemented: bounded repo scan, candidate discovery, omission accounting, target ranking reasons, ambiguity handling, missing discovery facts, and feature contract declaration for discovery/target selection. | Persistent index service, MCP/SDK/API, dynamic plugins, provider calls, edit/apply changes. | `orchestration` repo intelligence, `orchestration` context engine, `runtime/loop` contract consumption. | repo intelligence tests, context discovery tests, target ranking tests, ambiguity/missing facts tests, Agent Loop feature contract tests. | Candidate discovery emits evidence-backed candidate/omission facts; target ranking exposes ambiguity and does not grant edit authority; loop adapter can observe the feature contract without success claims. |
| CP003 Staged Read, Context Graph, And Missing Facts Hardening | Implemented: targeted context packet, context graph scoring, code graph trace/impact, read budget accounting, stale graph facts, missing required/optional facts, and next read suggestions. | Broad persistent graph index, full repository semantic model, provider-driven reading, write behavior. | `orchestration` context graph, `context` read projection, `runtime/loop` feature contract. | context graph tests, read packet tests, missing facts tests, stale graph tests. | Context sufficiency can be downgraded by missing/stale/omitted facts, and those facts reach planning without success shortcuts. |
| CP004 Planning Owner, Plan-To-Edit, And Plan-To-Verification Handoff | Implemented: planning ownership facts, plan quality, evidence-bound plan steps, assumptions, constraints, edit handoff, verification handoff, unsupported classification, and planning feature contract. | Apply authority, verification execution behavior changes, repair behavior changes, provider default enablement. | `orchestration` planning runtime, `planning` task plan classification, `verification` intent owner, `runtime/loop` feature contract. | planning runtime tests, planning owner tests, plan-to-edit handoff tests, plan-to-verification tests. | Planning produces evidence-backed handoff facts and next actions; edit and verification handoffs remain not-run/not-success unless owner evidence proves otherwise. |
| CP005 Memory Reuse, Stale Invalidation, And Continuation Context | Implemented: context memory record facts, reuse eligibility, stale invalidation, continuation context readiness, replay-safe planning state, memory handoffs, and continuation context feature contract. | Session schema migration, storage-backed branch/compaction, raw transcript dumps, provider calls. | `orchestration` context memory, `context`, `session`, `runtime/loop`, `evidence`. | memory reuse tests, stale context tests, read window continuation tests, session context rebuild tests, continuation handoff tests. | Reuse decisions are evidence-backed; stale/unsafe memory remains visible; continuation readiness is not continuation success. |
| CP006 Context And Planning Product Surface Closeout | Implemented: Context Planning block summary plus product surface sections for discovery, acquisition, planning, handoff, continuation context, not-proven claims, and next action. | TUI, SDK/RPC server, JSON API promises, provider/tool/edit behavior changes, result truth changes. | `presentation`, source owner projections, `runtime/loop` observation inputs where already safe. | product surface tests, context/planning projection tests, product loop/trajectory tests, build. | Users can see context discovery, ranking, graph, memory, planning, edit handoff, and verification intent states without terminal truth changes. |

## Aggressive But Safe Grouping

CP002 should combine repo intelligence, context discovery, and target ranking.
These are tightly coupled: ranking depends on scan/profile/symbol hints, and
planning quality cannot improve safely until target ambiguity and omissions are
visible.

CP003 should combine staged reads, context graph, code graph result, missing
facts, and stale graph facts. Combining these is safe because they share the
same context acquisition owner and all outputs are evidence/projection facts.

CP004 should combine planning owner consolidation, plan-to-edit handoff, and
plan-to-verification handoff. They should be grouped because the key risk is
one coherent plan lifecycle that does not imply write or verification success.

CP005 should combine memory reuse, stale invalidation, read continuation, and
session context rebuild linkage. These all decide whether future turns can rely
on prior context and must share freshness/redaction guardrails.

CP006 should be closeout/presentation only unless earlier routes require event
projection support. It must not add new product behavior.

## What Must Stay Separate

- Provider/live model execution remains default-off and separate.
- Apply/edit execution remains in existing edit owners and authority gates.
- Verification command execution remains in verification/runtime execution
  owners.
- Repair behavior remains separate from planning handoff.
- Session schema migration remains separate from context memory projection.
- SDK/RPC/TUI/browser/MCP/dynamic plugin/package loading remain separate.
- Persistent graph/index service is separate unless a future route explicitly
  scopes it after CP002/CP003 prove local value.

## Next Capability Block

The Context and Planning Quality Block should stop after CP006. The recommended
next capability block is Provider Streaming And Model Boundary: real provider
streaming, assistant response accumulation from stream, tool call streaming
detection, abort or cancel propagation, partial event emission, provider
failure recovery, and Agent Loop model-boundary integration.

## Block Close-To-Target Criteria

The Context and Planning Quality Block is close to target when:

- repo discovery exposes bounded scan, omitted candidates, ambiguity, and stale
  facts as report-safe evidence
- target ranking can explain why a target is selected and why competing targets
  remain unproven
- staged reads and context graph facts can downgrade planning readiness when
  evidence is missing, stale, or budget-limited
- planning owner output has one coherent lifecycle from task intent to analysis,
  plan, edit handoff, verification intent, and next action
- memory reuse is freshness-gated and can be invalidated visibly
- continuation context uses PL008 rebuild inputs without raw transcript dumps
- every context/planning capability has a PL009 feature integration contract
- product surface shows context/planning state without changing terminal truth
- no context/planning projection is used as task success without result/evidence
  truth

Remaining not-proven after CP006:

- full repository understanding
- persistent graph or index freshness
- edit/apply authority
- verification execution or pass
- repair execution or recovery
- provider success
- terminal success from context, planning, memory, continuation, surface, or
  loop observations alone

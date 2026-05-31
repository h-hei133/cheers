# Context Planning Quality Roadmap

Status: CP001 roadmap output.

This roadmap starts the Context and Planning Quality Block after PL009. It
keeps owner domains separate while requiring every context/planning capability
to connect through the Agent Loop feature integration contract.

## Route Sequence

| Route | Implements | Defers | Owner domains | Validation expectations | Completion criteria |
|---|---|---|---|---|---|
| CP002 Repo Intelligence, Context Discovery, And Target Ranking Upgrade | Improve bounded repo scan, candidate discovery, omission accounting, target ranking reasons, ambiguity handling, missing discovery facts, and feature contract declaration for discovery/target selection. | Persistent index service, MCP/SDK/API, dynamic plugins, provider calls, edit/apply changes. | `orchestration` repo intelligence, `orchestration` context engine, `runtime/loop` contract consumption, `presentation` projection if needed. | repo intelligence tests, context discovery tests, target ranking tests, ambiguity/missing facts tests, Agent Loop feature contract tests, product surface tests if rendered. | Candidate discovery emits evidence-backed candidate/omission facts; target ranking exposes ambiguity and does not grant edit authority; PL009 adapter can observe the feature contract without success claims. |
| CP003 Staged Read, Context Graph, And Missing Facts Hardening | Harden targeted context packet, context graph scoring, code graph trace/impact, read budget accounting, stale graph facts, missing required/optional facts, and next read suggestions. | Broad persistent graph index, full repository semantic model, provider-driven reading, write behavior. | `orchestration` context graph, `context` read projection, `runtime/loop` feature contract. | context graph tests, read packet tests, missing facts tests, stale graph tests, product surface tests. | Context sufficiency can be downgraded by missing/stale/omitted facts, and those facts reach planning and product surface without success shortcuts. |
| CP004 Planning Owner, Plan-To-Edit, And Plan-To-Verification Handoff | Consolidate planning ownership around analysis, executable plan, edit target readiness, mutation handoff, verification intent, and blocked decisions. | Apply authority, verification execution behavior changes, repair behavior changes, provider default enablement. | `orchestration` planning runtime, `planning` task plan classification, `verification` intent owner, `runtime/loop` feature contract, `result`. | planning runtime tests, planning owner tests, plan-to-edit handoff tests, plan-to-verification tests, result-contract if terminal/session output changes. | Planning produces evidence-backed handoff facts and next actions; edit and verification handoffs remain not-run/not-success unless owner evidence proves otherwise. |
| CP005 Memory Reuse, Stale Invalidation, And Continuation Context | Harden context memory reuse, freshness, stale-file invalidation, read window continuation, session context rebuild linkage, and continuation handoff visibility. | Session schema migration, storage-backed branch/compaction, raw transcript dumps, provider calls. | `orchestration` context memory, `context`, `session`, `runtime/loop`, `evidence`. | memory reuse tests, stale context tests, read window continuation tests, PL008 rebuild input tests, continuation handoff tests, product surface tests. | Reuse decisions are evidence-backed; stale/unsafe memory remains visible; continuation readiness is not continuation success. |
| CP006 Context And Planning Product Surface Closeout | Render context/planning adapter sections and close block-level truthfulness gaps. | TUI, SDK/RPC server, JSON API promises, provider/tool/edit behavior changes. | `presentation`, `runtime/events`, `runtime/loop`, `result`, source owner projections. | product surface tests, runtime event/JSON projection tests if event shapes change, result-contract. | Users can see context discovery, ranking, graph, memory, planning, edit handoff, and verification intent states without terminal truth changes. |

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

## Immediate Next Implementation Route

Immediate next route: CP002 Repo Intelligence, Context Discovery, And Target
Ranking Upgrade.

Suggested route document:

`docs/build-infrastructure/route/route-cp002-repo-intelligence-context-discovery-target-ranking.md`

CP002 should implement:

- explicit discovery scan profile facts and scan budget evidence
- candidate omission accounting
- stronger target ranking reasons and ambiguity state
- missing discovery facts for pathless/vague tasks
- safer candidate-to-context handoff facts
- a context discovery/target ranking Agent Loop feature contract declaration
- product surface visibility only if needed to expose the new facts safely

CP002 should defer:

- persistent index/cache writes
- broad code graph rewrite
- provider calls
- edit/apply behavior
- verification execution changes
- session schema migration
- SDK/RPC/TUI/MCP/plugin/package-loading surfaces

CP002 validation:

- `repoIntelligence` focused tests
- `contextEngine` focused tests
- target ranking focused tests
- ambiguous target and no-candidate tests
- missing facts tests
- Agent Loop feature contract tests
- product surface tests only if a context/planning section is rendered
- `verify:result-contract` only if terminal/session result output changes
- `git diff --check` and status hygiene

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

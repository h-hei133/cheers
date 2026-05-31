# Context Planning Route CP006: Context Planning Product Surface Closeout

## Goal

Close the Context and Planning quality block after CP002 through CP005.

CP002 improved repo intelligence, context discovery, target ranking, ambiguity, omission accounting, and discovery feature contract.

CP003 hardened staged reads, read budget, context packet provenance, context graph scoring, stale facts, missing facts, next read suggestions, sufficiency decision, and staged context acquisition feature contract.

CP004 hardened planning ownership, plan quality, evidence-bound plan steps, assumptions, constraints, plan-to-edit handoff, plan-to-verification handoff, unsupported classification, and planning feature contract.

CP005 hardened context memory reuse, stale invalidation, continuation readiness, replay-safe planning state, memory-to-discovery handoff, memory-to-planning handoff, and continuation context feature contract.

CP006 must connect these facts into product surface and loop trajectory summaries, update the Context and Planning block status, and make the remaining not-proven claims explicit.

Expected final status: COMPLETE.

This route is a closeout plus minimal product-surface integration route. It must not implement provider calls, edit or apply behavior, verification execution, repair behavior, session schema migration, SDK, RPC, TUI, browser, MCP, plugin loading, package loading, persistent indexing, or broad rewrites.

## Why this route exists

CP002 through CP005 improved the internal facts, but users and future routes need a coherent surface:

- What did discovery find?
- What was omitted?
- What context was read?
- What context is stale?
- Which facts are required versus optional?
- What plan was generated?
- What edit handoff exists?
- What verification intent exists?
- What memory was reused?
- What needs refresh?
- What is still not-proven?

Without CP006, these facts remain scattered across orchestration, session, and runtime loop contracts.

CP006 should make Context and Planning visible as one loop-governed capability block.

## Owner domains

Primary owners:

- presentation product surface
- orchestration context engine projection
- orchestration planning projection
- runtime loop trajectory or feature contract observation
- session continuation projection if needed

Allowed target areas:

- packages/ts-shell/src/presentation
- packages/ts-shell/src/orchestration/contextEngine.ts
- packages/ts-shell/src/orchestration/contextAcquisitionProjection.ts if present
- packages/ts-shell/src/orchestration/groundedPlanningProjection.ts if present
- packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts
- packages/ts-shell/src/orchestration/planningMutationHandoffProjection.ts
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/session
- focused tests beside touched modules

Do not move factual ownership into presentation.

Presentation may render facts only.

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use external-origin names or process words in product filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- productSurface
- terminalMessageRenderer
- cliSessionProductSurface if needed
- contextEngine
- contextAcquisitionProjection if present
- groundedPlanningProjection if present
- repoIntelligence CP002 facts
- contextGraphPlanning CP003 facts
- planningRuntime CP004 facts
- planningMutationHandoffProjection CP004 facts
- contextMemory CP005 facts
- continuationReadiness CP005 facts
- replaySafeLoopState CP005 facts
- runtime loop feature contract
- productLoopAdapter
- trajectoryProjection if context or planning facts are already observable
- result and evidence truthfulness surfaces
- focused tests around presentation, context, planning, memory, and product loop adapter
- CP001 to CP005 docs if present

Use local architecture study repositories only for narrow comparison if needed. Do not copy names, code, file layout, or product vocabulary from them.

Record inspected files and symbols in the final report.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Context planning block summary model

Add or harden a report-safe Context and Planning block summary.

It should combine facts from CP002 through CP005:

- discovery scan profile
- candidate ranking state
- omission accounting
- ambiguity state
- staged read status
- read budget status
- context packet provenance summary
- context graph confidence and unavailable components
- stale context facts
- required missing facts
- optional missing facts
- next read suggestions
- context sufficiency decision
- planning quality status
- plan assumptions
- plan constraints
- plan-to-edit handoff summary
- plan-to-verification handoff summary
- memory reuse status
- continuation readiness
- replay-safe planning state summary
- not-proven claims

This summary is not a success verdict.

### 2. Product surface sections

Expose Context and Planning sections through product surface if not already present.

Suggested sections:

- context_discovery
- context_acquisition
- planning
- handoff
- continuation_context
- not_proven
- next_action

Use existing section names if the product surface already has better local names.

The surface must show blockers and not-proven facts.

It must not hide required missing facts for prettier output.

### 3. Loop trajectory summary

If a runtime loop trajectory summary exists, connect Context and Planning facts to it as observations.

The trajectory may observe:

- discovery feature contract
- staged context acquisition feature contract
- planning feature contract
- continuation context feature contract
- context sufficiency status
- planning handoff status
- continuation readiness status
- not-proven claims

The trajectory must not claim terminal success.

If loop trajectory integration is not safe in this route, document the not-proven gap and keep product surface integration only.

### 4. Human and machine consistency

Human product surface must match machine facts.

Examples:

- if context sufficiency is partial, display partial
- if required refresh exists, display refresh required
- if verification intent is selected-not-run, display not run
- if edit handoff is no-write, display no write authority
- if memory is reusable with required refresh, display refresh required
- if candidate is ambiguous, display ambiguity
- if plan is review-only, display review-only

### 5. Context planning block closeout status

Add a local status projection for the Context and Planning block.

Recommended statuses:

- product_surface_ready
- review_only_ready
- partial_required_facts_missing
- blocked_stale_context
- blocked_ambiguous_target
- blocked_missing_required_context
- unsupported
- not_proven

Status must be derived from existing CP facts, not invented by presentation.

### 6. Roadmap and documentation update

Update the Context and Planning roadmap docs if present.

Required updates:

- mark CP002 through CP006 status
- summarize what the block now proves
- summarize what remains not-proven
- recommend the next capability block

Likely next capability block:

Provider Streaming And Model Boundary

Do not overclaim Context and Planning as solved.

## Required tests

Add focused tests only.

Required categories:

1. Block summary model
   Combines CP002 to CP005 facts without raw content leakage.

2. Product surface sections
   Discovery, acquisition, planning, handoff, continuation, not-proven, and next action facts render correctly.

3. Human and machine consistency
   Product surface status matches source facts for partial, blocked, stale, ambiguous, review-only, and not-run states.

4. Truthfulness
   Discovery found, context read, context sufficient for review-only, plan generated, edit handoff ready, verification intent selected, memory reused, continuation ready, product surface rendered, or loop observation cannot become task success, edit authority, apply success, verification pass, repair success, or provider success.

5. Redaction
   No API keys, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

6. Loop trajectory integration
   Only if touched, Context and Planning facts are observation-only and terminalSuccessClaim remains false.

7. Roadmap docs
   If docs are updated, diff is clean and no product claims are inflated.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no persistent index service
- no background indexing
- no provider calls
- no edit or apply behavior changes
- no verification execution changes
- no repair behavior changes
- no session schema migration
- no SDK, RPC, TUI, MCP, browser, plugin, or package-loading surfaces
- no new dependencies
- no broad memory rewrite
- no broad planning rewrite
- no broad context graph rewrite
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- claim Context and Planning is fully solved
- add provider calls
- add edit authority
- apply edits
- run verification commands by default
- implement repair execution
- add persistent indexing
- change session schema
- rewrite product loop
- move factual ownership into presentation
- create route runners
- create verify scripts
- create JSON reports
- add package scripts
- copy external repository names or structure

## Validation

Required:

- focused product surface tests
- focused context and planning projection tests
- focused memory or continuation tests if touched
- focused product loop adapter or trajectory tests if touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

CP006 is COMPLETE only if:

- targeted inspection was performed and reported
- Context and Planning block summary exists or is hardened
- product surface renders discovery, context acquisition, planning, handoff, continuation, not-proven, and next-action facts
- product surface does not become fact owner
- machine facts and human rendering are consistent
- loop trajectory integration is observation-only if touched
- CP002 through CP005 statuses are summarized in docs if docs are touched
- remaining not-proven claims are explicit
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires broad product surface rewrite, product loop rewrite, provider use, or result truthfulness change, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Context Planning block summary
6. Product surface sections
7. Loop trajectory integration if touched
8. Human and machine consistency
9. Roadmap docs update if any
10. Redaction behavior
11. Truthfulness behavior
12. Tests and validation pass or fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended next capability block

## Next route

After CP006 is complete, stop the Context and Planning quality block.

Recommended next capability block:

Provider Streaming And Model Boundary

The next block should audit and then implement real provider streaming, assistant response accumulation from stream, tool call streaming detection, abort or cancel propagation, partial event emission, provider failure recovery, and Agent Loop model-boundary integration.

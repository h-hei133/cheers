# Context Planning Route CP005: Memory Reuse Stale Invalidation And Continuation Context

## Goal

Implement the fourth Context and Planning quality route after CP004.

CP002 improved repo intelligence, discovery, target ranking, ambiguity, omission accounting, and discovery handoff facts.

CP003 hardened staged reads, context graph facts, read budget accounting, context packet provenance, stale facts, missing facts, next read suggestions, and staged context acquisition feature contract.

CP004 hardened planning ownership, plan quality, evidence-bound plan steps, assumptions, constraints, plan-to-edit handoff, plan-to-verification handoff, unsupported classification, and planning feature contract.

CP005 must now harden the cross-turn context layer:

- context memory reuse evidence
- stale invalidation
- continuation context readiness
- replay-safe planning state
- context freshness across turns
- memory to discovery and staged-read handoff
- memory to planning handoff
- Agent Loop feature contract for continuation context
- truthfulness boundaries for memory, continuation, replay, and freshness

Expected final status: COMPLETE.

This route strengthens memory reuse and continuation context. It must not implement persistent indexing, provider calls, edit or apply behavior, verification execution, repair behavior, session schema migration, SDK, RPC, TUI, browser, MCP, plugin loading, package loading, or broad memory rewrite.

## Why this route exists

CP001 classified memory reuse, stale detection, continuation context, and long-session planning memory as partial.

CP002 to CP004 improved single-turn discovery, acquisition, and planning facts. But a useful coding agent must carry context across turns without pretending old context is fresh.

CP005 must make reused context and continuation state explicit, invalidatable, replay-safe, and loop-governed.

Memory reused is not fresh context.

Continuation available is not enough context.

Replay-safe planning state is not task success.

## Owner domains

Primary owners:

- orchestration context memory
- orchestration context engine
- context session rebuild projection
- session continuation or replay projection if needed
- runtime loop feature contract
- presentation only if safe product surface display is needed

Allowed target areas:

- packages/ts-shell/src/orchestration/contextMemory.ts
- packages/ts-shell/src/orchestration/contextEngine.ts
- packages/ts-shell/src/context/sessionContextRebuildProjection.ts
- packages/ts-shell/src/session
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/presentation only if display is touched
- focused tests beside touched modules

Do not move context memory ownership into runtime loop. Runtime loop may observe feature contract and continuation facts only.

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use external-origin names or process words in product filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- contextMemory
- contextEngine
- sessionContextRebuildProjection
- session tree projection
- session continuation or replay modules
- read window continuation
- read delivery projection
- contextGraphPlanning CP003 facts
- repoIntelligence CP002 discovery facts
- planningRuntime CP004 planning facts
- planningMutationHandoffProjection only for downstream compatibility
- workflow coordinator only to understand current seam
- ShellSessionRuntime only to understand continuation consumption
- runtime loop feature contract
- product loop adapter
- product surface if display is touched
- focused tests for memory, continuation, context engine, session context rebuild, planning runtime, and product loop adapter
- CP001 to CP004 docs if present

Use local architecture study repositories only for narrow comparison if needed. Do not copy names, code, file layout, or product vocabulary from them.

Record inspected files and symbols in the final report.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Context memory record facts

Create or harden context memory record facts.

A memory record should represent:

- memory id
- source turn or safe source label
- source candidate ids
- source context packet ids
- source planning ids if available
- source session path or continuation id if safe
- created phase
- intended reuse scope
- freshness evidence
- staleness evidence
- invalidation state
- redaction state
- not-proven claims

A memory record must not include raw transcript dumps, raw file contents, hidden reasoning, provider output, oldText, newText, secrets, unredacted command output, or unsafe paths.

Memory record exists is not context freshness.

### 2. Reuse eligibility and reason model

Add or harden reuse eligibility facts.

Recommended statuses:

- reusable
- reusable_with_required_refresh
- reusable_with_optional_refresh
- stale
- invalidated
- workspace_mismatch
- task_mismatch
- target_mismatch
- missing_freshness_evidence
- unsupported

Reuse eligibility should include:

- reason
- matching task facts
- matching target facts
- matching workspace facts
- freshness requirement
- missing facts
- required refresh suggestions
- optional refresh suggestions
- not-proven claims

Memory reuse must not bypass CP002 discovery or CP003 staged context when refresh is required.

### 3. Stale invalidation

Add or harden stale invalidation.

Invalidation signals may include:

- workspace root mismatch
- session active path mismatch
- file digest mismatch if safely available
- mtime or safe freshness marker mismatch if available
- candidate target mismatch
- context packet older than current scan
- stale graph facts
- stale read packet
- changed discovery handoff
- missing freshness evidence
- expired memory policy
- user task changed

Stale invalidation must downgrade continuation context readiness and emit next read suggestions.

If freshness cannot be proven, mark missing freshness evidence instead of guessing.

### 4. Continuation context readiness

Represent continuation context readiness.

Recommended statuses:

- ready_for_review_only_planning
- ready_with_required_refresh
- ready_with_optional_refresh
- blocked_stale_context
- blocked_workspace_mismatch
- blocked_missing_required_facts
- blocked_ambiguous_target
- unsupported

Readiness should include:

- source memory ids
- source session path or active path facts
- context rebuild projection ids
- required refresh reads
- optional refresh reads
- stale facts
- missing required facts
- missing optional facts
- not-proven claims

Continuation ready is not edit authority, apply authority, verification success, or task success.

### 5. Replay-safe planning state

Add or harden replay-safe planning state.

It should carry only report-safe facts needed to continue planning:

- task intent summary
- discovery handoff ids
- staged context ids
- context sufficiency status
- planning quality id
- assumptions and constraints
- edit handoff id if safe
- verification handoff id if safe
- stale invalidation facts
- continuation readiness
- not-proven claims

It must not carry raw provider output, raw patch text, hidden reasoning, full transcript, raw command output, or secrets.

Replay-safe state is not proof that the plan remains valid.

### 6. Memory to discovery and staged-read handoff

Connect memory reuse to CP002 and CP003 facts.

The handoff should report:

- reused candidate ids
- candidate freshness state
- reused context packet ids
- context packet freshness state
- stale packets excluded
- required refresh candidates
- optional refresh candidates
- discovery facts that must be rerun
- staged reads that must be rerun
- next read suggestions
- not-proven claims

Memory should never silently replace fresh discovery when invalidation says refresh is required.

### 7. Memory to planning handoff

Connect continuation memory to CP004 planning facts.

The handoff should report:

- reused planning quality ids if safe
- assumptions that remain valid
- assumptions requiring refresh
- constraints that remain active
- plan steps that are replay-safe
- edit handoff freshness state
- verification handoff freshness state
- unsupported or stale planning reasons
- not-proven claims

A replayed plan is not executable work.

A replayed edit handoff is not mutation authority.

A replayed verification intent is not verification passed.

### 8. Agent Loop feature contract

Add or update a continuation context feature contract.

It should include:

- owner domain
- loop phase
- input facts
- output handoff facts
- runtime events if any
- evidence facts
- product surface section if rendered
- result truthfulness boundary
- not-proven claims
- forbidden shortcuts
- validation gates
- terminalSuccessClaim false

This contract should connect CP002 discovery, CP003 staged context, CP004 planning, and session continuation facts.

### 9. Product surface visibility

Only if needed, expose concise memory and continuation summaries through product surface.

It should show:

- memory reuse status
- continuation readiness
- stale invalidation facts
- required refresh reads
- optional refresh reads
- replay-safe planning state
- not-proven claims
- next action

It must not render memory reuse as fresh context or success.

## Required tests

Add focused tests only.

Required categories:

1. Memory record facts
   Memory records carry safe source ids, freshness, invalidation, redaction, and not-proven claims.

2. Reuse eligibility
   Reusable, refresh-required, stale, invalidated, mismatch, and unsupported states are represented.

3. Stale invalidation
   Workspace mismatch, stale packet, stale graph, changed candidate, missing freshness evidence, and task mismatch downgrade readiness.

4. Continuation readiness
   Ready, refresh-required, blocked stale, blocked mismatch, blocked missing facts, and unsupported statuses are represented.

5. Replay-safe planning state
   Replay state carries safe planning facts and excludes raw transcripts, hidden reasoning, provider output, patch text, command output, and secrets.

6. Memory to discovery and staged-read handoff
   Required refresh reads and next read suggestions are emitted when reused memory is stale or incomplete.

7. Memory to planning handoff
   Reused planning facts remain assumptions or replay-safe observations, not executable work.

8. Agent Loop feature contract
   Continuation context feature contract validates and has terminalSuccessClaim false.

9. Truthfulness
   Memory exists, memory reused, continuation ready, replay state available, refresh suggested, or product surface rendered cannot become task success, edit authority, apply success, verification success, or repair success.

10. Redaction
   No API keys, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

11. Product surface
   Only if touched, it must show memory and continuation facts without success inflation.

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

- add persistent database or index
- add background memory updater
- call live provider
- add tools
- change mutation authority
- change apply behavior
- run verification commands by default
- implement repair execution
- migrate session storage
- rewrite SessionManager
- rewrite ShellSessionRuntime
- move memory ownership into runtime loop
- create route runners
- create verify scripts
- create JSON reports
- add package scripts
- copy external repository names or structure

## Validation

Required:

- focused context memory tests
- focused context engine tests
- focused session context rebuild tests
- focused continuation tests if touched
- focused planning runtime or handoff tests if touched
- Agent Loop feature contract tests
- product surface tests if display is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

CP005 is COMPLETE only if:

- targeted inspection was performed and reported
- context memory record facts exist or are hardened
- reuse eligibility and reason model exists
- stale invalidation exists
- continuation context readiness exists
- replay-safe planning state exists
- memory to discovery and staged-read handoff exists
- memory to planning handoff exists
- Agent Loop feature contract exists for continuation context
- stale or missing freshness cannot be treated as fresh context
- no memory fact grants edit authority or terminal success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires persistent indexing, storage migration, broad memory rewrite, product loop rewrite, or provider use, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Memory record facts
6. Reuse eligibility
7. Stale invalidation
8. Continuation readiness
9. Replay-safe planning state
10. Memory to discovery and staged-read handoff
11. Memory to planning handoff
12. Agent Loop feature contract
13. Product surface changes if any
14. Redaction behavior
15. Truthfulness behavior
16. Tests and validation pass or fail
17. Architecture constraints preserved
18. What remains deliberately not-proven
19. Recommended next route

## Next route

After CP005 is complete, continue with:

docs/build-infrastructure/route/route-cp006-context-planning-product-surface-closeout.md

CP006 should close the Context and Planning quality block by connecting discovery, staged context, planning, memory, and continuation facts into product surface and loop trajectory summaries without success inflation.

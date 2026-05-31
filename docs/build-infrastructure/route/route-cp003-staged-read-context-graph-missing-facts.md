# Context Planning Route CP003: Staged Read Context Graph And Missing Facts

## Goal

Implement the second Context and Planning quality route after CP002.

CP002 improved repo intelligence, context discovery, target ranking, ambiguity, omission accounting, and Agent Loop feature contract facts.

CP003 must now harden the next layer:

- staged read planning
- read budget accounting
- context packet provenance
- context graph scoring
- code graph and test adjacency traces
- stale context detection
- required versus optional missing facts
- next read suggestions
- context sufficiency decision
- Agent Loop handoff facts for staged context acquisition

Expected final status: COMPLETE.

This route strengthens context acquisition and context graph quality. It must not implement persistent indexing, provider calls, edit/apply behavior, verification execution, repair behavior, session schema migration, SDK, RPC, TUI, browser, MCP, plugin loading, or package loading.

## Why this route exists

CP001 classified staged reads, context graph quality, stale detection, read continuation, and missing facts as partial.

CP002 made discovery and target ranking more evidence-backed, but ranked candidates are not enough. The next issue is whether the system reads the right evidence, tracks why it read it, explains what is still missing, and refuses to treat partial context as enough.

CP003 must make context acquisition more loop-governed and evidence-backed.

## Owner domains

Primary owners:

- orchestration context engine
- orchestration context graph planning
- context session rebuild projection if needed for handoff compatibility
- runtime loop feature contract consumption
- presentation only if safe product surface display is needed

Allowed target areas:

- packages/ts-shell/src/orchestration/contextEngine.ts
- packages/ts-shell/src/orchestration/contextGraphPlanning.ts
- packages/ts-shell/src/orchestration/contextAcquisitionProjection.ts if present
- packages/ts-shell/src/orchestration/groundedPlanningProjection.ts if needed for handoff compatibility
- packages/ts-shell/src/context
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/presentation only if display is touched
- focused tests beside touched modules

Do not move context ownership into runtime loop. Runtime loop may observe feature contract facts only.

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use external-origin names or process words in product filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- contextEngine
- contextGraphPlanning
- contextAcquisitionProjection if present
- groundedPlanningProjection if context facts flow there
- read delivery projection
- read window continuation
- session context rebuild projection
- repoIntelligence CP002 discovery handoff
- planningRuntime only for downstream consumption
- runtime loop feature contract
- product loop adapter
- product surface if display is touched
- focused tests for context engine, context graph, planning projection, read continuation, product loop adapter
- CP001 and CP002 docs if present in the repo

Use local architecture study repositories only for narrow comparison if needed. Do not copy names, code, file layout, or product vocabulary from them.

Record inspected files and symbols in the final report.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Staged read plan facts

Create or harden staged read plan facts.

A staged read plan should represent:

- selected candidate ids
- read stage
- read reason
- expected evidence type
- file role
- read priority
- read budget cost estimate
- read budget remaining
- raw content policy
- whether read is required or optional
- expected downstream consumer
- not-proven claims

Read planned is not read completed.

Read completed is not enough context.

### 2. Read budget accounting

Expose report-safe read budget accounting.

Recommended fields:

- budget kind
- max files
- max bytes or safe size bucket if available
- files planned
- files read
- files skipped
- skipped reason categories
- budget exhausted status
- partial context reason
- next read availability
- not-proven claims

Budget exhaustion must produce visible missing or partial context facts.

### 3. Context packet provenance

Every context packet or equivalent output should carry provenance.

Recommended facts:

- packet id
- source file path
- candidate id if available
- read reason
- read stage
- evidence type
- freshness hint
- staleness hint
- raw content redaction status
- derived summary status
- downstream use
- not-proven claims

Context packet exists is not repository understanding.

### 4. Context graph scoring

Harden context graph scoring and expose safe score components.

Recommended components:

- direct path relevance
- task token relevance
- symbol hint relevance
- import or dependency adjacency
- test adjacency
- package or module proximity
- file role
- freshness or staleness penalty
- uncertainty penalty
- missing facts penalty

If the current graph cannot support a component, mark it unavailable or not-proven instead of guessing.

### 5. Code graph and impact trace

Represent code graph and impact trace facts safely.

Examples:

- dependency edge observed
- import edge observed
- test adjacency observed
- changed file impact candidate
- caller or callee hint
- package boundary hint
- no graph evidence available
- graph stale
- graph partial

Graph evidence must be classified as observed, inferred, missing, stale, or not-proven.

Do not build a persistent graph index in this route.

### 6. Stale context detection

Add or harden stale context facts.

Staleness may come from:

- session continuation snapshot drift
- file mtime or content digest mismatch if safely available
- candidate handoff older than current read
- memory reuse without fresh read
- graph facts older than scan facts
- read packet missing freshness evidence
- workspace root mismatch
- branch or commit mismatch if safely available

Stale context must degrade sufficiency and surface next read suggestions.

Memory reused is not fresh context.

### 7. Required versus optional missing facts

Separate missing facts into required and optional where possible.

Required missing facts should block or downgrade context sufficiency.

Optional missing facts should remain visible but may allow review-only planning.

Examples of required facts:

- no plausible target
- no readable source file for selected target
- stale selected target
- missing reproduction clue for bug task
- missing explicit user intent for ambiguous task
- missing context around proposed edit anchor

Examples of optional facts:

- extra test adjacency
- extra caller trace
- broader package map
- secondary candidate read
- optional docs context

### 8. Next read suggestions

Emit next read suggestions when context is partial.

Suggestions should include:

- target file or safe label
- reason
- expected evidence
- priority
- required or optional status
- relation to missing facts
- budget requirement
- not-proven claims

Next read suggestion is not a completed read.

### 9. Context sufficiency decision

Represent context sufficiency as evidence-backed status.

Suggested statuses:

- sufficient_for_review_only_plan
- insufficient_required_facts_missing
- partial_optional_facts_missing
- stale_context
- ambiguous_context
- budget_exhausted
- no_readable_context
- unsupported

The status must not imply edit authority, apply authority, verification success, or task success.

### 10. Agent Loop feature contract

Add or update a staged context acquisition feature contract.

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

This contract should connect CP002 discovery handoff to CP003 staged read and context graph facts.

### 11. Product surface visibility

Only if needed, expose concise staged context and missing facts summaries.

It should show:

- read plan summary
- read budget status
- context graph confidence
- stale facts
- required missing facts
- optional missing facts
- next read suggestions
- context sufficiency status
- not-proven claims

It must not render context sufficiency as task success.

## Required tests

Add focused tests only.

Required categories:

1. Staged read plan
   Read stages, reasons, priorities, required or optional status, and downstream consumers are represented.

2. Read budget accounting
   Planned, read, skipped, exhausted, and partial context facts are represented.

3. Context packet provenance
   Context packets carry source, candidate, read reason, freshness, redaction, and not-proven claims.

4. Context graph scoring
   Score components and unavailable components are visible without guessing.

5. Code graph and impact trace
   Observed, inferred, missing, stale, and not-proven graph facts are represented.

6. Stale context detection
   Stale or reused context downgrades sufficiency and emits next read suggestions.

7. Required and optional missing facts
   Required facts block or downgrade; optional facts remain visible.

8. Next read suggestions
   Suggestions map to missing facts and remain not executed.

9. Context sufficiency truthfulness
   Sufficient for review-only planning is not edit authority, apply authority, verification success, or task success.

10. Agent Loop feature contract
   Staged context acquisition contract validates and has terminalSuccessClaim false.

11. Redaction
   No API keys, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

12. Product surface
   Only if touched, display context facts without success inflation.

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
- no broad planning rewrite
- no broad context graph rewrite
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- build persistent graph index
- add background scan or indexing
- call live provider
- add tools
- change mutation authority
- change apply behavior
- run verification commands by default
- rewrite planning runtime broadly
- rewrite context graph broadly
- move context ownership into runtime loop
- create route runners
- create verify scripts
- create JSON reports
- add package scripts
- copy external repository names or structure

## Validation

Required:

- focused context engine tests
- focused context graph tests
- read continuation or read delivery tests if touched
- Agent Loop feature contract tests
- product surface tests if display is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

CP003 is COMPLETE only if:

- targeted inspection was performed and reported
- staged read plan facts exist
- read budget accounting exists
- context packet provenance exists
- context graph scoring exposes safe components and unavailable components
- code graph or impact trace facts are represented as observed, inferred, missing, stale, or not-proven
- stale context detection exists
- required and optional missing facts are separated
- next read suggestions are emitted for partial context
- context sufficiency decision is represented without success inflation
- Agent Loop feature contract exists for staged context acquisition
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires persistent indexing, broad graph rewrite, product loop rewrite, or provider use, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Staged read plan design
6. Read budget accounting
7. Context packet provenance
8. Context graph scoring and impact trace
9. Stale context detection
10. Required and optional missing facts
11. Next read suggestions
12. Context sufficiency decision
13. Agent Loop feature contract
14. Product surface changes if any
15. Redaction behavior
16. Truthfulness behavior
17. Tests and validation pass or fail
18. Architecture constraints preserved
19. What remains deliberately not-proven
20. Recommended next route

## Next route

After CP003 is complete, continue with:

docs/build-infrastructure/route/route-cp004-planning-owner-handoff-contract.md

CP004 should harden the planning owner, plan quality model, plan-to-edit handoff, plan-to-verification handoff, and plan truthfulness boundaries.

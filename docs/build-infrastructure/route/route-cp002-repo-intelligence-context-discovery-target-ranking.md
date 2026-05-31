# Context Planning Route CP002: Repo Intelligence Context Discovery And Target Ranking

## Goal

Implement the first Context and Planning quality route after CP001.

CP001 audited the current context and planning block and selected CP002 as the immediate implementation route.

CP002 must improve:

- bounded repo scan evidence
- discovery scan profile facts
- candidate discovery quality
- candidate omission accounting
- target ranking reasons
- ambiguity handling
- missing discovery facts
- candidate to context handoff facts
- Agent Loop feature contract declaration for context discovery and target selection
- safe product surface visibility if needed

Expected final status: COMPLETE.

This route strengthens context discovery and target ranking. It must not implement persistent indexing, provider calls, edit or apply behavior, verification execution, session schema migration, SDK, RPC, TUI, browser, MCP, plugin loading, or package loading.

## Why this route exists

CP001 found that the current context path is useful but still partial:

- repo scan is bounded
- ranking is heuristic
- deeper files can be missed
- target correctness is not proven
- candidate omissions are not surfaced strongly enough
- context discovery is not yet a first class Agent Loop feature contract
- product surface can show planning facts but does not yet clearly expose context discovery and target ranking state

CP002 must make repo discovery and target selection more evidence-backed and loop-governed.

## Owner domains

Primary owners:

- orchestration repo intelligence
- orchestration context engine
- runtime loop feature contract consumption
- presentation only if safe product surface display is needed

Allowed target areas:

- packages/ts-shell/src/orchestration/repoIntelligence.ts
- packages/ts-shell/src/orchestration/contextEngine.ts
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/presentation
- focused tests beside touched modules

Do not move repo intelligence, context ownership, or target ranking truth into runtime loop. Runtime loop may observe feature contract facts only.

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use external-origin names or process words in product filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- repoIntelligence
- contextEngine
- contextGraphPlanning only for handoff compatibility
- planningRuntime only for downstream consumption
- runtime loop feature contract
- product loop adapter
- product surface if display is touched
- relevant repo intelligence and context engine tests
- CP001 audit and roadmap docs if available in the repo

Use local architecture study repositories only for narrow comparison if needed. Do not copy names, code, file layout, or product vocabulary from them.

Record inspected files and symbols in the final report.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Discovery scan profile facts

Expose a report-safe discovery scan profile.

It should include facts such as:

- workspace label or safe project identity
- scan mode
- scan budget
- files considered count
- files omitted count
- omitted reason categories
- raw content excluded status
- package or module map availability
- scan limit reached status
- discovery confidence
- not-proven claims

The scan profile must not include raw file contents, secrets, provider output, hidden reasoning, transcript dumps, unsafe paths, or raw command output.

### 2. Candidate omission accounting

Candidate discovery must explicitly report omissions.

Examples:

- scan budget reached
- file type excluded
- generated or vendor path excluded
- test files omitted or included by policy
- deep path not scanned
- large file skipped
- pathless task has weak signals
- ambiguous task has competing candidates

Omission facts must reach context engine output or downstream discovery evidence.

An omitted file is not proof that it is irrelevant.

### 3. Stronger candidate evidence

Candidate records should expose stronger safe evidence.

Recommended fields:

- candidate id
- safe file path
- role
- package or module hint
- symbol hints
- path match reasons
- task token match reasons
- test adjacency hints if available
- freshness or staleness hints if available
- rank score components
- uncertainty notes
- not-proven claims

Candidate evidence must make clear that high rank is not target correctness.

### 4. Target ranking ambiguity

Target ranking must expose ambiguity.

Represent:

- unambiguous top candidate
- multiple plausible candidates
- weak signal candidate
- no candidate
- missing path or symbol facts
- target family uncertainty
- test or source ambiguity

Ambiguity must downgrade confidence and produce missing discovery facts or next read suggestions.

The first ranked candidate must not silently become correct target.

### 5. Missing discovery facts

Add or harden missing discovery facts for vague or pathless tasks.

Examples:

- missing explicit file path
- missing symbol name
- missing package or workspace scope
- missing reproduction clue
- missing test target
- missing user intent
- insufficient scan coverage
- ambiguous candidate set

Separate required facts from optional facts where possible.

Optional gaps must remain visible but should not always block planning if downstream can safely continue in review-only mode.

### 6. Candidate to context handoff facts

The context engine should receive and return clear handoff facts from discovery.

Handoff should include:

- selected candidate ids
- competing candidate ids
- omitted candidate facts
- ambiguity state
- missing discovery facts
- scan profile id or evidence
- target ranking evidence id
- raw content excluded status
- not-proven claims

This handoff does not grant edit authority.

### 7. Agent Loop feature contract

Add or update a context discovery and target ranking feature contract declaration.

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

Use the existing feature contract mechanism from the product loop adapter.

The contract must not move discovery ownership into runtime loop.

### 8. Product surface visibility

Only if needed, expose a concise context discovery and target ranking section through the product surface.

It should show:

- scan profile summary
- candidate count
- omission count
- ambiguity state
- selected candidate summary
- missing discovery facts
- not-proven claims
- next read suggestion if present

It must not render candidate discovery as success.

## Required tests

Add focused tests only.

Required categories:

1. Scan profile facts
   Bounded scan exposes budget, considered count, omitted count, raw content excluded status, and not-proven claims.

2. Omission accounting
   Omitted files and omission categories are represented safely.

3. Candidate evidence
   Candidates include score components and reasons without raw content leakage.

4. Ambiguity handling
   Multiple plausible candidates produce ambiguity and do not silently grant target correctness.

5. No candidate or weak candidate
   Missing discovery facts and next read suggestions are emitted.

6. Candidate to context handoff
   Context engine carries discovery and ranking evidence into downstream output.

7. Agent Loop feature contract
   Context discovery and target selection contract validates and has terminalSuccessClaim false.

8. Truthfulness
   Candidate found, high rank, selected target, scan completed, or product surface rendered cannot become task success, edit authority, apply authority, or verification success.

9. Redaction
   No API keys, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

10. Product surface
   Only if touched, it must show discovery facts without success inflation.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
- no persistent index service
- no MCP or SDK surface
- no provider calls
- no edit or apply behavior changes
- no verification execution changes
- no repair behavior changes
- no session schema migration
- no browser or external tool expansion
- no dynamic plugin execution
- no package loading
- no new dependencies
- no broad planning rewrite
- no broad context graph rewrite
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- build a persistent graph index
- create background indexing
- call live provider
- add new tools
- change mutation authority
- change apply behavior
- run verification commands by default
- rewrite planning runtime broadly
- rewrite context graph broadly
- move repo intelligence into runtime loop
- create route runners
- create verify scripts
- create JSON reports
- add package scripts
- rename product files for style only
- copy external repository names or structure

## Validation

Required:

- focused repo intelligence tests
- focused context engine tests
- target ranking tests
- ambiguity and no candidate tests
- missing facts tests
- Agent Loop feature contract tests
- product surface tests if display is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

CP002 is COMPLETE only if:

- targeted inspection was performed and reported
- discovery scan profile facts exist
- candidate omission accounting exists
- candidate evidence includes safe score components and reasons
- target ranking ambiguity is represented
- missing discovery facts are emitted for weak or pathless tasks
- candidate to context handoff facts reach context engine output
- Agent Loop feature contract exists for context discovery and target selection
- no context or ranking fact grants edit authority or task success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires persistent indexing, broad graph rewrite, or product loop rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Scan profile design
6. Omission accounting design
7. Candidate evidence and ranking design
8. Ambiguity handling
9. Missing discovery facts
10. Candidate to context handoff
11. Agent Loop feature contract
12. Product surface changes if any
13. Redaction behavior
14. Truthfulness behavior
15. Tests and validation pass or fail
16. Architecture constraints preserved
17. What remains deliberately not-proven
18. Recommended next route

## Next route

After CP002 is complete, continue with:

docs/build-infrastructure/route/route-cp003-staged-read-context-graph-missing-facts.md

CP003 should harden staged reads, context graph scoring, code graph trace and impact, read budget accounting, stale graph facts, missing required and optional facts, and next read suggestions.

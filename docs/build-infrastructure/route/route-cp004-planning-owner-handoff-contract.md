# Context Planning Route CP004: Planning Owner And Handoff Contract

## Goal

Implement the third Context and Planning quality route after CP003.

CP002 improved repo intelligence, discovery, target ranking, ambiguity, omission accounting, and discovery feature contract.

CP003 hardened staged reads, context graph facts, read budget accounting, context packet provenance, stale facts, missing facts, next read suggestions, and staged context acquisition feature contract.

CP004 must now harden the planning layer:

- planning owner boundary
- plan quality model
- plan step evidence
- plan assumptions and constraints
- plan confidence and uncertainty
- plan-to-edit handoff
- plan-to-verification handoff
- unsupported or unsafe plan classification
- Agent Loop feature contract for planning
- truthfulness boundaries between plan, edit, apply, verification, repair, and success

Expected final status: COMPLETE.

This route strengthens planning and handoff contracts. It must not implement provider calls, mutation apply, verification execution, repair behavior, session schema migration, SDK, RPC, TUI, browser, MCP, plugin loading, package loading, or broad planning rewrite.

## Why this route exists

CP001 found that planning ownership, plan-to-edit, plan-to-verification, and planning truthfulness were partial.

CP002 and CP003 now provide stronger discovery and context acquisition facts. CP004 must make planning consume those facts and produce grounded handoffs without overclaiming.

A plan is not execution. An edit target is not authority. A verification intent is not verification passed.

## Owner domains

Primary owners:

- orchestration planning runtime
- orchestration planning projection
- orchestration planning product proposal if needed
- orchestration mutation proposal bridge for handoff facts only
- runtime loop feature contract
- presentation only if safe product surface display is needed

Allowed target areas:

- packages/ts-shell/src/orchestration/planningRuntime.ts
- packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts
- packages/ts-shell/src/orchestration/planningRuntimeProductProposal.ts
- packages/ts-shell/src/orchestration/planningMutationProposalBridge.ts
- packages/ts-shell/src/orchestration/groundedPlanningProjection.ts
- packages/ts-shell/src/orchestration/contextAcquisitionProjection.ts
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/presentation only if display is touched
- focused tests beside touched modules

Do not move planning ownership into runtime loop. Runtime loop may observe feature contract and handoff facts only.

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use external-origin names or process words in product filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- planningRuntime
- planningRuntimeProductExecution if present
- planningRuntimeProductProjection
- planningRuntimeProductProposal
- planningMutationProposalBridge
- groundedPlanningProjection
- contextAcquisitionProjection
- contextEngine
- contextGraphPlanning CP003 staged facts
- repoIntelligence CP002 discovery facts
- verification command plan or verification intent surfaces only for handoff compatibility
- mutation proposal bridge and exact proposal path only for handoff compatibility
- runtime loop feature contract
- product loop adapter
- product surface if display is touched
- focused planning and handoff tests
- CP001, CP002, and CP003 docs if present

Use local architecture study repositories only for narrow comparison if needed. Do not copy names, code, file layout, or product vocabulary from them.

Record inspected files and symbols in the final report.

If Serena is unavailable, use targeted repository search and report that honestly.

## Capability to build

### 1. Planning owner boundary

Make the planning owner explicit.

Planning owns:

- task understanding
- context sufficiency consumption
- plan step construction
- assumptions
- constraints
- uncertainty
- edit target intent
- verification intent
- unsupported classification
- next action suggestion

Planning does not own:

- mutation authority
- apply authority
- exact anchor truth
- verification execution truth
- repair execution truth
- terminal success
- provider truth
- file write behavior

The code should make this boundary visible through types, projection fields, or feature contract facts.

### 2. Plan quality model

Add or harden plan quality facts.

Recommended fields:

- plan id
- task kind
- planning mode
- context sufficiency input
- context source ids
- discovery handoff ids
- staged context ids
- assumptions
- constraints
- uncertainty notes
- plan confidence
- plan risk level
- unsupported reasons
- required missing facts
- optional missing facts
- next action
- not-proven claims

Plan quality must be report-safe.

### 3. Evidence-bound plan steps

Plan steps should carry evidence links.

Recommended facts:

- step id
- step kind
- target file or safe target label
- evidence source ids
- context packet ids
- candidate ids
- missing facts referenced
- expected result
- risk level
- whether step is executable, review-only, or unsupported
- not-proven claims

Plan step exists is not proof that the step is correct.

### 4. Assumptions and constraints

Represent planning assumptions and constraints explicitly.

Examples:

- assumes selected candidate is relevant
- assumes context packet is fresh
- assumes single-file change is enough
- assumes tests exist
- assumes target scope is bounded
- constraint no write authority
- constraint review-only
- constraint missing required fact
- constraint unsupported broad refactor
- constraint stale context

Assumptions must remain visible downstream.

### 5. Plan-to-edit handoff facts

Add or harden plan-to-edit handoff.

Handoff should include:

- edit intent id
- candidate target ids
- selected target ids
- target confidence
- target ambiguity
- context packet ids
- plan step ids
- proposed edit scope
- exact proposal readiness if known
- unsupported edit reasons
- authority requirement
- no-write status
- not-proven claims

This handoff must not grant mutation authority.

This handoff must not imply exact-ready anchor unless the existing proposal backend proves it.

### 6. Plan-to-verification handoff facts

Add or harden plan-to-verification handoff.

Handoff should include:

- verification intent id
- verification purpose
- changed or targeted files if known
- relevant test or command candidates if known
- confidence
- missing verification facts
- selected-not-run status
- task relevance status
- expected verification evidence
- not-proven claims

Verification intent is not command execution.

Selected command is not verification passed.

### 7. Unsupported and unsafe plan classification

Planning should explicitly classify unsupported or unsafe requests.

Examples:

- too broad
- insufficient context
- missing target
- stale context
- ambiguous target
- unsupported edit type
- unsafe authority request
- unsupported verification path
- requires external tool not available
- requires provider but provider disabled
- command-only task should bypass mutation handoff

Unsupported classification must be visible downstream and not become success.

### 8. Agent Loop feature contract

Add or update a planning feature contract.

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

This contract should connect CP002 discovery and CP003 staged context acquisition to planning handoff facts.

### 9. Product surface visibility

Only if needed, expose concise planning and handoff summaries through product surface.

It should show:

- plan status
- context sufficiency input
- assumptions
- constraints
- edit handoff status
- verification handoff status
- unsupported reasons
- not-proven claims
- next action

It must not render plan generation as success.

## Required tests

Add focused tests only.

Required categories:

1. Planning owner boundary
   Planning facts do not own mutation authority, apply truth, verification truth, repair truth, or terminal success.

2. Plan quality model
   Plan quality records context sufficiency, assumptions, constraints, uncertainty, confidence, risk, and not-proven claims.

3. Evidence-bound plan steps
   Plan steps carry source ids and remain review-only or unsupported when evidence is incomplete.

4. Assumptions and constraints
   Assumptions remain visible in edit and verification handoff.

5. Plan-to-edit handoff
   Handoff carries target confidence, ambiguity, scope, authority requirement, no-write status, and not-proven claims without granting authority.

6. Plan-to-verification handoff
   Verification intent carries relevance facts, selected-not-run state, missing verification facts, and not-proven claims without claiming pass.

7. Unsupported classification
   Broad, stale, missing target, ambiguous, unsafe, or command-only cases are classified without success inflation.

8. Agent Loop feature contract
   Planning feature contract validates and has terminalSuccessClaim false.

9. Truthfulness
   Plan generated, target selected, edit handoff ready, verification intent selected, or product surface rendered cannot become task success, edit authority, apply success, verification success, or repair success.

10. Redaction
   No API keys, provider.env, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, unsafe file contents, or terminal success claims.

11. Product surface
   Only if touched, it must show planning facts without success inflation.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc dumping ground
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

- call live provider
- create mutation authority
- apply edits
- run verification commands by default
- implement repair execution
- broaden command allowlists
- rewrite planning runtime broadly
- rewrite proposal backend broadly
- move planning ownership into runtime loop
- create route runners
- create verify scripts
- create JSON reports
- add package scripts
- copy external repository names or structure

## Validation

Required:

- focused planning runtime tests
- focused planning projection tests
- focused plan-to-edit handoff tests
- focused plan-to-verification handoff tests
- Agent Loop feature contract tests
- product surface tests if display is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract only if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

CP004 is COMPLETE only if:

- targeted inspection was performed and reported
- planning owner boundary is explicit
- plan quality model exists or is hardened
- plan steps are evidence-bound
- assumptions and constraints are represented
- plan-to-edit handoff facts exist
- plan-to-verification handoff facts exist
- unsupported and unsafe plan classification is represented
- Agent Loop feature contract exists for planning
- no planning fact grants edit authority or terminal success
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff check passes
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If this requires provider use, broad planning rewrite, proposal backend rewrite, or product loop rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Planning owner boundary
6. Plan quality model
7. Evidence-bound plan steps
8. Assumptions and constraints
9. Plan-to-edit handoff
10. Plan-to-verification handoff
11. Unsupported classification
12. Agent Loop feature contract
13. Product surface changes if any
14. Redaction behavior
15. Truthfulness behavior
16. Tests and validation pass or fail
17. Architecture constraints preserved
18. What remains deliberately not-proven
19. Recommended next route

## Next route

After CP004 is complete, continue with:

docs/build-infrastructure/route/route-cp005-memory-reuse-stale-invalidation-continuation-context.md

CP005 should harden memory reuse, stale invalidation, continuation context readiness, replay-safe planning state, and context freshness across turns.

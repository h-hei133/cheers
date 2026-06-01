# VR006 Evidence Result Verdict Boundary

## Goal

Connect post repair verification verdict candidate inputs into evidence and result owned terminal truth.

VR005 produced post repair verification requirement, request, result, and verdict candidate input facts while preserving original failure and repair apply facts.

VR006 must let evidence and result owners derive a final terminal projection only when the proof chain is complete.

Expected final status: COMPLETE.

## Scope

This task covers:

- verdict candidate input consumption
- evidence proof input facts
- result terminal projection facts
- verified with repair terminal status if evidence is complete
- partial or blocked terminal status if evidence is incomplete
- original failure preservation in final projection
- repair apply preservation in final projection
- post repair verification preservation in final projection
- runtime loop observation
- runtime event and JSON projection
- product surface rendering

This task must not run verification, apply repair, call provider, or change command execution.

## Owner domains

Primary owners:

- evidence
- result

Source domains:

- verification supplies post repair verification facts
- repair supplies repair proposal and apply facts
- edit supplies apply observation facts

Consumer domains:

- runtime/loop observes
- runtime/events projects
- presentation renders

Do not put terminal truth into verification, repair, edit, CLI, presentation, provider, model, compatibility shims, or generic orchestration areas.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- evidence verdict surfaces
- result terminal truth surfaces
- session result truth adapter
- post repair verification facts from VR005
- repair apply facts from VR004
- repair proposal facts from VR003
- original verification failure facts from VR002
- runtime loop trajectory
- runtime events and JSON stream
- product surface model and renderer
- existing result-contract tests

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Evidence proof input

Add or refine evidence-owned proof input facts.

Represent:

- original verification failure id
- original failure class
- repair proposal id
- repair authority state
- repair apply state
- repair touched target summaries
- post repair verification state
- post repair relevance and coverage
- receipt ids
- missing proof items
- not-proven claims

Evidence input is not terminal result.

### 2. Result terminal projection

Add or refine result-owned terminal projection.

Represent:

- verified with repair
- partial
- blocked
- failed
- not proven

Terminal projection may become verified with repair only if:

- original failure is preserved
- repair proposal exists
- repair authority is granted
- repair apply is applied
- post repair verification is passed
- relevance and coverage are sufficient
- no blocking missing proof items remain

If any required item is missing, status must remain partial, blocked, failed, or not proven.

### 3. Original failure preservation

Final projection must keep the original failure visible.

A verified with repair projection must not erase:

- original failed verification status
- original failure class
- original receipt evidence
- repair proposal facts
- repair authority facts
- repair apply facts
- post repair verification facts
- not-proven claims

### 4. Agent Loop observation

Runtime loop may observe:

- verdict candidate consumed
- evidence proof input complete
- evidence proof input incomplete
- result terminal projection observed
- verified with repair projected
- partial or blocked projected

Runtime loop must not derive terminal truth itself.

### 5. Events and JSON projection

Events and JSON stream may expose result projection observations.

They must not fabricate evidence.

They must not convert verification passed or repair applied into terminal success without evidence/result projection.

### 6. Product surface rendering

Product surface may render terminal projection.

It must show:

- final status
- original failure preserved
- repair proposal/apply facts
- post repair verification facts
- missing proof items when incomplete
- not-proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve:

- verdict candidate is not terminal result
- evidence input is not terminal result
- post repair verification passed alone is not terminal result
- repair applied alone is not repair success
- original failure must remain visible
- incomplete proof cannot become verified
- rendered output is not success
- result and evidence own terminal truth

## Required tests

Add focused tests only.

Test categories:

1. Complete proof
   Complete chain projects verified with repair through result owner.

2. Missing proof
   Missing authority, apply, relevance, coverage, or verification keeps partial, blocked, failed, or not proven.

3. Original failure preservation
   final projection preserves original failure facts.

4. Loop observation
   loop observes result projection without owning terminal truth.

5. Runtime events and JSON stream
   terminal projection observations are ordered, JSON-safe, and redacted.

6. Product surface
   rendered output shows final status and preserved failure facts.

7. Result truthfulness
   terminal status is derived only by evidence/result owner.

8. Negative controls
   repair applied only, verification passed only, and verdict candidate only cannot become verified.

## Architecture constraints

Hard rules:

- owner-domain-first
- no process or origin words in product filenames
- no external project names in product code or tests
- no compatibility shim growth
- no helper, utils, common, misc, or support dumping ground
- no verification execution
- no repair apply
- no new writer
- no fuzzy apply
- no provider calls
- no command allowlist expansion
- no CLI behavior changes
- no session schema migration
- no SDK, RPC, TUI, browser, MCP, dynamic plugin, package loading, or new dependency work
- no terminal truth outside evidence and result

## What not to do

Do not:

- run commands
- apply repair
- call provider
- read private provider config
- add scripts
- add package scripts
- add JSON reports
- create broad orchestration files
- move terminal truth into presentation
- let loop derive final status
- hide the original failure
- turn incomplete proof into verified

## Validation

Required:

- focused evidence tests
- focused result tests
- focused verification or repair tests if source facts change
- focused loop trajectory tests if loop facts change
- focused runtime event and JSON stream tests if events change
- focused product surface tests if display changes
- result-contract gate
- build for touched package
- git diff check
- git status

Commit after green validation.

A single push is allowed after commit. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- evidence proof input exists
- result terminal projection exists
- complete proof can project verified with repair
- incomplete proof remains partial, blocked, failed, or not proven
- original failure remains visible
- Agent Loop observes terminal projection without owning it
- runtime events and JSON stream expose projection safely
- product surface renders projection without becoming owner
- truthfulness guardrails are tested
- result-contract passes
- focused tests pass
- build passes
- diff check passes
- status is reported
- commit is created after green validation
- at most one push attempt after commit

If this requires command execution, repair apply, terminal truth rewrite outside result/evidence, or broad runtime rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Commit id if committed
6. Evidence proof input facts
7. Result terminal projection facts
8. Original failure preservation
9. Complete and incomplete proof behavior
10. Loop observation
11. Event and JSON projection
12. Product surface behavior
13. Truthfulness guardrails
14. Tests and validation pass or fail
15. Push attempted or not attempted
16. Remaining not-proven claims
17. Recommended next task

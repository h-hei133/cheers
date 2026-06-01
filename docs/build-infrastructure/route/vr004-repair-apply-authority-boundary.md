# VR004 Repair Apply Authority Boundary

## Goal

Connect repair proposal facts to an explicit repair authority and controlled apply boundary.

VR003 exposed repair-required and repair-proposal observations without applying repair.

VR004 may create the first repair apply observation, but only through the existing edit owner apply boundary and only after explicit repair authority.

Expected final status: COMPLETE.

## Scope

This task covers:

- repair authority requirement facts
- repair authority decision facts
- repair apply request facts
- repair apply blocked facts
- repair apply attempted facts
- repair apply result observations
- original failure preservation after apply observation
- runtime loop observation
- runtime event and JSON projection
- save point and next-turn carry-forward
- product surface rendering
- evidence and result truthfulness guardrails

This task does not cover post-repair verification.

Repair applied is not repair success.

## Owner domains

Primary owners:

- repair
- edit
- runtime/loop
- runtime/events
- evidence
- result
- presentation

Source or consumer domains:

- verification supplies original failure facts
- runtime/execution supplies receipt facts when present
- tools supplies execution facts when present

Do not put repair apply truth into CLI, provider, model, presentation, compatibility shims, generic orchestration areas, or result shortcuts.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- repair handoff boundary
- repair iteration or apply observation surfaces
- edit apply owner boundary
- authority and approval facts
- verification failure facts from VR002
- repair proposal facts from VR003
- runtime loop trajectory
- runtime events and JSON stream
- save point and next-turn facts
- product surface model and renderer
- evidence and result truth surfaces
- focused tests around repair, edit, loop, event, and surface owners

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Repair authority facts

Add or refine repair authority facts owned by repair.

Represent:

- source repair proposal id
- source verification failure id
- authority required
- authority decision
- authority source
- authority missing reason
- authority risk
- not-proven claims

Authority requested is not authority granted.

Prompt text alone is not authority.

### 2. Repair apply request facts

Add repair apply request facts that can be handed to the edit owner.

Represent:

- repair proposal id
- target summary
- expected edit operation kind
- authority state
- apply readiness
- apply blocker
- risk
- not-proven claims

Apply request is not apply attempted.

### 3. Controlled apply observation

If an existing safe edit owner seam can be used without broad rewrite, connect repair apply request to it.

Represent:

- apply not run
- apply blocked
- apply attempted
- apply applied
- apply failed
- apply receipt ids
- touched target summaries
- readback status if already produced by existing seam
- post-repair verification not run
- not-proven claims

Do not add a new writer.

Do not add fuzzy apply.

Do not bypass edit owner authority.

### 4. Original failure preservation

All repair apply observations must preserve the original verification failure facts.

A repair apply result must not hide:

- source failed verification status
- failure class
- task relevance
- coverage
- receipt evidence
- original not-proven claims

### 5. Agent Loop consumption

Connect repair authority and apply observations into loop trajectory.

The loop may observe:

- repair authority required
- repair authority granted
- repair apply requested
- repair apply blocked
- repair apply attempted
- repair apply applied
- repair apply failed
- post-repair verification not run

The loop must not decide terminal success.

### 6. Events and JSON projection

Project repair authority and apply observations through runtime events and JSON-safe stream entries.

Events are observation-only.

They must not turn authority granted, apply attempted, apply applied, or readback observed into repair success.

### 7. Save point and next-turn facts

Repair apply facts may attach to save point and next-turn projections as observed facts.

Save point creation is not success.

Next-turn preparation is not repair success.

### 8. Product surface rendering

Product surface may display repair authority and apply state.

It must preserve:

- original failure
- proposal observed
- authority state
- apply blocked or applied
- post-repair verification not run
- not-proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve these rules:

- repair proposal is not apply
- authority requested is not granted
- authority granted is not apply
- apply request is not apply attempted
- apply attempted is not apply success
- apply applied is not repair success
- readback is not post-repair verification
- post-repair verification not run cannot success
- original failure must remain visible
- rendered output is not success
- result and evidence remain terminal truth owners

## Required tests

Add focused tests only.

Test categories:

1. Authority states
   required, missing, granted, denied, blocked, and not-proven stay distinct.

2. Apply request
   request facts do not imply attempted or applied.

3. Controlled apply observation
   blocked, attempted, applied, and failed observations stay distinct.

4. Original failure preservation
   apply observations preserve failed verification evidence.

5. Loop trajectory
   loop observes repair authority and apply facts without terminal success.

6. Runtime events and JSON stream
   repair authority and apply observations are ordered, JSON-safe, and redacted.

7. Save point and next turn
   repair apply facts can be carried forward without success upgrade.

8. Product surface
   display keeps original failure and post-repair verification not-run visible.

9. Result truthfulness
   terminal status is not changed by repair apply observation facts.

## Architecture constraints

Hard rules:

- owner-domain-first
- no process or origin words in product filenames
- no external project names in product code or tests
- no compatibility shim growth
- no helper, utils, common, misc, or support dumping ground
- no new writer
- no fuzzy apply
- no automatic repair
- no post-repair verification run
- no command allowlist expansion
- no new command execution behavior
- no provider calls
- no CLI behavior changes
- no session schema migration
- no SDK, RPC, TUI, browser, MCP, dynamic plugin, package loading, or new dependency work
- no terminal success outside evidence and result truth rules

## What not to do

Do not:

- create a new apply engine
- bypass edit owner
- apply without explicit repair authority
- rerun verification
- call real provider
- read private provider config
- add scripts
- add package scripts
- add JSON reports
- create broad orchestration files
- move facts into presentation
- make result or verdict fabricate repair facts
- hide the original verification failure
- turn apply applied into repair success

## Validation

Required:

- focused repair tests
- focused edit tests if edit boundary changes
- focused loop trajectory tests if loop facts change
- focused runtime event and JSON stream tests if events change
- focused save point or next-turn tests if carried facts change
- focused product surface tests if display changes
- result-contract gate if terminal or result behavior is touched
- build for touched package
- git diff check
- git status

Commit after green validation.

A single push is allowed after commit. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- repair authority facts exist or are refined in repair owner
- repair apply request facts exist
- repair apply observations exist without post-repair verification success
- existing edit owner boundary is used if apply is observed
- no new writer exists
- original verification failure remains visible
- Agent Loop consumes repair apply facts as observation and handoff facts
- runtime events and JSON stream can expose repair apply observations safely
- save point and next-turn can carry repair apply facts without success
- product surface can render repair apply facts without becoming owner
- truthfulness guardrails are tested
- focused tests pass
- build passes
- diff check passes
- status is reported
- commit is created after green validation
- at most one push attempt after commit

If this requires new writer, fuzzy apply, post-repair verification, command behavior changes, or terminal truth rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Commit id if committed
6. Repair authority facts
7. Apply request facts
8. Apply observation facts
9. Original failure preservation
10. Loop consumption
11. Event and JSON projection
12. Save point and next-turn carry-forward
13. Product surface behavior
14. Truthfulness guardrails
15. Tests and validation pass or fail
16. Push attempted or not attempted
17. Remaining not-proven claims
18. Recommended next task

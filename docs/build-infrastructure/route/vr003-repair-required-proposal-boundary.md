# VR003 Repair Required And Proposal Observation Boundary

## Goal

Implement the repair-required and repair-proposal observation boundary after VR002.

VR002 connected task-relevant verification facts into the Agent Loop as observation and verdict-input facts.

VR003 must consume failed task-relevant verification facts and expose repair-required and repair-proposal facts without applying repair, rerunning verification, or manufacturing success.

Expected final status: COMPLETE.

## Scope

This task only covers:

- repair required facts
- repair eligibility facts
- original verification failure preservation
- repair reason and failure context
- repair proposal observation
- repair proposal source facts
- repair plan handoff facts
- runtime loop observation
- runtime event and JSON projection
- product surface rendering
- evidence and result truthfulness guardrails

This task must not perform repair apply or post-repair verification.

## Owner domains

Primary owners:

- repair
- verification
- runtime/loop
- runtime/events
- evidence
- result
- presentation

Consumer or source domains:

- runtime/execution
- tools
- edit only as future apply owner, not active apply owner here

Do not put repair truth into CLI, provider, model, presentation, compatibility shims, generic orchestration areas, or result shortcuts.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- repair requirement and proposal surfaces
- verification failure facts from VR002
- verification failure classifier
- task-relevant verification facts
- evidence and verdict surfaces
- result truth surfaces
- runtime loop trajectory
- runtime events and JSON stream
- save point and next-turn facts
- product surface model and renderer
- existing repair tests and repair-related older compatibility seams

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Repair required fact model

Add or refine repair-required facts owned by repair.

It must represent:

- source verification fact id
- original failure class
- original failure summary
- task relevance
- coverage
- authority state
- receipt ids
- repair eligibility
- repair blocker
- repair risk
- not-proven claims

Repair required is not repair success.

### 2. Original failure preservation

The original verification failure must remain visible through repair-required and proposal observations.

A later proposal must not hide:

- failed verification status
- failure class
- failed command or safe command label if available
- receipt evidence
- task relevance and coverage
- blocked or missing authority state
- not-proven claims

### 3. Repair proposal observation

Add repair proposal observation facts.

Represent:

- proposal observed
- proposal source
- source failure id
- proposal readiness
- proposal risk
- proposed target summary
- authority requirement
- apply not-run status
- post-repair verification not-run status
- not-proven claims

Allowed proposal sources include deterministic evidence-derived, model-derived observation, or existing product proposal source if safe.

Do not hardcode proposal text as success evidence.

### 4. Agent Loop consumption

Connect repair-required and proposal observations into the loop trajectory.

The loop may observe:

- repair required
- repair blocked
- repair eligible
- proposal observed
- proposal needs authority
- proposal not applied
- post-repair verification not run

The loop must not decide terminal success.

### 5. Events and JSON projection

Project repair observations through runtime events and JSON-safe stream entries.

Events are observation-only.

They must not turn repair required, proposal observed, proposal ready, or authority requested into repair success.

### 6. Save point and next-turn facts

Repair facts may attach to save point and next-turn projections as observed facts.

Save point creation is not success.

Next-turn preparation is not repair success.

### 7. Product surface rendering

Product surface may display repair-required and proposal states.

It must preserve:

- original failure
- repair required
- repair blocked
- proposal observed
- proposal not applied
- post-repair verification not run
- not-proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve these rules:

- repair required is not repair success
- repair eligible is not repair success
- repair proposal is not repair apply
- repair proposal ready is not authority
- authority requested is not authority granted
- repair apply not-run cannot be success
- post-repair verification not-run cannot be success
- original failure must remain visible
- rendered output is not success
- result and evidence remain terminal truth owners

## Required tests

Add focused tests only.

Test categories:

1. Repair required states
   eligible, blocked, unsupported, unsafe, missing authority, and not-proven stay distinct.

2. Original failure preservation
   repair facts preserve the failed verification evidence.

3. Proposal observation
   proposal observed does not imply apply, verification, or success.

4. Loop trajectory
   loop observes repair-required and proposal facts without terminal success.

5. Runtime events and JSON stream
   repair observations are ordered, JSON-safe, and redacted.

6. Save point and next turn
   repair facts can be carried forward without success upgrade.

7. Product surface
   display keeps original failure, proposal not applied, and not-proven visible.

8. Result truthfulness
   terminal status is not changed by repair observation facts.

## Architecture constraints

Hard rules:

- owner-domain-first
- no process or origin words in product filenames
- no external project names in product code or tests
- no compatibility shim growth
- no helper, utils, common, misc, or support dumping ground
- no repair apply
- no post-repair verification run
- no automatic repair
- no command allowlist expansion
- no new command execution behavior
- no provider calls
- no edit behavior changes
- no CLI behavior changes
- no session schema migration
- no SDK, RPC, TUI, browser, MCP, dynamic plugin, package loading, or new dependency work
- no terminal success outside evidence and result truth rules

## What not to do

Do not:

- apply a repair
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
- turn proposal readiness into authority

## Validation

Required:

- focused repair tests
- focused verification tests if verification facts change
- focused loop trajectory tests if loop facts change
- focused runtime event and JSON stream tests if events change
- focused save point or next-turn tests if carried facts change
- focused product surface tests if display changes
- result-contract gate if terminal or result behavior is touched
- build for touched package
- git diff check
- git status

A single push is allowed after validation passes. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- repair required facts exist or are refined in repair owner
- original verification failure remains visible
- repair proposal observation exists without apply or verification success
- Agent Loop consumes repair facts as observation and handoff facts
- runtime events and JSON stream can expose repair observations safely
- save point and next-turn can carry repair facts without success
- product surface can render repair facts without becoming owner
- truthfulness guardrails are tested
- focused tests pass
- build passes
- diff check passes
- status is reported
- at most one push attempt after green validation

If this requires repair apply, post-repair verification, command behavior changes, or terminal truth rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Repair required facts
6. Original failure preservation
7. Proposal observation facts
8. Loop consumption
9. Event and JSON projection
10. Save point and next-turn carry-forward
11. Product surface behavior
12. Truthfulness guardrails
13. Tests and validation pass or fail
14. Push attempted or not attempted
15. Remaining not-proven claims
16. Recommended next task

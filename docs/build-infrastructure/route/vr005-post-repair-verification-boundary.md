# VR005 Post Repair Verification Boundary

## Goal

Connect repair apply observations to post repair verification facts.

VR004 exposed repair authority and repair apply observations without claiming repair success.

VR005 must let verification owner observe post repair verification requests and results after repair apply, while preserving original failure and repair apply facts.

Expected final status: COMPLETE.

## Scope

This task covers:

- post repair verification requirement facts
- post repair verification request facts
- blocked and not run facts
- dispatched facts
- passed and failed facts
- timeout and cancelled facts
- receipt evidence
- task relevance and coverage
- original failure preservation
- repair apply preservation
- verdict candidate input facts
- runtime loop observation
- runtime event and JSON projection
- save point and next turn carry forward
- product surface rendering
- evidence and result truthfulness guardrails

This task does not create automatic repair success.

## Owner domains

Primary owners:

- verification
- repair
- runtime/loop
- runtime/events
- evidence
- result
- presentation

Source or consumer domains:

- edit supplies repair apply observation facts
- runtime/execution supplies receipt facts when present
- tools supplies command execution facts when present

Do not put verification truth into CLI, provider, model, presentation, compatibility shims, generic orchestration areas, or result shortcuts.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- verification result boundary from VR002
- repair required and proposal boundary from VR003
- repair apply authority boundary from VR004
- task relevant verification surfaces
- verification failure classifier
- evidence and result truth surfaces
- runtime loop trajectory
- runtime events and JSON stream
- save point and next turn facts
- product surface model and renderer
- focused tests around verification, repair, loop, events, and surface owners

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Post repair verification requirement facts

Add or refine verification owned post repair requirement facts.

Represent:

- source repair apply id
- source repair proposal id
- source verification failure id
- original failure class
- repair apply state
- verification required
- verification blocker
- task relevance expectation
- coverage expectation
- not-proven claims

Requirement is not a run.

### 2. Post repair verification request and result facts

Represent:

- verification request
- selected command
- selected not run
- blocked
- dispatched
- passed
- failed
- timed out
- cancelled
- unavailable
- skipped
- receipt ids
- failure class
- task relevance
- coverage
- not-proven claims

Selected command is not a pass.

Exit zero is not task success.

### 3. Original failure and repair apply preservation

Post repair verification facts must preserve:

- original failed verification status
- original failure class
- original relevance and coverage
- original receipt evidence
- repair proposal id
- repair authority state
- repair apply state
- touched target summaries
- repair apply receipt ids
- original not-proven claims

A later passed verification must not erase the original failure.

### 4. Verdict candidate input

If post repair verification passes, expose verdict candidate input facts only.

Do not let runtime loop, events, JSON stream, save point, next turn, or presentation declare terminal success.

Result and evidence remain terminal truth owners.

### 5. Agent Loop consumption

Connect post repair verification observations into loop trajectory.

The loop may observe:

- post repair verification required
- post repair verification blocked
- post repair verification dispatched
- post repair verification passed
- post repair verification failed
- verdict candidate available

The loop must not decide terminal success.

### 6. Events and JSON projection

Project post repair verification observations through runtime events and JSON-safe stream entries.

Events are observation-only.

They must not turn passed verification into terminal success unless result and evidence already own that status.

### 7. Save point and next turn facts

Post repair verification facts may attach to save point and next turn projections as observed facts.

Save point creation is not success.

Next turn preparation is not success.

### 8. Product surface rendering

Product surface may display post repair verification state.

It must preserve:

- original failure
- repair apply state
- post repair verification not run
- post repair verification passed or failed
- verdict candidate input
- not-proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve these rules:

- repair applied is not repair success
- readback is not post repair verification
- post repair verification required is not run
- selected command is not passed
- dispatched is not passed
- exit zero is not task success
- post repair verification passed is verdict input
- original failure must remain visible
- rendered output is not success
- result and evidence remain terminal truth owners

## Required tests

Add focused tests only.

Test categories:

1. Requirement states
   required, blocked, not run, and unavailable stay distinct.

2. Result states
   dispatched, passed, failed, timed out, cancelled, skipped stay distinct.

3. Original failure preservation
   post repair verification preserves original failed verification and repair apply facts.

4. Verdict candidate
   passed post repair verification exposes verdict candidate input without terminal success shortcut.

5. Loop trajectory
   loop observes post repair verification facts without terminal success.

6. Runtime events and JSON stream
   observations are ordered, JSON-safe, and redacted.

7. Save point and next turn
   facts can be carried forward without success upgrade.

8. Product surface
   display keeps original failure and verdict ownership visible.

9. Result truthfulness
   terminal status is not changed by observation facts alone.

## Architecture constraints

Hard rules:

- owner-domain-first
- no process or origin words in product filenames
- no external project names in product code or tests
- no compatibility shim growth
- no helper, utils, common, misc, or support dumping ground
- no new command execution behavior
- no command allowlist expansion
- no new writer
- no fuzzy apply
- no provider calls
- no CLI behavior changes
- no session schema migration
- no SDK, RPC, TUI, browser, MCP, dynamic plugin, package loading, or new dependency work
- no terminal success outside evidence and result truth rules

## What not to do

Do not:

- create a new verification executor
- create a new apply engine
- rerun commands outside existing sanctioned seams
- call real provider
- read private provider config
- add scripts
- add package scripts
- add JSON reports
- create broad orchestration files
- move facts into presentation
- make result or verdict fabricate verification facts
- hide the original verification failure
- turn post repair verification passed directly into terminal success

## Validation

Required:

- focused verification tests
- focused repair tests
- focused loop trajectory tests if loop facts change
- focused runtime event and JSON stream tests if events change
- focused save point or next turn tests if carried facts change
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
- post repair verification requirement facts exist
- post repair verification request and result facts exist
- original verification failure remains visible
- repair apply facts remain visible
- verdict candidate input facts exist if verification passes
- Agent Loop consumes post repair verification facts as observation and verdict input
- runtime events and JSON stream expose observations safely
- save point and next turn can carry facts without success
- product surface renders facts without becoming owner
- truthfulness guardrails are tested
- focused tests pass
- build passes
- diff check passes
- status is reported
- commit is created after green validation
- at most one push attempt after commit

If this requires new command behavior, new writer, provider call, terminal truth rewrite, or broad runtime rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Commit id if committed
6. Post repair verification requirement facts
7. Request and result facts
8. Original failure preservation
9. Repair apply preservation
10. Verdict candidate input facts
11. Loop consumption
12. Event and JSON projection
13. Save point and next turn carry forward
14. Product surface behavior
15. Truthfulness guardrails
16. Tests and validation pass or fail
17. Push attempted or not attempted
18. Remaining not-proven claims
19. Recommended next task

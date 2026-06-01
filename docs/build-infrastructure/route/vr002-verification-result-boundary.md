# VR002 Verification Result Boundary In Agent Loop

## Goal

Implement the first Verification and Repair behavior block after the audit.

This task connects task-relevant verification facts into the Agent Loop as observation and verdict-input facts.

It must not change command execution, command allowlists, repair apply, post-repair rerun, CLI behavior, provider behavior, edit behavior, or terminal truth rules.

Expected final status: COMPLETE.

## Why this task exists

The current verification system already has:

- command planning
- task relevance
- coverage facts
- authority gating
- dispatch through existing runtime and tool boundary
- runtime receipt evidence
- result classification
- failure classification
- repair eligibility facts

The Agent Loop currently has only default planned or not-run verification projection unless explicit verification facts are injected.

This task closes that gap.

## Owner domains

Primary owners:

- verification
- runtime/loop
- runtime/events
- evidence
- result
- presentation

Consumer-only or evidence-source domains:

- tools
- runtime/execution
- core/tools
- core/shell

Repair is a consumer for repair eligibility only.

Do not put verification truth into CLI, presentation, compatibility shims, provider, model, edit, or generic orchestration areas.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- verification command planning
- verification result boundary
- task-relevant verification surface
- verification failure classifier
- verification facade
- runtime loop contract and trajectory
- runtime events and JSON stream
- execution receipts
- tool result facts
- save point and next-turn facts
- product surface model and renderer
- evidence and result truth surfaces
- focused tests around these owners

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Verification boundary fact model

Add or refine a verification boundary fact model owned by verification.

It must represent:

- intent
- selected command
- selected_not_run
- blocked
- dispatched
- passed
- failed
- timed_out
- cancelled
- skipped
- unavailable
- task relevance
- coverage
- authority status
- runtime receipt ids
- failure class
- repair eligibility
- not-proven claims

Verification intent must remain separate from selected command, dispatch, result, and verdict.

### 2. Agent Loop consumption

Connect verification boundary facts into the Agent Loop trajectory as observation and verdict-input facts.

The loop may observe:

- verification requested
- verification selected
- verification not run
- verification dispatched
- verification result observed
- verification failed
- repair eligible
- verification blocked

The loop must not decide terminal success.

### 3. Event and JSON projection

Project verification observations through runtime events and JSON-safe stream entries.

Events must be observation-only.

They must not turn selected command, dispatch, exit zero, receipt presence, or rendered output into success.

### 4. Save point and next-turn facts

Verification facts may attach to save point and next-turn projections as observed facts.

Save point creation is not success.

Next-turn preparation is not success.

### 5. Product surface rendering

Product surface may display verification state.

It must preserve:

- selected but not run
- blocked
- failed
- passed as verification fact only
- repair eligible as not repair success
- not-proven claims

Presentation is a consumer only.

### 6. Truthfulness rules

Must preserve these rules:

- intent is not a run
- selected command is not a pass
- dispatch is not success
- receipt exists is not success
- exit zero is not task success
- tool execution is not verification success
- repair eligible is not repair success
- rendered output is not success
- result and evidence remain terminal truth owners

## Required tests

Add focused tests only.

Test categories:

1. Boundary states
   intent, selected_not_run, blocked, dispatched, passed, failed, timed_out, cancelled, skipped, and unavailable stay distinct.

2. Relevance and coverage
   exit zero without relevance or coverage cannot become success-shaped verification.

3. Runtime receipt linkage
   receipt ids are carried as evidence inputs only.

4. Failure class and repair eligibility
   failed task-relevant verification can expose repair eligibility without repair success.

5. Loop trajectory
   loop observes verification facts without becoming terminal success.

6. Runtime events and JSON stream
   verification observations are ordered, JSON-safe, and redacted.

7. Save point and next turn
   verification facts can be carried forward without success upgrade.

8. Product surface
   display keeps selected-not-run, blocked, failed, and not-proven visible.

9. Result truthfulness
   terminal status is not changed by observation-only verification facts.

## Architecture constraints

Hard rules:

- owner-domain-first
- no process or origin words in product filenames
- no external project names in product code or tests
- no compatibility shim growth
- no helper, utils, common, misc, or support dumping ground
- no command allowlist expansion
- no new command execution behavior
- no repair apply
- no post-repair rerun
- no provider calls
- no edit behavior changes
- no CLI behavior changes
- no session schema migration
- no SDK, RPC, TUI, browser, MCP, dynamic plugin, package loading, or new dependency work
- no terminal success outside evidence and result truth rules

## What not to do

Do not:

- execute verification commands for this implementation unless existing focused tests already do so safely
- call real provider
- read private provider config
- add command aliases
- add package scripts
- add JSON reports
- add verification scripts
- create new broad orchestration files
- move facts into presentation
- make result/verdict fabricate verification facts
- make repair proposal or apply facts

## Validation

Required:

- focused verification tests
- focused loop trajectory tests if loop facts change
- focused runtime event and JSON stream tests if events change
- focused save point or next-turn tests if carried facts change
- focused product surface tests if display changes
- result-contract gate if terminal/result behavior is touched
- build for touched package
- git diff check
- git status

A single push is allowed after validation passes. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- verification boundary facts exist or are refined in verification owner
- Agent Loop consumes those facts as observation and verdict input
- runtime events and JSON stream can expose verification observations safely
- save point and next-turn can carry verification facts without success
- product surface can render verification facts without becoming owner
- repair eligibility is visible but repair success is not claimed
- truthfulness guardrails are tested
- focused tests pass
- build passes
- diff check passes
- status is reported
- at most one push attempt after green validation

If this requires command behavior changes, repair apply, or terminal truth rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Verification boundary facts
6. Loop consumption
7. Event and JSON projection
8. Save point and next-turn carry-forward
9. Product surface behavior
10. Truthfulness guardrails
11. Tests and validation pass or fail
12. Push attempted or not attempted
13. Remaining not-proven claims
14. Recommended next task

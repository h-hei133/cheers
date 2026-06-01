# VR007 Loop Finalization Decision Boundary

## Goal

Connect result owned terminal projection from VR006 into Agent Loop finalization decisions.

VR006 derives terminal projection through evidence and result owners.

VR007 must let the Agent Loop consume that projection and decide whether the loop should stop, continue, await user action, or carry forward pending work.

Expected final status: COMPLETE.

## Scope

This task covers:

- loop finalization input facts
- stop and continue decision facts
- await user action facts
- pending handoff facts
- session carry forward facts
- next action projection
- runtime event and JSON projection
- product surface rendering
- truthfulness guardrails

This task must not derive terminal truth.

## Owner domains

Primary owners:

- runtime/loop
- result
- evidence
- session
- presentation

Consumer or source domains:

- verification supplies terminal input facts through result
- repair supplies preserved repair facts through result
- runtime/events projects observations

Do not put terminal truth into loop, session, presentation, CLI, provider, model, compatibility shims, generic orchestration areas, or shortcuts.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- result repair terminal projection from VR006
- evidence repair proof input from VR006
- runtime loop contract and trajectory
- loop final or stop decision surfaces if present
- session carry forward or continuation surfaces
- runtime events and JSON stream
- product surface model and renderer
- result and evidence truth tests

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Loop finalization input

Add or refine loop owned finalization input facts.

Represent:

- result projection id
- terminal status
- proof completeness
- original failure preservation status
- repair apply preservation status
- post repair verification preservation status
- missing proof items
- not-proven claims

Input is not terminal truth. It is consumed truth.

### 2. Finalization decision

Represent loop control decision:

- stop_complete
- stop_failed
- stop_blocked
- await_user
- continue_next_turn
- continue_repair
- continue_verification
- unsupported
- not_proven

Decision must be derived from result projection and pending handoff facts.

Loop decision is control flow, not terminal truth.

### 3. Session carry forward

Add session carry-forward facts if safe.

Represent:

- final status observed
- pending next action
- pending user authority
- pending verification
- pending repair
- preserved failure summary
- preserved not-proven claims

Do not migrate session schema.

Do not hide original failure.

### 4. Events and JSON projection

Project finalization decisions through runtime events and JSON-safe stream entries.

Events are observation-only.

They must not fabricate result truth.

### 5. Product surface rendering

Product surface may render:

- final loop decision
- terminal result from result owner
- pending next action
- preserved original failure
- missing proof items
- not-proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve:

- loop decision is not terminal truth
- stop_complete requires result-owned verified status
- continue_next_turn is not success
- await_user is not success
- rendered output is not success
- missing proof cannot be hidden
- original failure must remain visible
- result and evidence own terminal truth

## Required tests

Add focused tests only.

Test categories:

1. Complete result
   verified_with_repair projection can produce stop_complete control decision.

2. Incomplete result
   partial, blocked, failed, or not_proven cannot produce stop_complete.

3. Await user
   missing authority or user action produces await_user without success.

4. Continue decisions
   pending verification or repair can produce continue decisions without success.

5. Session carry forward
   finalization facts preserve original failure and not-proven claims.

6. Runtime events and JSON stream
   finalization observations are ordered, JSON-safe, and redacted.

7. Product surface
   rendered output shows result-owned status and loop-owned next action separately.

8. Result truthfulness
   loop finalization cannot rewrite result terminal projection.

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
- move terminal truth into loop or presentation
- hide original failure
- turn continue or await_user into success

## Validation

Required:

- focused loop tests
- focused result tests if result facts change
- focused session tests if carry forward changes
- focused runtime event and JSON stream tests if events change
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
- loop finalization input exists
- loop control decision exists
- verified result can produce stop_complete
- incomplete result cannot produce stop_complete
- pending action can produce await_user or continue decisions
- session carry forward preserves failure and not-proven claims if touched
- runtime events and JSON stream expose observations safely
- product surface renders result status and loop decision separately
- truthfulness guardrails are tested
- result-contract passes if result behavior is touched
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
6. Loop finalization input facts
7. Control decision facts
8. Session carry forward facts
9. Event and JSON projection
10. Product surface behavior
11. Truthfulness guardrails
12. Tests and validation pass or fail
13. Push attempted or not attempted
14. Remaining not-proven claims
15. Recommended next task

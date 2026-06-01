# VR008 Product Loop Closeout Boundary

## Goal

Connect loop finalization decisions from VR007 into the higher level product loop closeout path.

VR007 created loop owned finalization decisions from result owned terminal projection.

VR008 must let the product loop closeout path consume those decisions and carry safe closeout facts into session, event, and presentation surfaces.

Expected final status: COMPLETE.

## Scope

This task covers:

- product loop closeout input facts
- closeout decision consumption
- session carry forward facts
- next action facts
- final product surface facts
- runtime event and JSON projection
- result truth preservation
- original failure preservation
- not proven preservation

This task must not derive terminal truth.

## Owner domains

Primary owners:

- runtime loop
- result
- session
- presentation

Consumer domains:

- runtime events
- evidence
- core shell if a host adapter consumes closeout facts

Source domains:

- verification
- repair
- edit

Do not put terminal truth into CLI, presentation, session, generic orchestration areas, compatibility shims, provider, model, or edit.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- loop finalization facts from VR007
- result terminal projection from VR006
- runtime loop trajectory
- workflow coordination closeout seam
- shell session runtime host seam
- session carry forward and continuation surfaces
- runtime events and JSON stream
- product surface model and renderer
- evidence and result truth tests

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Product closeout input facts

Add or refine product closeout input facts.

Represent:

- loop decision id
- result projection id
- terminal status from result owner
- control decision from loop owner
- next action
- pending user action
- pending verification
- pending repair
- preserved original failure
- preserved repair facts
- missing proof items
- not proven claims

Input facts are not terminal truth.

### 2. Product loop closeout projection

Create or refine a closeout projection consumed by the product path.

Represent:

- complete
- failed
- blocked
- awaiting user
- continue next turn
- continue verification
- continue repair
- unsupported
- not proven

The projection must keep result owned terminal status separate from loop owned control decision.

### 3. Session carry forward

Carry forward safe facts only.

Represent:

- final observed status
- next action
- pending handoff
- original failure summary
- repair chain summary
- verification summary
- not proven claims

Do not migrate session schema.

Do not hide original failure.

### 4. Runtime event and JSON projection

Expose closeout observations through runtime events and JSON-safe stream entries.

Events are observation-only.

They must not fabricate result truth.

### 5. Product surface rendering

Render closeout facts through product surface.

Show separately:

- result owned terminal status
- loop owned control decision
- next action
- original failure
- repair chain facts
- missing proof items
- not proven claims

Presentation is a consumer only.

## Truthfulness rules

Must preserve:

- product closeout is not terminal truth
- loop decision is not terminal truth
- session carry forward is not terminal truth
- rendered output is not terminal truth
- complete closeout requires result owned verified status
- awaiting user is not success
- continue is not success
- missing proof cannot be hidden
- original failure must remain visible
- evidence and result own terminal truth

## Required tests

Add focused tests only.

Test categories:

1. Complete closeout
   result owned verified status plus stop complete can project complete closeout.

2. Incomplete closeout
   partial, blocked, failed, not proven, await user, or continue cannot become complete.

3. Separation
   result terminal status and loop control decision remain separate.

4. Session carry forward
   closeout preserves original failure, repair facts, next action, and not proven claims.

5. Runtime events and JSON stream
   closeout observations are ordered, JSON-safe, and redacted.

6. Product surface
   display shows closeout without becoming fact owner.

7. Result truthfulness
   closeout projection cannot rewrite result terminal projection.

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
- no CLI behavior rewrite
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
- move terminal truth into session, loop, shell, or presentation
- hide original failure
- turn awaiting user or continue into success

## Validation

Required:

- focused loop tests
- focused session tests if carry forward changes
- focused runtime event and JSON stream tests if events change
- focused product surface tests if display changes
- focused result tests if result facts change
- result contract gate if terminal or result behavior is touched
- build for touched package
- git diff check
- git status

Commit after green validation.

A single push is allowed after commit. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- product closeout input facts exist
- product closeout projection exists
- result status and loop decision remain separate
- session carry forward preserves failure and not proven claims if touched
- runtime events and JSON stream expose closeout safely
- product surface renders closeout safely
- incomplete states cannot become complete
- truthfulness guardrails are tested
- focused tests pass
- build passes
- diff check passes
- status is reported
- commit is created after green validation
- at most one push attempt after commit

If this requires command execution, repair apply, terminal truth rewrite outside evidence or result, or broad runtime rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Commit id if committed
6. Product closeout input facts
7. Closeout projection facts
8. Session carry forward facts
9. Event and JSON projection
10. Product surface behavior
11. Truthfulness guardrails
12. Tests and validation pass or fail
13. Push attempted or not attempted
14. Remaining not proven claims
15. Recommended next task

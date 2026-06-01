# VR009 Product Completion Packet

## Goal

Create a product completion packet for the full verification and repair behavior chain.

The previous tasks built the chain from verification facts through repair, post repair verification, evidence and result projection, loop finalization, and product closeout.

This task must connect those facts into one product level packet that can be consumed by the current product path without moving terminal truth away from evidence and result owners.

Expected final status: COMPLETE.

## Scope

This task covers:

- unified verification and repair completion packet
- current product path consumer
- session carry forward summary
- runtime event and JSON projection
- product surface rendering
- end to end focused regression scenario
- truthfulness guardrails

This task must not add new execution behavior.

## Owner domains

Primary owners:

- runtime loop
- result
- evidence
- session
- presentation

Source domains:

- verification
- repair
- edit
- runtime execution
- tools

Consumer domains:

- runtime events
- core shell only as host adapter

Do not put terminal truth into shell, presentation, session, loop, provider, model, edit, compatibility shims, or broad coordination areas.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- verification boundary facts
- repair handoff facts
- repair apply facts
- post repair verification facts
- evidence and result repair verdict projection
- loop finalization facts
- product closeout facts
- workflow coordination seam
- shell session host seam
- session carry forward surfaces
- runtime event and JSON stream
- product surface model and renderer
- result truth tests

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Completion packet

Add a product completion packet that preserves:

- result projection id
- terminal status from result owner
- loop decision
- closeout state
- original verification failure
- repair required facts
- proposal facts
- authority facts
- apply observations
- post repair verification facts
- missing proof items
- pending next action
- not proven claims

The packet is a product consumption object, not terminal truth.

### 2. Product path consumer

Wire one current product path seam to consume the packet.

Preferred consumers:

- loop finalization closeout path
- shell session product surface
- session carry forward surface
- runtime API projection

Do not rewrite the current product loop.

Do not let host adapters derive terminal status.

### 3. Session carry forward

Carry forward safe packet facts:

- final observed result status
- next action
- preserved failure summary
- repair chain summary
- verification summary
- pending handoff
- not proven claims

Do not migrate session schema.

### 4. Event and JSON projection

Expose packet observations through runtime events and JSON-safe stream entries.

Events are observations only.

### 5. Product surface

Render packet facts with separate sections for:

- result status
- loop decision
- closeout state
- original failure
- repair chain
- post repair verification
- missing proof
- next action
- not proven claims

Presentation remains a consumer only.

### 6. End to end focused regression

Add a focused in-process regression scenario that builds a complete packet from source facts through product closeout consumption.

Also add negative scenarios:

- missing authority
- missing apply
- missing post repair verification
- failed post repair verification
- verdict candidate only
- closeout only

None of these can become complete.

## Truthfulness rules

Must preserve:

- packet is not terminal truth
- product consumer is not terminal truth
- session carry forward is not terminal truth
- event emission is not terminal truth
- rendered output is not terminal truth
- complete packet requires result owned verified status
- incomplete proof cannot become complete
- original failure must remain visible
- evidence and result own terminal truth

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
- no CLI rewrite
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
- create broad coordination files
- move terminal truth into packet, shell, session, loop, or presentation
- hide original failure
- turn pending or incomplete states into complete

## Validation

Required:

- focused packet tests
- focused loop tests if loop facts change
- focused session tests if carry forward changes
- focused runtime event and JSON stream tests if events change
- focused product surface tests if display changes
- focused result tests if result facts change
- result contract gate if terminal or result behavior is touched
- build for touched package
- git diff check
- git status

Use the installed large task workflow aid for disciplined phase planning, telemetry, and self review if available, but do not add it to this project.

Commit after green validation.

A single push is allowed after commit. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- completion packet exists
- one current product path seam consumes the packet
- result status and loop decision remain separate
- session carry forward preserves failure and not proven claims if touched
- runtime events and JSON stream expose packet safely
- product surface renders packet safely
- complete chain can produce complete packet only from result owned verified status
- negative controls cannot become complete
- truthfulness guardrails are tested
- focused tests pass
- result contract passes if touched
- build passes
- diff check passes
- status is reported
- commit is created after green validation
- at most one push attempt after commit

If this requires command execution, repair apply, terminal truth outside evidence or result, or broad product loop rewrite, stop and report PARTIAL with exact reason.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Commit id if committed
6. Completion packet facts
7. Product path consumer
8. Session carry forward facts
9. Event and JSON projection
10. Product surface behavior
11. Negative controls
12. Truthfulness guardrails
13. Tests and validation pass or fail
14. Push attempted or not attempted
15. Remaining not proven claims
16. Recommended next task

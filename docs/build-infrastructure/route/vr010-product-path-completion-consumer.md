# VR010 Product Path Completion Consumer

## Goal

Wire the product completion packet from VR009 into the higher level product path consumer surfaces.

VR009 created a unified packet for the verification and repair behavior chain.

VR010 must make current product-level consumers able to read that packet safely, carry it through session and display boundaries, and prove that result ownership remains unchanged.

Expected final status: COMPLETE.

## Scope

This task covers:

- product path packet consumption
- shell or session host packet consumption
- session replay and continuation carry-forward
- product surface final rendering
- runtime event and JSON consistency
- end to end focused scenario
- negative controls
- behavior block closeout summary in code-facing tests or existing product surfaces

This task must not add new execution behavior.

## Owner domains

Primary owners:

- runtime loop
- result
- evidence
- session
- presentation
- core shell as host adapter only

Source domains:

- verification
- repair
- edit
- runtime events

Do not put terminal truth into shell, presentation, session, loop, provider, model, edit, compatibility shims, or broad coordination areas.

## Required inspection

Use targeted symbol inspection before editing.

Inspect:

- product completion packet
- loop finalization and closeout
- workflow coordination seam
- shell session runtime
- session replay and continuation facts
- session carry-forward state
- runtime event and JSON stream
- product surface model and renderer
- evidence and result terminal truth tests

If targeted inspection is unavailable, use targeted repository search and report it.

## Capability to build

### 1. Product path consumer

Add or refine one higher level product consumer for the packet.

Preferred consumers:

- current product loop closeout seam
- shell session host surface
- session replay or continuation surface
- runtime API projection if already present

The consumer must read packet facts only.

It must not derive terminal status.

### 2. Session carry-forward

Carry forward packet facts safely:

- result-owned terminal status
- loop-owned decision
- closeout state
- original failure summary
- repair chain summary
- post repair verification summary
- missing proof items
- next action
- not proven claims

Do not migrate session schema.

### 3. Host display integration

The host surface may render:

- result status
- loop decision
- closeout state
- original failure
- repair chain
- next action
- not proven claims

The host is a display adapter only.

### 4. Event and JSON consistency

Ensure packet, closeout, session carry-forward, and rendered surface agree with the same result status and loop decision.

Events and JSON entries are observations only.

### 5. End to end focused scenario

Add a focused in-process scenario that proves:

- complete chain produces a complete packet
- product consumer reads it
- session carry-forward preserves key facts
- surface renders key facts
- terminal truth remains result-owned

Add negative controls:

- packet without result verified status
- packet with missing apply
- packet with missing post repair verification
- closeout without packet
- session carry-forward only
- rendered surface only

None can become complete.

## Truthfulness rules

Must preserve:

- product consumer is not terminal truth
- session carry-forward is not terminal truth
- host display is not terminal truth
- event emission is not terminal truth
- complete product view requires result-owned verified status and complete packet
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

## Validation

Required:

- focused packet consumer tests
- focused session tests if carry-forward changes
- focused host surface tests if display changes
- focused runtime event and JSON stream tests if events change
- focused result tests if result facts change
- result contract gate if terminal or result behavior is touched
- build for touched package
- git diff check
- git status

Use spec_driven_develop only as a Codex-side planning and review aid. Do not add it to this project and do not write its name into product code, tests, docs, package scripts, or generated surfaces.

Commit after green validation.

A single push is allowed after commit. If push fails, do not retry.

## Completion criteria

COMPLETE requires:

- targeted inspection performed and reported
- higher level product consumer reads the packet
- result status and loop decision remain separate
- session carry-forward preserves failure and not proven claims if touched
- host surface renders packet-derived facts safely
- event and JSON observations remain consistent
- complete scenario passes only with result-owned verified status
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
6. Product consumer behavior
7. Session carry-forward behavior
8. Host display behavior
9. Event and JSON consistency
10. Negative controls
11. Truthfulness guardrails
12. Tests and validation pass or fail
13. Push attempted or not attempted
14. Remaining not proven claims
15. Recommended next task

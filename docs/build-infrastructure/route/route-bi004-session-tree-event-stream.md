# Build Infrastructure Route BI004: Session Tree Projection And Event Stream

## Goal

Implement the third Pi-inspired build-infrastructure route.

BI002 introduced frozen turn snapshot, runtime phase vocabulary, and evidence-only save point.
BI003 introduced execution error taxonomy, execution receipts, and tool result content/details split.

BI004 must now add the next runtime infrastructure layer:

- schema-neutral session tree projection
- host-neutral runtime event stream
- event projection from turn snapshot, save point, execution receipt, tool result, and session/result facts
- CLI/session consumption without changing the existing session storage schema

Expected final status: COMPLETE.

This route must improve architecture boundaries. It must not migrate the session store schema or create a new UI framework.

## Why this route exists

BI001 classified Pi session tree and event stream as adapt-later patterns.

After BI002 and BI003, the project now has enough structured runtime facts to project a session tree and event stream without rewriting the whole session system.

The goal is to build a safe projection layer first:

- current session model remains source of truth
- event stream is host-neutral
- tree projection is schema-neutral
- CLI/session can consume projected facts
- no storage migration is required

## Owner domains

Primary owners:

- session
- runtime
- runtime/events
- turn
- evidence
- result
- cli only for minimal consumption if needed

Allowed target areas:

- packages/ts-shell/src/session
- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/turn
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/core/shell only if display or session surface consumes projection

Do not put business logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- session runtime and SessionManager boundaries
- session continuation or replay surfaces
- core shell session runtime
- runtime turn boundary from BI002
- execution receipt and save point from BI003
- result projection and terminal truthfulness
- CLI/session output surface if consumption is needed

Inspect Pi reference repo only for targeted comparison:

- session tree entry types
- active leaf behavior
- build session context path
- compaction entry and branch summary behavior
- agent event stream types
- message start/update/end events
- tool execution events
- save point events if present

Do not broad dump either repo.

Record inspected symbols/files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Schema-neutral session tree projection

Add a projection that can describe current session state as a tree-like structure without changing storage.

It should support report-safe fields such as:

- session id or safe session identity
- node id or projected id
- parent id if known
- entry kind
- created order or timestamp if safe
- active leaf or active path if known
- branch summary availability
- compaction availability
- continuation state
- terminal state facts
- not-proven claims

It must not include:

- raw transcript dump
- provider secrets
- raw provider output
- raw oldText or newText
- unredacted command output
- hidden reasoning
- arbitrary file contents

If the current session storage is not tree-shaped, build a projection that represents the current linear path and explicitly marks tree branching as not-proven or not-supported.

Do not migrate the storage schema in this route.

### 2. Host-neutral runtime event stream

Add a small event model for runtime events.

Events should be host-neutral and not tied to CLI rendering.

Recommended event groups:

- turn snapshot created
- phase changed or phase rejected
- execution receipt created
- tool result projected
- save point created
- result facts observed
- session projection updated
- terminal verdict observed

Use local names that fit the project.

Events must be report-safe.

Events must not imply success unless the result/evidence layer already proves success.

### 3. Projection from BI002 and BI003 facts

Wire event emission or projection from existing facts:

- runtime turn snapshot
- runtime phase transition
- evidence-only save point
- execution receipt
- tool result split
- result or terminal facts
- session continuation facts if available

This route should prefer adapters or projection functions over rewriting the runtime loop.

### 4. CLI/session consumption

If practical, let the CLI/session product surface consume projected events or session tree projection.

Minimal acceptable consumption:

- tests prove a product seam can read projected events or session tree projection
- output or result surface can summarize projected facts safely

Do not redesign CLI UX.

Do not create a TUI package.

### 5. Truthfulness and redaction

Event stream and session tree projection are observations, not verdicts.

They cannot upgrade:

- provider called
- tool executed
- command exit zero
- save point created
- session node projected
- event emitted

into terminal success.

Success remains owned by evidence/verdict/result truthfulness.

## Required tests

Add focused tests only.

Test categories:

1. Session tree projection
   A current session or continuation surface projects a safe active path or linear path without raw transcript leakage.

2. Event stream redaction
   Events exclude provider secrets, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, and full file contents.

3. Event ordering
   A simple turn path emits or projects stable order for snapshot, execution receipt, save point, and result facts where applicable.

4. Truthfulness
   Event emission and session projection cannot produce terminal success.

5. Product integration
   A real local product seam consumes or exposes projection without route-local-only proof.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no session schema migration
- no broad runtime rewrite
- no provider default enablement
- no tool/edit/verification/browser/MCP expansion
- no new UI framework or TUI package split
- no Python runtime
- no contracts business logic
- no direct side-effect bypass outside ExecutionService or sanctioned owner
- no success outside evidence/verdict/result truthfulness

## What not to do

Do not:

- create a route runner
- create a verify route script
- create JSON capability reports
- migrate session JSONL or storage schema
- copy Pi session format directly
- copy Pi event names blindly
- introduce dynamic resources
- introduce extension loading
- redesign CLI
- rewrite SessionManager
- rewrite workflow coordinator
- move files just to look like Pi
- add browser or MCP behavior
- broaden command execution

## Validation

Required:

- focused tests for touched modules
- npm run verify:result-contract if result/session terminal behavior is touched
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Do not claim tests or build passed unless actually run.

## Completion criteria

BI004 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- a schema-neutral session tree or active-path projection exists in the proper owner domain
- a host-neutral runtime event model or projection exists
- BI002 turn/save-point facts and BI003 execution receipt facts can feed the event projection
- product seam can consume or expose the projection safely
- no session storage schema migration occurs
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires session schema migration or broad runtime rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Session projection design
6. Event stream design
7. BI002 and BI003 integration
8. Product seam consumption
9. Redaction behavior
10. Truthfulness behavior
11. Tests and validation pass/fail
12. Architecture constraints preserved
13. What was deliberately deferred to BI005
14. Recommended next route

## Next route

After BI004 is complete, continue with:

docs/build-infrastructure/route/route-bi005-static-resource-contract-experiment.md

BI005 should implement a static resource contract experiment for skills, prompt templates, provider metadata, and extension-like manifests without dynamic discovery, default loading, or plugin execution.

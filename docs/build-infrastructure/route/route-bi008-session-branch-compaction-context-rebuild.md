# Build Infrastructure Route BI008: Session Branch Compaction And Context Rebuild

## Goal

Implement the next Pi-inspired build-infrastructure route after BI007.

BI004 added schema-neutral active-path session projection and host-neutral runtime events, but explicitly left branching and compaction as not-proven.

BI008 must now define and implement the first safe layer of session branch, compaction, branch summary, and context rebuild semantics without forcing a storage schema migration.

Target capabilities:

- branch-capable session entry contract or projection
- active leaf and active path semantics
- compaction record contract
- branch summary contract
- context rebuild projection from active path
- session event integration
- truthfulness and redaction guardrails

Expected final status: COMPLETE.

This route is architecture infrastructure work, not a full session storage migration.

## Why this route exists

Pi's session model is one of its strongest architecture patterns:

- append-only entries
- id and parentId tree
- active leaf
- branch navigation
- branch summary
- compaction entry
- context rebuilding from active path
- extension state rebuilt from current branch

This project should adopt the semantics carefully, but not blindly copy Pi or rewrite storage first.

BI008 should create the semantic layer first.

## Owner domains

Primary owners:

- session
- session/continuation if present
- session/replay if present
- runtime/events
- context
- evidence
- result

Secondary owners only if needed:

- core/shell for minimal session display
- turn for active path correlation

Allowed target areas:

- packages/ts-shell/src/session
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/context
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/core/shell only for minimal display
- packages/ts-shell/src/turn only for correlation

Do not put branch or compaction logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- SessionManager
- session store or store access modules
- session replay runtime or replay builder
- session continuation modules
- session tree projection from BI004
- runtime event projection from BI004 and BI007
- context rebuild or read context surfaces
- result and evidence truthfulness surfaces
- core shell session runtime if display is needed

Inspect Pi reference repo with Serena:

- session entry types
- memory storage or JSONL storage
- active leaf mechanics
- get path to root or active path build
- compaction append and first kept entry
- branch summary append or moveTo
- build session context
- extension state or custom entries if relevant

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Branch-capable session entry contract

Define local branch-capable session entry semantics.

This may be a projection or contract layer, not storage migration.

Recommended fields:

- entry id
- parent id
- entry kind
- order or timestamp if safe
- active leaf marker
- active path marker
- branch summary availability
- compaction availability
- source session identity
- report-safe payload summary
- not-proven claims

If current storage is linear, represent it as a branch-capable active path with branching unsupported or not-proven.

Do not migrate storage schema in this route.

### 2. Active leaf and active path

Implement a report-safe active leaf and active path projection.

The active path should support:

- current linear path
- future branch-aware path
- path length
- entry kinds along path
- redaction status
- context rebuild readiness
- unsupported branch navigation claims

It must not include raw transcript dumps or hidden reasoning.

### 3. Compaction contract

Add a compaction record contract or projection.

It should represent:

- compaction id
- source active path or range summary
- first kept entry if available
- summary availability
- token or size metadata if safe
- redaction status
- evidence that compaction occurred or is only planned
- not-proven claims

Compaction summary is not truth by itself.

Compaction must not delete evidence required for result truthfulness.

### 4. Branch summary contract

Add a branch summary contract or projection.

It should represent:

- branch summary id
- source branch or path identity
- target location if known
- summary availability
- redaction status
- not-proven claims

Branch summary must not become success evidence.

### 5. Context rebuild projection

Implement a context rebuild projection from active path.

It should report:

- rebuild source
- active path entries considered
- compaction summaries considered
- branch summaries considered
- resource or tool details excluded or included by policy
- missing facts
- redaction status
- not-proven claims

This route should not rewrite the full context engine.

It should create a projection or seam that later implementation can consume.

### 6. Runtime event integration

Extend runtime event projection with session branch and compaction observations.

Possible event kinds:

- session active path projected
- session branch summary observed
- session compaction observed
- session context rebuild projected
- branch unsupported
- compaction unsupported

Events are observations, not verdicts.

### 7. Truthfulness and redaction

Session branch, compaction, and rebuild projections cannot upgrade:

- provider called
- tool executed
- apply attempted
- verification selected
- repair proposed
- session projected
- compaction summarized

into terminal success.

Success remains evidence, verdict, and result owned.

## Required tests

Add focused tests only.

Test categories:

1. Active path projection
   Linear session state can project a safe active path.

2. Branch unsupported truthfulness
   If branch storage is not implemented, projection marks branching unsupported or not-proven.

3. Compaction contract
   Compaction projection does not erase result/evidence truthfulness or leak raw transcript.

4. Branch summary contract
   Branch summary projection is report-safe and not success evidence.

5. Context rebuild projection
   Active-path context rebuild projection reports included and missing facts safely.

6. Runtime event integration
   Session branch or compaction observations can appear in host-neutral runtime events.

7. Redaction
   No provider secrets, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, full transcript dumps, or unsafe file contents.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no session storage migration unless explicitly proven safe and necessary
- no broad SessionManager rewrite
- no broad runtime rewrite
- no provider default enablement
- no tool/edit/verification/browser/MCP expansion
- no dynamic plugin execution
- no package loading
- no new dependencies
- no Python runtime
- no contracts business logic
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- migrate session storage schema by default
- copy Pi session format directly
- implement full branch navigation UI
- implement full compaction algorithm
- delete or rewrite transcript history
- rewrite SessionManager
- add dynamic extension state persistence
- add package/plugin loading
- create a route runner
- create a verify route script
- create JSON capability reports
- change provider/tool/edit/verification behavior
- move files just to look like Pi

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- git diff --check
- git status --short --branch

Run npm run verify:result-contract if result or terminal behavior is touched.

Do not claim tests or build passed unless actually run.

## Completion criteria

BI008 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- branch-capable session entry contract or projection exists
- active leaf and active path semantics are represented
- compaction contract or projection exists
- branch summary contract or projection exists
- context rebuild projection from active path exists
- runtime event projection can carry session branch or compaction observations
- branching or compaction gaps are explicitly marked not-proven where not implemented
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff --check passes
- no session schema migration occurs unless explicitly justified
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires schema migration or broad SessionManager rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Branch-capable entry design
6. Active leaf and active path design
7. Compaction contract design
8. Branch summary contract design
9. Context rebuild projection design
10. Runtime event integration
11. Redaction behavior
12. Truthfulness behavior
13. Tests and validation pass or fail
14. Architecture constraints preserved
15. What remains deliberately not-proven
16. Recommended next route

## Next route

After BI008 is complete, continue with:

docs/build-infrastructure/route/route-bi009-runtime-api-json-event-stream.md

BI009 should address programmatic runtime API, SDK/RPC-oriented boundaries, and JSON event stream surfaces without turning CLI into the runtime owner.

# Build Infrastructure Route BI009: Runtime API And JSON Event Stream

## Goal

Implement the next Pi-inspired build-infrastructure route after BI008.

BI002 introduced turn snapshots, phases, and save points.
BI003 introduced execution receipts and tool result split.
BI004 introduced runtime event projection.
BI007 introduced extension lifecycle and hook observation contracts.
BI008 introduced session active-path, branch, compaction, and context rebuild projections.

BI009 must now define a host-neutral runtime API and JSON event stream surface.

Target capabilities:

- host-neutral runtime session API boundary
- JSON-safe event stream projection
- CLI as one host, not runtime owner
- programmatic test seam
- event ordering and redaction contract
- integration with turn snapshots, save points, execution receipts, tool results, session projections, hook observations, and result facts

Expected final status: COMPLETE.

This route is infrastructure work. It must not create an SDK package or RPC server yet.

## Why this route exists

Pi exposes agent runtime through multiple hosts:

- interactive CLI
- JSON event stream
- RPC
- SDK embedding
- TUI

The current project has CLI/session surfaces and host-neutral event projections, but it still needs a clearer runtime API boundary that can later support JSON mode, RPC, SDK, and tests without making CLI the runtime owner.

BI009 builds the contract layer first.

## Owner domains

Primary owners:

- runtime
- runtime/events
- session
- result
- evidence
- cli or core/shell only as host adapter
- test harness only if needed

Allowed target areas:

- packages/ts-shell/src/runtime
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/session
- packages/ts-shell/src/result
- packages/ts-shell/src/evidence
- packages/ts-shell/src/core/shell only as consumer or host adapter
- packages/ts-shell/src/cli only if a CLI adapter exists

Do not put runtime API logic into compatibility shims.

Do not add route-numbered product files.

Do not use route, sprint, capstone, MVP, cut-through, closeout, or BI names in product code filenames.

## Required Serena inspection

Use Serena before implementation.

Inspect current project with targeted symbol/file inspection:

- ShellSessionRuntime and session product surface
- runtime event projection from BI004, BI007, BI008
- turn boundary from BI002
- execution receipt from BI003
- session tree/context rebuild projection from BI008
- result and evidence truthfulness surfaces
- CLI entry and print/session adapters only if needed
- existing JSON/print output if present

Inspect Pi reference repo with Serena:

- SDK session API
- RPC server or runtime interface
- JSON event stream
- agent event types
- session prompt API
- event ordering or streaming code
- TUI host adapter if relevant
- CLI host boundary if relevant

Do not broad dump either repository.

Record inspected symbols and files in the final report.

If Serena is unavailable, stop and report BLOCKED.

## Capability to build

### 1. Runtime session API boundary

Define a local host-neutral runtime session API contract.

It should describe operations such as:

- start or create session if local architecture supports it
- submit prompt or task
- observe runtime events
- abort or stop if existing architecture supports it
- get current safe session projection
- get result or terminal projection
- get active runtime capabilities
- get not-proven claims

This route may implement a minimal adapter over existing shell/session runtime.

It must not rewrite SessionManager or CLI.

It must not create a new SDK package.

### 2. JSON-safe event stream projection

Create a JSON-safe event stream representation.

It should include events from existing projections:

- turn snapshot created
- phase changed or rejected
- execution receipt created
- tool result projected
- save point created
- hook policy observed
- resource projection observed
- session active path projected
- branch or compaction observed
- context rebuild projected
- result facts observed
- terminal verdict observed

Event fields must be serializable and report-safe.

Events must include ordering or sequence information.

Events must not contain:

- API keys
- provider.env
- raw provider output
- raw oldText
- raw newText
- unredacted command output
- hidden reasoning
- full transcript dumps
- unsafe file contents

### 3. CLI as host adapter

If CLI/session surface is touched, keep it as a host adapter.

CLI may consume runtime API or event stream projection.

CLI must not become owner of runtime events, session tree, result truthfulness, or execution receipts.

### 4. Programmatic test seam

Add a small test-only or product-safe seam that can drive the runtime API contract without invoking full CLI.

It may be an in-process adapter.

It must not bypass evidence or result truthfulness.

It must not fake provider, tool, apply, verification, or repair success.

### 5. Event truthfulness

Event stream is observation, not verdict.

Events cannot upgrade:

- provider called
- tool executed
- command exit zero
- save point created
- session projected
- hook observed
- resource available

into terminal success.

Terminal success remains owned by evidence, verdict, and result layers.

## Required tests

Add focused tests only.

Test categories:

1. Runtime API contract
   A host-neutral runtime session adapter exposes safe operations without CLI ownership.

2. JSON event stream serialization
   Event stream entries serialize to JSON-safe structures.

3. Event ordering
   Events carry stable order or sequence.

4. Redaction
   Events exclude secrets, raw provider output, raw patch payloads, command output, hidden reasoning, transcripts, and unsafe file contents.

5. Truthfulness
   Events cannot produce terminal success without result/evidence verdict.

6. CLI host boundary
   If CLI/session is touched, tests prove CLI consumes projection but does not own it.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no process words in product code filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no new SDK package
- no RPC server yet
- no new TUI framework
- no session storage migration
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

- implement network RPC server
- create public SDK package
- create route runner
- create verify route script
- create JSON capability report
- copy Pi SDK or RPC layout directly
- rewrite CLI around the new API
- rewrite SessionManager
- add provider or tool behavior
- change verification, edit, browser, or MCP behavior
- enable live provider
- migrate session storage
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

BI009 is COMPLETE only if:

- Serena was used for targeted inspection of both current project and Pi
- host-neutral runtime session API boundary exists in the proper owner domain
- JSON-safe event stream projection exists
- events integrate BI002 to BI008 facts where available
- event ordering or sequence is represented
- CLI remains a host adapter, not runtime owner
- programmatic test seam exists or is explicitly unnecessary with reason
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- git diff --check passes
- no route-era product naming is introduced
- no compatibility shim grows business logic

If this requires SDK package creation, RPC server implementation, or broad runtime rewrite, stop and report PARTIAL or BLOCKED with exact reason.

## Final report

Include:

1. Final status
2. Serena inspection summary
3. Owner domains changed
4. Files changed
5. Runtime API boundary design
6. JSON event stream design
7. Event ordering design
8. CLI host adapter boundary
9. Programmatic test seam
10. Redaction behavior
11. Truthfulness behavior
12. Tests and validation pass or fail
13. Architecture constraints preserved
14. What remains deliberately not-proven
15. Recommended next route

## Next route

After BI009 is complete, continue with:

docs/build-infrastructure/route/route-bi010-provider-model-registry-compatibility.md

BI010 should address provider and model registry, compatibility flags, provider failure classification, fallback policy metadata, and per-request auth contract without default-enabling providers.

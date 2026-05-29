# Product Loop Route PL008: Session Context Rebuild And Continuation Hardening

## Goal

Implement the next Agent Loop product phase after PL007.

PL004 added model response and tool-call boundary.
PL005 added tool batch dispatch and tool result messages.
PL006 added save point, next-turn bundle, steering, follow-up, and delivery boundaries.
PL007 added verification and repair handoff observations.

PL008 must implement session context rebuild and continuation hardening as real loop input preparation.

Target phase:

session active path
-> context rebuild projection
-> continuation facts
-> next-turn input readiness
-> missing facts
-> replay-safe loop state
-> runtime event and JSON stream observation
-> product surface rendering

Expected final status: COMPLETE.

This route must not migrate session storage and must not claim context completeness as success.

## Why this route exists

The Agent Loop cannot approach the target architecture if every turn is effectively isolated.

The loop now has model boundary, tool batch, save point, next-turn bundle, verification and repair handoff. The next missing piece is making session and context facts usable as loop input preparation.

This route does not build a full session tree storage system. It strengthens the current session and context projections so the loop can safely prepare continuation without hiding missing facts.

## Owner domains

Primary owners:

- session
- context
- runtime/loop
- runtime/events
- turn
- evidence
- result

Consumer owners:

- presentation
- core/shell

Input owners used by projection:

- tools
- verification
- repair
- provider
- runtime/execution

Allowed target areas:

- packages/ts-shell/src/session
- packages/ts-shell/src/context
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/turn
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/presentation only as consumer
- packages/ts-shell/src/core/shell only as host consumer
- packages/ts-shell/src/tools only for input references
- packages/ts-shell/src/verification only for input references
- packages/ts-shell/src/repair only for input references
- packages/ts-shell/src/provider only for safe metadata references
- packages/ts-shell/src/runtime/execution only for receipt references

Do not put session context rebuild or continuation logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- sessionTreeProjection
- session replay builder or replay runtime
- session continuation modules
- session terminal state
- ShellSessionRuntime
- context session rebuild projection
- planning or context read surfaces if needed
- turn next-turn bundle
- turn delivery policy
- turn steering queue
- turn follow-up queue
- runtime loop agent loop contract
- runtime loop trajectory projection
- runtime loop infrastructure map
- runtime events projection
- JSON event stream
- runtime workflowExecutionCoordinator
- evidence runtime save point
- verification loop boundary
- repair loop boundary
- provider model response boundary
- tools tool result messages
- execution receipts
- product surface and renderer
- result and evidence truthfulness surfaces
- focused tests around session, context, loop, events, product surface, shell runtime

Inspect the local architecture study repository only for Agent Loop comparison if needed:

- session active path
- context rebuild from active path
- continuation or replay into next turn
- compaction and branch summary interaction
- save point and next turn input
- event emission around continuation

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Loop context rebuild input

Create or extend a report-safe context rebuild input for the Agent Loop.

It should represent:

- rebuild input id
- source session id or safe identity
- active path projection id
- next-turn bundle id if available
- save point id if available
- tool result message ids if available
- verification handoff ids if available
- repair handoff ids if available
- provider metadata ids if available
- resource or package metadata ids if already safe
- included facts summary
- excluded facts summary
- missing facts
- redaction state
- not-proven claims

It must not include:

- API keys
- provider.env
- auth headers
- raw provider output
- raw oldText
- raw newText
- unredacted command output
- hidden reasoning
- transcript dumps
- unsafe file contents

### 2. Context rebuild projection hardening

Harden the existing context rebuild projection so it can be used as next-turn preparation evidence.

It should distinguish:

- available context
- missing required facts
- missing optional facts
- excluded unsafe facts
- stale facts
- unsupported branch facts
- unsupported compaction facts
- redaction applied
- not-proven claims

Context rebuild projection cannot mean enough-context success.

Context rebuilt cannot mean task success.

### 3. Continuation readiness boundary

Add a continuation readiness boundary for the loop.

It should represent whether the current loop state is ready for a future continuation.

Required statuses:

- ready
- ready_with_missing_optional_facts
- blocked_missing_required_facts
- blocked_unsafe_context
- blocked_stale_session
- unsupported
- not_ready
- not_proven

Continuation readiness must not execute the next turn.

Continuation readiness must not imply provider success, tool success, verification success, repair success, or terminal success.

### 4. Replay-safe loop state summary

Add a replay-safe loop state summary.

It should include safe references to:

- active path
- latest save point
- next-turn bundle
- steering and follow-up queues
- tool result messages
- verification and repair handoffs
- context rebuild projection
- terminal result facts
- not-proven claims

It must not include raw transcript content or hidden reasoning.

This summary is for continuation and display, not for terminal verdict.

### 5. Branch and compaction gap handling

If storage-backed branch or compaction is not implemented, keep it explicit.

Represent:

- branch unsupported
- branch projection-only
- compaction unsupported
- compaction projection-only
- branch summary not-proven
- compaction summary not-proven

Do not migrate session storage schema.

Do not write compaction entries.

Do not rewrite transcript history.

### 6. Loop trajectory integration

Attach session context rebuild and continuation readiness facts to loop trajectory.

Trajectory may record:

- active path projected
- context rebuild input prepared
- context rebuild projection observed
- continuation readiness evaluated
- replay-safe loop state summarized
- branch and compaction gaps visible
- next turn still not executed by default
- not-proven claims

### 7. Runtime event and JSON stream integration

Add host-neutral events for:

- session active path observed
- context rebuild input prepared
- context rebuild projected
- continuation readiness evaluated
- replay-safe loop state summarized
- branch unsupported
- compaction unsupported
- unsafe context blocked
- missing required facts blocked
- missing optional facts observed

Events must remain JSON-safe.

Events must not imply task success.

### 8. Product surface rendering

Product surface should render session context and continuation readiness.

Expected sections:

- session
- context
- save point
- next action
- events
- not_proven
- verdict

Rendered output must distinguish:

- context available
- missing facts
- unsafe facts excluded
- stale facts
- continuation ready
- continuation blocked
- branch unsupported
- compaction unsupported
- success not proven

Presentation must not become fact owner.

### 9. CLI product path integration

If safe, workflowExecutionCoordinator or shell host surface may include default-safe session context rebuild and continuation readiness observations.

Do not execute next turn.

Do not call real provider.

Do not execute new tools.

Do not change edit, verification, or repair behavior.

Do not migrate session storage.

## Required tests

Add focused tests only.

Test categories:

1. Context rebuild input
   Builds a safe input from active path, next-turn bundle, save point, tool result messages, verification and repair handoffs.

2. Context rebuild projection
   Distinguishes available facts, missing required facts, missing optional facts, excluded unsafe facts, stale facts, and unsupported branch or compaction facts.

3. Continuation readiness
   ready, ready_with_missing_optional_facts, blocked_missing_required_facts, blocked_unsafe_context, blocked_stale_session, unsupported, not_ready, and not_proven are represented safely.

4. Replay-safe loop state
   Summary contains safe references and excludes raw transcripts, hidden reasoning, provider secrets, raw output, patch payloads, and command output.

5. Branch and compaction gaps
   Unsupported branch and compaction remain visible and cannot look implemented.

6. Trajectory integration
   Loop trajectory includes context rebuild, continuation readiness, replay-safe state, branch and compaction gaps.

7. Runtime events and JSON stream
   Events are ordered, JSON-safe, and observation-only.

8. Product surface
   Session and context readiness render clearly with not-proven claims.

9. CLI product path safety
   Any default-safe coordinator or shell integration does not change terminal state.

10. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

11. Result truthfulness
   active path projected, context rebuilt, continuation ready, replay state summarized, branch projected, and compaction projected cannot upgrade terminal success.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no real provider call
- no provider default enablement
- no manual provider.env read
- no provider streaming implementation
- no new model turn execution by default
- no arbitrary tool execution
- no command allowlist expansion
- no new real tools
- no browser or MCP expansion
- no edit behavior change
- no verification behavior expansion
- no repair behavior expansion
- no session schema migration
- no storage-backed branch implementation
- no storage-backed compaction implementation
- no transcript rewrite
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no product loop replacement
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- migrate session schema
- implement full branch navigation
- implement storage-backed compaction
- rewrite SessionManager
- rewrite ShellSessionRuntime
- replace workflowExecutionCoordinator
- execute a new model turn
- call real provider
- execute arbitrary tools
- implement verification command behavior
- implement repair apply behavior
- create route runner
- create verify script
- create JSON capability report
- add package scripts
- hide missing facts
- hide not-proven claims

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched
- git diff --check
- git status --short --branch

After all required validation passes and audit residue is clean, commit the changes with message:

pl008: add session context rebuild and continuation hardening

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL008 is COMPLETE only if:

- targeted inspection was performed and reported
- loop context rebuild input exists
- context rebuild projection is hardened
- continuation readiness boundary exists
- replay-safe loop state summary exists
- branch and compaction unsupported gaps remain visible
- loop trajectory observes session context rebuild and continuation facts
- runtime events and JSON stream observe the facts safely
- product surface renders session context and continuation readiness safely
- no session schema migration occurs
- no next turn execution occurs by default
- no provider call occurs
- no terminal success is manufactured
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If safe continuation hardening cannot be implemented without session schema migration or broad runtime rewrite, report PARTIAL and keep unsupported claims visible.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Context rebuild input design
6. Context rebuild projection hardening
7. Continuation readiness boundary
8. Replay-safe loop state summary
9. Branch and compaction gap handling
10. Trajectory integration
11. Runtime event and JSON stream integration
12. Product surface integration
13. CLI product path integration
14. Redaction behavior
15. Truthfulness behavior
16. Tests and validation pass or fail
17. Commit hash if committed
18. Architecture constraints preserved
19. What remains deliberately not-proven
20. Recommended next route

## Next route

After PL008 is complete, continue with:

docs/build-infrastructure/route/route-pl009-product-loop-adapter-consolidation.md

PL009 should consolidate the product loop adapter, define the future feature integration contract, and stop the Agent Loop block before switching to the next capability block.

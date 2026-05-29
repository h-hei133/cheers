# Product Loop Route PL009: Product Loop Adapter Consolidation

## Goal

Consolidate the Agent Loop product integration block after PL008.

PL002 connected the real CLI product path to loop observation.
PL004 added model response and tool-call boundary.
PL005 added tool batch dispatch and tool result messages.
PL006 added save point, next-turn bundle, steering, follow-up, and delivery boundaries.
PL007 added verification and repair loop handoff.
PL008 added session context rebuild and continuation hardening.

PL009 must now consolidate these phases into a stable product loop adapter boundary and define the future feature integration contract.

Expected final status: COMPLETE.

This route should stop the Agent Loop block from growing into an all-owning super-framework.

## Core purpose

PL009 is not another phase-expansion route.

It must answer:

- where the current product loop adapter lives
- which facts flow through it
- which owner domains still own truth
- how future feature blocks must connect to the loop
- what is product-integrated versus observation-only
- what is still not-proven
- how the CLI path exposes the unified loop state
- how to prevent future features from bypassing the loop spine

## Owner domains

Primary owners:

- runtime/loop
- runtime
- core/shell
- presentation
- evidence
- result

Referenced owner domains:

- provider
- tools
- runtime/execution
- turn
- session
- context
- verification
- repair
- runtime/events

Allowed target areas:

- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/presentation
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/provider only for safe metadata references
- packages/ts-shell/src/tools only for safe references
- packages/ts-shell/src/runtime/execution only for receipt references
- packages/ts-shell/src/turn only for next-turn references
- packages/ts-shell/src/session only for continuation references
- packages/ts-shell/src/context only for rebuild references
- packages/ts-shell/src/verification only for handoff references
- packages/ts-shell/src/repair only for handoff references
- packages/ts-shell/src/runtime/events only for observation references

Do not put adapter logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- workflowExecutionCoordinator
- runtime loop infrastructure map
- runtime loop trajectory projection
- agent loop contract
- model response boundary
- assistant response
- tool call batch
- tool batch dispatch
- tool result message
- next-turn bundle
- delivery policy
- steering and follow-up queues
- session context rebuild input and projection
- continuation readiness
- replay-safe loop state
- verification loop boundary
- repair loop boundary
- runtime event projection
- JSON event stream
- product surface renderer
- ShellSessionRuntime
- session terminal state
- result and evidence truthfulness
- focused tests around runtime loop, coordinator, shell, presentation, result contract

Inspect the local architecture study repository only if needed for final adapter consolidation comparison:

- product loop adapter
- event emission from loop phases
- session continuation handoff
- feature extension points
- host adapter boundary

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Product loop adapter contract

Create or consolidate a product loop adapter contract in the runtime loop owner domain.

It should represent the unified product loop state for the current CLI path.

It should include safe references to:

- prompt or task input summary
- turn snapshot
- model response boundary
- assistant accumulation
- tool-call batch
- tool dispatch plan
- tool result messages
- save point
- next-turn bundle
- steering queue
- follow-up queue
- delivery policy
- verification handoff
- repair handoff
- session active path
- context rebuild input
- continuation readiness
- replay-safe loop state
- runtime event ids
- JSON stream ids
- product surface section ids
- result facts
- not-proven claims

The adapter is a composition boundary, not a fact owner.

### 2. Product integration status map

Add a machine-local status map for Agent Loop phases.

Each phase must be classified as:

- product_integrated
- observation_only
- contract_only
- projection_only
- unsupported
- not_proven
- deferred

Phases to classify:

- CLI prompt input
- turn snapshot
- provider/model boundary
- assistant accumulation
- tool-call extraction
- before-tool policy
- tool dispatch
- execution receipt
- tool result details
- tool result messages
- save point
- next-turn bundle
- steering
- follow-up
- delivery policy
- verification handoff
- repair handoff
- session active path
- context rebuild
- continuation readiness
- replay-safe state
- runtime events
- JSON event stream
- product surface
- result truthfulness

Do not overclaim.

### 3. Future feature integration contract

Add a local contract for future feature blocks.

Every future feature route must declare:

- owner domain
- loop phase
- input facts
- output handoff facts
- runtime events
- evidence facts
- product surface section
- result truthfulness boundary
- not-proven claims
- forbidden shortcuts
- validation gates

This contract prevents future features from bypassing the loop spine.

The contract should be product architecture code or a strongly typed checklist, not just prose.

### 4. Shell and presentation consolidation

ShellSessionRuntime and product surface may consume the consolidated adapter.

They must remain host adapters and renderers, not fact owners.

Rendered output should show:

- unified loop phase summary
- product integration status
- not-proven claims
- next action
- terminal verdict from result/evidence only

Do not redesign CLI.

Do not build TUI.

Do not change interactive flow broadly.

### 5. Runtime event and JSON stream consolidation

Expose a consolidated loop adapter observation through runtime events and JSON stream if safe.

Events should show:

- adapter observed
- phase status summarized
- feature integration contract available
- unsupported phases visible
- not-proven claims visible

Events are observations only.

### 6. Continuation and session boundary

If safe, attach replay-safe loop state and continuation readiness to the adapter as references.

Do not migrate session storage.

Do not persist new schema.

Do not implement storage-backed branching or compaction.

Do not claim continuation success from readiness.

### 7. Stop condition for Agent Loop block

Create or update docs under docs/build-infrastructure:

- product-loop-agent-loop-block-closeout.md

This document must state:

- what PL002 to PL009 completed
- what remains not-proven
- why the Agent Loop block should stop here
- how future capability blocks must connect through the feature integration contract
- recommended next capability block

This is the only documentation deliverable required by PL009.

## Required tests

Add focused tests only.

Test categories:

1. Product loop adapter contract
   Unified adapter includes safe references to all PL002 to PL008 phases.

2. Phase status map
   Phase statuses classify product-integrated, observation-only, contract-only, projection-only, unsupported, not-proven, and deferred correctly.

3. Future feature integration contract
   Valid feature integration declarations pass; missing owner domain, loop phase, evidence boundary, product surface section, or truthfulness boundary fail.

4. Shell consumption
   Shell or terminal state consumes adapter without becoming fact owner.

5. Product surface rendering
   Product surface renders unified loop summary and phase status without hiding not-proven claims.

6. Runtime event and JSON stream
   Adapter observation and phase status are JSON-safe and observation-only.

7. Continuation boundary
   replay-safe state and readiness can be referenced without implying continuation success.

8. Truthfulness
   Adapter observed, phase product-integrated, feature contract valid, replay state summarized, and product surface rendered cannot upgrade terminal success.

9. Redaction
   No API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

10. Regression safety
   Existing PL002 to PL008 focused tests remain green if touched.

## Architecture constraints

Hard rules:

- owner-domain-first
- no route-numbered product files
- no external-origin product naming
- no process words in product filenames
- no compatibility shim growth
- no helper, utils, common, misc, support dumping ground
- no product loop replacement
- no workflowExecutionCoordinator rewrite beyond adapter consumption
- no ShellSessionRuntime rewrite beyond host-adapter consumption
- no SessionManager rewrite
- no session schema migration
- no storage-backed branch implementation
- no storage-backed compaction implementation
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
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- keep expanding Agent Loop phases beyond PL008
- replace the product loop
- turn runtime loop into owner of provider, tool, context, session, verification, repair, or result truth
- implement storage persistence
- implement provider streaming
- implement real next-turn execution
- implement SDK or RPC server
- implement browser or MCP tools
- create route runner
- create verify script
- create JSON capability report
- add package scripts
- hide not-proven claims
- overclaim Agent Loop completion

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract
- git diff --check
- git status --short --branch

After all required validation passes and audit residue is clean, commit the changes with message:

pl009: consolidate product loop adapter

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL009 is COMPLETE only if:

- targeted inspection was performed and reported
- product loop adapter contract exists
- product integration status map exists
- future feature integration contract exists
- Shell or product surface consumes the consolidated adapter safely
- runtime events or JSON stream can observe the adapter safely
- replay-safe state and continuation readiness remain references, not success
- product-loop-agent-loop-block-closeout.md is created or updated
- PL002 to PL008 phases are summarized honestly
- future capability blocks have a required loop integration contract
- no new phase expansion occurs
- no product loop replacement occurs
- no terminal success is manufactured
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- result-contract passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If consolidation requires broad rewrites, report PARTIAL and keep current adapter seams visible.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Product loop adapter contract
6. Product integration status map
7. Future feature integration contract
8. Shell and presentation consumption
9. Runtime event and JSON stream integration
10. Continuation boundary
11. Agent Loop block closeout summary
12. Redaction behavior
13. Truthfulness behavior
14. Tests and validation pass or fail
15. Commit hash if committed
16. Architecture constraints preserved
17. What remains deliberately not-proven
18. Recommended next capability block

## Next route

After PL009 is complete, stop the Agent Loop block.

Recommended next capability block:

Context and Planning Quality Block

The first route should audit and plan how context discovery, repository understanding, planning quality, target selection, and memory reuse connect to the product loop adapter without becoming a separate loop.

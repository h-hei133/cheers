# SP007 Complete Session Branch Compaction Runtime

## Goal

Build the complete session, branch, and compaction runtime.

This is a major capability-system task. It must move session behavior from projection and replay-safe summaries toward durable branch and compaction behavior that can drive continuation, context rebuild, provider request preparation, runtime events, replay, product surface, CLI/session status, and truth preservation.

This task is not complete if it only adds branch metadata, only adds compaction display text, only writes docs, only adds a projection helper, or only proves isolated storage helpers.

## Capability Target

The completed capability must support this controlled lane:

user turn input
-> session record append
-> active leaf resolution
-> branch creation or branch switch
-> compaction record creation
-> safe summary and retained context projection
-> context rebuild
-> continuation readiness
-> provider request preparation
-> runtime loop continuation
-> runtime events
-> replay-safe carry-forward
-> product surface
-> CLI/session status envelope
-> evidence/result truth boundary

Synthetic fixtures may drive the lane. Do not run live providers.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- session/store
- session/replay
- session/continuation
- session/presentation
- context
- planning
- provider/request
- runtime/loop
- runtime/events
- presentation/surface
- core/shell
- evidence
- result
- policy

Change at least seven rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/session
- packages/ts-shell/src/session/store
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/continuation
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/context
- packages/ts-shell/src/planning
- packages/ts-shell/src/provider/request
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/presentation/surface
- packages/ts-shell/src/core/shell
- nearby owner tests

## Required Runtime Behavior

Implement complete branch and compaction runtime behavior with these properties:

1. Session records can represent parent and child turn relationships.
2. Active leaf resolution is explicit and safe.
3. Branch creation and branch switching are represented as durable session facts.
4. Compaction records distinguish retained context, excluded context, summary text, stale inputs, unsafe inputs, missing facts, unsupported inputs, and summary provenance.
5. Context rebuild consumes branch and compaction facts rather than raw hidden transcript assumptions.
6. Continuation readiness can proceed, block, or warn based on branch and compaction facts.
7. Provider request preparation receives safe continuation and compaction blockers.
8. Runtime loop can continue, wait for user, block, or fail without owning terminal truth.
9. Replay carries safe branch and compaction facts only.
10. Product surface and CLI/session status show active branch, compaction status, retained or missing context, blockers, and next action.
11. Evidence/result remains the only terminal truth owner.
12. Summaries are context aids, not verification evidence or task success.
13. Redaction excludes raw transcript, raw provider output, raw command output, raw edit text, patch bodies, and secrets.

## Required State Coverage

Tests must cover at least these states:

- new session root
- append child turn
- branch created from prior turn
- active leaf switched
- active leaf missing
- branch parent missing
- compaction created
- compaction retained safe context
- compaction excluded unsafe context
- compaction stale
- compaction unsupported
- compaction summary missing
- context rebuild from active leaf
- continuation allowed from safe branch and compaction facts
- continuation blocked by stale or unsafe compaction
- provider request blocked by branch or compaction readiness
- replay carries branch and compaction safe facts
- product surface and CLI/session status render branch and compaction state
- branch or compaction facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least three integration tests:

1. Resume happy lane: session has a root and child turn, active leaf resolves, safe compaction exists, context rebuild succeeds, continuation readiness passes, provider request preparation receives safe facts, events/replay/status/surface agree, terminal success remains false without evidence/result proof.

2. Branch switch lane: session creates or selects an alternate leaf, replay and context rebuild use the selected leaf, product surface and CLI/session status show active branch facts, and no summary or branch fact claims task success.

3. Blocked compaction lane: stale, unsafe, unsupported, or missing compaction facts block continuation or request preparation; events/replay/status/surface show blockers; terminal success remains false.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- session record appended
- branch created
- active leaf selected
- compaction created
- summary produced
- context rebuild succeeded
- continuation readiness passed
- provider request prepared
- runtime continued
- event emitted
- replay carried forward
- product surface rendered
- CLI/session status rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- add broad SDK or RPC server behavior
- broaden command allowlists
- add new writer behavior
- bypass sanctioned session, context, provider, or execution owners
- hide behavior in compatibility shims
- make terminal text the runtime API
- weaken tests or mass-rebaseline snapshots

If durable session schema changes are needed, keep migration and backward compatibility explicit and tested. Do not silently break existing session replay.

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven storage-backed branch and compaction runtime
- still unproven host SDK or RPC contract if not completed
- still unproven broad real-provider compatibility if not completed
- still unproven broad parallel mutation if not completed
- still unsupported dynamic execution areas

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- session store tests
- session replay tests
- session continuation tests
- context rebuild tests
- provider request tests
- runtime loop tests
- runtime event tests
- CLI/session status tests
- product surface tests
- evidence/result truth tests if terminal status mapping changes
- anti-false-success gate
- package build if imports, contracts, session schemas, or runtime-facing types changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Durable branch and compaction runtime facts exist.
2. Active leaf, branch switching, compaction records, context rebuild, continuation readiness, provider request preparation, events, replay, product surface, and CLI/session status are connected.
3. At least three integration tests prove resume happy lane, branch switch lane, and blocked compaction lane.
4. At least eighteen required states are covered by tests.
5. At least seven owner domains are changed or justified as already compliant.
6. Existing session replay compatibility is preserved or explicitly migrated and tested.
7. Events, replay, product surface, and CLI/session status consume the same branch and compaction facts.
8. Terminal truth remains evidence/result owned.
9. Report-safe surfaces redact unsafe content.
10. No live provider or secret access occurs.
11. Sprint docs are updated by editing stale claims.
12. Focused validation and diff checks pass.
13. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- branch and compaction runtime implemented
- states covered
- integration tests added
- files changed
- schema or compatibility handling
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

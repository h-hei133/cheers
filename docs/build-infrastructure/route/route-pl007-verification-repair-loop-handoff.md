# Product Loop Route PL007: Verification And Repair Loop Handoff

## Goal

Implement the next Agent Loop product phase after PL006.

PL004 added model response and tool-call boundary.
PL005 added tool batch dispatch and tool result messages.
PL006 added post-tool save point, next-turn bundle, steering, follow-up, and delivery boundaries.

PL007 must implement the next loop boundary:

tool result and next-turn facts
-> verification intent
-> verification handoff
-> verification result observation
-> repair-required handoff
-> repair proposal or repair iteration observation
-> post-repair verification handoff observation
-> loop trajectory and event observation
-> product surface rendering

Expected final status: COMPLETE.

This route must not manufacture success.

## Why this route exists

The Agent Loop is not complete if verification and repair remain outside the loop.

The current project already has verification and repair capabilities in separate product seams. PL007 should not rewrite them. PL007 should connect them to the Agent Loop as explicit loop phases and handoff facts.

The key rule:

verification selected is not verification passed
command exit zero is not task success unless the verification owner proves relevance
repair proposed is not repair applied
repair applied is not verified repair success
repair continuation is not repair success
rendered output is not success

## Owner domains

Primary owners:

- verification
- repair
- runtime/loop
- runtime/events
- evidence
- result
- turn

Consumer owners:

- presentation
- core/shell

Input owners used by projection:

- tools
- runtime/execution
- session
- context

Allowed target areas:

- packages/ts-shell/src/verification
- packages/ts-shell/src/repair
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- packages/ts-shell/src/turn
- packages/ts-shell/src/presentation only as consumer
- packages/ts-shell/src/core/shell only as host consumer
- packages/ts-shell/src/tools only for input references
- packages/ts-shell/src/runtime/execution only for receipt references
- packages/ts-shell/src/session only for projection references
- packages/ts-shell/src/context only for projection references

Do not put verification or repair loop logic into compatibility shims.

Do not add route-numbered product files.

Do not use process or origin words in product code filenames.

## Required inspection

Use Serena targeted inspection before editing.

Inspect current project:

- verification command stage
- task relevant verification route
- verification failure classifier
- verification repair flow
- verification repair iteration flow
- repair result or repair handoff surfaces
- result and evidence truthfulness surfaces
- evidence runtime save point
- runtime loop agent loop contract
- runtime loop trajectory projection
- runtime loop infrastructure map
- runtime events projection
- runtime events JSON stream
- turn next-turn bundle
- turn delivery policy
- tool result messages
- execution receipts
- session active path projection
- context rebuild projection
- workflowExecutionCoordinator
- product surface and terminal renderer
- focused tests around verification, repair, loop, events, product surface, result contract

Inspect the local architecture study repository only for Agent Loop comparison if needed:

- verification or command result handoff
- repair loop handoff
- failed tool or verification retry
- next-turn repair preparation
- event emission around failure and recovery
- save point around repair boundary

Do not broad dump either repository.

Report inspected symbols and files in the final report.

If Serena is unavailable, continue with targeted local search and report that honestly.

## Capability to build

### 1. Verification intent boundary

Add a report-safe verification intent boundary for the Agent Loop.

It should represent:

- intent id
- source turn or trajectory id
- verification target summary
- verification kind
- command candidate summary if available
- owner domain
- authority requirement
- dispatch status
- relevance status
- redaction status
- not-proven claims

Required dispatch statuses:

- planned
- selected
- authority_required
- dispatched
- passed
- failed
- blocked
- unsupported
- not_run

Required relevance statuses:

- task_relevant
- probably_relevant
- unrelated
- unknown
- not_proven

Selecting verification is not success.

A verification command exit zero is not task success unless the verification owner marks it task relevant and result/evidence owners accept it.

### 2. Verification handoff

Connect verification intent to existing verification owner seams.

Allowed:

- existing task-relevant verification route
- existing command stage projection
- existing failure classifier
- existing execution receipt facts
- fake/default-safe verification fixture if clearly labeled
- observation-only product seam

Not allowed:

- command allowlist expansion
- arbitrary shell execution
- new command dispatch behavior
- provider call
- edit behavior change
- repair behavior change before the repair handoff boundary

If safe verification dispatch is not available, mark not_run, blocked, or unsupported.

### 3. Verification result observation

Add a report-safe verification result observation.

It should include:

- verification id
- execution receipt id if available
- status
- relevance status
- failure class if failed
- safe summary
- redaction state
- not-proven claims

Required statuses:

- passed
- failed
- blocked
- not_run
- unsupported
- selected_not_run
- relevance_rejected

Passed verification is still not terminal success unless result/evidence owners derive success.

### 4. Repair-required handoff

When verification fails or is blocked in a repairable way, create repair-required handoff facts.

It should include:

- repair handoff id
- source verification id
- failure class
- original failure preserved marker
- repairability status
- suggested repair mode
- authority requirement
- redaction state
- not-proven claims

Required repairability statuses:

- repair_required
- repair_possible
- repair_not_available
- unsupported
- not_proven

Repair-required is not repair success.

### 5. Repair proposal observation

Connect to existing repair owner seams as observation.

It may include:

- repair proposal id
- source failure id
- proposal source
- target summary
- exactness or readiness status if available
- authority requirement
- apply status
- redaction state
- not-proven claims

Allowed proposal sources:

- deterministic_from_failure_evidence
- deterministic_from_product_read_evidence
- existing_repair_owner_projection
- fake_default_safe
- unavailable

Forbidden as success evidence:

- route-local hardcoded proposal
- raw provider output
- proposal-only success
- repair continuation-only success

Repair proposal is no-write evidence unless existing repair owner proves otherwise.

### 6. Repair apply and post-repair verification handoff observation

Represent repair apply and post-repair verification as loop handoff facts only.

It should include:

- repair apply status
- repair authority status
- post-repair verification status
- original failure preserved marker
- not-proven claims

Required apply statuses:

- not_applied
- authority_required
- applied
- failed
- blocked
- unsupported
- not_proven

Required post-repair verification statuses:

- not_run
- passed
- failed
- blocked
- unsupported
- not_proven

Applied repair without post-repair verification cannot be success.

Post-repair verification passed still must go through result and evidence truthfulness.

### 7. Loop trajectory integration

Attach verification and repair handoff facts to loop trajectory.

Trajectory may record:

- verification intent planned
- verification selected
- verification dispatched or not run
- verification result observed
- repair-required handoff created
- repair proposal observed
- repair apply observed
- post-repair verification observed
- original failure preserved
- terminal success not derived by trajectory
- not-proven claims

### 8. Runtime event and JSON stream integration

Add host-neutral runtime events for:

- verification intent planned
- verification selected
- verification dispatched
- verification result observed
- verification relevance rejected
- repair required
- repair proposal observed
- repair authority required
- repair apply observed
- post-repair verification observed
- original failure preserved

Events must be JSON-safe.

Events must not imply terminal success.

### 9. Product surface rendering

Product surface should render verification and repair handoff phases.

Expected sections:

- verification
- repair
- authority
- events
- not_proven
- next_action
- verdict

Rendered output must distinguish:

- verification selected
- verification not run
- verification passed
- verification failed
- repair required
- repair proposed
- repair applied
- post-repair verification not run
- success not proven

Presentation must not become fact owner.

### 10. CLI product path integration

If safe, workflowExecutionCoordinator may include fake/default-safe verification and repair handoff observations in the existing loop trajectory.

Do not execute new verification commands unless an existing sanctioned test seam already does so.

Do not change verification command selection.

Do not change repair apply behavior.

Do not call real provider.

Do not execute new tools.

## Required tests

Add focused tests only.

Test categories:

1. Verification intent
   planned, selected, authority_required, not_run, unsupported, and dispatched states are represented safely.

2. Verification relevance
   task_relevant, unrelated, unknown, and not_proven relevance states are preserved.

3. Verification result
   passed, failed, blocked, not_run, selected_not_run, unsupported, and relevance_rejected are represented without terminal success.

4. Repair-required handoff
   failed verification creates repair-required or repair-possible handoff while preserving original failure.

5. Repair proposal observation
   proposal-only and continuation-only do not become success.

6. Repair apply and post-repair verification
   repair applied without post-repair verification remains not success.

7. Trajectory integration
   loop trajectory includes verification and repair handoff facts.

8. Runtime events and JSON stream
   events are ordered, JSON-safe, and observation-only.

9. Product surface
   verification and repair phases render clearly with not-proven claims.

10. CLI product path safety
   any default-safe coordinator integration does not change terminal state.

11. Redaction
   no API keys, provider.env, auth headers, raw provider output, raw oldText, raw newText, unredacted command output, hidden reasoning, transcript dumps, or unsafe file contents.

12. Result truthfulness
   command exit zero, verification selected, verification passed observation, repair proposed, repair applied, and rendered repair success wording cannot upgrade terminal success unless result/evidence owners derive it.

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
- no arbitrary tool execution
- no command allowlist expansion
- no new real tools
- no browser or MCP expansion
- no edit behavior change
- no verification behavior expansion beyond handoff observation
- no repair behavior expansion beyond handoff observation
- no session schema migration
- no SDK or RPC server
- no TUI
- no dynamic plugin execution
- no package loading
- no new dependencies
- no product loop replacement
- no success outside evidence, verdict, and result truthfulness

## What not to do

Do not:

- call real provider
- execute arbitrary verification commands
- broaden verification command policy
- apply repair automatically
- treat repair proposal as repair success
- treat repair apply as verified success
- implement provider streaming
- implement full product loop replacement
- replace workflowExecutionCoordinator
- rewrite ShellSessionRuntime
- rewrite SessionManager
- add package scripts
- create route runner
- create verify script
- create JSON capability report
- hide not-proven claims

## Validation

Required:

- focused tests for touched modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract if result, terminal, session output, or result classification behavior is touched
- git diff --check
- git status --short --branch

After all required validation passes and audit residue is clean, commit the changes with message:

pl007: add verification and repair loop handoff

Do not push.

Do not commit failing states.

Do not claim tests passed unless actually run.

## Completion criteria

PL007 is COMPLETE only if:

- targeted inspection was performed and reported
- verification intent boundary exists
- verification handoff to existing owner seams exists
- verification result observation exists
- repair-required handoff exists and preserves original failure
- repair proposal observation exists
- repair apply and post-repair verification handoff observation exists
- loop trajectory observes verification and repair handoff facts
- runtime events and JSON stream observe verification and repair handoff safely
- product surface renders verification and repair handoff safely
- command exit zero cannot manufacture success
- repair proposal cannot manufacture success
- repair apply without post-repair verification cannot manufacture success
- no provider call occurs
- no command allowlist expansion occurs
- no terminal success is manufactured
- redaction tests pass
- truthfulness tests pass
- focused tests pass
- build passes
- diff check passes
- commit is created after green validation
- no route-era or external-origin product naming is introduced
- no compatibility shim grows business logic

If safe verification or repair handoff cannot be implemented without broad behavior change, report PARTIAL and keep unsupported claims visible.

## Final report

Include:

1. Final status
2. Inspection summary
3. Owner domains changed
4. Files changed
5. Verification intent design
6. Verification handoff design
7. Verification result observation
8. Repair-required handoff
9. Repair proposal observation
10. Repair apply and post-repair verification handoff
11. Trajectory integration
12. Runtime event and JSON stream integration
13. Product surface integration
14. CLI product path integration
15. Redaction behavior
16. Truthfulness behavior
17. Tests and validation pass or fail
18. Commit hash if committed
19. Architecture constraints preserved
20. What remains deliberately not-proven
21. Recommended next route

## Next route

After PL007 is complete, continue with:

docs/build-infrastructure/route/route-pl008-session-context-rebuild-continuation-hardening.md

PL008 should implement session context rebuild and continuation hardening as real loop input preparation, without migrating session storage or claiming context completeness as success.

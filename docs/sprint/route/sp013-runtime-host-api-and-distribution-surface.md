# SP013 Runtime Host API And Distribution Surface

## Goal

Build the complete runtime host API and distribution surface on top of the existing in-process host contract and deterministic evaluation runtime.

This is a major capability-system task. It must make the proven host command contract usable from stable non-interactive entrypoints, JSON output, package smoke checks, and distribution readiness checks without turning terminal prose into an API and without enabling dynamic execution.

This task is not complete if it only adds command flags, only changes JSON fields, only writes docs, only adds a smoke script, or only proves isolated serializers.

## Capability Target

The completed capability must support this controlled lane:

non-interactive host request
-> command envelope validation
-> session selection or creation
-> runtime host execution
-> provider, tool, mutation, branch, and evaluation lanes when requested
-> structured event stream
-> status snapshot
-> final response envelope
-> exit classification
-> package smoke check
-> distribution readiness result
-> replay-safe facts
-> evidence/result truth boundary

Live providers remain default-off. Dynamic execution, external tool servers, browser automation, and broad SDK server behavior remain out of scope unless explicitly bounded by this task.

## Four-Level Component Adoption

Keep the four-level adoption model:

1. Dependency use
2. Structured port
3. Isolated source adoption
4. Behavior-only alignment

Prefer dependency use or structured port for command envelope parsing, JSON framing, smoke harness structure, and exit classification when it is compatible with owner boundaries.

Direct source adoption is allowed only when license and notice requirements can be satisfied without violating this task's naming and content constraints. If required notices or copied files would require disallowed names or content, do not copy source. Use structured port or behavior-only alignment instead.

Every adopted or ported behavior must update docs/sprint/component-adoption-log.md with selected mode, owner domain, reason, rejected alternatives, expected callers, side-effect boundary, truthfulness boundary, validation evidence, and rollback plan if unsafe.

Do not put process wording, comparison wording, provenance wording, or outside project names into product code names, runtime fields, user-visible output, product file names, or product content.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/component-adoption-log.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- cli
- core/shell
- runtime/api
- runtime/events
- runtime/evaluation
- runtime/loop
- session/store
- session/replay
- session/presentation
- provider/request
- provider/response
- tools
- edit
- verification
- repair
- evidence
- result
- presentation
- scripts
- package metadata

Change at least eight rightful owner domains unless the final report proves one inspected owner already satisfies required behavior without code changes.

## Required Runtime Behavior

Implement a stable non-interactive host API and distribution surface with these properties:

1. Non-interactive command entrypoint accepts structured input without scraping terminal prose.
2. Host request validation distinguishes valid, invalid, unsupported, missing session, unsafe mode, provider blocked, and execution blocked.
3. Output envelope separates events, status snapshot, final response, result summary, diagnostics, blockers, redacted details, replay facts, and truth facts.
4. JSON output has stable schema metadata, version, command id, session id, turn id, ordering, severity, event category, and terminalSuccessClaim.
5. Exit classification distinguishes success proof, completed without proof, blocked, failed, invalid input, unsupported, cancelled, stopped, and internal error.
6. Package smoke checks verify importability, CLI entrypoint availability, host command availability, JSON output shape, default-off provider behavior, and redaction.
7. Distribution readiness reports passed, failed, blocked, skipped, unsupported, and not-proven.
8. Host API can run deterministic evaluation cases through package or CLI smoke without live provider credentials.
9. Terminal rendering may consume host facts but terminal text is not the machine API.
10. Evidence/result remains the only terminal truth owner.
11. Report-safe surfaces redact raw transcript, provider output, command output, edit text, patch bodies, hidden reasoning, secrets, tokens, headers, and private paths.

## Required State Coverage

Tests must cover at least these states:

- valid non-interactive start
- valid continue
- status command
- list heads
- inspect summary
- run evaluation case
- invalid input
- unsupported command
- missing session
- provider blocked
- tool blocked
- mutation blocked
- branch or compaction blocked
- cancelled
- stopped
- completed without proof
- result-owned complete proof
- JSON schema metadata present
- event ordering stable
- redaction enforced
- terminal text not API
- package import smoke
- CLI entrypoint smoke
- host command smoke
- default provider off
- distribution readiness passed
- distribution readiness blocked
- evaluation case passed
- evaluation case failed
- evaluation case skipped
- host facts remain non-success without evidence/result verdict

## Required Integration Tests

Add at least five integration tests:

1. Host CLI happy lane: non-interactive input runs a deterministic host turn and returns structured events, status, final response, replay facts, and truth facts.

2. Host blocked lane: invalid input, missing session, or provider blocker returns structured blockers and non-success exit classification.

3. Evaluation distribution lane: deterministic evaluation cases run through the host surface and produce structured case results without live providers.

4. Package smoke lane: package or CLI smoke validates import, command availability, JSON shape, default-off provider behavior, and redaction.

5. Truth lane: complete proof is reported only when evidence/result verdict is complete; host, JSON, CLI, smoke, event, replay, and evaluation facts do not claim success alone.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- host command accepted
- JSON emitted
- CLI exit zero
- event emitted
- status snapshot produced
- package smoke passed
- distribution readiness passed
- provider response normalized
- tool result produced
- mutation applied
- evaluation case executed
- replay restored
- terminal text rendered

Missing proof stays not-proven.

## Safety And Scope

Do not:

- run a live provider
- manually read provider secret directories
- enable provider defaults
- add browser automation
- add external tool server behavior
- add dynamic loading
- broaden command allowlists
- add arbitrary writer behavior
- bypass sanctioned host, provider, session, tool, edit, execution, evidence, or result owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process wording, comparison wording, provenance wording, or outside project names. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed
- docs/sprint/component-adoption-log.md

Edit stale sections directly. Do not append progress logs.

The docs must distinguish newly proven host API and distribution surface, still unsupported broad SDK server behavior if not completed, still default-off live provider behavior, still unsupported dynamic execution areas, and still unsupported browser or external tool server behavior.

## Validation

Run focused validation for every changed owner.

Expected validation includes host API tests, CLI or shell tests, runtime event tests, evaluation tests, session store and replay tests, provider synthetic tests, tool and edit integration tests for exercised lanes, evidence/result truth tests, package or CLI smoke tests, anti-false-success gate, result contract gate if terminal result shapes change, package build if imports, contracts, runtime-facing types, host envelopes, package metadata, or scripts changed, rtk git diff --check, and rtk git diff --cached --check.

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Stable non-interactive host API exists.
2. JSON output is structured, versioned, and independent of terminal text.
3. Package or CLI smoke checks exist and run without live providers.
4. Distribution readiness result exists.
5. At least five integration tests prove happy, blocked, evaluation, package smoke, and truth lanes.
6. At least thirty required states are covered by tests.
7. At least eight owner domains are changed or justified as already compliant.
8. Terminal truth remains evidence/result owned.
9. Report-safe surfaces redact unsafe content.
10. Sprint docs and adoption log are updated by editing stale claims.
11. Focused validation and diff checks pass.
12. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report owner domains inspected, owner domains changed, adoption mode used and why, component or behavior ported, host API implemented, distribution surface implemented, commands and states covered, integration tests added, files changed, JSON and exit behavior, package smoke behavior, negative and redaction controls, sprint docs updated, remaining unproven capability areas, why terminal truth still belongs to evidence/result, validation commands and outcomes, final git status, commit hash, and push status.

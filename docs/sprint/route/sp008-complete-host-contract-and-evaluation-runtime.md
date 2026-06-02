# SP008 Complete Host Contract And Evaluation Runtime

## Goal

Build the complete host contract and evaluation runtime.

This is a major capability-system task. It must expose the proven runtime facts through a stable machine-readable host boundary and add an evaluation harness that can run deterministic coding-agent scenarios without scraping terminal text.

This task is not complete if it only adds JSON fields, only changes terminal output, only adds a helper, only writes docs, or only proves isolated serializers.

## Capability Target

The completed capability must support this controlled lane:

host request
-> command envelope validation
-> session selection or creation
-> user turn input
-> provider and tool runtime path
-> mutation or read-only action path when requested
-> runtime events
-> status snapshot
-> final host response
-> replay-safe continuation facts
-> evaluation case result
-> evidence/result truth boundary

The host boundary must be stable enough for tests and future automation. It must not require live providers.

## Required Starting Point

Read these docs first:

- docs/sprint/sprint-working-index.md
- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md

Use docs as planning material only. Current code and tests remain product evidence.

## Owner Domains

Inspect at least these owners:

- cli
- core/shell
- runtime/events
- runtime/loop
- session
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

Change at least seven rightful owner domains unless the final report proves one inspected owner already satisfies the required behavior without code changes.

Likely implementation areas include:

- packages/ts-shell/src/cli
- packages/ts-shell/src/core/shell
- packages/ts-shell/src/runtime/events
- packages/ts-shell/src/runtime/loop
- packages/ts-shell/src/session
- packages/ts-shell/src/session/store
- packages/ts-shell/src/session/replay
- packages/ts-shell/src/session/presentation
- packages/ts-shell/src/presentation
- packages/ts-shell/src/provider
- packages/ts-shell/src/tools
- packages/ts-shell/src/edit
- packages/ts-shell/src/evidence
- packages/ts-shell/src/result
- scripts
- nearby owner tests

## Required Host Contract

Implement a stable machine-readable host boundary with these properties:

1. Host command envelope validates action, session id, input text, mode, continuation choice, provider mode, and output preference.
2. Supported commands include at least start turn, continue session, get status, list session heads, inspect session summary, cancel or stop requested work, and run deterministic evaluation case.
3. Unsupported commands produce structured blockers, not thrown raw errors.
4. Host output separates event stream entries, status snapshot, final result summary, diagnostics, blockers, and redacted details.
5. Host output uses stable typed facts, not terminal prose.
6. Host output is distinct from terminal rendering.
7. Existing CLI or print paths can consume the contract, but terminal text must not become the API.
8. Events include correlation ids, session ids, turn ids, timestamps or ordering, severity, category, redaction status, and terminalSuccessClaim.
9. Replay-safe session state can be restored through the host boundary.
10. The host boundary can run deterministic provider/tool/edit scenarios without live provider credentials.
11. Evidence/result remains the only terminal truth owner.
12. Redaction excludes raw transcript, raw provider output, raw command output, raw edit text, patch bodies, hidden reasoning, and secrets.

## Required Evaluation Runtime

Add an evaluation harness for deterministic local cases.

The harness must support at least:

- read-only tool loop case
- provider blocked case
- provider fallback case
- mutation recovery success case
- apply-only negative case
- branch and compaction continuation case
- missing proof case

Each case must record:

- scenario id
- input
- host command
- expected status
- expected blockers or next action
- expected terminalSuccessClaim
- expected evidence/result verdict
- event count or categories
- replay-safe facts
- redaction checks

The evaluation harness must not depend on live providers. It may use synthetic provider behavior and deterministic fixtures.

## Required State Coverage

Tests must cover at least these states:

- valid host start turn
- invalid host command
- unsupported host command
- continue existing session
- missing session
- status snapshot
- session head listing
- provider blocked
- synthetic provider streaming
- tool result next turn
- mutation recovery complete
- apply-only non-success
- branch and compaction continuation
- missing proof
- cancellation or stop requested
- redaction-sensitive content excluded
- host output not equal to terminal text API
- evidence/result-only complete proof

## Required Integration Tests

Add at least four integration tests:

1. Host happy lane: host starts a deterministic turn, receives events, status snapshot, replay-safe facts, and final result summary without terminal scraping.

2. Host blocked lane: invalid command, missing session, provider blocker, or unsupported command returns structured blockers and no terminal success.

3. Evaluation lane: deterministic evaluation harness runs multiple cases and produces structured case results with redaction checks.

4. Truth lane: complete proof is only reported when evidence/result verdict is complete; provider/tool/edit/event/replay/status facts remain non-success.

Unit tests are still required for owner behavior, but isolated unit tests alone are not enough.

## Truthfulness Rules

Evidence/result owns terminal truth.

The following must never become terminal success by themselves:

- host command accepted
- session created
- event emitted
- status snapshot produced
- provider response normalized
- tool result produced
- mutation applied
- verification planned
- replay restored
- evaluation case executed
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
- add arbitrary writer behavior outside sanctioned owners
- bypass sanctioned session, provider, tool, edit, or execution owners
- make terminal text the machine API
- hide behavior in compatibility shims
- weaken tests or mass-rebaseline snapshots

During development, do not create product file names or product content containing process-history wording, comparison wording, study wording, or names of outside codebases. Product code must use domain language only.

## Required Documentation Update

After code and tests pass, update:

- docs/sprint/current-capability-summary.md
- docs/sprint/project-gap-and-priority-plan.md
- docs/sprint/sprint-working-index.md if statuses changed

Edit stale sections directly. Do not append progress logs.

The docs must distinguish:

- newly proven host contract and evaluation runtime
- still unproven live provider defaults if not completed
- still unproven broad real-provider compatibility if not completed
- still unproven dynamic execution areas
- still unproven broad parallel mutation if not completed
- still unproven broader interactive branch navigation if not completed

## Validation

Run focused validation for every changed owner.

Expected validation includes:

- host contract tests
- CLI or shell tests if touched
- runtime event tests
- runtime loop tests
- session store and replay tests
- session presentation tests
- provider synthetic tests
- tool and edit integration tests when cases exercise them
- evidence/result truth tests
- evaluation harness tests
- anti-false-success gate
- package build if imports, contracts, session schemas, runtime-facing types, or scripts changed
- rtk git diff --check
- rtk git diff --cached --check

Do not run live provider tests.

## Completion Gates

Do not claim completion unless all gates pass:

1. Stable host command and response envelope exists.
2. Host boundary supports start, continue, status, session summary, session heads, stop or cancel request, and deterministic evaluation case.
3. At least four integration tests prove happy, blocked, evaluation, and truth lanes.
4. At least seventeen required states are covered by tests.
5. At least seven owner domains are changed or justified as already compliant.
6. Evaluation harness runs deterministic cases without live providers.
7. Host output is stable structured data and not terminal prose.
8. Events, replay, product surface, and CLI/session status consume compatible facts.
9. Terminal truth remains evidence/result owned.
10. Redaction checks prove unsafe content is excluded.
11. Sprint docs are updated by editing stale claims.
12. Focused validation and diff checks pass.
13. Changes are committed.

After commit, one push attempt is allowed. If push fails, do not retry.

## Final Report

Report:

- owner domains inspected
- owner domains changed
- host contract implemented
- evaluation runtime implemented
- commands supported
- states covered
- integration tests added
- files changed
- negative and redaction controls added
- sprint docs updated
- remaining unproven capability areas
- why terminal truth still belongs to evidence/result
- validation commands and outcomes
- final git status
- commit hash
- push status

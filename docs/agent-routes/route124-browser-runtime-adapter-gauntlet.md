# Route 124: opt-in real browser runtime adapter and controlled action gauntlet

## Goal

Implement the opt-in real browser runtime adapter surface and expand controlled browser action/eval coverage in one larger route.

Route 123 added a controlled browser runtime MVP:

- browser runtime manifest / availability / session / executor
- DOM snapshot
- accessibility snapshot
- observation/provenance
- controlled click/type policy and executor
- selector repair seed
- browser runtime receipt/surface
- browser eval benchmark foundation

Route 124 should move from simulated-runtime-only MVP toward a real adapter boundary:

- external browser runtime protocol
- external runtime process adapter
- skill-managed browser runtime binding
- explicit runtime manifest bridge
- controlled action loop over adapter output
- selector repair apply for controlled pages
- DOM/accessibility snapshot provenance hardening
- expanded browser eval gauntlet
- CLI/harness scenarios for external/skill-managed adapter paths

This route should trust the existing safety foundation and take a bigger capability step, while preserving explicit controlled/local/test scope.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/opt-in-real-browser-runtime-adapter.md
- docs/design/edit-capability-roadmap.md: concise Route 124 note only

Do not append Route 124 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/real-browser-runtime-mvp.md
- docs/design/browser-public-readonly-web-runner.md
- docs/design/public-readonly-extraction-quality.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/browser-external-network-runner-handoff.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- controlled simulated browser runtime MVP exists
- browser eval benchmark foundation exists
- public HTTP read-only path exists
- public browser automation remains blocked
- no real external browser runtime adapter exists
- no skill-managed runtime binding exists for browser runtime actions
- selector repair is preview-only
- eval benchmark is foundation-level, not gauntlet-level

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness/eval references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 14 files
- Stagehand: at most 14 files
- OpenHands: at most 10 files
- Inspect AI + mini-swe-agent: at most 10 files total
- opencode/gemini-cli/ClaudeCode combined: at most 8 files
- total default budget: 56 files
- exceed by 4 only for directly relevant browser runtime adapter, page snapshot, action loop, selector repair, eval benchmark, or report files

Focus:

- Playwright MCP: browser server lifecycle, page/context/session model, snapshot format, accessibility tree, click/type tools, locator/selector metadata, tool response schema
- Stagehand: observe/act/extract runtime loop, action targets, selector repair, cached/replayable actions, JS-rendered pages, human-readable action summaries
- OpenHands: browser runtime events, action/observation separation, sandbox status, browser state surfaces, failure reports
- Inspect AI: benchmark task/scorer separation, browser/tool eval patterns, skipped/unavailable reports, safe transcript evidence
- mini-swe-agent: trajectory format, tool runner subprocess boundaries, concise scenario reports, reproduction evidence
- coding-agent baselines: command permissioning, runtime availability, slash command UX, sidebar/report summaries

Answer in docs/design/opt-in-real-browser-runtime-adapter.md:

1. What is the minimum real browser runtime adapter boundary?
2. How do external-runtime and skill-managed-runtime differ?
3. What protocol must a runtime runner implement?
4. How are DOM/accessibility snapshots validated and redacted?
5. How does controlled selector repair apply work?
6. What eval gauntlet proves this route?
7. What remains blocked until Route 125?

## This route changes

Allowed:

- docs/design/opt-in-real-browser-runtime-adapter.md
- docs/design/edit-capability-roadmap.md, concise Route 124 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserRuntimeProtocol.ts
- packages/ts-shell/src/core/context/browserRuntimeProcessAdapter.ts
- packages/ts-shell/src/core/context/browserExternalRuntimeManifest.ts
- packages/ts-shell/src/core/context/browserSkillRuntimeBinding.ts
- packages/ts-shell/src/core/context/browserRuntimeAdapterPolicy.ts
- packages/ts-shell/src/core/context/browserRuntimeAdapterExecutor.ts
- packages/ts-shell/src/core/context/browserSnapshotValidation.ts
- packages/ts-shell/src/core/context/browserSelectorRepairApplyPolicy.ts
- packages/ts-shell/src/core/context/browserSelectorRepairApplyExecutor.ts
- packages/ts-shell/src/core/context/browserRuntimeGauntletManifest.ts
- packages/ts-shell/src/core/harness/browserRuntimeAdapterFixtures.ts
- packages/ts-shell/src/core/harness/browserRuntimeAdapterScenarioExamples.test.ts
- packages/ts-shell/src/core/harness/browserRuntimeGauntletScenarios.test.ts

Allowed if clean:

- add explicit external browser runtime manifest env support
- add explicit skill-managed browser runtime manifest/binding support
- add test runner process that speaks runtime protocol
- allow controlled observe/extract/click/type through runtime adapter
- allow selector repair apply only for controlled/local/test pages
- integrate runtime adapter receipts/provenance into sidebar/report
- expand browser eval benchmark into a deterministic gauntlet
- keep public HTTP read-only path unchanged

## Boundaries

Preserve:

- no default browser runtime
- no package dependency changes
- no Playwright dependency installation
- no MCP launch
- no dynamic skill discovery
- no provider/model calls
- no public browser automation
- no public click/type
- no auth/session/cookies persistence
- no payment/destructive/upload/download/screenshot/OCR by default
- no arbitrary JavaScript execution from model/user input
- no cross-session browser state persistence
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no global allowlist changes
- no raw DOM/page content/secrets/credentials/hidden reasoning in receipts, reports, cache, or output

Real browser runtime adapter is opt-in and controlled/local/test scoped. A runner may be real or test-local, but it must be provided explicitly through manifest/harness. Public browser automation remains blocked.

## Tasks

### 1. Design

Create docs/design/opt-in-real-browser-runtime-adapter.md.

Keep it concise but complete.

Include:

- reference scan summary
- Route 123 MVP baseline
- external runtime protocol
- skill-managed runtime binding
- runtime process adapter
- snapshot validation
- selector repair apply policy
- eval gauntlet model
- controlled-only boundary
- Route 125 recommendation

### 2. Add browser runtime protocol

Add browserRuntimeProtocol.ts.

Protocol request types:

- runtime-status
- navigate
- observe
- extract
- click
- type
- close

Protocol response fields:

- status
- runtime id
- session id
- current URL summary
- DOM snapshot payload summary
- accessibility snapshot payload summary
- action target result
- post-action observation
- warnings/redactions
- error summary

Required behavior:

- deterministic validation
- reject raw oversized DOM
- reject secrets/credentials
- reject unsupported actions
- no runtime launch in protocol module

Add focused tests.

### 3. Add external runtime manifest and adapter policy

Add browserExternalRuntimeManifest.ts and browserRuntimeAdapterPolicy.ts.

Manifest fields:

- manifest version
- source: cli-harness, explicit-local-config, test-only
- runtime mode: external-process, skill-managed, simulated
- runner command/ref for external-process
- allowed origins: controlled/local/test only
- allowed actions: navigate, observe, extract, click, type
- blocked actions
- snapshot capabilities
- timeout/output budgets
- session persistence: false
- browser launch allowed: explicit-controlled only
- public automation allowed: false
- evidence/redaction policy

Policy should block:

- public click/type
- auth/payment/destructive/upload/download/screenshot/OCR
- arbitrary JS
- credential URLs
- raw DOM output
- global runtime config
- missing explicit manifest

Add focused tests.

### 4. Add runtime process adapter

Add browserRuntimeProcessAdapter.ts.

Adapter should:

- spawn only explicit test/local runner command from manifest
- pass request as JSON stdin or temp request file
- enforce timeout and output budget
- parse response JSON
- validate response with runtime protocol
- sanitize stdout/stderr summaries
- return unavailable/invalid/timed-out safely
- never spawn without explicit manifest

Add focused tests with temp runner scripts.

### 5. Add skill runtime binding

Add browserSkillRuntimeBinding.ts.

Binding should:

- connect skill-managed metadata to runtime protocol
- require explicit binding metadata
- not discover skills dynamically
- validate allowed actions and snapshot capabilities
- return future-skill-runtime-required when binding missing
- support test-only binding for harness

Add focused tests.

### 6. Add runtime adapter executor

Add browserRuntimeAdapterExecutor.ts.

Executor should:

- choose external-process, skill-managed, or simulated adapter based on manifest
- execute navigate/observe/extract/click/type only after policy pass
- validate snapshots after every response
- create observation/provenance/receipt records
- update runtime session model without persistence
- block unsafe actions before adapter call
- produce user-facing runtime surface data

Add focused tests.

### 7. Add snapshot validation

Add browserSnapshotValidation.ts.

Validation should:

- validate DOM snapshot summary
- validate accessibility snapshot summary
- enforce budgets
- redact secret-looking values
- block raw page dump markers
- block user-entered sensitive values
- preserve provenance ids

Add focused tests.

### 8. Add selector repair apply policy and executor

Add browserSelectorRepairApplyPolicy.ts and browserSelectorRepairApplyExecutor.ts.

Allowed:

- controlled/local/test selector repair apply
- replacement target from accessibility snapshot candidates
- confidence threshold
- explicit confirmation if click/type

Blocked:

- public selector repair apply
- auth/password/payment/destructive/upload/download
- arbitrary selector generated from raw model text without candidate evidence
- automatic repair without explicit command/harness step

Executor should apply repair to action target metadata only, then require explicit action execution step unless harness scenario combines them intentionally.

Add focused tests.

### 9. Integrate with /browser runtime and execute

Update command/runtime wiring if clean.

Required behavior:

- /browser runtime status can show external/skill runtime availability
- /browser execute observe/extract can use explicit runtime adapter
- /browser execute click/type can use explicit runtime adapter only for controlled/local/test pages
- public click/type remains blocked
- public HTTP read-only route remains unchanged
- output includes runtime mode, snapshot ids, provenance, and action target summary

Add focused tests.

### 10. Add runtime adapter fixtures

Add browserRuntimeAdapterFixtures.ts.

Fixtures should create:

- explicit external runtime manifest
- explicit skill runtime binding manifest
- temp runtime runner script
- DOM snapshot fixture
- accessibility snapshot fixture
- JS-rendered observation fixture
- safe click/type fixture
- missing selector fixture
- unsafe form fixture
- invalid/timeout runner fixture
- cleanup helper

No secrets. No public network.

### 11. Add runtime adapter scenarios

Add browserRuntimeAdapterScenarioExamples.test.ts.

Required scenarios:

1. no manifest -> unavailable
2. external runtime status via temp runner
3. external runtime observe returns validated DOM/accessibility snapshots
4. external runtime extract returns provenance/citation records
5. external runtime click safe button returns post-action observation
6. external runtime type safe input returns post-action observation
7. password/payment/destructive target blocked
8. public click/type blocked
9. invalid runner response blocked
10. timeout runner blocked
11. raw DOM/secrets redacted
12. skill-managed test binding path works or returns explicit future-required if missing

### 12. Add controlled selector repair apply scenarios

Required scenarios:

1. missing selector gets repair candidates from accessibility snapshot
2. repair apply picks high-confidence candidate
3. repaired target is metadata-only until explicit action
4. repaired click in controlled harness works only after explicit action step
5. low-confidence repair blocked
6. public repair apply blocked

### 13. Expand browser eval benchmark gauntlet

Add browserRuntimeGauntletManifest.ts and browserRuntimeGauntletScenarios.test.ts, or extend existing benchmark files if cleaner.

Gauntlet tasks:

- observe rendered title/headings
- extract visible text
- extract accessibility landmarks
- identify button by accessible name
- click button and verify state change
- type into safe input and verify state change
- block password/payment field
- repair missing selector and then execute controlled action
- verify provenance/citation exists
- verify public click blocked
- verify invalid runner handled
- verify no raw DOM/secrets in report

Report should include score, passed/failed/skipped, warnings, and next action.

### 14. Sidebar/report integration

If clean:

- report includes runtime adapter mode, snapshot ids, action target, selector repair status, gauntlet score
- sidebar summary includes browser runtime observation/action status
- no raw DOM/page content/secrets

Add focused tests if touched.

### 15. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 124 added opt-in browser runtime adapter, controlled selector repair apply, and browser eval gauntlet expansion
- public browser automation remains blocked
- next route recommendation

Recommended next route:

- Route 125: real Playwright/Stagehand runner adapter decision and opt-in implementation
- or Route 125: browser action planner for controlled pages
- or Route 125: browser session/auth design, still disabled by default
- or Route 125: eval benchmark expansion and score gates

## Validation

Run:

- focused tests for touched browser/context modules
- focused tests for touched command modules if touched
- focused tests for touched harness modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.
Do not add package scripts.
Do not run public network smoke tests unless explicit env is set.

## Stop conditions

Stop and report if:

- package dependency changes become necessary
- Playwright install becomes necessary
- MCP launch becomes necessary
- provider/model calls become necessary
- public browser automation becomes necessary
- auth/session/cookies become necessary
- raw DOM/page content/secrets would appear
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Runtime adapter and action gauntlet design
4. Adapter/action/repair/eval scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

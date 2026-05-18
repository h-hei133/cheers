# Route 123: real browser runtime MVP, snapshots, controlled actions, and browser eval harness

## Goal

Implement a real browser runtime MVP that jumps beyond the previous HTTP-only read-only path.

Route 120-122 added public read-only HTTP execution and extraction quality. That was useful but too incremental. Route 123 should open the real browser capability frontier in one larger slice:

- real browser runtime seam
- explicit browser runtime manifest
- runtime availability and dependency policy reuse
- DOM snapshot model
- accessibility snapshot model
- JS-rendered observe/extract for controlled pages
- controlled click/type action loop for local/test pages
- action target metadata
- selector repair readiness seed
- provenance/citation records for browser observations
- browser eval benchmark foundation
- report/sidebar/receipt integration

This route should remain opt-in and controlled, but it should no longer be just HTTP fetch post-processing.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/real-browser-runtime-mvp.md
- docs/design/edit-capability-roadmap.md: concise Route 123 note only

Do not append Route 123 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-public-readonly-web-runner.md
- docs/design/public-readonly-extraction-quality.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/browser-controlled-network-runner-harness.md
- docs/design/browser-external-network-runner-handoff.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- HTTP read-only public runner exists
- controlled loopback HTTP harness exists
- egress guard and network audit exist
- public read-only extraction quality exists
- external runner and skill-managed runner bridges exist
- browser runtime dependency policy currently prefers external-runner/skill-managed paths
- no real browser runtime MVP exists
- no DOM/accessibility snapshot exists
- no JS-rendered page observe/extract exists
- no click/type action loop exists
- no browser eval benchmark exists

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

- Playwright MCP: at most 12 files
- Stagehand: at most 12 files
- OpenHands: at most 8 files
- Inspect AI + mini-swe-agent: at most 8 files total
- opencode/gemini-cli/ClaudeCode combined: at most 6 files
- total default budget: 46 files
- exceed by 4 only for directly relevant browser runtime, snapshot, action loop, selector repair, eval harness, or provenance files

Focus:

- Playwright MCP: browser lifecycle, page snapshot, accessibility snapshot, click/type/navigate tools, selector/locator model, tool result schema, browser context isolation
- Stagehand: observe/act/extract loop, action target metadata, selector/action repair, cached action/replay, JS-rendered page handling, user-facing browser action summaries
- OpenHands: browser runtime integration, action/observation events, sandboxed execution, browser state reporting, screenshot/snapshot boundaries
- Inspect AI: browser/web task eval structure, sandbox/tool configuration, scorer/report separation, skipped/unavailable behavior
- mini-swe-agent: trajectory/evidence reporting, subprocess tool runner, bounded benchmark scenarios, failure reproduction
- coding-agent baselines: permission gates, tool availability, command result surfaces, report/side panel summaries

Answer in docs/design/real-browser-runtime-mvp.md:

1. What is the minimum real browser runtime MVP?
2. Which runtime path is used: external runner, skill-managed runner, or package dependency?
3. What does DOM/accessibility snapshot contain, and what must be redacted?
4. Which actions are allowed in controlled/test mode?
5. How are selector/action targets represented and repaired?
6. How does provenance/citation attach to browser observations?
7. What benchmark scenarios prove the MVP?
8. What remains blocked until Route 124?

## This route changes

Allowed:

- docs/design/real-browser-runtime-mvp.md
- docs/design/edit-capability-roadmap.md, concise Route 123 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserRuntimeManifest.ts
- packages/ts-shell/src/core/context/browserRuntimeAvailability.ts
- packages/ts-shell/src/core/context/browserRuntimeSession.ts
- packages/ts-shell/src/core/context/browserRuntimeExecutor.ts
- packages/ts-shell/src/core/context/browserDomSnapshot.ts
- packages/ts-shell/src/core/context/browserAccessibilitySnapshot.ts
- packages/ts-shell/src/core/context/browserObservationModel.ts
- packages/ts-shell/src/core/context/browserActionTarget.ts
- packages/ts-shell/src/core/context/browserActionLoopPolicy.ts
- packages/ts-shell/src/core/context/browserActionLoopExecutor.ts
- packages/ts-shell/src/core/context/browserSelectorRepairSeed.ts
- packages/ts-shell/src/core/context/browserObservationProvenance.ts
- packages/ts-shell/src/core/context/browserRuntimeReceipt.ts
- packages/ts-shell/src/core/context/browserRuntimeSurface.ts
- packages/ts-shell/src/core/harness/browserRuntimeMvpScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserRuntimeMvpScenarioExamples.test.ts
- packages/ts-shell/src/core/harness/browserEvalBenchmarkModel.ts
- packages/ts-shell/src/core/harness/browserEvalBenchmarkRunner.ts
- packages/ts-shell/src/core/harness/browserEvalBenchmarkReport.ts

Allowed if clean:

- use explicit external/skill-managed browser runtime manifest
- use temp test runner scripts for deterministic runtime simulation if real Playwright/browser is unavailable
- add a real browser runner adapter only if an existing runtime is already available without package changes
- add controlled JS-rendered page observation through test runner/harness only
- add controlled click/type only against local/test pages with non-sensitive elements
- add selector repair seed/preview, not autonomous repair execution on public sites
- add browser eval benchmark scenarios over local/test pages
- integrate snapshot/provenance into receipt/report/sidebar output

## Boundaries

Preserve:

- no default browser runtime
- no package dependency changes
- no Playwright dependency unless already available and no package changes are required
- no public browser automation by default
- no public click/type
- no auth/payment/destructive/upload/download/screenshot/OCR by default
- no cookies/auth/session persistence
- no cross-session browser state persistence
- no dynamic skill discovery
- no MCP launch
- no provider/model calls
- no automatic allowlist update
- no automatic confirmation
- no automatic replay
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no global allowlist changes
- no raw DOM/page content/secrets/credentials/hidden reasoning in receipts, reports, cache, or output

Real browser runtime MVP is allowed only through explicit local/test/controlled manifests. Public read-only HTTP remains separate from public browser automation.

## Tasks

### 1. Design

Create docs/design/real-browser-runtime-mvp.md.

Keep it concise but complete.

Include:

- reference scan summary
- Route 120-122 HTTP-readonly baseline
- runtime strategy decision
- controlled browser runtime scope
- DOM snapshot model
- accessibility snapshot model
- action loop boundary
- selector repair seed
- provenance/citation model
- eval benchmark model
- blocked public automation boundary
- Route 124 recommendation

### 2. Add browser runtime manifest

Add browserRuntimeManifest.ts.

Manifest fields:

- manifest version
- source: cli-harness, explicit-local-config, test-only
- runtime mode:
  - simulated-browser-runtime
  - external-browser-runtime
  - skill-managed-browser-runtime
  - unavailable
- allowed origins: controlled loopback/local test only for this route
- allowed actions: navigate, observe, extract, click, type
- blocked actions: auth, payment, destructive, upload, download, screenshot, OCR, arbitrary-js
- snapshot capabilities: DOM, accessibility, text, links
- JS-rendered support flag
- session persistence: false
- timeout/output budgets
- evidence/redaction policy
- warnings

Required behavior:

- explicit manifest required
- no default runtime manifest
- reject public automation origins for click/type
- reject wildcard origins
- reject credential URLs
- reject unsafe actions
- deterministic serialization
- no raw secrets

Add focused tests.

### 3. Add runtime availability/session model

Add browserRuntimeAvailability.ts and browserRuntimeSession.ts.

Availability statuses:

- available-simulated
- available-external
- available-skill-managed
- unavailable
- blocked-by-policy
- dependency-missing

Session model should represent:

- runtime id
- session id
- origin scope
- createdAt
- expiresAt
- state persistence: none
- cookies/auth: disabled
- current URL summary
- warnings

No real session persistence.

Add focused tests.

### 4. Add DOM snapshot model

Add browserDomSnapshot.ts.

DOM snapshot fields:

- snapshot id
- URL/origin summary
- title
- headings
- text nodes within budget
- forms summary without values
- buttons/links summary
- input fields summary without values
- redactions/warnings
- raw DOM stored: no

Required behavior:

- sanitize raw DOM input from runner
- strip scripts/styles/comments
- redact secrets/credentials
- budget output
- no raw DOM persistence

Add focused tests.

### 5. Add accessibility snapshot model

Add browserAccessibilitySnapshot.ts.

Accessibility snapshot fields:

- snapshot id
- role tree summary
- landmarks
- interactive elements
- labels/names within budget
- disabled/hidden state summary
- candidate action targets
- redactions/warnings

Required behavior:

- no raw accessibility dump if oversized
- no user-entered values
- no secrets
- deterministic ordering

Add focused tests.

### 6. Add observation model and provenance

Add browserObservationModel.ts and browserObservationProvenance.ts.

Observation should unify:

- DOM snapshot
- accessibility snapshot
- text extraction
- links/interactive elements
- runtime status
- evidence source

Provenance should record:

- observation id
- runtime id
- URL/origin
- action that produced observation
- snapshot ids
- timestamp
- evidence visibility
- quote/snippet budget
- source citation labels for command output

No raw page content or hidden reasoning.

Add focused tests.

### 7. Add action target and action loop policy

Add browserActionTarget.ts and browserActionLoopPolicy.ts.

Action target fields:

- target id
- action kind: click/type
- selector summary
- accessible role/name summary
- text/label summary
- confidence
- risk level
- requires confirmation yes/no
- provenance snapshot id

Policy should allow only:

- controlled local/test click
- controlled local/test type into non-sensitive fields
- no auth/password/payment/destructive/upload/download
- no public click/type
- no arbitrary JS

Add focused tests.

### 8. Add action loop executor

Add browserActionLoopExecutor.ts.

Executor should:

- run navigate/observe/extract/click/type through explicit browser runtime only
- support simulated runtime for deterministic tests
- support real external runtime only if already available without package changes
- produce new observation after action when runner provides one
- enforce action loop policy before every action
- emit receipt/provenance
- never auto-plan multiple steps unless harness scenario explicitly provides steps

Add focused tests.

### 9. Add selector repair seed

Add browserSelectorRepairSeed.ts.

Selector repair seed should:

- detect missing/low-confidence target
- propose alternate target candidates from accessibility snapshot
- classify repair readiness
- produce repair preview only
- not execute repaired selector automatically

Add focused tests.

### 10. Add runtime receipt and surface

Add browserRuntimeReceipt.ts and browserRuntimeSurface.ts.

Receipt fields:

- receipt id
- runtime mode
- action kind
- origin scope
- DOM snapshot id if any
- accessibility snapshot id if any
- provenance id
- action target id if any
- selector repair readiness if any
- executed yes/no
- browser launched yes/no
- public automation yes/no
- JS rendered support yes/no
- warnings/redactions
- next action

Surface should render concise user-facing output.

Add focused tests.

### 11. Integrate with /browser commands

Update /browser if clean.

Required behavior:

- /browser runtime status shows explicit runtime availability
- /browser execute observe controlled-runtime:// or controlled loopback page can produce DOM/accessibility snapshot
- /browser execute extract controlled page can use snapshot extraction
- /browser execute click/type works only in controlled local/test runtime with explicit manifest and confirmation if required
- public click/type remains blocked
- public HTTP read-only path remains unchanged

Add focused tests.

### 12. Add runtime MVP fixtures

Add browserRuntimeMvpScenarioFixtures.ts.

Fixtures should provide:

- simulated browser runtime manifest
- controlled JS-rendered page fixture
- DOM snapshot fixture
- accessibility snapshot fixture
- click target fixture
- type target fixture
- missing selector fixture
- unsafe form fixture
- public URL blocked fixture

No secrets. No public network.

### 13. Add runtime MVP scenarios

Add browserRuntimeMvpScenarioExamples.test.ts.

Required scenarios:

1. runtime status with no manifest -> unavailable
2. explicit simulated runtime observe returns DOM + accessibility snapshot
3. JS-rendered fixture observe shows rendered text from runner evidence
4. extract uses DOM/accessibility/text observation
5. controlled click produces post-action observation
6. controlled type into safe field produces post-action observation
7. type into password/payment field blocked
8. public click/type blocked
9. missing selector produces repair seed preview
10. raw DOM/secrets are redacted
11. provenance/citation ids appear in report
12. public HTTP read-only path unchanged

### 14. Add browser eval benchmark foundation

Add browserEvalBenchmarkModel.ts, browserEvalBenchmarkRunner.ts, browserEvalBenchmarkReport.ts.

Benchmark should define small deterministic tasks:

- observe title/headings
- extract rendered text
- identify button by accessible name
- click controlled button and verify changed observation
- type into safe input and verify changed observation
- blocked unsafe action test

Runner should:

- use simulated/controlled runtime only
- produce score/report
- never call provider/model
- never access public network

Add focused tests.

### 15. Sidebar/report integration

If clean:

- report includes runtime mode, snapshot ids, action target, provenance, selector repair status
- sidebar summary includes browser runtime observation/action status
- no raw DOM/page content/secrets

Add focused tests if touched.

### 16. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 123 added real browser runtime MVP surface with DOM/accessibility snapshots, controlled actions, selector repair seed, and browser eval foundation
- public browser automation remains blocked
- next route recommendation

Recommended next route:

- Route 124: real browser runtime adapter decision and opt-in implementation
- or Route 124: browser eval benchmark expansion
- or Route 124: selector repair apply loop for controlled pages
- or Route 124: browser session/auth design only after controlled runtime remains stable

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
- real browser runtime requires Playwright install
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
3. Browser runtime MVP design
4. Snapshot/action/eval scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

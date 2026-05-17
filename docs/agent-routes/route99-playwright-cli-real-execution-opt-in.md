# Route 99: Playwright CLI real execution opt-in, local-only first

## Goal

Add the first real browser execution opt-in path after Route 97 sandbox gates and Route 98 real CLI scenario harness.

Route 96 added a non-default browser execution seam.
Route 97 added sandbox authority, network allowlist, confirmation, runtime preflight, and evidence policy.
Route 98 added real CLI scenario harness.

Route 99 should add a narrowly scoped Playwright CLI/Skills-oriented execution prototype:

- real execution remains non-default
- executor must be explicitly injected/configured
- default `/browser execute ...` remains blocked
- first real execution path is local/test-local only
- no default external network browsing
- no auth/payment/destructive/file upload/download
- execution evidence is sanitized, bounded, and sidebar-visible
- real CLI scenario harness verifies blocked default and allowed local execution paths

This route should prove the execution seam can run safely without making browser automation generally available.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/playwright-cli-non-default-browser-execution.md
- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/browser preview` exists
- `/browser dry-run` exists
- `/browser execute` exists but is gated
- no executor means blocked
- fake/test executor exists
- sandbox authority and allowlist preflight exist
- real CLI scenario harness exists
- no real Playwright execution exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- Playwright CLI: /home/wang/projects/playwright-cli
- browser-use: /home/wang/projects/browser-use

Budget:

- Playwright MCP / optional Playwright CLI: at most 8 files total
- Stagehand: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use: at most 3 files if present
- total default budget: 30 files
- exceed by 2 only for directly relevant Playwright execution / CLI / evidence / harness files

Focus:

Playwright MCP / optional Playwright CLI:

- browser command invocation
- accessibility snapshot evidence
- CLI versus MCP tradeoff
- browser context lifecycle
- tool output shape
- safe execution status

Stagehand:

- observe / act / extract execution boundary
- preview-before-execution
- action result and evidence
- deterministic action versus AI action split

OpenHands:

- tool execution events
- sandboxed action/observation surface
- browser/tool evidence
- blocked versus executed status

Inspect AI:

- tool-use transcript
- sandbox separation
- evidence/log/report boundaries

mini-swe-agent:

- command execution trajectory
- failure handling
- process result evidence

Answer in docs/design/playwright-cli-real-execution-opt-in.md:

1. What is the smallest safe real browser execution path?
2. How should local/test-local execution differ from external-network execution?
3. What evidence must an execution result include?
4. What must remain blocked until a later browser sandbox route?
5. How should CLI scenario harness prove real execution stayed bounded?
6. What should Route 100 own?

## This route changes

Allowed:

- docs/design/playwright-cli-real-execution-opt-in.md
- docs/design/browser-sandbox-network-allowlist.md, Route 99 note only
- docs/design/playwright-cli-non-default-browser-execution.md, Route 99 note only
- docs/design/real-cli-scenario-harness.md, Route 99 note only
- docs/design/agent-scenario-harness-foundation.md, Route 99 note only
- docs/design/sidebar-live-event-capture.md, Route 99 note only
- docs/design/context-engineering-continuity-baseline.md, Route 99 note only
- docs/design/edit-capability-roadmap.md, concise Route 99 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserPlaywrightCliExecutor.ts
- packages/ts-shell/src/core/context/browserLocalExecutionAuthority.ts
- packages/ts-shell/src/core/context/browserLocalFixture.ts
- packages/ts-shell/src/core/context/browserExecutionEvidenceRedactor.ts
- packages/ts-shell/src/core/context/browserExecutionLifecycleSurface.ts

Optional harness files:

- packages/ts-shell/src/core/harness/browserRealCliScenarioExamples.test.ts

Allowed if clean:

- extend BrowserExecutor with explicit local/test-local executor mode
- add Playwright CLI-style executor adapter that can be injected but is not default
- add local fixture execution plan using deterministic fixture content
- run a test-local executor in focused tests
- run real CLI scenario harness against blocked default execution and allowed local/test-local execution if clean
- emit sidebar event for local execution success/block

## This route must preserve

Route-specific boundaries:

- no default browser execution
- no external-network browsing by default
- no arbitrary URL execution unless explicitly allowlisted and still local/test gated
- no auth/payment/destructive actions
- no file upload/download
- no arbitrary JavaScript execution
- no screenshot/OCR capture
- no persistent browser session
- no MCP server launch or dynamic MCP discovery
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in browser execution output
- execution result must clearly say Executed: yes/no and Execution mode

## Tasks

### 1. Design and audit

Create docs/design/playwright-cli-real-execution-opt-in.md.

Include:

- Route 99 reference scan summary
- Route 97/98 baseline
- local/test-local first execution decision
- external-network deferral rationale
- executor injection model
- Playwright CLI/Skills adapter boundary
- evidence model
- redaction policy
- sidebar integration model
- real CLI scenario harness coverage
- blocked actions
- Route 100 recommendation

### 2. Add local execution authority

Add packages/ts-shell/src/core/context/browserLocalExecutionAuthority.ts.

Expected concepts:

- BrowserLocalExecutionAuthority
- BrowserLocalExecutionMode:
  - disabled
  - fake-test
  - local-fixture
  - explicit-local
  - future-external
- BrowserLocalExecutionDecision:
  - allowed
  - blocked-disabled
  - blocked-nonlocal
  - blocked-missing-fixture
  - blocked-unsafe-action
  - blocked-confirmation-required
  - future-external-required

Policy:

- disabled by default
- fake-test allowed only for fake executor
- local-fixture allowed only for deterministic fixture execution
- explicit-local represented but must still pass sandbox/allowlist/preflight
- future-external remains blocked in this route

Add focused tests.

### 3. Add local fixture model

Add packages/ts-shell/src/core/context/browserLocalFixture.ts.

Fixture should support deterministic local browser evidence without external network.

Expected concepts:

- BrowserLocalFixture
- fixtureId
- fixtureKind:
  - static-page
  - accessibility-summary
  - extraction-result
- safeTitle
- safeUrl
- safeTextSummary
- allowedActions:
  - observe
  - extract
  - navigate-local
- redactions
- warnings

Required behavior:

- no raw secret content
- no hidden reasoning
- no external network
- deterministic fixture ids
- bounded text summary

Add focused tests.

### 4. Add Playwright CLI executor seam

Add packages/ts-shell/src/core/context/browserPlaywrightCliExecutor.ts.

This should be an opt-in executor adapter.

Two acceptable implementation levels:

A. If a real local Playwright CLI/Skills command is available without package changes:
- build command invocation through injected process runner
- only run against local/test fixture or explicitly local target
- capture sanitized evidence
- no external network by default

B. If not available:
- implement the adapter seam and local/test executor behavior
- return unavailable with clear reason for real CLI execution
- keep Playwright CLI plan evidence

Required behavior either way:

- never default-enable
- no package install
- no package script changes
- no provider/model calls
- no external network by default
- no raw content/secrets
- clear executed/unavailable status

Add focused tests.

### 5. Add execution evidence redactor

Add packages/ts-shell/src/core/context/browserExecutionEvidenceRedactor.ts.

Redact:

- raw page content beyond bounded safe summaries
- secrets / tokens / credentials
- hidden reasoning markers
- raw HTML if present
- screenshot/OCR data
- file paths if sensitive
- provider credentials

Evidence output should keep:

- action id
- execution mode
- runtime name
- target origin or local fixture id
- safe title
- safe URL if allowed
- safe summary
- action trace summary
- executed yes/no
- warnings/redactions

Add focused tests.

### 6. Add execution lifecycle surface

Add packages/ts-shell/src/core/context/browserExecutionLifecycleSurface.ts.

Surface should render:

- Browser execution lifecycle
- Mode
- Runtime
- Sandbox/allowlist/confirmation status
- Local fixture / target
- Evidence summary
- Redactions
- Executed: yes/no
- Next action

Keep output concise.

Add focused tests.

### 7. Integrate local execution into `/browser execute`

Update browser execution runner/policy as needed.

Required behavior:

- no executor: still blocked
- fake-test executor: still works only with fake-test authority
- local-fixture executor: can execute observe/extract/navigate-local if all gates pass
- external navigate remains blocked/future-external unless route can prove explicit local safe execution only
- auth/payment/destructive/upload/download/screenshot remain blocked
- executed result emits sidebar event
- preview/dry-run remain unchanged

Add focused tests.

### 8. Scenario harness coverage

Add browser real CLI / in-process scenarios as clean.

Required scenarios:

1. default execution blocked

- `/browser execute observe`
- assert blocked
- Executed: no

2. local fixture observe success

- inject local-fixture executor/authority
- execute observe
- assert Executed: yes
- assert evidence sanitized

3. local fixture extract success

- inject local-fixture executor/authority
- execute extract
- assert safe extraction summary
- assert no raw HTML/secrets

4. external URL execution blocked

- try execute navigate https://example.com without external authority
- assert future-external-required or blocked

5. sidebar event

- assert browser execution event appears

If real CLI child process can carry the executor harness cleanly, include a real CLI scenario. If not, keep in-process scenario and document real CLI executor injection blocker.

### 9. Real CLI scenario harness integration

Attempt a CLI scenario only for blocked default path and local-fixture path if clean.

Required:

- default blocked path through real CLI should pass
- local-fixture executor path through real CLI only if safe harness injection is available
- no external network
- no browser launch unless explicit local executor implementation is safely available

If local executor cannot be injected through CLI without lifecycle changes:

- document blocker
- keep CLI blocked-path coverage
- recommend Route 100 CLI executor injection bridge

### 10. Tests

Required tests:

- local execution authority blocks by default
- local fixture model redacts unsafe content
- Playwright CLI executor seam unavailable/plan-only if CLI absent
- local fixture executor returns executed evidence
- evidence redactor strips secrets/raw HTML
- lifecycle surface says Executed: yes/no correctly
- `/browser execute observe` blocked without executor
- `/browser execute observe` succeeds with local-fixture authority/executor
- external navigate blocked
- auth/payment/destructive/upload/download/screenshot blocked
- sidebar event emitted
- scenario harness covers blocked and local success
- real CLI blocked scenario passes

### 11. Docs and roadmap update

Update:

- docs/design/playwright-cli-real-execution-opt-in.md with final notes
- docs/design/browser-sandbox-network-allowlist.md with Route 99 note
- docs/design/playwright-cli-non-default-browser-execution.md with Route 99 note
- docs/design/real-cli-scenario-harness.md with Route 99 note
- docs/design/agent-scenario-harness-foundation.md with Route 99 note
- docs/design/sidebar-live-event-capture.md with Route 99 note
- docs/design/context-engineering-continuity-baseline.md with Route 99 note
- docs/design/edit-capability-roadmap.md with concise status and Route 100 recommendation

Recommended next route:

- Route 100: CLI executor injection bridge for local browser execution
  - if real CLI cannot inject local executor cleanly
- or Route 100: external-network browser execution opt-in
  - only if local execution and evidence are stable
- or Route 100: browser action cache/replay design
  - if Stagehand-like repeatability should come before external network

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.

If CLI scenario tests reveal unrelated existing CLI failures, narrow to safe subset and document blocker.

## Stop conditions

Stop and report if:

- package dependency changes become necessary
- default browser execution becomes necessary
- external network becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- broad CLI lifecycle rewrite becomes necessary
- executor injection through CLI becomes unsafe or confusing
- raw page content/secrets would need to appear
- Playwright CLI adapter would need to become a hidden real runtime without explicit authority

## Final report

1. What changed
2. Reference scan summary
3. Execution mode decision
4. Scenario harness coverage
5. CLI scenario coverage
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

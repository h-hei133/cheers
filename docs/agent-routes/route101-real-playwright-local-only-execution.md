# Route 101: real Playwright local-only execution experiment

## Goal

Attempt the first real Playwright local-only browser execution experiment after Route 100.

Route 99 added local-fixture browser execution in-process.
Route 100 bridged local-fixture browser execution into the real CLI scenario harness through an explicit temp manifest and env pointer.

Route 101 should now attempt a real Playwright-backed local-only executor, but only when a Playwright runtime is already available or safely injectable without package/script changes.

Target behavior:

- default `/browser execute ...` remains blocked
- explicit CLI harness manifest remains required
- local fixture manifest remains required
- only local/test fixture targets are eligible
- no external network
- no persistent browser session
- no auth/payment/destructive/upload/download/screenshot/OCR
- real Playwright executor returns bounded sanitized evidence
- real CLI scenario harness verifies blocked default path and local-only execution path if runtime is available
- if Playwright runtime is unavailable, report unavailable clearly and keep all tests deterministic

This route must not install dependencies, change package scripts, or make browser execution generally available.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/cli-browser-executor-injection-bridge.md
- docs/design/playwright-cli-real-execution-opt-in.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- CLI fixture manifest injection exists
- local-fixture executor can run through real CLI harness
- external URL remains blocked
- Playwright CLI adapter is plan-only / unavailable when no runtime is present
- no real Playwright execution exists yet

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary browser references:

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
- exceed by 2 only for directly relevant local Playwright execution / evidence / harness files

Focus:

Playwright MCP / optional Playwright CLI:

- browser context lifecycle
- local page / fixture execution
- accessibility snapshot evidence
- action result schema
- server/CLI availability checks
- safe shutdown / cleanup

Stagehand:

- observe / extract / act split
- local page execution boundary
- action evidence
- preview-to-execute transition
- deterministic action versus AI action split

OpenHands:

- browser/tool execution event surface
- sandboxed action/observation logs
- evidence redaction
- failed tool execution reporting

Inspect AI:

- sandboxed tool execution
- transcript/log/evidence separation
- availability / skipped execution handling

mini-swe-agent:

- process execution trajectory
- failure evidence
- command/runtime availability handling

Answer in docs/design/real-playwright-local-only-execution.md:

1. What is the smallest real Playwright local-only execution surface?
2. How should runtime availability be detected without package changes?
3. What evidence should local Playwright execution produce?
4. How should unavailable runtime be reported deterministically?
5. How should real CLI scenarios prove no external network/default execution happened?
6. What should Route 102 own?

## This route changes

Allowed:

- docs/design/real-playwright-local-only-execution.md
- docs/design/cli-browser-executor-injection-bridge.md, Route 101 note only
- docs/design/playwright-cli-real-execution-opt-in.md, Route 101 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 101 note only
- docs/design/real-cli-scenario-harness.md, Route 101 note only
- docs/design/agent-scenario-harness-foundation.md, Route 101 note only
- docs/design/sidebar-live-event-capture.md, Route 101 note only
- docs/design/context-engineering-continuity-baseline.md, Route 101 note only
- docs/design/edit-capability-roadmap.md, concise Route 101 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserPlaywrightAvailability.ts
- packages/ts-shell/src/core/context/browserPlaywrightLocalExecutor.ts
- packages/ts-shell/src/core/context/browserPlaywrightLocalEvidence.ts
- packages/ts-shell/src/core/context/browserPlaywrightLifecycle.ts
- packages/ts-shell/src/core/harness/browserPlaywrightLocalScenarioExamples.test.ts

Allowed if clean:

- use existing project dependency if Playwright is already installed/available
- use an injected process runner or module loader instead of importing Playwright directly if that avoids dependency changes
- create deterministic local HTML/static fixture in temp dir for harness
- execute local fixture observe/extract/navigate-local only
- skip real execution with clear unavailable result if runtime is absent
- run real CLI scenarios for default blocked and local-only execution/unavailable paths

## This route must preserve

Route-specific boundaries:

- no package dependency changes
- no package script/default gate changes
- no default browser execution
- no external network
- no arbitrary URL execution
- no MCP server launch or dynamic MCP discovery
- no provider/model calls
- no persistent browser session
- no auth/payment/destructive actions
- no file upload/download
- no arbitrary JavaScript execution
- no screenshot/OCR capture
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw page content/secrets/hidden reasoning in evidence/output
- execution result must clearly say runtime, mode, Executed: yes/no, and whether runtime was unavailable

## Tasks

### 1. Design and audit

Create docs/design/real-playwright-local-only-execution.md.

Include:

- Route 101 reference scan summary
- Route 100 CLI manifest baseline
- runtime availability audit
- local-only execution model
- fixture model
- evidence model
- redaction policy
- unavailable-runtime behavior
- real CLI scenario plan
- no-external-network boundary
- Route 102 recommendation

### 2. Audit local runtime availability

Before implementation, inspect project dependency/config only through RTK commands.

Determine:

- whether Playwright is already available in package dependencies
- whether a Playwright CLI binary is available through existing dependencies
- whether existing tests use Playwright
- whether using a process runner is cleaner than direct import
- whether package changes would be required

Record decision in the design doc.

Do not install dependencies.
Do not modify package.json or lockfiles.

### 3. Add Playwright availability model

Add packages/ts-shell/src/core/context/browserPlaywrightAvailability.ts.

Expected concepts:

- BrowserPlaywrightAvailability
- BrowserPlaywrightRuntimeKind:
  - module
  - cli
  - unavailable
- BrowserPlaywrightAvailabilityStatus:
  - available
  - unavailable
  - disabled
  - blocked-by-policy
- version, optional
- reason
- nextAction

Required behavior:

- deterministic availability result for tests
- no process spawn unless through injected checker
- no package install
- no network
- clear unavailable result

Add focused tests.

### 4. Add Playwright local evidence model

Add packages/ts-shell/src/core/context/browserPlaywrightLocalEvidence.ts.

Evidence should include:

- executionId
- runtime kind
- mode:
  - local-fixture
  - unavailable
  - blocked
- fixture id
- safe URL
- safe title
- action kind
- safe observation summary
- safe extraction summary
- action trace summary
- stderr/stdout summary if process runner used
- redactions
- warnings
- executed yes/no

Must exclude:

- raw HTML
- screenshot/OCR
- secrets
- hidden reasoning
- external page content
- raw stdout/stderr beyond bounded summary

Add focused tests.

### 5. Add Playwright lifecycle helper

Add packages/ts-shell/src/core/context/browserPlaywrightLifecycle.ts.

Lifecycle should model:

- prepare local fixture
- launch local execution, if runtime available
- collect evidence
- close/cleanup
- fail safely
- timeout
- unavailable runtime

This can be pure/planned if no runtime is available.

Required behavior:

- cleanup always represented
- no persistent session
- no external network
- no raw content
- deterministic fake/injected runner in tests
- no default browser launch

Add focused tests.

### 6. Add Playwright local executor

Add packages/ts-shell/src/core/context/browserPlaywrightLocalExecutor.ts.

Executor should implement the BrowserExecutor interface from Route 96.

Behavior:

- require explicit local-fixture authority
- require valid CLI fixture manifest
- require Playwright availability
- support only:
  - observe local fixture
  - extract from local fixture
  - navigate local-fixture://...
- block:
  - external URLs
  - click/type unless route can make them local-only safe and evidence-bounded
  - auth/payment/destructive/upload/download/screenshot/OCR
- if runtime unavailable:
  - return blocked/unavailable result
  - Executed: no
  - next action explains missing runtime
- if runtime available:
  - execute local fixture only
  - collect sanitized evidence
  - close runtime
  - Executed: yes

Implementation levels allowed:

A. Real Playwright local execution if existing runtime is available without package changes.
B. Injected process/module runner with deterministic fake local execution if runtime unavailable, but label as unavailable/fake.
C. Plan-only unavailable if neither is safe.

Prefer A if safe and dependency already exists. Otherwise do B/C and document why.

Add focused tests.

### 7. Integrate with CLI manifest bridge

Update browserCliExecutionBridge / browserCliExecutorInjection as needed.

Required behavior:

- manifest can request executor mode:
  - local-fixture
  - playwright-local
- invalid/unsupported mode blocks safely
- no env means disabled
- valid local fixture manifest plus available runtime can construct Playwright local executor
- unavailable runtime produces safe unavailable result
- no default enablement

Add focused tests.

### 8. Integrate with `/browser execute`

Update browser execution runner only if needed.

Required behavior:

- default blocked behavior unchanged
- local fixture executor still works
- Playwright local executor can run only with explicit manifest/authority/allowlist/confirmation
- external URL blocked
- evidence surface includes runtime availability and lifecycle status
- sidebar event emitted for executed/unavailable/blocked result

Add focused tests.

### 9. Real CLI scenarios

Add packages/ts-shell/src/core/harness/browserPlaywrightLocalScenarioExamples.test.ts.

Required scenarios:

1. default blocked still passes

- no manifest
- `/browser execute observe local-fixture://demo`
- Executed: no

2. Playwright unavailable path is safe

- manifest requests playwright-local
- runtime unavailable or disabled through injected checker
- `/browser execute observe local-fixture://demo`
- Executed: no
- clear unavailable reason
- no raw content/secrets

3. local fixture execution with existing runtime, only if available

- manifest requests playwright-local
- if runtime available without package changes:
  - execute observe/extract local fixture
  - assert Executed: yes
  - assert safe evidence
- if runtime unavailable:
  - skip or assert unavailable deterministically; do not fail route

4. external URL blocked with manifest

- valid manifest
- `/browser execute navigate https://example.com`
- Executed: no
- external blocked/future required

5. sidebar/report evidence

- command output/report includes browser execution status
- no cross-process sidebar persistence assumption

### 10. Harness and report updates

Extend CLI scenario report if needed to show:

- Playwright availability status
- local fixture id
- execution mode
- evidence summary
- cleanup status
- Executed: yes/no
- unavailable reason

Reuse safety assertions.

### 11. Tests

Required focused tests:

- availability model reports available/unavailable deterministically
- evidence model redacts raw HTML/secrets/stdout
- lifecycle represents cleanup on success/failure
- local executor blocks without authority
- local executor blocks external URLs
- local executor returns unavailable when runtime absent
- local executor can run through injected fake/process runner only if clearly labeled
- CLI manifest can request playwright-local mode safely
- `/browser execute` default blocked unchanged
- real CLI scenario covers unavailable or local success path
- no package/dependency changes
- no provider/model/network/MCP side effects

### 12. Docs and roadmap update

Update:

- docs/design/real-playwright-local-only-execution.md with final notes
- docs/design/cli-browser-executor-injection-bridge.md with Route 101 note
- docs/design/playwright-cli-real-execution-opt-in.md with Route 101 note
- docs/design/browser-sandbox-network-allowlist.md with Route 101 note
- docs/design/real-cli-scenario-harness.md with Route 101 note
- docs/design/agent-scenario-harness-foundation.md with Route 101 note
- docs/design/sidebar-live-event-capture.md with Route 101 note
- docs/design/context-engineering-continuity-baseline.md with Route 101 note
- docs/design/edit-capability-roadmap.md with concise status and Route 102 recommendation

Recommended next route:

- Route 102: browser execution evidence/report hardening
  - if Playwright local execution works or unavailable path is stable
- or Route 102: external-network browser execution design
  - only if local Playwright execution is truly working
- or Route 102: Playwright runtime dependency decision
  - if runtime is unavailable and package/dependency policy must be decided
- or Route 102: browser action cache/replay design
  - if local execution evidence is stable enough

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- real CLI scenario tests added by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.

If runtime availability differs by environment, tests must remain deterministic by testing unavailable path and gating real execution path.

## Stop conditions

Stop and report if:

- package dependency changes become necessary
- Playwright install becomes necessary
- external network becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- persistent browser session becomes necessary
- SessionManager schema changes become necessary
- broad CLI lifecycle rewrite becomes necessary
- raw page content/secrets would need to appear
- test becomes flaky due to local browser runtime availability

## Final report

1. What changed
2. Reference scan summary
3. Runtime availability decision
4. Execution mode decision
5. CLI scenarios implemented
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

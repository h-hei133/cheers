# Route 96: Playwright CLI/Skills non-default browser execution prototype

## Goal

Add the first non-default browser execution prototype after browser dry-run and agent scenario harness foundation.

Route 93 added preview-only browser capability.
Route 94 added runtime decision and non-executing browser dry-run harness.
Route 95 added Agent Scenario Harness foundation.

Route 96 should add a narrow browser execution seam and a Playwright CLI/Skills-oriented prototype:

- execution contract
- execution policy
- non-default executor interface
- Playwright CLI/Skills adapter plan
- fake/test executor for harness scenarios
- `/browser execute ...` command path if clean
- execution evidence/result projection
- sidebar activity event
- harness scenario coverage

This route must not make browser execution default. If no explicit executor is injected, execution must be blocked with a clear reason and next action.

The first execution prototype should be safe, narrow, and auditable.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/browser-capability-boundary-preview.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/sidebar-tui-panel-prototype.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/browser` status exists.
- `/browser preview ...` exists.
- `/browser dry-run ...` exists.
- browser runtime direction currently prefers Playwright CLI/Skills.
- no real browser execution exists.
- scenario harness exists and can cover cross-capability flows.

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Harness reference:

- Inspect AI: /home/wang/projects/inspect_ai

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional, only if present:

- Playwright CLI: /home/wang/projects/playwright-cli
- browser-use: /home/wang/projects/browser-use

Budget:

- Stagehand: at most 7 files
- Playwright MCP / optional Playwright CLI: at most 7 files total
- OpenHands: at most 4 files
- mini-swe-agent + Inspect AI: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use: at most 3 files if present
- total default budget: 25 files, or 28 if optional repos exist
- exceed by 2 only for directly relevant browser executor / harness / tool execution files

Focus:

Stagehand:

- act / observe / extract execution boundary
- action preview before execution
- evidence/result shape
- cached/self-healing action boundary
- deterministic code versus natural-language action split

Playwright MCP / optional Playwright CLI:

- browser action schema
- accessibility snapshot / structured evidence
- CLI/Skills token efficiency
- MCP overhead and statefulness tradeoff
- safe command invocation / tool output

OpenHands:

- browser/tool execution events
- sandbox/tool result surfaces
- action/observation event model
- UI/sidebar evidence

mini-swe-agent:

- compact execution loop
- tool command abstraction
- trajectory/evidence report
- failure handling

Inspect AI:

- tool-use eval harness
- sandbox separation
- transcript/log/evidence
- scorer/assertion pattern

Answer in docs/design/playwright-cli-non-default-browser-execution.md:

1. What is the smallest safe browser execution seam?
2. What must be executor-injected versus default runtime behavior?
3. Which actions are safe enough for first non-default prototype?
4. What evidence must execution produce?
5. How should browser execution integrate with scenario harness?
6. What should remain deferred until browser sandbox hardening?

## This route changes

Allowed:

- docs/design/playwright-cli-non-default-browser-execution.md
- docs/design/browser-runtime-decision-dry-run-harness.md, Route 96 note only
- docs/design/browser-capability-boundary-preview.md, Route 96 note only
- docs/design/agent-scenario-harness-foundation.md, Route 96 note only
- docs/design/sidebar-live-event-capture.md, Route 96 note only
- docs/design/context-engineering-continuity-baseline.md, Route 96 note only
- docs/design/edit-capability-roadmap.md, concise Route 96 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserExecutionContract.ts
- packages/ts-shell/src/core/context/browserExecutionPolicy.ts
- packages/ts-shell/src/core/context/browserExecutionResult.ts
- packages/ts-shell/src/core/context/browserExecutionSurface.ts
- packages/ts-shell/src/core/context/browserExecutor.ts
- packages/ts-shell/src/core/context/browserPlaywrightCliAdapter.ts
- packages/ts-shell/src/core/context/browserExecutionCommandContract.ts
- packages/ts-shell/src/core/context/browserExecutionCommandRunner.ts

Optional harness files:

- packages/ts-shell/src/core/harness/browserScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserScenarioExamples.test.ts

Allowed if clean:

- extend `/browser` with:
  - `/browser execute navigate <url>`
  - `/browser execute observe`
  - `/browser execute extract <goal>`
- use fake/test executor for validation
- add adapter that builds a Playwright CLI/Skills-style execution request without launching by default
- add sidebar events for execution blocked/succeeded/failed
- add scenario harness coverage for blocked default execution and fake executor success

## This route must preserve

Route-specific boundaries:

- browser execution remains non-default
- no execution if executor is not explicitly injected
- no default Playwright launch
- no MCP server launch or dynamic MCP discovery
- no provider/model calls
- no browser session persistence
- no auth/payment/destructive actions
- no file upload/download
- no screenshot/OCR unless represented as future evidence only
- no network execution unless explicit fake/test executor or documented non-default executor handles it safely
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in browser execution output
- execution result must clearly say whether it executed

## Tasks

### 1. Design and audit

Create docs/design/playwright-cli-non-default-browser-execution.md.

Include:

- Route 96 reference scan summary
- Route 94 dry-run baseline
- runtime direction confirmation
- execution seam design
- executor injection model
- first supported action subset
- blocked action policy
- evidence model
- sidebar integration model
- scenario harness integration model
- no-default-execution boundary
- future browser sandbox hardening route boundary
- next-route decision criteria

### 2. Add browser execution contract

Add packages/ts-shell/src/core/context/browserExecutionContract.ts.

Expected concepts:

- BrowserExecutionRequest
- BrowserExecutionMode:
  - disabled
  - fake-test
  - explicit-local
  - future-runtime
- BrowserExecutionActionKind:
  - navigate
  - observe
  - extract
  - click
  - type
- BrowserExecutionRisk
- BrowserExecutionRequirement
- BrowserExecutionApproval
- BrowserExecutionRequestSource

Required behavior:

- pure types/helpers
- deterministic request ids if helper logic exists
- no execution

Add focused tests if helper logic exists.

### 3. Add browser execution policy

Add packages/ts-shell/src/core/context/browserExecutionPolicy.ts.

Policy should decide whether an execution request may run.

Initial allowed subset:

- navigate:
  - only with explicit executor
  - must require network/runtime confirmation
- observe:
  - only with explicit executor
  - read-only
- extract:
  - only with explicit executor
  - read-only output shape only

Still blocked:

- auth
- payment
- destructive
- upload
- download
- screenshot/OCR
- persistent sessions
- arbitrary JavaScript
- hidden browser state
- click/type by default unless route can make them confirmation-required without execution risk

Policy outputs:

- allowed
- blocked-no-executor
- blocked-unsupported-action
- blocked-sensitive
- blocked-confirmation-required
- blocked-sandbox-required
- blocked-unsafe-target
- future-runtime-required

Required behavior:

- no provider/model calls
- no dynamic discovery
- clear reason and next action

Add focused tests.

### 4. Add executor interface and fake executor

Add packages/ts-shell/src/core/context/browserExecutor.ts.

Expected concepts:

- BrowserExecutor
- BrowserExecutorContext
- BrowserExecutorResult
- BrowserExecutorEvidence
- BrowserExecutorError
- NoopBrowserExecutor
- FakeBrowserExecutor for tests

Required behavior:

- default/noop executor always blocks
- fake executor returns deterministic evidence
- no real browser by default
- no raw content/secrets
- no provider/model calls
- result distinguishes:
  - executed
  - blocked
  - failed
  - skipped

Add focused tests.

### 5. Add Playwright CLI adapter seam

Add packages/ts-shell/src/core/context/browserPlaywrightCliAdapter.ts.

This adapter should not launch Playwright by default.

It should:

- translate BrowserExecutionRequest into a future Playwright CLI/Skills-style command plan
- identify required runtime dependencies
- identify expected evidence
- identify sandbox requirements
- return adapter plan / command description
- never spawn processes in this route unless explicitly fake/test path is used

Required behavior:

- no process spawn by default
- no network
- no browser launch
- no package dependency changes
- no raw content/secrets

Add focused tests.

### 6. Add execution result and surface

Add:

- packages/ts-shell/src/core/context/browserExecutionResult.ts
- packages/ts-shell/src/core/context/browserExecutionSurface.ts

Surface should render:

- Browser execution
- Action
- Mode
- Runtime
- Policy decision
- Evidence
- Warnings/blockers
- Executed: yes/no
- Next action

Required behavior:

- blocked result is useful
- fake executor success is clearly marked fake/test if applicable
- no raw content/secrets
- no hidden reasoning
- concise output

Add focused tests.

### 7. Add browser execution command contract/runner

Add:

- packages/ts-shell/src/core/context/browserExecutionCommandContract.ts
- packages/ts-shell/src/core/context/browserExecutionCommandRunner.ts

Preferred UX:

- `/browser execute navigate <url>`
- `/browser execute observe`
- `/browser execute extract <goal>`

Required behavior:

- without injected executor, command is blocked clearly
- with fake/test executor, command can return executed evidence
- preview/dry-run commands remain unchanged
- invalid args rejected clearly
- supported subset only
- no real browser launch by default

Add focused tests.

### 8. Integrate with `/browser`

Update browser command runtime if clean.

Required behavior:

- `/browser` status unchanged
- `/browser preview` unchanged
- `/browser dry-run` unchanged
- `/browser execute ...` routes to execution runner
- command context can carry optional browserExecutor
- no executor means blocked-no-executor
- execution/blocked result emits sanitized sidebar event if sink exists

Add focused tests.

### 9. Integrate with agent scenario harness

Add browser scenario fixtures or examples.

Required scenarios:

1. browser execute blocked by default

- run `/browser execute navigate https://example.com`
- assert blocked-no-executor
- assert Executed: no
- assert sidebar event appears
- assert no raw/secrets

2. browser fake executor success

- inject FakeBrowserExecutor
- run `/browser execute observe`
- assert Executed: yes
- assert fake/test evidence present
- assert sidebar event appears
- assert report safety passes

3. dry-run remains non-executing

- run `/browser dry-run navigate https://example.com`
- assert Executed: no
- assert no executor required

If scenario harness integration is too coupled, implement focused runner tests and document blocker.

### 10. Browser execution tests

Required tests:

- default/noop executor blocks
- fake executor success returns deterministic evidence
- execution policy blocks auth/payment/destructive/upload/download/screenshot
- navigate requires explicit executor
- observe/extract are read-only but still require explicit executor
- Playwright CLI adapter builds plan without spawning
- `/browser execute ...` blocked without executor
- `/browser execute ...` succeeds with fake executor
- sidebar event emitted for blocked/success result
- harness scenario covers blocked and fake success
- no provider/model/browser/MCP side effects

### 11. Docs and roadmap update

Update:

- docs/design/playwright-cli-non-default-browser-execution.md with final notes
- docs/design/browser-runtime-decision-dry-run-harness.md with Route 96 note
- docs/design/browser-capability-boundary-preview.md with Route 96 note
- docs/design/agent-scenario-harness-foundation.md with Route 96 note
- docs/design/sidebar-live-event-capture.md with Route 96 note
- docs/design/context-engineering-continuity-baseline.md with Route 96 note
- docs/design/edit-capability-roadmap.md with concise status and Route 97 recommendation

Recommended next route:

- Route 97: browser sandbox hardening and network allowlist
  - if non-default execution seam works
- or Route 97: real CLI scenario harness
  - if harness needs process-spawn coverage before browser runtime
- or Route 97: Playwright CLI real execution opt-in
  - only if sandbox/allowlist/confirmation are sufficient

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

If broad src/core/shell or src/session paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- real browser launch becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- package dependency changes become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- command parser becomes confusing or flag-heavy
- raw content/secrets would need to appear
- fake executor starts acting like a second browser runtime

## Final report

1. What changed
2. Reference scan summary
3. Execution mode and runtime decision
4. Scenario harness coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

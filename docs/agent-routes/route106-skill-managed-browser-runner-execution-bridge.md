# Route 106: skill-managed browser runner execution bridge

## Goal

Implement the explicit skill-managed browser runner execution bridge after Route 105.

Route 105 added:

- skill-managed browser runner metadata
- capability model
- readiness model
- skill runner manifest
- skill runner surface
- `/browser status` and `/browser execute` metadata/readiness explanations
- receipt/replay readiness integration
- sidebar/report summaries
- no dynamic discovery
- no skill execution

Route 106 should add the first explicit skill-managed execution bridge:

- skill-managed execution request/response contract
- explicit skill runner binding
- skill execution bridge over the existing external-runner/test-local process layer
- `/browser execute ...` can run through skill-managed mode only when an explicit valid manifest and runner binding are present
- local-fixture observe/extract/navigate-local only
- stable receipt and replay readiness
- sidebar/report/harness coverage
- real CLI scenarios for blocked/default, valid skill execution, invalid metadata, unsafe output, timeout, and external URL blocked

This route should make skill-managed mode real for local/test execution, but must not implement dynamic skill discovery, MCP skill execution, external network browsing, or default browser execution.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/skill-managed-browser-runner-metadata.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- external runner bridge exists
- test-local external runner execution works
- browser execution receipts exist
- replay readiness exists
- skill-managed runner metadata exists
- skill-managed readiness can report metadata-ready or future-execution-required
- skill-managed execution does not exist yet
- no dynamic skill discovery exists

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

- browser-use: /home/wang/projects/browser-use
- Playwright repo: /home/wang/projects/playwright

Budget:

- Playwright MCP: at most 7 files
- Stagehand: at most 7 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 30 files
- exceed by 2 only for directly relevant skill execution, tool bridge, runner binding, receipt, or harness files

Focus:

Playwright MCP:

- tool invocation protocol
- browser action schema
- execution result shape
- server/tool availability boundary
- dynamic discovery risk
- evidence summary shape

Stagehand:

- observe / extract / act execution handoff
- action cache/replay metadata
- skill-like action boundaries
- deterministic execution versus AI-mediated actions
- self-healing boundaries

OpenHands:

- tool runtime bridge
- action/observation event surface
- local/remote tool status
- blocked/unavailable tool execution
- UI/session report evidence

Inspect AI:

- tool execution configuration
- sandbox/tool binding
- transcript/report separation
- unavailable tool behavior
- scorer/assertion patterns

mini-swe-agent:

- minimal tool runner binding
- command trajectory
- execution evidence
- tool failure handling

Coding-agent baselines:

- command registry/tool binding
- permission and allowlist gates
- blocked default behavior
- CLI status/report output
- test-only tool injection

Answer in docs/design/skill-managed-browser-runner-execution-bridge.md:

1. What is the minimum safe skill-managed execution bridge?
2. How should skill runner binding differ from raw external runner manifests?
3. Which metadata must be present before execution is allowed?
4. How should receipts distinguish skill-managed execution from raw external runner execution?
5. How should CLI scenarios prove there is no dynamic discovery or default execution?
6. What should Route 107 own?

## This route changes

Allowed:

- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/skill-managed-browser-runner-metadata.md, Route 106 note only
- docs/design/browser-execution-evidence-replay-readiness.md, Route 106 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 106 note only
- docs/design/playwright-runtime-dependency-decision.md, Route 106 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 106 note only
- docs/design/real-cli-scenario-harness.md, Route 106 note only
- docs/design/agent-scenario-harness-foundation.md, Route 106 note only
- docs/design/sidebar-live-event-capture.md, Route 106 note only
- docs/design/context-engineering-continuity-baseline.md, Route 106 note only
- docs/design/edit-capability-roadmap.md, concise Route 106 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSkillExecutionProtocol.ts
- packages/ts-shell/src/core/context/browserSkillRunnerBinding.ts
- packages/ts-shell/src/core/context/browserSkillExecutionBridge.ts
- packages/ts-shell/src/core/context/browserSkillExecutionExecutor.ts
- packages/ts-shell/src/core/context/browserSkillExecutionSurface.ts
- packages/ts-shell/src/core/harness/browserSkillExecutionScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserSkillExecutionScenarioExamples.test.ts

Allowed if clean:

- extend skill runner manifest with explicit binding to test-local runner
- reuse external runner process adapter from Route 103
- map skill execution response into browser execution receipts from Route 104
- support observe/extract/navigate-local only
- add real CLI scenarios with explicit skill-managed manifest
- integrate skill execution result into sidebar and CLI report summaries

## This route must preserve

Route-specific boundaries:

- no dynamic skill discovery
- no MCP server launch
- no Playwright dependency
- no default browser execution
- no external network
- no provider/model calls
- no persistent browser session
- no auth/payment/destructive actions
- no file upload/download
- no arbitrary JavaScript execution
- no screenshot/OCR capture
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw page content/secrets/hidden reasoning in skill metadata, runner output, receipts, reports, sidebar events, or command output
- skill-managed execution must be explicit, local/test scoped, and auditable
- valid metadata alone must not imply authority to execute

## Tasks

### 1. Design and audit

Create docs/design/skill-managed-browser-runner-execution-bridge.md.

Include:

- Route 106 reference scan summary
- Route 105 metadata baseline
- skill-managed execution bridge model
- skill runner binding model
- metadata/readiness requirements
- execution protocol
- receipt/replay integration
- sidebar/report integration
- real CLI scenario strategy
- no dynamic discovery boundary
- no default execution boundary
- Route 107 recommendation

### 2. Add skill execution protocol

Add packages/ts-shell/src/core/context/browserSkillExecutionProtocol.ts.

Expected concepts:

- BrowserSkillExecutionRequest
- BrowserSkillExecutionResponse
- BrowserSkillExecutionAction:
  - observe
  - extract
  - navigate-local
- BrowserSkillExecutionStatus:
  - executed
  - blocked
  - unavailable
  - failed
  - timed-out
  - invalid-response
  - unsafe-output
- BrowserSkillExecutionMode:
  - skill-managed-test-local
  - skill-managed-explicit-local
  - future-skill-runtime
- BrowserSkillExecutionEvidence
- BrowserSkillExecutionError

Request should include:

- request id
- skill id
- skill runner metadata id/version
- action kind
- fixture/local target
- safe URL
- extraction goal if applicable
- sandbox decision
- allowlist decision
- confirmation decision
- evidence contract id
- replay contract id
- output budget

Response should include:

- status
- executed yes/no
- safe title
- safe URL
- safe observation summary
- safe extraction summary
- action trace summary
- receipt hints
- replay hints
- warnings
- redactions
- error summary

Must reject or redact:

- raw HTML
- raw page content beyond bounded summaries
- secrets/tokens/credentials
- hidden reasoning markers
- screenshots/OCR blobs
- arbitrary stdout/stderr payloads

Add focused tests.

### 3. Add skill runner binding model

Add packages/ts-shell/src/core/context/browserSkillRunnerBinding.ts.

Binding should explicitly connect metadata to a runnable local/test runner.

Expected concepts:

- BrowserSkillRunnerBinding
- BrowserSkillRunnerBindingSource:
  - cli-harness-manifest
  - explicit-local-config
  - test-only
  - disabled
- BrowserSkillRunnerBindingMode:
  - test-local-process
  - external-local-process
  - future-skill-runtime
- runner command/ref
- skill metadata reference
- supported action subset
- fixture scope
- sandbox contract
- evidence contract
- replay contract
- timeout/output budget
- redactions/warnings

Required behavior:

- disabled by default
- reject binding without matching skill metadata
- reject dynamic discovery claims
- reject unsafe/global/default runner paths
- reject unsupported actions
- reject external network mode
- reject raw secrets
- validate timeout/output budget
- deterministic serialization

Add focused tests.

### 4. Add skill execution bridge

Add packages/ts-shell/src/core/context/browserSkillExecutionBridge.ts.

Bridge should:

- validate skill metadata
- validate capability readiness
- validate binding
- validate sandbox/allowlist/confirmation decisions
- build skill execution request
- choose process adapter only for explicit local/test binding
- return unavailable/future-execution-required when binding is missing
- return blocked for unsafe metadata/capability/binding
- never dynamically discover skills

Required behavior:

- no execution without explicit binding
- no MCP call
- no provider/model call
- no external network
- no raw content/secrets in errors
- clear next action

Add focused tests.

### 5. Add skill execution executor

Add packages/ts-shell/src/core/context/browserSkillExecutionExecutor.ts.

Executor should implement or wrap the existing BrowserExecutor interface.

It should:

- consume validated skill execution bridge result
- reuse external runner process adapter when binding is test-local/external-local
- parse and validate skill execution response
- map response into BrowserExecutionResult
- create or attach BrowserExecutionReceipt
- set receipt source to skill-managed
- set replay readiness appropriately
- label execution mode clearly:
  - skill-managed-test-local
  - skill-managed-explicit-local
  - future-skill-runtime
- reject unsafe/malformed responses
- preserve Executed: yes/no accurately

Required behavior:

- no default enablement
- no dynamic discovery
- no MCP launch
- no external network
- no provider/model calls
- no persistent session
- no raw content/secrets

Add focused tests.

### 6. Add skill execution surface

Add packages/ts-shell/src/core/context/browserSkillExecutionSurface.ts.

Surface should render:

- Skill-managed browser execution
- Skill id/name
- Binding mode
- Action
- Execution status
- Evidence summary
- Receipt status
- Replay readiness
- Warnings/redactions
- Executed: yes/no
- Next action

Keep concise and user-facing.

Add focused tests.

### 7. Integrate with manifests and CLI bridge

Update browserSkillRunnerManifest, browserExternalRunnerManifest, browserCliExecutorInjection, and browserCliExecutionBridge as needed.

Required behavior:

- manifest can include skill metadata + skill runner binding
- missing binding means metadata-ready but future-execution-required
- invalid binding blocks safely
- valid test-local binding constructs skill execution executor
- existing raw external runner path remains working
- local-fixture path remains working
- no default enablement

Add focused tests.

### 8. Integrate with `/browser execute`

Update browser command runner/execution runner if clean.

Required behavior:

- `/browser status` shows skill metadata and binding status if manifest provides them
- `/browser execute observe local-fixture://demo` runs through skill-managed test-local binding only when valid manifest is present
- `/browser execute extract local-fixture://demo` runs through skill-managed test-local binding only when valid manifest is present
- `/browser execute navigate local-fixture://demo` can run only as local fixture
- external URL remains blocked
- unsafe/malformed/timeout skill response blocks safely
- output clearly says skill-managed mode and Executed: yes/no
- sidebar event emitted if sink exists

Add focused tests.

### 9. Integrate with receipts and replay readiness

Update browser execution receipt/replay readiness if clean.

Required behavior:

- receipt can identify skill-managed execution source
- receipt links skill metadata id/version and binding mode
- replay readiness can be replay-ready only for safe local/test skill-managed actions with complete evidence
- missing binding gives replay-needs-skill-runner
- unsafe skill output gives replay-unsafe or replay-blocked
- no automatic replay

Add focused tests.

### 10. Harness fixtures

Add packages/ts-shell/src/core/harness/browserSkillExecutionScenarioFixtures.ts.

Fixtures should:

- create valid skill metadata manifest
- create valid test-local skill binding
- create temp skill runner script
- create invalid metadata manifest
- create missing binding manifest
- create unsafe capability manifest
- create malformed-response runner
- create timeout runner
- create unsafe-output runner
- provide env for real CLI scenario harness
- cleanup temp files

Required behavior:

- temp/local only
- no secrets
- no network
- deterministic outputs
- no raw page content

Add focused tests if helper logic exists.

### 11. Scenario examples

Add packages/ts-shell/src/core/harness/browserSkillExecutionScenarioExamples.test.ts.

Required real CLI scenarios:

1. no manifest/default blocked

- `/browser execute observe local-fixture://demo`
- Executed: no

2. valid metadata but missing binding

- `/browser execute observe local-fixture://demo`
- future-execution-required
- Executed: no
- replay-needs-skill-runner

3. valid skill-managed test-local observe success

- explicit manifest + binding + temp runner
- `/browser execute observe local-fixture://demo`
- Executed: yes
- receipt source skill-managed
- replay-ready if evidence safe

4. valid skill-managed test-local extract success

- safe extraction summary
- receipt source skill-managed

5. external URL blocked

- valid skill manifest
- `/browser execute navigate https://example.com`
- Executed: no

6. unsafe skill capability rejected

- auth/payment/destructive/arbitrary-js capability
- blocked-unsafe-capability

7. malformed response blocked

- invalid-response
- no raw stdout leak

8. timeout blocked

- timed-out
- no hang

9. unsafe output rejected/redacted

- no secrets/raw content leak
- replay-unsafe or replay-blocked

### 12. Sidebar and report integration

Update sidebar event adapter / CLI report if clean.

Required behavior:

- skill-managed success appears as Browser execution event
- missing binding / invalid metadata / timeout / unsafe output appear as warning/blocker events
- report includes skill id, binding mode, receipt status, replay readiness
- report does not include raw runner output
- no cross-process sidebar persistence assumption

Add focused tests.

### 13. Tests

Required focused tests:

- protocol validates safe request/response
- binding validates safe test-local binding
- binding rejects missing metadata / dynamic discovery / unsafe actions
- bridge blocks missing binding
- bridge allows valid test-local binding
- executor returns executed receipt for safe response
- executor blocks malformed/timeout/unsafe response
- `/browser status` shows metadata + binding status
- `/browser execute` routes to skill-managed executor when manifest provides valid binding
- external URL blocked
- receipt source/replay readiness reflect skill-managed mode
- real CLI scenarios cover blocked/future/success/unsafe cases
- no package changes
- no provider/model/browser/MCP/network side effects beyond explicit temp runner process

### 14. Docs and roadmap update

Update:

- docs/design/skill-managed-browser-runner-execution-bridge.md with final notes
- docs/design/skill-managed-browser-runner-metadata.md with Route 106 note
- docs/design/browser-execution-evidence-replay-readiness.md with Route 106 note
- docs/design/browser-external-runner-skill-bridge.md with Route 106 note
- docs/design/playwright-runtime-dependency-decision.md with Route 106 note
- docs/design/browser-sandbox-network-allowlist.md with Route 106 note
- docs/design/real-cli-scenario-harness.md with Route 106 note
- docs/design/agent-scenario-harness-foundation.md with Route 106 note
- docs/design/sidebar-live-event-capture.md with Route 106 note
- docs/design/context-engineering-continuity-baseline.md with Route 106 note
- docs/design/edit-capability-roadmap.md with concise status and Route 107 recommendation

Recommended next route:

- Route 107: browser action cache/replay design
  - if skill-managed execution bridge works
- or Route 107: browser runner UX/report polish
  - if output is too noisy
- or Route 107: external-network browser execution design
  - only if local/skill-managed receipts are stable
- or Route 107: skill-managed runner packaging/registry decision
  - if dynamic discovery remains the next blocker

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
Do not add package scripts.

If real CLI scenario tests reveal unrelated existing CLI failures, narrow to safe subset and document blocker.

## Stop conditions

Stop and report if:

- skill execution bridge requires dynamic skill discovery
- MCP server launch becomes necessary
- external network becomes necessary
- Playwright package dependency becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- raw skill runner output/secrets would appear in output/report
- skill-managed execution becomes default
- metadata semantics imply execution without explicit binding

## Final report

1. What changed
2. Reference scan summary
3. Skill execution bridge design
4. Real CLI scenarios implemented
5. Receipt/replay integration
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

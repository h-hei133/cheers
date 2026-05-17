# Route 103: browser external runner and skill-managed execution bridge

## Goal

Implement the external-runner / skill-managed browser execution bridge chosen by Route 102.

Route 102 decided:

- Playwright should not be added as a package dependency now.
- Browser runtime strategy is external-runner-only.
- Future direction prefers skill-managed runner bridge.
- Default browser execution remains disabled.
- Playwright-local remains unavailable unless an explicit runner/checker is injected.

Route 103 should build the bridge that makes this policy usable:

- external browser runner protocol
- external runner manifest
- skill-managed runner policy
- external runner process adapter
- test-local runner harness
- `/browser execute ...` integration through explicit external runner manifest
- real CLI scenario coverage for default blocked, invalid runner, local-fixture external runner success, and external URL blocked
- sidebar/report evidence for external runner status

This route must not add Playwright dependency, launch MCP, discover tools dynamically, or enable default browser execution.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/real-playwright-local-only-execution.md
- docs/design/cli-browser-executor-injection-bridge.md
- docs/design/playwright-cli-real-execution-opt-in.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- dependency decision is external-runner-only
- no Playwright dependency exists
- `/browser status` surfaces runtime dependency decision
- CLI fixture manifest injection exists
- local-fixture executor works through explicit manifest
- playwright-local mode is deterministic unavailable unless explicit checker/runner is injected
- default `/browser execute` remains blocked

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
- Playwright repo: /home/wang/projects/playwright

Budget:

- Playwright MCP / optional Playwright repo or CLI: at most 8 files total
- Stagehand: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use: at most 3 files if present
- total default budget: 30 files
- exceed by 2 only for directly relevant external runner / tool protocol / skill-managed execution files

Focus:

Playwright MCP:

- tool protocol shape
- browser action request / response schema
- server lifecycle and status boundaries
- accessibility snapshot evidence
- MCP overhead / dynamic discovery risks

Stagehand:

- act / observe / extract command boundaries
- preview-to-execute handoff
- action result evidence
- cached action / reusable action boundary
- deterministic execution versus AI-mediated execution

OpenHands:

- tool runtime bridge
- action/observation event surface
- local/remote runtime status
- tool failure evidence

Inspect AI:

- external tool execution boundary
- sandbox/tool config
- transcript/log/report separation
- unavailable tool behavior

mini-swe-agent:

- external command runner
- tool trajectory
- process evidence
- minimal task runner configuration

Coding-agent baselines:

- CLI tool availability
- external command policy
- permission / allowlist
- status and evidence rendering
- blocked default behavior

Answer in docs/design/browser-external-runner-skill-bridge.md:

1. What should the external browser runner protocol look like?
2. How should skill-managed runner mode differ from raw external command mode?
3. What manifest fields are required for safe local execution?
4. What evidence must an external runner return?
5. How should unavailable, invalid, timed-out, and unsafe runner responses be surfaced?
6. What remains blocked until Route 104?

## This route changes

Allowed:

- docs/design/browser-external-runner-skill-bridge.md
- docs/design/playwright-runtime-dependency-decision.md, Route 103 note only
- docs/design/real-playwright-local-only-execution.md, Route 103 note only
- docs/design/cli-browser-executor-injection-bridge.md, Route 103 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 103 note only
- docs/design/real-cli-scenario-harness.md, Route 103 note only
- docs/design/agent-scenario-harness-foundation.md, Route 103 note only
- docs/design/context-engineering-continuity-baseline.md, Route 103 note only
- docs/design/edit-capability-roadmap.md, concise Route 103 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserExternalRunnerProtocol.ts
- packages/ts-shell/src/core/context/browserExternalRunnerManifest.ts
- packages/ts-shell/src/core/context/browserSkillManagedRunnerPolicy.ts
- packages/ts-shell/src/core/context/browserExternalRunnerProcess.ts
- packages/ts-shell/src/core/context/browserExternalRunnerExecutor.ts
- packages/ts-shell/src/core/context/browserExternalRunnerSurface.ts
- packages/ts-shell/src/core/harness/browserExternalRunnerScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserExternalRunnerScenarioExamples.test.ts

Allowed if clean:

- add explicit manifest field for external-runner / skill-managed runner mode
- add test-local external runner script created in temp dir by harness
- spawn that test-local runner only through explicit manifest in CLI scenario tests
- enforce timeout / stdout budget / stderr budget
- parse runner JSON response
- reject malformed / unsafe / raw-content responses
- route sanitized evidence into `/browser execute`
- emit sidebar event for external runner blocked/success/failure

## This route must preserve

Route-specific boundaries:

- no Playwright package dependency
- no package script/default gate changes
- no default browser execution
- no external network
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
- no raw page content/secrets/hidden reasoning in runner manifest, runner protocol, output, report, or sidebar event
- external runner execution must be explicit, local/test scoped, and auditable
- skill-managed mode is a policy/protocol boundary, not dynamic skill discovery

## Tasks

### 1. Design and audit

Create docs/design/browser-external-runner-skill-bridge.md.

Include:

- Route 103 reference scan summary
- Route 102 external-runner-only decision
- external runner protocol
- skill-managed runner policy
- manifest model
- runner process model
- timeout/output-budget policy
- response validation/redaction policy
- sidebar/reporting model
- real CLI scenario strategy
- no-default-execution boundary
- Route 104 recommendation

### 2. Add external runner protocol

Add packages/ts-shell/src/core/context/browserExternalRunnerProtocol.ts.

Expected concepts:

- BrowserExternalRunnerRequest
- BrowserExternalRunnerResponse
- BrowserExternalRunnerAction:
  - observe
  - extract
  - navigate-local
- BrowserExternalRunnerMode:
  - external-local
  - skill-managed
  - test-local
- BrowserExternalRunnerStatus:
  - executed
  - blocked
  - unavailable
  - failed
  - timed-out
  - invalid-response
- BrowserExternalRunnerEvidence
- BrowserExternalRunnerError

Request should include:

- request id
- action kind
- fixture id / local target
- safe URL
- extraction goal if applicable
- sandbox decision summary
- allowlist decision summary
- confirmation decision summary
- output budget

Response should include:

- status
- executed yes/no
- safe title
- safe URL
- safe observation summary
- safe extraction summary
- action trace summary
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

### 3. Add external runner manifest

Add packages/ts-shell/src/core/context/browserExternalRunnerManifest.ts.

Expected concepts:

- BrowserExternalRunnerManifest
- manifestVersion
- runnerMode:
  - test-local
  - external-local
  - skill-managed
- runnerCommand or runnerRef, depending on mode
- fixture scope
- allowed actions
- sandbox authority
- network allowlist
- confirmation state
- timeout
- output budget
- evidence policy
- source:
  - cli-harness
  - explicit-local-config
  - skill-managed
  - test-only
- redactions/warnings

Required behavior:

- validate manifest
- reject default/global runner paths
- reject external network modes
- reject unsafe actions
- reject missing timeout/budget
- reject raw secrets
- reject raw HTML fixtures unless summarized
- deterministic serialization for tests

Add focused tests.

### 4. Add skill-managed runner policy

Add packages/ts-shell/src/core/context/browserSkillManagedRunnerPolicy.ts.

Policy should define future skill-managed runner rules without dynamic discovery.

Expected concepts:

- BrowserSkillManagedRunnerPolicy
- BrowserSkillManagedRunnerDecision:
  - allowed
  - blocked-no-skill
  - blocked-dynamic-discovery
  - blocked-unsafe-scope
  - future-skill-required
- required skill metadata:
  - skill id
  - runner capability
  - fixture/local scope
  - allowed actions
  - evidence contract
  - sandbox contract

Required behavior:

- no skill discovery
- no MCP call
- skill-managed mode can only pass if explicit metadata is provided
- otherwise returns future-skill-required / blocked-no-skill
- no execution

Add focused tests.

### 5. Add external runner process adapter

Add packages/ts-shell/src/core/context/browserExternalRunnerProcess.ts.

Adapter should:

- spawn an explicitly configured local/test runner command only when manifest allows it
- pass request JSON through stdin or temp file
- capture stdout/stderr
- enforce timeout
- enforce stdout/stderr budget
- parse JSON response
- return invalid-response on malformed output
- return timed-out on timeout
- sanitize stderr/stdout summaries
- never execute without explicit manifest

Required behavior:

- no default command
- no global runner path
- no network
- no provider/model calls
- no raw stdout/stderr in result
- deterministic tests through temp test runner script

Add focused tests.

### 6. Add external runner executor

Add packages/ts-shell/src/core/context/browserExternalRunnerExecutor.ts.

Executor should implement the existing BrowserExecutor interface.

It should:

- consume validated manifest
- consume process adapter
- consume sandbox/allowlist/confirmation decisions
- build runner request
- execute external runner process only in allowed local/test modes
- validate runner response
- convert to BrowserExecutionResult
- label execution mode clearly:
  - external-local
  - test-local
  - skill-managed
  - unavailable
- reject unsafe/malformed responses
- preserve Executed: yes/no accurately

Required behavior:

- no external network
- no default enablement
- no raw content/secrets
- no provider/model calls
- no persistent session

Add focused tests.

### 7. Add external runner surface

Add packages/ts-shell/src/core/context/browserExternalRunnerSurface.ts.

Surface should render:

- External browser runner
- Mode
- Runner source
- Skill-managed status if relevant
- Request action
- Execution status
- Evidence summary
- Timeout/output budget
- Redactions/warnings
- Executed: yes/no
- Next action

Keep output concise.

Add focused tests.

### 8. Integrate manifest and CLI bridge

Update browserLocalFixtureManifest / browserCliExecutorInjection / browserCliExecutionBridge as needed.

Required behavior:

- manifest can specify external-runner mode
- manifest can specify skill-managed mode but execution is blocked unless explicit metadata is present
- manifest can specify test-local runner command created by harness
- invalid external runner manifest blocks safely
- no manifest remains disabled
- existing local-fixture executor path remains working
- playwright-local unavailable path remains working

Add focused tests.

### 9. Integrate `/browser execute`

Update browser execution command runner only if needed.

Required behavior:

- `/browser execute observe local-fixture://demo` can run through explicit test-local external runner manifest
- `/browser execute extract local-fixture://demo` can run through explicit test-local external runner manifest
- `/browser execute navigate local-fixture://demo` can run only as local fixture
- external URL remains blocked
- malformed runner response blocks
- timeout blocks
- unsafe runner output is redacted or rejected
- output clearly says external runner mode and Executed: yes/no
- sidebar event emitted if sink exists

Add focused tests.

### 10. Harness fixtures and real CLI scenarios

Add packages/ts-shell/src/core/harness/browserExternalRunnerScenarioFixtures.ts.

Fixtures should:

- create temp external runner script
- create valid manifest
- create invalid manifest
- create timeout runner
- create malformed-response runner
- create unsafe-output runner
- provide env for real CLI scenario harness
- cleanup temp files

Add packages/ts-shell/src/core/harness/browserExternalRunnerScenarioExamples.test.ts.

Required real CLI scenarios:

1. default no manifest remains blocked

- `/browser execute observe local-fixture://demo`
- Executed: no

2. valid test-local external runner observe success

- manifest points to temp runner
- `/browser execute observe local-fixture://demo`
- Executed: yes
- safe evidence appears

3. valid test-local external runner extract success

- manifest points to temp runner
- `/browser execute extract local-fixture://demo`
- Executed: yes
- safe extraction summary appears

4. external URL blocked even with runner

- valid runner manifest
- `/browser execute navigate https://example.com`
- Executed: no

5. malformed runner response blocked

- manifest points to malformed runner
- result invalid-response
- no raw stdout leak

6. timeout runner blocked

- manifest points to timeout runner
- result timed-out
- no hang

7. unsafe runner output rejected/redacted

- manifest points to unsafe-output runner
- no secret/raw content leaks

### 11. Sidebar and report integration

Update sidebar event adapter / CLI report if clean.

Required behavior:

- external runner success appears as Browser execution event
- timeout/invalid response appears as warning/error event
- report includes runner mode/source/status
- report does not include raw runner output
- no cross-process sidebar persistence assumption

Add focused tests.

### 12. Tests

Required focused tests:

- protocol validates safe request/response
- protocol rejects raw/secret response
- manifest validates safe test-local runner
- manifest rejects unsafe/global/default runner
- skill-managed policy blocks without explicit metadata
- process adapter handles success/malformed/timeout/unsafe output
- external runner executor returns executed evidence for safe response
- external runner executor blocks unsafe response
- `/browser execute` routes to external runner when manifest provided
- external URL blocked
- real CLI scenarios cover success/block/timeout/malformed/unsafe
- no package changes
- no provider/model/browser/MCP/network side effects beyond explicit temp runner process

### 13. Docs and roadmap update

Update:

- docs/design/browser-external-runner-skill-bridge.md with final notes
- docs/design/playwright-runtime-dependency-decision.md with Route 103 note
- docs/design/real-playwright-local-only-execution.md with Route 103 note
- docs/design/cli-browser-executor-injection-bridge.md with Route 103 note
- docs/design/browser-sandbox-network-allowlist.md with Route 103 note
- docs/design/real-cli-scenario-harness.md with Route 103 note
- docs/design/agent-scenario-harness-foundation.md with Route 103 note
- docs/design/context-engineering-continuity-baseline.md with Route 103 note
- docs/design/edit-capability-roadmap.md with concise status and Route 104 recommendation

Recommended next route:

- Route 104: browser external runner evidence/report hardening
  - if external runner bridge works and evidence needs polish
- or Route 104: skill-managed runner metadata prototype
  - if skill-managed mode should become real
- or Route 104: browser action cache/replay design
  - if Stagehand-like repeatability should come next
- or Route 104: external-network browser execution design
  - only if local external runner bridge is stable

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

- external runner bridge requires package changes
- external runner bridge requires default browser execution
- external runner bridge requires external network
- external runner bridge requires MCP server launch
- external runner bridge requires provider/model calls
- external runner bridge requires SessionManager schema changes
- CLI lifecycle rewrite becomes necessary
- runner manifest semantics become unsafe or confusing
- raw runner output/secrets would appear in output/report
- temp runner process tests become flaky or hang-prone

## Final report

1. What changed
2. Reference scan summary
3. External runner bridge design
4. Skill-managed policy status
5. Real CLI scenarios implemented
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

# Route 117: external-network runner handoff protocol and simulated execution harness

## Goal

Add an external-network browser runner handoff protocol and simulated execution harness without performing real network execution.

Route 116 added the external-network execution opt-in bridge, disabled by default. It can route external URLs into bridge output and produce ready-for-future-runner / blocked states, but there is still no external-network runner handoff.

Route 117 should add the next layer:

- external-network runner manifest
- network-capable runner policy
- external-network handoff request / response protocol
- simulated external-network runner for tests and CLI harness
- external-network handoff receipt
- /browser execute external URL can reach simulated handoff only when all gates are complete
- output explicitly says real network execution did not happen
- real CLI scenario coverage

This route proves the full external-network handoff chain without launching a browser or making network requests.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-external-network-runner-handoff.md
- docs/design/edit-capability-roadmap.md: concise Route 117 note only

Do not append Route 117 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/browser-self-healing-apply-cli-harness.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- local/test browser execution works
- skill-managed local/test execution works
- external URL routes into disabled external-network bridge
- external-network bridge can classify missing allowlist, missing confirmation, disabled runner, and ready-for-future-runner
- no external-network runner manifest exists
- no external-network runner handoff protocol exists
- no simulated external-network handoff exists

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 8 files
- Stagehand: at most 7 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 30 files
- exceed by 2 only for directly relevant external runner, network handoff, browser tool protocol, permission, evidence, or CLI harness files

Focus:

- Playwright MCP: browser tool request/response schema, tool status, external browser action boundaries, network-capable tool risks
- Stagehand: external site observe/extract/act handoff, action result shape, confirmation-before-action, deterministic versus AI-mediated action boundary
- OpenHands: external tool runtime handoff, action/observation evidence, blocked/unavailable tool reporting
- Inspect AI: sandbox/tool handoff, simulated tool execution, report/evidence separation
- mini-swe-agent: external command runner configuration, CLI trajectory evidence, unavailable/failure reports
- coding-agent baselines: permission prompts, external command policy, allowlist/preflight, command result evidence

Answer in docs/design/browser-external-network-runner-handoff.md:

1. What must an external-network runner manifest declare?
2. What should a handoff request and response contain?
3. How does simulated handoff differ from real network execution?
4. Which gates must be complete before handoff?
5. What receipt/evidence proves no real network happened?
6. What should Route 118 own?

## This route changes

Allowed:

- docs/design/browser-external-network-runner-handoff.md
- docs/design/edit-capability-roadmap.md, concise Route 117 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserExternalNetworkRunnerManifest.ts
- packages/ts-shell/src/core/context/browserExternalNetworkHandoffProtocol.ts
- packages/ts-shell/src/core/context/browserExternalNetworkHandoffPolicy.ts
- packages/ts-shell/src/core/context/browserExternalNetworkHandoffExecutor.ts
- packages/ts-shell/src/core/context/browserExternalNetworkHandoffReceipt.ts
- packages/ts-shell/src/core/context/browserExternalNetworkHandoffSurface.ts
- packages/ts-shell/src/core/harness/browserExternalNetworkHandoffScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserExternalNetworkHandoffScenarioExamples.test.ts

Allowed if clean:

- extend /browser execute external URL path to call simulated external-network handoff only when all gates are complete
- add explicit external-network runner manifest env support for CLI harness
- add simulated external runner process or in-process adapter for tests
- integrate handoff receipt with existing external-network receipt/report/sidebar summaries
- support navigate/observe/extract only as simulated external-network handoff actions

## Boundaries

Preserve:

- no real external network request
- no browser launch
- no real external runner network execution
- no MCP launch
- no dynamic skill discovery
- no Playwright dependency
- no provider/model calls
- no automatic allowlist update
- no automatic confirmation
- no automatic replay
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no auth/payment/destructive/upload/download/screenshot/OCR
- no raw page content, URL credentials, secrets, or hidden reasoning in manifests, handoff requests, receipts, reports, or output

Simulated external-network handoff is not real browser/network execution. Output must say real network execution: no.

## Tasks

### 1. Design

Create docs/design/browser-external-network-runner-handoff.md.

Keep it concise.

Include:

- reference scan summary
- Route 116 bridge baseline
- external-network runner manifest model
- handoff request/response protocol
- simulated runner model
- required gates before handoff
- receipt/report/sidebar model
- no-real-network boundary
- Route 118 recommendation

### 2. Add external-network runner manifest

Add browserExternalNetworkRunnerManifest.ts.

Manifest fields:

- manifest version
- source: cli-harness, explicit-local-config, test-only
- runner mode:
  - simulated-external
  - disabled
  - future-real-external
- allowed origins
- allowed action kinds: navigate, observe, extract
- disallowed sensitive actions
- timeout/output budgets
- evidence contract
- network execution flag, must be false for simulated-external
- warnings

Required behavior:

- explicit manifest path/context required
- no default runner manifest
- reject wildcard all origins
- reject credential URLs
- reject unsafe schemes
- reject auth/payment/destructive/upload/download/screenshot/OCR
- reject networkExecution:true in this route
- deterministic serialization
- no raw secrets

Add focused tests.

### 3. Add handoff protocol

Add browserExternalNetworkHandoffProtocol.ts.

Request fields:

- request id
- action kind
- target origin
- safe URL summary
- allowlist status
- confirmation status
- sandbox/preflight status
- runner mode
- evidence requirements
- output budget
- realNetworkExecution: false

Response fields:

- status: simulated, blocked, unavailable, invalid-response, timed-out, unsafe-output
- executed: false for simulated handoff unless route explicitly models simulated executed as non-network
- realNetworkExecution: false
- safe title/summary if simulated
- warnings
- redactions
- error summary

Must reject/redact:

- raw page content
- URL credentials
- secrets
- hidden reasoning markers
- screenshot/OCR payloads
- raw stdout/stderr over budget

Add focused tests.

### 4. Add handoff policy

Add browserExternalNetworkHandoffPolicy.ts.

Policy should require:

- valid external URL intent
- existing allowlist decision pass
- existing confirmation decision pass
- existing sandbox/preflight pass
- valid runner manifest
- runner mode simulated-external
- action kind navigate/observe/extract only
- realNetworkExecution false

Policy statuses:

- handoff-allowed-simulated
- blocked-no-allowlist
- blocked-no-confirmation
- blocked-sandbox
- blocked-no-runner-manifest
- blocked-runner-disabled
- blocked-real-network-not-allowed
- blocked-sensitive-action
- blocked-unsafe-url
- future-real-runner-required

Add focused tests.

### 5. Add handoff executor

Add browserExternalNetworkHandoffExecutor.ts.

Executor should:

- consume policy-approved handoff request
- run only simulated external runner path
- never call network
- optionally call a temp simulated runner script only if explicit manifest says test-only simulated and command is local
- validate response
- return sanitized result
- mark realNetworkExecution: false
- mark browserLaunched: false

Add focused tests.

### 6. Add handoff receipt

Add browserExternalNetworkHandoffReceipt.ts.

Receipt should include:

- receipt id
- target origin
- action kind
- runner mode
- gate summary
- simulated handoff status
- real network execution: no
- browser launched: no
- evidence summary
- warnings/redactions
- next action

Add focused tests.

### 7. Add handoff surface

Add browserExternalNetworkHandoffSurface.ts.

Render:

- External browser runner handoff
- Origin
- Action
- Gates
- Runner mode
- Simulated handoff
- Real network execution: no
- Browser launched: no
- Receipt
- Next action

Keep concise.

Add focused tests.

### 8. Integrate with /browser execute

Update /browser execute external URL path if clean.

Required behavior:

- missing gates remain blocked as before
- complete gates plus no runner manifest -> ready/future runner or blocked-no-runner-manifest
- complete gates plus simulated runner manifest -> simulated handoff output
- output says real network execution: no
- local/test execution path unchanged

Add focused tests.

### 9. CLI harness fixtures

Add browserExternalNetworkHandoffScenarioFixtures.ts.

Fixtures should create:

- explicit allowlist/confirmation context or manifest required by current code
- simulated external runner manifest
- disabled runner manifest
- invalid runner manifest
- unsafe output runner if process path is used
- env for real CLI scenario
- cleanup helper

No external network, no secrets.

### 10. Scenario coverage

Add browserExternalNetworkHandoffScenarioExamples.test.ts.

Required scenarios:

1. no allowlist -> blocked
2. allowlist but no confirmation -> blocked
3. complete gates but no runner manifest -> future/blocked no runner
4. complete gates plus disabled runner -> blocked-runner-disabled
5. complete gates plus simulated runner -> simulated handoff, real network no
6. credential URL blocked and redacted
7. unsupported/private URL blocked
8. sensitive actions blocked
9. invalid runner manifest blocked
10. local/test execution unchanged
11. real CLI scenario: simulated handoff output says real network execution: no

### 11. Sidebar/report integration

If clean:

- report includes external-network handoff status
- sidebar summary includes simulated/blocked handoff status
- no raw URL credentials or secrets

Add focused tests if touched.

### 12. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 117 added external-network runner handoff protocol with simulated execution only
- real external network still not executed
- next route recommendation

Recommended next route:

- Route 118: real external-network runner design, still disabled by default
- or Route 118: external-network handoff report/UX polish
- or Route 118: replay/report UX polish if network should wait

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

## Stop conditions

Stop and report if:

- handoff requires actual network execution
- handoff requires browser launch
- handoff requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw URL credentials/secrets would appear
- global allowlist/session mutation becomes necessary
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. External-network handoff design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

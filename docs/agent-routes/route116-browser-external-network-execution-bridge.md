# Route 116: external-network browser execution opt-in bridge, disabled by default

## Goal

Add an external-network browser execution opt-in bridge without performing external network execution.

This route replaces the thinner standalone readiness-gate route.

The local/test browser stack is already mature:

- explicit external runner bridge
- skill-managed local/test execution
- execution receipts
- replay readiness and explicit replay
- persistent sanitized cache
- cache hardening and multiprocess stress
- replay repair readiness
- self-healing proposal/apply/manifest patch writer
- cross-process self-healing CLI harness

Route 116 should now advance the external-network path by adding a disabled-by-default opt-in execution bridge:

- external-network execution mode
- external URL intent normalization
- external runner readiness bridge
- external execution risk receipt
- /browser execute external URL path through existing preflight/gates
- CLI/harness coverage for incomplete gates, complete gates but disabled runner, and unsafe URLs
- no actual external network request
- no browser launch
- no MCP launch
- no default execution

The output of a fully gated external request should be "ready for future external runner" or "blocked by disabled runner", not actual execution.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-external-network-execution-bridge.md
- docs/design/edit-capability-roadmap.md: concise Route 116 note only

Do not append Route 116 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-self-healing-apply-cli-harness.md
- docs/design/browser-self-healing-manifest-patch-writer.md
- docs/design/browser-self-healing-explicit-apply.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- local/test browser execution works through explicit runner manifests
- skill-managed local/test execution works
- external URL execution remains blocked
- sandbox, allowlist, confirmation, receipt, replay, and CLI harness layers already exist
- no external-network execution bridge exists
- no external-network runner exists

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

- Playwright MCP: at most 7 files
- Stagehand: at most 7 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 29 files
- exceed by 2 only for directly relevant external-network, browser runner, permission, confirmation, execution receipt, or report files

Focus:

- Playwright MCP: browser tool boundaries, origin/network status, action schema, server/tool safety
- Stagehand: external site action gating, observe/extract/act split, preview-before-execute, confirmation boundary
- OpenHands: tool permission, browser/action status, blocked tool execution reasons
- Inspect AI: sandbox/tool permission, unavailable tool reports, safe execution evidence
- mini-swe-agent: CLI trajectory evidence and explicit tool configuration
- coding-agent baselines: allowlists, command preflight, permission prompts, external command safety

Answer in docs/design/browser-external-network-execution-bridge.md:

1. What external-network execution bridge is needed beyond existing local/test execution?
2. Which existing gates should be reused rather than re-modeled?
3. What does disabled-by-default external runner mean?
4. What receipt/evidence must be generated when external execution is blocked or ready-but-disabled?
5. What remains blocked until Route 117?
6. What should Route 117 own?

## This route changes

Allowed:

- docs/design/browser-external-network-execution-bridge.md
- docs/design/edit-capability-roadmap.md, concise Route 116 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserExternalNetworkExecutionMode.ts
- packages/ts-shell/src/core/context/browserExternalNetworkExecutionBridge.ts
- packages/ts-shell/src/core/context/browserExternalNetworkRunnerPolicy.ts
- packages/ts-shell/src/core/context/browserExternalNetworkExecutionReceipt.ts
- packages/ts-shell/src/core/context/browserExternalNetworkExecutionSurface.ts
- packages/ts-shell/src/core/harness/browserExternalNetworkExecutionScenarioExamples.test.ts

Allowed if clean:

- reuse existing browserNetworkAllowlist, browserExecutionConfirmation, browserRuntimePreflight, browserExecutionReceipt, and browserExternalRunner policy modules
- add only thin external-network bridge modules instead of duplicating Route 97 gates
- extend /browser execute navigate https://... to produce external-network bridge output
- add disabled/unavailable external runner policy
- add fake disabled external runner only if needed for deterministic tests
- add CLI scenarios for blocked and ready-but-disabled external execution
- add report/sidebar summaries if clean

## Boundaries

Preserve:

- no actual external network request
- no browser launch
- no external runner network execution
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
- no raw page content, URL credentials, secrets, or hidden reasoning in manifests, receipts, reports, or output

External-network bridge is not authority to execute network actions in this route.

## Tasks

### 1. Design

Create docs/design/browser-external-network-execution-bridge.md.

Keep it concise.

Include:

- reference scan summary
- existing gate reuse audit
- external-network execution mode
- disabled external runner policy
- bridge decision matrix
- receipt/report model
- CLI scenario plan
- no-network-execution boundary
- Route 117 recommendation

### 2. Add external-network execution mode

Add browserExternalNetworkExecutionMode.ts.

Expected concepts:

- BrowserExternalNetworkExecutionMode
- mode values:
  - disabled
  - blocked-by-policy
  - ready-for-future-runner
  - explicit-external-runner-required
  - future-runtime-required
- action kind
- normalized origin
- risk level
- executed: false
- next action

Required behavior:

- no execution
- no network calls
- deterministic classification
- redacts credential URLs

Add focused tests.

### 3. Add external runner policy

Add browserExternalNetworkRunnerPolicy.ts.

Policy should decide whether external-network execution can call a runner.

Current allowed output:

- blocked-no-runner
- blocked-runner-disabled
- blocked-unsupported-action
- blocked-sensitive-action
- ready-for-future-runner

Rules:

- disabled by default
- no runner process is called
- no MCP is called
- no external network is allowed
- only navigate/observe/extract may reach ready-for-future-runner
- click/type remain future confirmation-required or blocked unless already represented safely
- auth/payment/destructive/upload/download/screenshot/OCR always blocked

Add focused tests.

### 4. Add external-network execution bridge

Add browserExternalNetworkExecutionBridge.ts.

Bridge should consume existing pieces:

- browser execution request
- normalized external origin / URL
- existing network allowlist decision
- existing confirmation decision
- existing sandbox/preflight decision
- external runner policy

Bridge should output:

- blocked / ready-for-future-runner / future-runtime-required
- blockers
- warnings
- evidence requirements
- executed: false
- next action

Do not duplicate existing allowlist/confirmation/preflight logic. Reuse it.

Add focused tests.

### 5. Add external-network execution receipt

Add browserExternalNetworkExecutionReceipt.ts.

Receipt should include:

- receipt id
- target origin
- action kind
- allowlist status
- confirmation status
- sandbox/preflight status
- external runner status
- risk level
- blocked reasons
- readiness status
- executed: false
- next action

Receipt must redact credential URLs and never include raw page content.

Add focused tests.

### 6. Add external-network execution surface

Add browserExternalNetworkExecutionSurface.ts.

Render:

- External browser execution
- Origin
- Action
- Gate status
- Runner status
- Risk receipt
- Executed: no
- Next action

Keep concise.

Add focused tests.

### 7. Integrate with /browser execute

Update browser command/execution runner if clean.

Required behavior:

- /browser execute navigate https://example.com enters external-network bridge
- missing allowlist remains blocked
- missing confirmation remains blocked
- complete gates still do not execute network and return ready-for-future-runner or blocked-runner-disabled
- local/test execution remains unchanged
- output includes Executed: no

Add focused tests.

### 8. Integrate with dry-run/status if clean

Keep this minimal.

Required behavior if touched:

- /browser dry-run navigate https://example.com can mention external-network bridge requirements
- /browser status can mention external-network execution disabled by default
- no large status output

Add focused tests if touched.

### 9. Scenario coverage

Add browserExternalNetworkExecutionScenarioExamples.test.ts.

Required scenarios:

1. external URL with no allowlist -> blocked
2. allowlisted origin but no confirmation -> blocked
3. allowlist + confirmation + sandbox represented -> ready-for-future-runner but Executed: no
4. disabled runner -> blocked-runner-disabled
5. credential URL blocked and redacted
6. unsupported scheme blocked
7. private network blocked by default
8. auth/payment/destructive/upload/download/screenshot blocked
9. local/test execution path unchanged
10. CLI scenario: /browser execute navigate https://example.com remains no-network and Executed: no

### 10. Sidebar/report integration

If clean:

- report includes external-network bridge status
- sidebar summary includes blocked/ready-for-future-runner status
- no raw URL credentials or secrets

Add focused tests if touched.

### 11. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 116 added external-network execution opt-in bridge, disabled by default
- external network still not executed
- next route recommendation

Recommended next route:

- Route 117: external-network runner design with real execution still disabled by default
- or Route 117: external-network CLI harness polish
- or Route 117: replay/report UX polish if browser network should wait

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

- bridge requires actual network execution
- bridge requires browser launch
- bridge requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw URL credentials/secrets would appear
- global allowlist/session mutation becomes necessary
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. External-network bridge design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

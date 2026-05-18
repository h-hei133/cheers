# Route 118: controlled-network external browser runner harness

## Goal

Add a controlled-network external browser runner harness after Route 117 simulated external-network handoff.

Route 117 added:

- external-network runner manifest
- handoff request/response protocol
- handoff policy
- simulated external handoff executor
- handoff receipt/surface
- /browser execute external URL path that can reach simulated handoff only when gates are complete

Route 118 should move beyond pure simulation by adding a test-only controlled-network harness:

- controlled local HTTP server fixture
- network-capable test runner manifest
- controlled-network runner policy
- controlled-network executor over explicit local test server only
- controlled-network receipt/evidence
- real CLI scenarios proving actual local HTTP request happened only inside harness
- public external network remains blocked

This route should prove network-shaped browser runner plumbing without allowing public internet browsing.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-controlled-network-runner-harness.md
- docs/design/edit-capability-roadmap.md: concise Route 118 note only

Do not append Route 118 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-external-network-runner-handoff.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-self-healing-apply-cli-harness.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- local/test browser execution works
- skill-managed local/test execution works
- external-network bridge exists
- simulated external-network handoff exists
- real public external network is blocked
- no controlled-network actual HTTP harness exists
- no network-capable test runner exists

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
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 31 files
- exceed by 2 only for directly relevant controlled server, browser/network runner, network permission, evidence, or CLI harness files

Focus:

- Playwright MCP: browser context/network tool boundaries, local server/test patterns if present, tool result evidence
- Stagehand: external site observe/extract execution, controlled action boundaries, test server or evaluation patterns if present
- OpenHands: sandboxed network/tool execution, action/observation evidence, runtime/network status
- Inspect AI: controlled tool/sandbox network tests, transcript evidence, scorer/report separation
- mini-swe-agent: subprocess runner, controlled environment, CLI trajectory evidence
- coding-agent baselines: allowlist, confirmation, command preflight, network denial, local test harnesses

Answer in docs/design/browser-controlled-network-runner-harness.md:

1. What makes controlled-network execution different from public external-network execution?
2. What exact origins are allowed in this route?
3. What must the network-capable test runner prove?
4. What evidence proves the request stayed inside the controlled harness?
5. What remains blocked until Route 119?
6. What should Route 119 own?

## This route changes

Allowed:

- docs/design/browser-controlled-network-runner-harness.md
- docs/design/edit-capability-roadmap.md, concise Route 118 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserControlledNetworkOrigin.ts
- packages/ts-shell/src/core/context/browserControlledNetworkRunnerManifest.ts
- packages/ts-shell/src/core/context/browserControlledNetworkPolicy.ts
- packages/ts-shell/src/core/context/browserControlledNetworkExecutor.ts
- packages/ts-shell/src/core/context/browserControlledNetworkReceipt.ts
- packages/ts-shell/src/core/context/browserControlledNetworkSurface.ts
- packages/ts-shell/src/core/harness/browserControlledNetworkServer.ts
- packages/ts-shell/src/core/harness/browserControlledNetworkScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserControlledNetworkScenarioExamples.test.ts

Allowed if clean:

- start a test-only local HTTP server inside focused tests
- use loopback origin only when explicit controlled-network manifest allows it
- allow controlled-network runner to fetch the local test server only
- prove response summary/evidence is sanitized
- integrate controlled-network receipt with /browser execute output
- add real CLI scenario using controlled local server if stable
- keep public external URL path blocked or ready-for-future-runner only

## Boundaries

Preserve:

- no public internet access
- no arbitrary external network
- no browser launch unless route explicitly uses a test-only non-browser HTTP runner
- no Playwright dependency
- no MCP launch
- no dynamic skill discovery
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
- no raw page content, URL credentials, secrets, or hidden reasoning in manifests, receipts, reports, cache, or output

Controlled-network execution is allowed only for test-local loopback server fixtures explicitly created by the harness.

## Tasks

### 1. Design

Create docs/design/browser-controlled-network-runner-harness.md.

Keep it concise.

Include:

- reference scan summary
- Route 117 simulated baseline
- controlled-network definition
- allowed origins and blocked origins
- runner manifest model
- test server model
- evidence/receipt model
- public internet blocked boundary
- Route 119 recommendation

### 2. Add controlled-network origin model

Add browserControlledNetworkOrigin.ts.

Expected behavior:

- allow only explicit loopback test origin created by harness
- reject public internet origins
- reject wildcard origins
- reject credential URLs
- reject unsupported schemes
- reject private network unless exact harness-issued loopback origin matches
- normalize origin safely
- no network calls

Add focused tests.

### 3. Add controlled-network runner manifest

Add browserControlledNetworkRunnerManifest.ts.

Manifest fields:

- manifest version
- source: cli-harness, test-only
- runner mode: controlled-network-test
- allowed loopback origin
- allowed action kinds: navigate, observe, extract
- server nonce or test run id
- timeout/output budgets
- evidence contract
- publicNetworkAllowed: false
- browserLaunchAllowed: false unless explicitly test-only future route
- warnings

Required behavior:

- explicit manifest path/context required
- no default manifest
- reject public origins
- reject wildcard origins
- reject auth/payment/destructive/upload/download/screenshot/OCR
- deterministic serialization
- no raw secrets

Add focused tests.

### 4. Add controlled-network policy

Add browserControlledNetworkPolicy.ts.

Policy should require:

- valid controlled origin
- explicit controlled-network manifest
- allowlist and confirmation pass using existing gates where possible
- sandbox/preflight pass
- action kind navigate/observe/extract only
- public network disabled
- browser launch disabled

Statuses:

- controlled-network-allowed
- blocked-no-controlled-manifest
- blocked-public-origin
- blocked-origin-mismatch
- blocked-no-confirmation
- blocked-no-allowlist
- blocked-sensitive-action
- blocked-browser-launch
- blocked-unsafe-url

Add focused tests.

### 5. Add controlled-network executor

Add browserControlledNetworkExecutor.ts.

Executor should:

- execute only policy-approved controlled-network requests
- use injected fetch/process runner or Node http/undici only if existing project dependency allows and no package changes are needed
- connect only to harness-issued loopback origin
- enforce timeout/output budget
- produce safe observation/extraction summary
- mark publicNetwork: no
- mark browserLaunched: no
- reject redirects to non-controlled origins
- reject raw content over budget
- redact secrets

If implementation cannot safely issue HTTP request without dependency/package changes, implement executor unavailable and document blocker. Do not force package changes.

Add focused tests.

### 6. Add controlled-network receipt

Add browserControlledNetworkReceipt.ts.

Receipt fields:

- receipt id
- controlled origin
- action kind
- policy status
- request status
- public network: no
- browser launched: no
- safe status code summary if available
- safe title/summary/extraction summary
- timeout/output budget
- redactions/warnings
- executed: yes/no
- next action

Add focused tests.

### 7. Add controlled-network surface

Add browserControlledNetworkSurface.ts.

Render:

- Controlled browser network execution
- Origin
- Action
- Policy
- Public network: no
- Browser launched: no
- Executed: yes/no
- Evidence summary
- Receipt
- Next action

Keep concise.

Add focused tests.

### 8. Add controlled-network test server

Add browserControlledNetworkServer.ts.

Server should:

- bind to loopback only
- choose dynamic port
- expose deterministic test pages/endpoints
- include test nonce or run id
- provide cleanup helper
- expose origin to manifest fixture
- never serve secrets/raw large content
- support slow response for timeout test if clean

Add focused tests.

### 9. Integrate with /browser execute

Update external-network handoff path if clean.

Required behavior:

- public https://example.com remains simulated/blocked, not controlled-network executed
- harness-issued loopback origin with controlled manifest can execute controlled-network request
- output clearly says public network: no, browser launched: no
- local/test fixture execution remains unchanged
- simulated handoff remains available

Add focused tests.

### 10. Harness fixtures and scenarios

Add browserControlledNetworkScenarioFixtures.ts and browserControlledNetworkScenarioExamples.test.ts.

Required scenarios:

1. public URL remains blocked/not executed
2. controlled loopback origin without manifest blocked
3. controlled loopback origin with manifest but no confirmation blocked
4. controlled loopback origin with gates complete executes controlled request
5. observe/extract produce sanitized evidence
6. redirect to public origin blocked
7. credential URL redacted/blocked
8. timeout handled safely
9. sensitive actions blocked
10. real CLI scenario uses controlled server and confirms public network: no

### 11. Sidebar/report integration

If clean:

- report includes controlled-network status
- sidebar summary includes controlled-network executed/blocked status
- no raw content or secrets

Add focused tests if touched.

### 12. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 118 added controlled-network external runner harness
- public external network remains blocked
- next route recommendation

Recommended next route:

- Route 119: public external-network execution design with real runner still opt-in
- or Route 119: controlled-network evidence/report polish
- or Route 119: browser runner dependency/tooling decision if controlled network exposes runtime gap

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

- controlled-network requires public internet access
- browser launch becomes necessary
- Playwright dependency becomes necessary
- MCP launch becomes necessary
- dynamic skill discovery becomes necessary
- provider/model calls become necessary
- raw page content/secrets would appear
- global allowlist/session mutation becomes necessary
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Controlled-network execution design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

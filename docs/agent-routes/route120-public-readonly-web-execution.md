# Route 120: public read-only web execution opt-in

## Goal

Add the first real public read-only web execution path, explicitly opt-in and guarded by existing network safety layers.

Route 118 added controlled-network loopback HTTP execution.
Route 119 added egress guard, redirect policy, and network audit records.

Route 120 should now add a real public read-only web runner:

- public HTTPS GET/HEAD only
- explicit opt-in manifest required
- explicit origin allowlist required
- explicit confirmation required
- egress guard required before request and after redirects
- no browser launch
- no Playwright dependency
- no JavaScript execution
- no cookies/auth/session
- no POST/PUT/PATCH/DELETE
- no file download persistence
- no raw page content persistence
- sanitized receipt/evidence/report only

This route should make public read-only web access possible in the narrowest useful form while keeping all write/browser/interactive behaviors blocked.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-public-readonly-web-runner.md
- docs/design/edit-capability-roadmap.md: concise Route 120 note only

Do not append Route 120 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/browser-controlled-network-runner-harness.md
- docs/design/browser-external-network-runner-handoff.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- controlled loopback network execution works
- public URL execution is blocked/not executed
- egress guard and redirect policy exist
- network audit records exist
- no public read-only web runner exists
- packages/ts-shell runtime dependency already includes undici

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands
- Stagehand: /home/wang/projects/stagehand

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 7 files
- OpenHands: at most 6 files
- Stagehand: at most 5 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 28 files
- exceed by 2 only for directly relevant public web, read-only fetch, egress, redirect, evidence, or CLI harness files

Focus:

- Playwright MCP: read-only browser evidence, navigation safety, URL/redirect handling, tool output boundaries
- OpenHands: sandboxed web/tool execution, network permission reporting, action/observation evidence
- Stagehand: read-only observe/extract boundaries, external site safety, deterministic evidence summaries
- Inspect AI: sandbox/tool web access, transcript/audit reports, skipped/flaky external checks
- mini-swe-agent: command runner evidence, explicit tool configuration, network failure reporting
- coding-agent baselines: allowlists, confirmations, HTTP client usage, external command safety, report surfaces

Answer in docs/design/browser-public-readonly-web-runner.md:

1. What is the minimum useful public read-only web runner?
2. Why is this not a browser automation feature yet?
3. Which gates must pass before a GET/HEAD request?
4. What evidence is safe to store and show?
5. How should tests avoid public-network flakiness?
6. What should Route 121 own?

## This route changes

Allowed:

- docs/design/browser-public-readonly-web-runner.md
- docs/design/edit-capability-roadmap.md, concise Route 120 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserPublicReadOnlyWebManifest.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebPolicy.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebExecutor.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebEvidence.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebReceipt.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebSurface.ts
- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebScenarioExamples.test.ts

Allowed if clean:

- use existing undici dependency for GET/HEAD if already available without package changes
- add injected HTTP client for deterministic tests
- add real public read-only execution only behind explicit manifest and confirmation
- keep default tests deterministic with injected client or controlled server
- add optional real-public smoke scenario only if it is explicit opt-in and skipped by default
- integrate with existing egress guard and redirect policy
- integrate with /browser execute navigate|observe|extract https://...
- integrate receipt/report/sidebar summaries

## Boundaries

Preserve:

- no default public web execution
- no public request without explicit manifest, allowlist, confirmation, and egress guard pass
- no browser launch
- no Playwright dependency
- no MCP launch
- no dynamic skill discovery
- no provider/model calls
- no JavaScript execution
- no cookies/auth/session headers
- no credential URLs
- no POST/PUT/PATCH/DELETE
- no form submission
- no auth/payment/destructive/upload/download/screenshot/OCR
- no file download persistence
- no raw page content persistence
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no automatic allowlist update
- no automatic confirmation
- no automatic replay
- no secrets, URL credentials, hidden reasoning, or raw page content in manifests, receipts, reports, cache, or output

Public read-only web execution is not browser automation. It is a gated HTTP read-only evidence runner.

## Tasks

### 1. Design

Create docs/design/browser-public-readonly-web-runner.md.

Keep it concise.

Include:

- reference scan summary
- Route 119 egress baseline
- public read-only scope
- explicit opt-in requirements
- HTTP method policy
- redirect policy
- evidence and redaction model
- deterministic test strategy
- public smoke test policy
- Route 121 recommendation

### 2. Add public read-only manifest

Add browserPublicReadOnlyWebManifest.ts.

Manifest fields:

- manifest version
- source: cli-harness, explicit-local-config, test-only
- allowed public origins
- allowed methods: GET, HEAD only
- allowed actions: navigate, observe, extract
- max redirects
- timeout
- response byte budget
- content-type allowlist
- confirmation requirement
- evidence policy
- publicNetworkAllowed: true only for explicit read-only mode
- warnings

Required behavior:

- explicit manifest required
- reject wildcard all origins
- reject credential URLs
- reject unsupported schemes
- reject private/local origins for public mode
- reject non-GET/HEAD methods
- reject auth/payment/destructive/upload/download/screenshot/OCR
- deterministic serialization
- no raw secrets

Add focused tests.

### 3. Add public read-only policy

Add browserPublicReadOnlyWebPolicy.ts.

Policy should require:

- valid https origin
- explicit read-only manifest
- origin allowlisted
- confirmation valid
- egress guard pass
- action kind navigate/observe/extract only
- method GET or HEAD only
- no credential URL
- no private/local network target
- no sensitive action
- output budget represented

Statuses:

- public-readonly-allowed
- blocked-no-manifest
- blocked-no-allowlist
- blocked-no-confirmation
- blocked-expired-confirmation
- blocked-origin-mismatch
- blocked-private-network
- blocked-credential-url
- blocked-unsupported-scheme
- blocked-sensitive-action
- blocked-method
- blocked-output-budget
- blocked-redirect-escape
- blocked-client-unavailable

Add focused tests.

### 4. Add public read-only executor

Add browserPublicReadOnlyWebExecutor.ts.

Executor should:

- execute only policy-approved requests
- use injected HTTP client in tests
- optionally use undici only if already dependency and no package changes needed
- send GET/HEAD only
- send no cookies/auth headers
- enforce timeout
- enforce response byte budget
- enforce content-type allowlist
- enforce redirect policy with egress guard on every redirect
- block redirects to non-allowlisted/private/credential/unsupported origins
- produce sanitized evidence only
- never persist raw body

If using real network in default tests would be flaky, do not do it. Use injected client or controlled server for deterministic tests, and add opt-in smoke only if safe.

Add focused tests.

### 5. Add evidence model

Add browserPublicReadOnlyWebEvidence.ts.

Evidence fields:

- action kind
- method
- final origin
- status code class
- content type summary
- content length summary
- safe title if extractable
- safe text summary within budget
- redirect summary
- egress audit id
- redactions/warnings

Must exclude:

- raw full page content
- secrets
- credential URLs
- cookies/headers
- hidden reasoning
- binary body

Add focused tests.

### 6. Add public read-only receipt

Add browserPublicReadOnlyWebReceipt.ts.

Receipt fields:

- receipt id
- target origin
- method
- action kind
- policy status
- egress audit summary
- redirect policy summary
- public network: yes
- browser launched: no
- JavaScript executed: no
- safe evidence summary
- executed: yes/no
- warnings/redactions
- next action

Add focused tests.

### 7. Add surface

Add browserPublicReadOnlyWebSurface.ts.

Render:

- Public read-only web execution
- Origin
- Method
- Action
- Policy
- Public network: yes/no
- Browser launched: no
- JavaScript executed: no
- Executed: yes/no
- Evidence summary
- Receipt
- Next action

Keep concise.

Add focused tests.

### 8. Integrate with /browser execute

Update /browser execute external URL path if clean.

Required behavior:

- without manifest/confirmation, external URL remains blocked
- with explicit manifest + confirmation + allowlist + egress pass, GET/HEAD read-only execution can run
- output clearly says public network: yes, browser launched: no, JavaScript executed: no
- local/test controlled-network execution remains unchanged
- simulated external handoff remains available if manifest selects simulation
- sensitive actions remain blocked

Add focused tests.

### 9. Harness fixtures

Add browserPublicReadOnlyWebScenarioFixtures.ts.

Fixtures should provide:

- explicit public read-only manifest
- confirmation context
- injected HTTP client responses
- redirect response fixtures
- unsafe response fixtures
- optional opt-in real public smoke helper disabled by default
- cleanup helper

No secrets. No default public network tests.

### 10. Scenario coverage

Add browserPublicReadOnlyWebScenarioExamples.test.ts.

Required scenarios:

1. no manifest -> blocked
2. no confirmation -> blocked
3. manifest + confirmation + injected HTTP client -> executed read-only GET
4. HEAD request executed read-only
5. redirect same allowlisted origin allowed
6. redirect to non-allowlisted public origin blocked
7. redirect to private/credential URL blocked
8. unsupported content type blocked or summarized safely
9. response over budget blocked or truncated safely
10. credential URL blocked/redacted
11. private network target blocked
12. sensitive action blocked
13. local/test controlled-network path unchanged
14. real CLI scenario with injected/deterministic client or controlled server proves output shape

Optional:

- opt-in public smoke test that is skipped unless explicit env is set. It must not be part of default validation.

### 11. Sidebar/report integration

If clean:

- report includes public read-only status and receipt id
- sidebar summary includes public read-only executed/blocked status
- no raw page content or credentials

Add focused tests if touched.

### 12. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 120 added explicit public read-only web execution opt-in
- limited to GET/HEAD, no browser/JS/auth/write actions
- next route recommendation

Recommended next route:

- Route 121: public read-only web runner UX/report polish
- or Route 121: public read-only real smoke harness if opt-in path needs proof
- or Route 121: browser automation design if HTTP read-only is stable

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
Do not run public network smoke tests by default.

## Stop conditions

Stop and report if:

- implementation requires browser launch
- Playwright dependency becomes necessary
- MCP launch becomes necessary
- dynamic skill discovery becomes necessary
- provider/model calls become necessary
- cookies/auth/session become necessary
- POST/write action becomes necessary
- raw page content or credentials would appear
- global allowlist/session mutation becomes necessary
- package/schema changes become necessary
- default tests require public internet
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Public read-only web runner design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

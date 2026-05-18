# Route 121: public read-only real smoke harness and UX report polish

## Goal

Add an explicit opt-in real public read-only web smoke harness and polish the public read-only report/UX.

Route 120 added the first public read-only web runner:

- HTTPS GET/HEAD only
- explicit manifest required
- exact origin allowlist required
- confirmation required
- egress guard before request and after redirects
- no browser launch
- no JavaScript
- no cookies/auth/session
- no write methods
- sanitized evidence/receipt/report only

Route 121 should prove and polish this capability without making public network access part of default validation:

- opt-in real public smoke harness, skipped by default
- deterministic injected-client tests remain default
- real smoke uses explicit env, explicit URL, explicit manifest, and explicit confirmation
- public read-only UX/report output becomes concise and user-understandable
- failures are reported as skipped/unavailable/blocked, not flaky default failures
- no expansion beyond read-only HTTP evidence

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/public-readonly-web-smoke-and-report-polish.md
- docs/design/edit-capability-roadmap.md: concise Route 121 note only

Do not append Route 121 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-public-readonly-web-runner.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/browser-controlled-network-runner-harness.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- public read-only runner exists
- deterministic injected-client tests cover GET/HEAD, redirect, budget, content type, credential/private URL blocks
- default validation does not access public internet
- real CLI coverage is blocked output shape, not real public smoke
- report/sidebar output exists but can be polished

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

- Playwright MCP: at most 5 files
- OpenHands: at most 5 files
- Stagehand: at most 4 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 24 files
- exceed by 2 only for directly relevant public smoke, skip policy, read-only report, web evidence, or CLI harness files

Focus:

- Playwright MCP: read-only web evidence, navigation/snapshot boundaries, unsafe output handling
- OpenHands: optional network/tool smoke tests, skipped/unavailable reporting, tool observation summaries
- Stagehand: external read-only observe/extract evidence and user-facing action summaries
- Inspect AI: optional eval/sandbox execution, skip/unavailable report semantics
- mini-swe-agent: CLI trajectory, opt-in command evidence, failure report shape
- coding-agent baselines: opt-in env gates, no-default-network tests, concise command output

Answer in docs/design/public-readonly-web-smoke-and-report-polish.md:

1. What should the opt-in real public smoke prove?
2. How is it kept out of default validation?
3. What env/config enables it?
4. What should public read-only output show to users?
5. What raw information must remain hidden?
6. What should Route 122 own?

## This route changes

Allowed:

- docs/design/public-readonly-web-smoke-and-report-polish.md
- docs/design/edit-capability-roadmap.md, concise Route 121 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebSmokeConfig.ts
- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebSmokeRunner.ts
- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebSmokeReport.ts
- packages/ts-shell/src/core/harness/browserPublicReadOnlyWebSmokeScenario.test.ts
- packages/ts-shell/src/core/context/browserPublicReadOnlyWebUxSummary.ts

Allowed if clean:

- add opt-in smoke env parsing
- add skipped-by-default smoke test
- add real public GET or HEAD only when env explicitly enables it
- add report/UX summary polish for public read-only receipts
- add sidebar summary polish if clean
- add optional CLI smoke scenario that is skipped unless env is set

## Boundaries

Preserve:

- no default public-network tests
- no public request without explicit smoke env and explicit manifest/allowlist/confirmation
- no browser launch
- no JavaScript execution
- no cookies/auth/session headers
- no credential URLs
- no POST/PUT/PATCH/DELETE
- no form submission
- no auth/payment/destructive/upload/download/screenshot/OCR
- no Playwright dependency
- no MCP launch
- no dynamic skill discovery
- no provider/model calls
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no automatic allowlist update
- no automatic confirmation
- no automatic replay
- no raw page content, cookies, headers, URL credentials, secrets, or hidden reasoning in reports, receipts, cache, or output

The smoke harness is opt-in evidence only. It must not become part of default validation.

## Tasks

### 1. Design

Create docs/design/public-readonly-web-smoke-and-report-polish.md.

Keep it concise.

Include:

- reference scan summary
- Route 120 baseline
- opt-in smoke policy
- env/config names
- skip/unavailable behavior
- report/UX polish plan
- no-default-network boundary
- Route 122 recommendation

### 2. Add smoke config

Add browserPublicReadOnlyWebSmokeConfig.ts.

Expected env/config:

- PRIVATE_AGENTS_ENABLE_PUBLIC_WEB_SMOKE=1 enables smoke
- PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_URL supplies exact HTTPS URL
- PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_METHOD optionally HEAD or GET, default HEAD
- PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_TIMEOUT_MS optional bounded timeout
- PRIVATE_AGENTS_PUBLIC_WEB_SMOKE_BYTE_BUDGET optional bounded byte budget

Required behavior:

- disabled by default
- reject missing URL when enabled
- reject non-HTTPS URL
- reject credential URL
- reject private/local network URL
- reject unsupported methods
- deterministic disabled/skipped reason
- no network call in config parser

Add focused tests.

### 3. Add smoke runner

Add browserPublicReadOnlyWebSmokeRunner.ts.

Runner should:

- create explicit manifest/allowlist/confirmation from smoke config
- call existing public read-only web runner
- use HEAD by default
- enforce egress guard and redirect policy
- report skipped when disabled
- report unavailable/blocked safely on network/client failure
- never expose raw body/headers/cookies
- never persist raw content

Add focused tests using injected client. Do not require public network.

### 4. Add smoke report

Add browserPublicReadOnlyWebSmokeReport.ts.

Report should show:

- Smoke enabled: yes/no
- Target origin
- Method
- Status: skipped/executed/blocked/unavailable
- Public network used: yes/no
- Browser launched: no
- JavaScript executed: no
- Evidence summary
- Redactions/warnings
- Next action

Keep concise and safe.

Add focused tests.

### 5. Add skipped-by-default smoke test

Add browserPublicReadOnlyWebSmokeScenario.test.ts.

Required scenarios:

1. default env -> skipped, no network call
2. enabled with invalid URL -> blocked before network
3. enabled with private URL -> blocked before network
4. enabled with unsupported method -> blocked before network
5. enabled with injected client -> executed read-only smoke
6. injected redirect escape -> blocked
7. injected failure -> unavailable safe report

Optional:

- real public smoke case guarded by PRIVATE_AGENTS_ENABLE_PUBLIC_WEB_SMOKE=1 and skipped otherwise
- if added, it must not be required by default validation

### 6. Add public read-only UX summary

Add browserPublicReadOnlyWebUxSummary.ts.

Summary should convert public read-only receipt/evidence into user-friendly lines:

- What was requested
- What was allowed
- What was fetched
- What evidence was collected
- What was not done: browser, JS, auth, write, raw persistence
- What to do next

Add focused tests.

### 7. Integrate UX summary into command output

Update public read-only surface or /browser execute output if clean.

Required behavior:

- successful public read-only output is concise
- blocked output explains missing manifest/allowlist/confirmation clearly
- unavailable output differentiates network/client failure from policy block
- no raw page content
- existing Route 120 tests remain stable

Add focused tests.

### 8. Sidebar/report polish

If clean:

- report includes public read-only UX summary
- sidebar summary includes executed/blocked/unavailable status
- no raw page content or credentials

Add focused tests if touched.

### 9. Real CLI output shape

Add or update CLI scenario coverage:

- default smoke disabled output is skipped/no-network
- /browser execute public read-only blocked output remains safe without manifest
- injected/deterministic public read-only execution output shape is stable if CLI harness supports it

Do not require public internet in default CLI tests.

### 10. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 121 added opt-in real public read-only smoke harness and UX/report polish
- default validation still does not access public internet
- next route recommendation

Recommended next route:

- Route 122: public read-only smoke CI/operator documentation and manual run recipe
- or Route 122: browser read-only extraction quality/ranking
- or Route 122: browser automation design only after read-only public runner remains stable

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

- default tests would require public internet
- implementation requires browser launch
- implementation requires JavaScript execution
- cookies/auth/session become necessary
- POST/write action becomes necessary
- Playwright dependency becomes necessary
- MCP launch becomes necessary
- provider/model calls become necessary
- raw page content or credentials would appear
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Smoke harness and UX design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

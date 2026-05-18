# Route 119: browser egress guard and network audit layer

## Goal

Add a browser network egress guard and audit layer before any public external-network execution.

Route 118 added controlled-network execution against a harness-issued loopback HTTP server. It proved network-shaped runner plumbing without public internet access.

Route 119 should add the next safety layer needed before public external browsing:

- egress guard policy
- network audit record
- redirect escape detection
- private network protection
- credential URL redaction/blocking
- per-request origin enforcement
- controlled-network executor integration
- CLI/harness scenarios proving allowed controlled origin and blocked escaped/public/private origins

This route should not enable public internet browsing. It should make future public browsing auditable and enforceable.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-egress-guard-network-audit.md
- docs/design/edit-capability-roadmap.md: concise Route 119 note only

Do not append Route 119 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-controlled-network-runner-harness.md
- docs/design/browser-external-network-runner-handoff.md
- docs/design/browser-external-network-execution-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- controlled loopback network execution works through explicit harness manifest
- public external URLs remain blocked/not executed
- controlled executor blocks public redirects
- no public browser/network execution exists
- no general egress guard/audit layer exists yet

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
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 29 files
- exceed by 2 only for directly relevant network egress, allowlist, redirect, audit, sandbox, or harness files

Focus:

- Playwright MCP: browser context/tool network boundaries, navigation/redirect handling, snapshot/evidence boundaries
- OpenHands: sandboxed network/tool execution, event/audit records, blocked network/tool reporting
- Stagehand: external-site action boundaries, observe/extract after navigation, redirect/action safety
- Inspect AI: sandbox/network policy, transcript/audit evidence, safe eval reports
- mini-swe-agent: command/network evidence and trajectory reports
- coding-agent baselines: command allowlists, network denial, permission/audit records

Answer in docs/design/browser-egress-guard-network-audit.md:

1. What must every future browser network request pass through?
2. What should an egress guard decide before and after redirects?
3. What audit record proves the request stayed within allowed boundaries?
4. How should public internet remain blocked in this route?
5. What should Route 120 own?

## This route changes

Allowed:

- docs/design/browser-egress-guard-network-audit.md
- docs/design/edit-capability-roadmap.md, concise Route 119 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserNetworkEgressGuard.ts
- packages/ts-shell/src/core/context/browserNetworkAuditRecord.ts
- packages/ts-shell/src/core/context/browserRedirectPolicy.ts
- packages/ts-shell/src/core/context/browserNetworkEgressSurface.ts
- packages/ts-shell/src/core/harness/browserNetworkEgressScenarioExamples.test.ts

Allowed if clean:

- integrate egress guard into controlled-network executor
- update controlled-network receipt with egress audit summary
- update external-network handoff receipt with planned egress requirement
- add CLI/harness scenarios for allowed loopback, blocked public, blocked private, blocked credentials, redirect escape, and audit summaries
- add sidebar/report summaries if clean

## Boundaries

Preserve:

- no public internet access
- no arbitrary external network
- no browser launch
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
- no raw page content, URL credentials, secrets, or hidden reasoning in manifests, audit records, receipts, reports, cache, or output

Egress guard is enforcement/audit infrastructure. It is not permission to browse the public internet in this route.

## Tasks

### 1. Design

Create docs/design/browser-egress-guard-network-audit.md.

Keep it concise.

Include:

- reference scan summary
- Route 118 controlled-network baseline
- egress guard model
- pre-request and post-redirect checks
- audit record model
- controlled-network integration
- public internet blocked boundary
- Route 120 recommendation

### 2. Add egress guard model

Add browserNetworkEgressGuard.ts.

Expected decisions:

- allowed-controlled-origin
- blocked-no-allowlist
- blocked-origin-mismatch
- blocked-public-origin
- blocked-private-network
- blocked-credential-url
- blocked-unsupported-scheme
- blocked-redirect-escape
- blocked-sensitive-action
- blocked-output-budget

Inputs:

- requested URL/origin
- allowed origins
- controlled origin metadata
- action kind
- redirect target if present
- network mode: controlled-only, future-public, disabled
- output budget

Required behavior:

- allow only explicit controlled loopback origin in this route
- block public origins
- block non-harness private network origins
- block credential URLs
- block unsupported schemes
- block redirect escape from controlled origin
- no network calls

Add focused tests.

### 3. Add redirect policy

Add browserRedirectPolicy.ts.

Policy should:

- allow no redirect or same controlled origin redirect
- block redirect to public origin
- block redirect to private non-harness origin
- block redirect to credential URL
- block unsupported scheme redirect
- report sanitized original/target origin summaries

Add focused tests.

### 4. Add network audit record

Add browserNetworkAuditRecord.ts.

Audit record fields:

- audit id
- request id
- action kind
- requested origin
- effective origin
- allowed origin
- egress decision
- redirect decision if any
- publicNetwork: no
- controlledNetwork: yes/no
- privateNetworkBlocked: yes/no
- credentialsRedacted: yes/no
- status code summary if available
- byte/output budget summary
- warnings/redactions
- next action

Required behavior:

- deterministic ids for tests
- no raw URL credentials
- no raw page content
- safe for reports/sidebar

Add focused tests.

### 5. Add egress surface

Add browserNetworkEgressSurface.ts.

Render:

- Browser network egress guard
- Requested origin
- Decision
- Redirect decision
- Public network: no
- Controlled network: yes/no
- Audit id
- Warnings/redactions
- Next action

Keep concise.

Add focused tests.

### 6. Integrate with controlled-network executor

Update browserControlledNetworkExecutor and receipt if clean.

Required behavior:

- executor calls egress guard before request
- executor calls redirect policy if response redirect is observed or simulated
- controlled origin success includes audit record
- redirect escape blocks and produces audit record
- public URL remains blocked before executor
- output says public network: no

Add focused tests.

### 7. Integrate with external-network handoff receipt

If clean, update external-network handoff receipt/surface to mention future public execution must pass egress guard.

No long output.

Add focused tests if touched.

### 8. Harness scenarios

Add browserNetworkEgressScenarioExamples.test.ts.

Required scenarios:

1. controlled loopback request allowed and audit record generated
2. public URL blocked before request
3. private non-harness URL blocked
4. credential URL blocked/redacted
5. unsupported scheme blocked
6. same-origin redirect allowed if implemented
7. redirect to public origin blocked
8. output budget exceeded blocks or warns safely
9. sensitive action blocked
10. real CLI controlled-network scenario includes egress audit and public network: no

### 9. Sidebar/report integration

If clean:

- report includes egress decision and audit id
- sidebar summary includes egress blocked/allowed status
- no raw credentials or page content

Add focused tests if touched.

### 10. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 119 added browser network egress guard and audit layer
- public internet remains blocked
- next route recommendation

Recommended next route:

- Route 120: public external-network execution design with egress guard, still opt-in
- or Route 120: controlled-network report/UX polish
- or Route 120: browser runner dependency/tooling decision if real public runner needs runtime policy

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

- egress guard requires public internet access
- browser launch becomes necessary
- Playwright dependency becomes necessary
- MCP launch becomes necessary
- dynamic skill discovery becomes necessary
- provider/model calls become necessary
- raw page content/URL credentials/secrets would appear
- global allowlist/session mutation becomes necessary
- package/schema changes become necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Egress guard/audit design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

# Route 97: browser sandbox hardening and network allowlist

## Goal

Harden the browser execution seam before any real Playwright execution.

Route 96 added:

- browser execution contract and policy
- noop/fake executor
- Playwright CLI plan-only adapter
- `/browser execute navigate|observe|extract`
- default no-executor blocked behavior
- fake/test executor evidence
- scenario harness coverage

Route 97 should add the missing safety gates required before real browser execution can be considered:

- browser sandbox authority model
- network allowlist model
- explicit confirmation policy
- browser runtime preflight
- execution authority projection
- evidence redaction/safety checks
- sidebar-visible sandbox status
- scenario harness coverage for allowed/blocked sandbox cases

This route should not launch a browser or make network requests. It should make the future real execution gate explicit and testable.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/playwright-cli-non-default-browser-execution.md
- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/browser-capability-boundary-preview.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- browser execution is non-default
- no executor means blocked
- fake/test executor exists
- Playwright CLI adapter is plan-only
- real browser execution remains unavailable
- no network allowlist exists
- no browser sandbox authority exists
- no explicit browser confirmation gate exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- E2B: /home/wang/projects/E2B
- Daytona: /home/wang/projects/daytona
- browser-use: /home/wang/projects/browser-use

Budget:

- Stagehand: at most 6 files
- Playwright MCP: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional sandbox/browser repos: at most 4 files total if present
- total default budget: 28 files
- exceed by 2 only for directly relevant sandbox / allowlist / confirmation / browser execution files

Focus:

Stagehand:

- execution gating
- action confirmation
- browser action safety
- preview-before-execution
- cached action boundary

Playwright MCP:

- browser context options
- allowed origins / server config if present
- tool safety model
- accessibility snapshot evidence
- MCP vs CLI statefulness risk

OpenHands:

- sandboxed tool execution
- command/action permission
- browser/tool evidence
- session activity for blocked/allowed actions

Inspect AI:

- sandbox separation
- tool-use eval safety
- execution transcript/evidence
- scorer/assertion patterns

mini-swe-agent:

- command execution guard
- environment isolation
- trajectory evidence
- failure handling

Coding-agent baselines:

- permission prompts
- allowlists
- shell sandbox
- command preflight
- result evidence

Answer in docs/design/browser-sandbox-network-allowlist.md:

1. What sandbox authority is required before browser execution?
2. What should the initial network allowlist model look like?
3. Which actions require explicit confirmation?
4. How should blocked sandbox/network cases appear to users?
5. What evidence should be required before a future real executor can claim success?
6. What should Route 98 own?

## This route changes

Allowed:

- docs/design/browser-sandbox-network-allowlist.md
- docs/design/playwright-cli-non-default-browser-execution.md, Route 97 note only
- docs/design/browser-runtime-decision-dry-run-harness.md, Route 97 note only
- docs/design/browser-capability-boundary-preview.md, Route 97 note only
- docs/design/agent-scenario-harness-foundation.md, Route 97 note only
- docs/design/sidebar-live-event-capture.md, Route 97 note only
- docs/design/context-engineering-continuity-baseline.md, Route 97 note only
- docs/design/edit-capability-roadmap.md, concise Route 97 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSandboxAuthority.ts
- packages/ts-shell/src/core/context/browserNetworkAllowlist.ts
- packages/ts-shell/src/core/context/browserExecutionConfirmation.ts
- packages/ts-shell/src/core/context/browserRuntimePreflight.ts
- packages/ts-shell/src/core/context/browserExecutionEvidencePolicy.ts
- packages/ts-shell/src/core/context/browserSandboxSurface.ts

Optional harness files:

- packages/ts-shell/src/core/harness/browserSandboxScenarioExamples.test.ts

Allowed if clean:

- extend `/browser execute ...` to require sandbox authority and network allowlist
- extend `/browser dry-run ...` to display missing sandbox/allowlist/confirmation gates
- add `/browser sandbox` or `/browser policy` status if simple
- emit sidebar events for sandbox blocked/allowed preflight
- use fake/test executor only after sandbox gates pass

## This route must preserve

Route-specific boundaries:

- no real browser launch
- no Playwright process spawn
- no MCP server launch or dynamic MCP discovery
- no real network requests
- no browser session persistence
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no auth/payment/destructive actions
- no file upload/download
- no screenshot/OCR capture
- no raw content/secrets/hidden reasoning in browser sandbox output
- future execution must remain blocked unless explicit sandbox authority allows it

## Tasks

### 1. Design and audit

Create docs/design/browser-sandbox-network-allowlist.md.

Include:

- Route 97 reference scan summary
- Route 96 execution seam baseline
- browser sandbox authority model
- network allowlist model
- confirmation policy
- runtime preflight model
- evidence policy
- sidebar/status surface model
- scenario harness coverage plan
- no-real-execution boundary
- Route 98 recommendation

### 2. Add browser sandbox authority model

Add packages/ts-shell/src/core/context/browserSandboxAuthority.ts.

Expected concepts:

- BrowserSandboxAuthority
- BrowserSandboxAuthorityMode:
  - disabled
  - dry-run-only
  - fake-test
  - explicit-local
  - future-runtime
- BrowserSandboxScope
- BrowserSandboxCapability:
  - navigation
  - observe
  - extract
  - click
  - type
  - screenshot
  - upload
  - download
  - auth
  - payment
  - destructive
- BrowserSandboxAuthorityDecision:
  - allowed
  - blocked
  - confirmation-required
  - future-runtime-required

Required behavior:

- default disabled/dry-run-only blocks real execution
- fake-test can allow fake executor only
- explicit-local can be represented but not real-executed in this route
- no persistence
- no process/network calls

Add focused tests.

### 3. Add network allowlist model

Add packages/ts-shell/src/core/context/browserNetworkAllowlist.ts.

Expected concepts:

- BrowserNetworkAllowlist
- BrowserAllowedOrigin
- BrowserNetworkTarget
- BrowserNetworkDecision:
  - allowed
  - blocked-no-allowlist
  - blocked-origin
  - blocked-scheme
  - blocked-private-network
  - blocked-credential-url
  - confirmation-required
- normalize origin helper
- match URL/origin helper

Policy:

- default deny
- allow https origins explicitly listed
- block file:, data:, javascript:, about:, chrome:, extension:
- block localhost/private-network by default unless explicit test/local mode allows it
- block URLs containing credentials
- no network calls

Add focused tests.

### 4. Add explicit confirmation policy

Add packages/ts-shell/src/core/context/browserExecutionConfirmation.ts.

Expected concepts:

- BrowserExecutionConfirmationRequest
- BrowserExecutionConfirmationDecision
- ConfirmationKind:
  - network
  - state-changing
  - sensitive
  - sandbox
  - future-runtime
- confirmation status:
  - not-required
  - required
  - confirmed
  - denied
  - expired

Policy:

- navigate requires network confirmation if future real execution is enabled
- click/type are state-changing and require confirmation
- observe/extract may not require confirmation if read-only and allowlisted
- auth/payment/destructive always blocked for now
- no real prompt UI in this route; represent confirmation state only

Add focused tests.

### 5. Add runtime preflight

Add packages/ts-shell/src/core/context/browserRuntimePreflight.ts.

Preflight should consume:

- BrowserExecutionRequest
- BrowserExecutionPolicy
- BrowserSandboxAuthority
- BrowserNetworkAllowlist
- BrowserExecutionConfirmation
- BrowserPlaywrightCliAdapter plan if useful

It should produce:

- preflightStatus:
  - pass
  - blocked
  - warning
  - future-runtime-required
- blockers
- warnings
- requiredConfirmations
- sandboxDecision
- networkDecision
- evidenceRequirements
- nextAction

Required behavior:

- no browser execution
- no network calls
- deterministic output
- fake/test executor allowed only in fake-test authority
- no executor still blocked
- no raw content/secrets

Add focused tests.

### 6. Add execution evidence policy

Add packages/ts-shell/src/core/context/browserExecutionEvidencePolicy.ts.

Policy should define required evidence for future real execution.

Evidence examples:

- action request id
- runtime/backend
- target URL/origin
- allowlist decision
- sandbox decision
- confirmation decision
- accessibility snapshot summary reference
- selected element evidence
- extraction schema/result summary
- action trace summary
- stderr/stdout summary if CLI
- redactions
- executed yes/no

Required behavior:

- fake executor evidence must be clearly fake/test
- real evidence requirements can be planned but not produced
- no raw browser content
- no screenshots/OCR capture
- no secrets

Add focused tests.

### 7. Add sandbox surface

Add packages/ts-shell/src/core/context/browserSandboxSurface.ts.

Render:

- Browser sandbox preflight
- Sandbox authority
- Network allowlist
- Confirmation status
- Evidence requirements
- Blockers/warnings
- Executed: no unless fake/test executor executed
- Next action

Keep output concise and user-facing.

Add focused tests.

### 8. Integrate sandbox preflight into browser execution

Update browserExecutionPolicy / browserExecutionCommandRunner / browserCommandRunner as needed.

Required behavior:

- `/browser execute navigate <url>` without sandbox authority remains blocked
- with fake-test authority and fake executor, allowed only if policy says fake-test is allowed
- with explicit allowlist but no real executor, still blocked-no-executor or future-runtime-required
- invalid/disallowed origins blocked before executor
- click/type require confirmation representation
- preview/dry-run remain non-executing and show sandbox gaps if useful
- no real browser execution

Add focused tests.

### 9. Sidebar and harness integration

Update sidebar command event adapter if clean.

Required behavior:

- sandbox/preflight blocked result appears as sanitized sidebar event
- fake/test allowed execution appears as Browser execution event with fake/test marker
- no raw content/secrets

Add scenario harness coverage:

1. browser execution blocked by missing sandbox authority
2. browser execution blocked by network allowlist
3. browser fake-test execution allowed with fake authority and allowlisted target
4. browser dry-run shows sandbox/allowlist requirements without execution

Add focused tests.

### 10. Browser sandbox tests

Required tests:

- default sandbox authority blocks real execution
- default network allowlist blocks external URL
- explicit allowlisted https origin passes network decision
- unsupported schemes blocked
- credential URL blocked
- localhost/private-network blocked by default
- click/type require confirmation
- observe/extract read-only policy works with allowlist and authority
- auth/payment/destructive still blocked
- preflight prevents executor call when blocked
- fake-test executor can run only with fake-test authority
- evidence policy marks fake evidence as fake/test
- sidebar event emitted for blocked/allowed fake result
- scenario harness covers blocked and fake allowed flows
- no provider/model/browser/MCP/network side effects

### 11. Docs and roadmap update

Update:

- docs/design/browser-sandbox-network-allowlist.md with final notes
- docs/design/playwright-cli-non-default-browser-execution.md with Route 97 note
- docs/design/browser-runtime-decision-dry-run-harness.md with Route 97 note
- docs/design/browser-capability-boundary-preview.md with Route 97 note
- docs/design/agent-scenario-harness-foundation.md with Route 97 note
- docs/design/sidebar-live-event-capture.md with Route 97 note
- docs/design/context-engineering-continuity-baseline.md with Route 97 note
- docs/design/edit-capability-roadmap.md with concise status and Route 98 recommendation

Recommended next route:

- Route 98: Playwright CLI real execution opt-in with sandbox/allowlist
  - only if Route 97 gates are stable
- or Route 98: real CLI scenario harness
  - if process-spawn evidence should come before browser launch
- or Route 98: browser sandbox lifecycle hardening
  - if allowlist/confirmation needs more polish

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
- network access becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- package dependency changes become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- allowlist/confirmation UX becomes confusing
- raw content/secrets would need to appear
- fake executor starts acting like real runtime

## Final report

1. What changed
2. Reference scan summary
3. Sandbox/allowlist decision
4. Scenario harness coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

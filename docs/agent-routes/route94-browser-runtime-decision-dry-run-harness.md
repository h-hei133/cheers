# Route 94: browser runtime decision and non-executing dry-run harness

## Goal

Advance the browser/tooling phase from preview-only action contracts to a runtime decision and non-executing dry-run harness.

Route 93 added:

- browser capability model
- browser action contract
- browser action readiness
- browser action preview
- `/browser` status and `/browser preview ...`
- sidebar-visible browser placeholder
- no actual browser execution

Route 94 should decide the preferred future browser runtime direction and add a dry-run harness that can plan browser actions without executing them.

Target behavior:

- `/browser` still shows preview-only status.
- `/browser preview ...` still shows readiness only.
- `/browser dry-run ...` or equivalent creates a non-executing browser execution plan.
- dry-run output shows:
  - selected future backend candidate
  - action sequence
  - sandbox requirements
  - user confirmations required
  - expected evidence if execution is enabled later
  - blocked risks
  - "Executed: no"
- sidebar can show browser dry-run events.
- no real browser process launch.
- no Playwright/MCP runtime integration yet.

This route should be contract-first and safety-first. It should make future browser execution easy to add without accidentally enabling it now.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-capability-boundary-preview.md
- docs/design/sidebar-state-model.md
- docs/design/sidebar-live-event-capture.md
- docs/design/sidebar-live-panel-runtime-experiment.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- `/browser` exists.
- browser commands are preview-only.
- browser capability appears in sidebar Tools section.
- browser command results can appear in sanitized sidebar activity.
- no browser runtime or dry-run harness exists.
- no actual browser execution exists.

## Reference scan

Use the expanded reference pool from `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional if present:

- browser-use: /home/wang/projects/browser-use

Budget:

- Stagehand: at most 8 files
- Playwright MCP: at most 6 files
- OpenHands: at most 5 files
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- browser-use if present: at most 3 files
- total default budget: 22 files, or 25 if browser-use exists
- exceed by 2 only for directly relevant browser runtime / dry-run / sandbox files

Focus:

Stagehand:

- act / observe / extract runtime split
- preview before action
- code-vs-natural-language boundary
- action caching / self-healing
- execution result/evidence shape

Playwright MCP:

- accessibility snapshot model
- browser action schemas
- MCP server state/status
- MCP vs CLI/Skills token tradeoff
- deterministic browser actions

OpenHands:

- browser/tool runtime boundary
- sandbox/tool execution events
- GUI/session activity for browser/tool actions
- execution evidence/status surface

Coding-agent baselines:

- tool permission
- dry-run/planning
- command sandbox
- result/evidence projection

Answer in docs/design/browser-runtime-decision-dry-run-harness.md:

1. Which runtime direction should be preferred first: Playwright CLI/Skills, Playwright MCP, Stagehand-like abstraction, or custom wrapper?
2. What must dry-run prove before real execution is allowed?
3. What browser sandbox constraints are required?
4. What evidence should real execution eventually produce?
5. Which browser actions remain blocked even in dry-run?
6. What should Route 95 own?

## This route changes

Allowed:

- docs/design/browser-runtime-decision-dry-run-harness.md
- docs/design/browser-capability-boundary-preview.md, Route 94 note only
- docs/design/sidebar-state-model.md, Route 94 note only
- docs/design/sidebar-live-event-capture.md, Route 94 note only
- docs/design/context-engineering-continuity-baseline.md, Route 94 note only
- docs/design/edit-capability-roadmap.md, concise Route 94 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserRuntimeDecision.ts
- packages/ts-shell/src/core/context/browserSandboxPolicy.ts
- packages/ts-shell/src/core/context/browserDryRunPlan.ts
- packages/ts-shell/src/core/context/browserDryRunHarness.ts
- packages/ts-shell/src/core/context/browserDryRunSurface.ts

Allowed if clean:

- extend `/browser` with:
  - `/browser dry-run navigate <url>`
  - `/browser dry-run extract <goal>`
  - `/browser dry-run click <target>`
  - `/browser dry-run type <target> <text>`
- emit sidebar events for dry-run results
- include browser dry-run status in `/sidebar panel`
- keep `/browser preview` behavior stable

## This route must preserve

Route-specific boundaries:

- no actual browser execution
- no Playwright process launch
- no MCP server launch or dynamic MCP discovery
- no website navigation
- no browser session persistence
- no screenshots/OCR/browser snapshots
- no network access
- no auth/payment/destructive browser automation
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in browser dry-run output
- dry-run must clearly say Executed: no

## Tasks

### 1. Design and audit

Create docs/design/browser-runtime-decision-dry-run-harness.md.

Include:

- Route 94 reference scan summary
- Route 93 preview-only baseline
- runtime decision matrix:
  - Playwright CLI/Skills
  - Playwright MCP
  - Stagehand-like abstraction
  - custom wrapper
- recommended first runtime direction
- dry-run harness model
- browser sandbox policy
- evidence model for future execution
- unsupported action policy
- sidebar integration model
- no-execution boundary
- future Route 95 options

The design should be opinionated. Pick a preferred first runtime direction, but do not implement real execution.

### 2. Add browser runtime decision model

Add packages/ts-shell/src/core/context/browserRuntimeDecision.ts.

Expected concepts:

- BrowserRuntimeCandidate
  - playwright-cli-skills
  - playwright-mcp
  - stagehand-like
  - custom-playwright-wrapper
  - unavailable
- BrowserRuntimeRecommendation
- BrowserRuntimeDecisionReason
- BrowserRuntimeDecisionInput
- BrowserRuntimeDecisionResult

Decision criteria should include:

- token efficiency
- deterministic action support
- sandboxability
- evidence quality
- ease of integration
- MCP overhead
- state persistence risk
- user UX simplicity
- testability

Required behavior:

- deterministic recommendation
- no runtime launch
- no dynamic discovery
- no provider/model call
- can recommend "defer execution" if inputs are unsafe

Add focused tests.

### 3. Add browser sandbox policy

Add packages/ts-shell/src/core/context/browserSandboxPolicy.ts.

Policy should classify browser actions and constraints.

Expected concepts:

- BrowserSandboxRequirement:
  - network-access
  - external-site
  - authentication
  - credential-entry
  - payment
  - file-upload
  - file-download
  - destructive-action
  - screenshot
  - persistent-session
  - third-party-data
- BrowserSandboxDecision:
  - allowed-for-dry-run
  - blocked
  - future-confirmation-required
  - future-sandbox-required
- BrowserSandboxBlocker

Required behavior:

- dry-run allowed for safe previewable actions
- real execution remains unavailable
- auth/payment/destructive/file upload/download blocked
- screenshot/snapshot blocked or future-sandbox-required
- external network marked as future-sandbox-required
- clear reason and next action

Add focused tests.

### 4. Add browser dry-run plan model

Add packages/ts-shell/src/core/context/browserDryRunPlan.ts.

Plan should represent what would happen if execution were enabled later.

Expected fields:

- dryRunId
- requestedAction
- recommendedRuntime
- sandboxDecision
- plannedSteps
- requiredConfirmations
- expectedEvidence
- blockedReasons
- warnings
- nextAction
- executed: false

Expected future evidence examples:

- navigation target
- accessibility snapshot summary
- selected element evidence
- extraction schema/result summary
- action trace
- screenshot reference only if future route enables it
- command/runtime logs

Required behavior:

- no browser execution
- no web content
- no raw content/secrets
- deterministic id/clock injection for tests
- blocked plan still produces useful next action

Add focused tests.

### 5. Add browser dry-run harness

Add packages/ts-shell/src/core/context/browserDryRunHarness.ts.

Harness should consume:

- BrowserActionContract
- BrowserActionReadiness
- BrowserRuntimeDecision
- BrowserSandboxPolicy

It should produce BrowserDryRunPlan.

Required behavior:

- navigate/extract/click/type can produce non-executing plans
- blocked actions produce blocked plans
- ambiguous actions produce blocked plans
- no backend available means execution unavailable but dry-run still explains plan
- no provider/model calls
- no browser process launch
- no MCP launch
- no network

Add focused tests.

### 6. Add browser dry-run surface

Add packages/ts-shell/src/core/context/browserDryRunSurface.ts.

Surface should render:

- Browser dry-run
- Requested action
- Recommended future runtime
- Sandbox decision
- Planned steps
- Required confirmations
- Expected evidence
- Blocked reasons
- Next action
- Executed: no

Keep output concise and user-friendly.

Add focused tests.

### 7. Extend `/browser` command

Update browserCommandContract / browserCommandRunner.

Preferred command UX:

- `/browser`
  - status
- `/browser status`
  - status
- `/browser preview ...`
  - readiness preview
- `/browser dry-run ...`
  - non-executing execution plan

Supported dry-run actions:

- navigate
- extract
- click
- type

Blocked or future-only:

- auth
- payment
- destructive
- screenshot
- download
- upload

Required behavior:

- invalid args rejected clearly
- dry-run says Executed: no
- preview command remains stable
- no browser execution

Add focused tests.

### 8. Sidebar integration

Update sidebar event adapter / tool availability if clean.

Required behavior:

- `/browser dry-run` emits sanitized sidebar event
- sidebar Tools section can show browser runtime recommendation if provided
- no dynamic discovery
- no execution
- no raw content/secrets

Add focused tests.

### 9. Browser dry-run tests

Required tests:

- runtime decision prefers chosen first runtime with documented reasons
- dry-run navigate creates non-executing plan
- dry-run extract creates non-executing plan
- dry-run click/type identify state-changing risk but do not execute
- auth/payment/destructive blocked
- upload/download/screenshot blocked or future-sandbox-required
- no backend still produces useful dry-run explanation
- ambiguous target blocked
- surface includes Executed: no
- sidebar event emitted if integrated
- no provider/model/browser/MCP side effects

### 10. Docs and roadmap update

Update:

- docs/design/browser-runtime-decision-dry-run-harness.md with final notes
- docs/design/browser-capability-boundary-preview.md with Route 94 note
- docs/design/sidebar-state-model.md with Route 94 note
- docs/design/sidebar-live-event-capture.md with Route 94 note
- docs/design/context-engineering-continuity-baseline.md with Route 94 note
- docs/design/edit-capability-roadmap.md with concise status and Route 95 recommendation

Recommended next route:

- Route 95: Playwright CLI/Skills non-default execution prototype
  - if Playwright CLI/Skills is chosen
- or Route 95: Playwright MCP adapter prototype
  - if MCP path is chosen
- or Route 95: browser sandbox executor contract
  - if runtime decision still needs a lower-level execution seam
- or Route 95: Stagehand-like action cache design
  - if action preview/cache/replay should come before execution

## Validation

Route-specific final validation:

- focused tests for touched core/context command/session modules
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

If broad src/core/shell or src/session paths expose unrelated failures, narrow to touched tests and document them.

## Stop conditions

Stop and report if:

- dry-run requires actual browser execution
- Playwright/MCP/Stagehand integration becomes necessary
- dynamic MCP discovery becomes necessary
- provider/model calls become necessary
- browser session persistence becomes necessary
- network access becomes necessary
- command parsing becomes confusing or flag-heavy
- raw content/secrets would need to appear
- cli.tsx rewrite becomes necessary

## Final report

1. What changed
2. Reference scan summary
3. Runtime direction decision
4. Validation
5. Boundaries preserved
6. Residue cleanup
7. Risks / blockers
8. Next route recommendation
9. Proposed commit message

Do not commit or push.

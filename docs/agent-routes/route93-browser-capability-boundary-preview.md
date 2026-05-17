# Route 93: browser capability boundary and action preview

## Goal

Start the browser/tooling capability phase with a safe browser capability boundary and action preview surface.

Route 88-92 built the visible state/sidebar substrate:

- `/sidebar` preview
- `/sidebar panel`
- `/sidebar watch`
- live session-scoped event capture
- tool/MCP/skills placeholders

Route 93 should add the first browser capability substrate:

- browser capability model
- browser action contract
- browser action readiness / preview classifier
- browser command surface for status/preview
- sidebar-visible browser capability status
- no real browser execution yet

This route should make browser automation understandable and safe before adding actual Playwright/MCP/browser execution.

Target user-facing principle:

- normal users should see clear browser status and why an action is supported/blocked
- no confusing low-level flags
- no browser process launch
- no website interaction
- no auth/payment/destructive browser automation
- no hidden browser state

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/sidebar-state-model.md
- docs/design/sidebar-live-event-capture.md
- docs/design/sidebar-tui-panel-prototype.md
- docs/design/sidebar-live-panel-runtime-experiment.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- sidebar state and live activity exist
- tool/MCP/skills placeholders exist
- no browser capability model exists
- no browser command surface exists
- no browser runtime execution exists

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

Budget:

- Stagehand: at most 7 files
- Playwright MCP: at most 5 files
- OpenHands: at most 5 files
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- total default budget: 22 files
- exceed by 2 only for directly relevant browser capability / action preview / tool boundary files

Focus:

Stagehand:

- act / observe / extract surface
- action preview
- deterministic code vs natural-language action split
- cached action / self-healing boundaries
- browser automation status wording

Playwright MCP:

- accessibility snapshot model
- MCP browser tool schema
- MCP vs CLI/Skills token tradeoff
- browser tool availability/status
- deterministic browser actions

OpenHands:

- browser/tool status in agent surface
- GUI/session activity for browser/tool actions
- sandbox/browser boundary if present

Coding-agent baselines:

- tool permission
- command preview
- blocked action messaging
- CLI status output

Answer in docs/design/browser-capability-boundary-preview.md:

1. What browser actions should be modeled first?
2. Which actions are read-only versus state-changing?
3. How should preview/readiness be represented before execution exists?
4. How should Playwright MCP versus CLI/Skills tradeoffs influence this project?
5. What should remain blocked until a real browser sandbox/runtime route?
6. What browser state should appear in `/sidebar`?

## This route changes

Allowed:

- docs/design/browser-capability-boundary-preview.md
- docs/design/sidebar-state-model.md, Route 93 note only
- docs/design/sidebar-live-panel-runtime-experiment.md, Route 93 note only
- docs/design/context-engineering-continuity-baseline.md, Route 93 note only
- docs/design/edit-capability-roadmap.md, concise Route 93 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserCapabilityModel.ts
- packages/ts-shell/src/core/context/browserActionContract.ts
- packages/ts-shell/src/core/context/browserActionReadiness.ts
- packages/ts-shell/src/core/context/browserActionPreview.ts
- packages/ts-shell/src/core/context/browserCapabilitySurface.ts
- packages/ts-shell/src/core/context/browserCommandContract.ts
- packages/ts-shell/src/core/context/browserCommandRunner.ts

Allowed if clean:

- register `/browser`
- `/browser` default shows status
- `/browser status` shows status
- `/browser preview ...` creates a non-executing preview/readiness result
- integrate browser capability status into sidebar tool availability placeholders
- emit sidebar event for browser status/preview command

## This route must preserve

Route-specific boundaries:

- no actual browser execution
- no Playwright process launch
- no MCP server launch or dynamic MCP discovery
- no website navigation
- no browser session persistence
- no screenshots/OCR/browser snapshots
- no auth/payment/destructive browser automation
- no provider/model calls
- no package script/default gate changes
- no SessionManager schema changes
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw content/secrets/hidden reasoning in browser preview/status output
- browser capability is preview-only

## Tasks

### 1. Design and audit

Create docs/design/browser-capability-boundary-preview.md.

Include:

- Route 93 reference scan summary
- Stagehand action preview lessons
- Playwright MCP vs CLI/Skills tradeoff
- OpenHands browser/tool status lessons
- first browser action taxonomy
- browser readiness/blocker model
- browser preview output model
- sidebar integration model
- no-execution boundary
- future browser sandbox/runtime route boundary
- next-route decision criteria

### 2. Add browser capability model

Add packages/ts-shell/src/core/context/browserCapabilityModel.ts.

Expected concepts:

- BrowserCapabilityState
- BrowserBackendKind:
  - none
  - planned-playwright-cli
  - planned-playwright-mcp
  - planned-stagehand-like
  - external
- BrowserCapabilityStatus:
  - unavailable
  - available-placeholder
  - preview-only
  - blocked
  - future
- BrowserActionKind:
  - status
  - navigate
  - click
  - type
  - extract
  - observe
  - wait
  - screenshot
  - download
  - upload
  - auth
  - payment
  - destructive
- BrowserActionRisk:
  - read-only
  - state-changing
  - sensitive
  - destructive
  - unsupported
- BrowserCapabilityBoundary

Model must be pure and non-persistent.

Add focused tests if helpers exist.

### 3. Add browser action contract

Add packages/ts-shell/src/core/context/browserActionContract.ts.

Contract should represent requested action without executing it.

Expected fields:

- actionKind
- target
- url, optional
- selector, optional
- text, optional
- extractionGoal, optional
- userIntentSummary
- requestedBackend, optional
- requiresNetwork
- requiresAuth
- risk
- sourceCommand

Required behavior:

- parse/normalize structured preview requests if command needs it
- reject ambiguous or unsafe action contracts
- no browser execution
- no provider/model calls

Add focused tests.

### 4. Add browser readiness classifier

Add packages/ts-shell/src/core/context/browserActionReadiness.ts.

Readiness should classify:

- supported-preview
- blocked-sensitive
- blocked-destructive
- blocked-auth
- blocked-payment
- blocked-no-backend
- blocked-dynamic-discovery
- blocked-unsupported-action
- blocked-ambiguous-target
- future-runtime-required

Required behavior:

- navigate/click/type/extract/observe can be previewable only
- screenshot/download/upload/auth/payment/destructive are blocked unless future route explicitly reopens
- no execution readiness claim
- clear reason and next action
- deterministic output

Add focused tests.

### 5. Add browser action preview

Add packages/ts-shell/src/core/context/browserActionPreview.ts.

Preview should render:

- requested action
- risk
- readiness
- backend status
- expected evidence if future execution exists
- required user confirmation if future route enables execution
- blocked reason
- next action
- “Executed: no”

Required behavior:

- no raw content/secrets
- no website content
- no hidden reasoning
- concise user-facing summary
- no execution implication

Add focused tests.

### 6. Add browser capability surface

Add packages/ts-shell/src/core/context/browserCapabilitySurface.ts.

Surface should show:

- Browser capability: preview-only / unavailable / future
- backend candidates:
  - Playwright CLI/Skills
  - Playwright MCP
  - Stagehand-like deterministic/AI split
- supported preview actions
- blocked actions
- safety caveats
- next action

Keep output concise.

Add focused tests.

### 7. Add `/browser` command contract and runner

Add:

- packages/ts-shell/src/core/context/browserCommandContract.ts
- packages/ts-shell/src/core/context/browserCommandRunner.ts

Preferred command UX:

- `/browser`
  - show browser capability status
- `/browser status`
  - same as status
- `/browser preview navigate <url>`
  - preview navigate only
- `/browser preview extract <goal>`
  - preview extraction intent only
- `/browser preview click <target>`
  - preview click only
- `/browser preview type <target> <text>`
  - preview type only

If parsing natural user syntax gets complex, keep the parser simple and document future UX.

Required behavior:

- no execution
- no browser process
- no provider/model call
- invalid/unsafe args rejected clearly
- output says preview-only

Add focused tests.

### 8. Register `/browser` if clean

Integrate with slash command registry.

Required behavior:

- `/browser` routes to status
- `/browser preview ...` routes to preview runner
- emits sidebar event if sidebar event sink integration is clean
- does not affect existing commands
- no cli.tsx rewrite

Add focused tests.

### 9. Integrate browser status with sidebar

Update sidebar tool availability / state projection if clean.

Required behavior:

- browser capability appears as preview-only/future in Tools section
- no dynamic discovery
- no MCP launch
- no browser execution
- `/sidebar` and `/sidebar panel` can show browser placeholder if provided
- browser preview command can produce recent activity event

Add focused tests.

### 10. Browser boundary tests

Required tests:

- `/browser` shows preview-only status
- preview navigate produces readiness/preview with Executed: no
- preview extract produces readiness/preview with Executed: no
- click/type previews are state-changing but not executed
- auth/payment/destructive blocked
- screenshot/download/upload blocked or future-runtime-required
- no backend blocks execution claim
- ambiguous target blocked
- sidebar tools section includes browser placeholder
- browser command emits sidebar event if integrated
- no raw content/secrets/hidden reasoning leak
- no provider/model/browser execution side effects

### 11. Docs and roadmap update

Update:

- docs/design/browser-capability-boundary-preview.md with final notes
- docs/design/sidebar-state-model.md with Route 93 note
- docs/design/sidebar-live-panel-runtime-experiment.md with Route 93 note
- docs/design/context-engineering-continuity-baseline.md with Route 93 note
- docs/design/edit-capability-roadmap.md with concise status and Route 94 recommendation

Recommended next route:

- Route 94: browser sandbox/runtime decision and non-executing dry-run harness
  - if browser boundary is stable
- or Route 94: Playwright CLI/Skills integration prototype
  - if CLI path is chosen
- or Route 94: Playwright MCP capability adapter
  - if MCP path is chosen
- or Route 94: Stagehand-like action cache design
  - if preview/cache/replay is preferred first

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

- browser command requires actual browser execution
- Playwright/MCP/Stagehand integration becomes necessary
- dynamic MCP discovery becomes necessary
- provider/model calls become necessary
- browser session persistence becomes necessary
- command parsing becomes confusing or flag-heavy
- raw content/secrets would need to appear
- cli.tsx rewrite becomes necessary

## Final report

1. What changed
2. Reference scan summary
3. Validation
4. Boundaries preserved
5. Residue cleanup
6. Risks / blockers
7. Next route recommendation
8. Proposed commit message

Do not commit or push.

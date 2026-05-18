# Route 125: Direct Playwright core adapter spike and MCP backend comparison

## Goal

Decide and prototype the correct browser runtime direction after Route 124.

The project already has a strong browser safety and control shell:

- permission and confirmation gates
- allowlist and egress guard
- receipts, replay, provenance, cache, and repair
- sidebar and report summaries
- controlled runtime MVP
- external and skill runtime adapter boundary
- browser eval gauntlet foundation

The remaining question is whether to stop hand-rolling low-level browser runtime behavior and use Direct Playwright or Playwright MCP as the browser engine layer.

Route 125 is a decision-and-spike route:

- audit current Playwright and MCP dependency/runtime availability
- prototype a Direct Playwright core adapter seam when available without package changes
- preserve deterministic unavailable behavior when Playwright is not installed
- compare Playwright MCP backend shape without making it the default core
- run controlled local/test page observe, extract, click, and type scenarios through the adapter seam
- reuse existing policy, evidence, receipt, sidebar, and eval layers
- produce a clear runtime direction decision

Expected decision bias:

- Direct Playwright should become the preferred core browser runtime if viable.
- Playwright MCP should remain an optional backend and ecosystem path.
- Stagehand-like behavior should remain a future high-level planner and repair layer, not the low-level runtime.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/direct-playwright-core-adapter-decision.md
- docs/design/edit-capability-roadmap.md: concise Route 125 note only

Do not append Route 125 notes across browser docs.
Do not expand multiple roadmap/design files.
Put detailed validation and residue notes in the final report instead of spreading them through docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/opt-in-real-browser-runtime-adapter.md
- docs/design/real-browser-runtime-mvp.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- controlled browser runtime MVP exists
- runtime protocol and external process adapter exist
- skill runtime binding exists
- DOM and accessibility snapshot models exist
- controlled click/type and selector repair apply exist
- browser eval gauntlet exists
- no direct Playwright core adapter exists
- no Playwright MCP backend comparison exists
- no package dependency changes should be made in this route

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness and eval references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 18 files
- Stagehand: at most 12 files
- OpenHands: at most 10 files
- Inspect AI plus mini-swe-agent: at most 10 files total
- opencode, gemini-cli, and ClaudeCode combined: at most 8 files
- total default budget: 58 files
- exceed by 5 only for directly relevant Playwright runtime, MCP browser tool, action loop, snapshot, selector, eval, or report files

Focus:

- Playwright MCP: browser tool schemas, context/session lifecycle, snapshots, accessibility tree, click/type/navigate tools, browser server boundaries, result/evidence shape
- Stagehand: observe/act/extract abstraction, action target confidence, selector repair, JS-rendered page behavior, high-level planner boundary
- OpenHands: browser runtime integration, action/observation events, sandbox status, tool availability, browser state reporting
- Inspect AI: browser/tool eval setup, task/scorer/report separation, skipped/unavailable behavior, deterministic harness patterns
- mini-swe-agent: subprocess runner, trajectory/evidence reporting, failure reproduction, concise scenario report
- coding-agent baselines: permission gates, runtime availability, slash UX, receipt/sidebar/report integration

Answer in docs/design/direct-playwright-core-adapter-decision.md:

1. Should this project stop hand-rolling low-level browser runtime?
2. Is Direct Playwright viable as the core runtime without package changes in this route?
3. What is the minimal Direct Playwright adapter boundary?
4. What does Playwright MCP offer as an optional backend, and where does it lose control?
5. How do existing policy, evidence, receipt, and eval layers wrap either backend?
6. What should Route 126 own?

## This route changes

Allowed:

- docs/design/direct-playwright-core-adapter-decision.md
- docs/design/edit-capability-roadmap.md, concise Route 125 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserPlaywrightRuntimeAvailability.ts
- packages/ts-shell/src/core/context/browserDirectPlaywrightAdapter.ts
- packages/ts-shell/src/core/context/browserPlaywrightMcpBackendComparison.ts
- packages/ts-shell/src/core/context/browserRuntimeDirectionDecision.ts
- packages/ts-shell/src/core/context/browserPlaywrightEvidenceMapper.ts
- packages/ts-shell/src/core/context/browserPlaywrightAdapterSurface.ts
- packages/ts-shell/src/core/harness/browserPlaywrightAdapterSpikeFixtures.ts
- packages/ts-shell/src/core/harness/browserPlaywrightAdapterSpikeScenarios.test.ts
- packages/ts-shell/src/core/harness/browserRuntimeDirectionDecisionScenarios.test.ts

Allowed if clean:

- dynamically check whether Playwright is available without adding dependencies
- use Direct Playwright only if already installed and available in the environment
- otherwise produce deterministic unavailable status
- add adapter seam that can later use Playwright as dependency
- add MCP backend comparison as metadata/protocol comparison, not live MCP launch
- use existing controlled local/test fixtures for observe/extract/click/type
- integrate Playwright-shaped evidence into existing DOM/accessibility/provenance/receipt model
- run controlled scenarios through fake or injected Playwright-like adapter if real Playwright is unavailable
- keep existing external process adapter and skill-managed adapter working

## Boundaries

Preserve:

- no package dependency changes
- no Playwright install
- no MCP server launch
- no dynamic skill discovery
- no provider/model calls
- no default browser runtime
- no public browser automation
- no public click/type
- no auth/session/cookies persistence
- no payment/destructive/upload/download/screenshot/OCR by default
- no arbitrary JavaScript execution from model/user input
- no cross-session browser state persistence
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no global allowlist changes
- no automatic confirmation
- no automatic replay
- no raw DOM/page content/secrets/credentials/hidden reasoning in receipts, reports, cache, or output

This route may prove that Direct Playwright is the right core runtime, but it must not require installing Playwright or changing package files.

## Tasks

### 1. Design and decision document

Create docs/design/direct-playwright-core-adapter-decision.md.

Keep it concise but decisive.

Include:

- reference scan summary
- why low-level browser runtime should not continue to be hand-rolled
- Direct Playwright core-runtime argument
- Playwright MCP optional-backend argument
- Stagehand-like future high-level planner argument
- package/dependency audit result
- adapter spike result
- decision matrix
- Route 126 recommendation

### 2. Add Playwright availability audit

Add browserPlaywrightRuntimeAvailability.ts.

Availability checks:

- package.json and workspace dependency status if easy without changing files
- runtime import availability through safe dynamic check if clean
- browser binary availability should be informational only
- status values: available, package-missing, binary-missing, unavailable, blocked-by-policy

Required behavior:

- no install
- no package change
- no browser launch during availability check unless explicitly injected in tests
- deterministic unavailable status in normal environment if not available

Add focused tests.

### 3. Add Direct Playwright adapter seam

Add browserDirectPlaywrightAdapter.ts.

Adapter should define the direct runtime boundary:

- launch/connect policy
- browser context policy
- page lifecycle policy
- observe/extract/click/type methods
- DOM/accessibility snapshot mapping
- timeout/budget policy
- cleanup policy
- unavailable fallback

If real Playwright is unavailable, implement an injected adapter interface and deterministic unavailable path. Do not force real launch.

Add focused tests with injected Playwright-like client.

### 4. Add Playwright evidence mapper

Add browserPlaywrightEvidenceMapper.ts.

Map Playwright-like outputs into existing models:

- DOM snapshot
- accessibility snapshot
- observation/provenance
- action target
- runtime receipt
- redactions/warnings

Required behavior:

- no raw DOM dump
- no secrets/credentials
- budgeted snapshots
- deterministic provenance ids

Add focused tests.

### 5. Add Playwright MCP backend comparison

Add browserPlaywrightMcpBackendComparison.ts.

Comparison should classify:

- tool schema maturity
- control-plane visibility
- permission mapping complexity
- evidence mapping quality
- server lifecycle complexity
- sandbox boundary complexity
- suitability: core-runtime, optional-backend, not-recommended

Do not launch MCP.

Add focused tests.

### 6. Add runtime direction decision model

Add browserRuntimeDirectionDecision.ts.

Decision output should include:

- recommended core runtime
- optional backends
- rejected paths
- reasons
- prerequisites for Route 126
- risk list
- next action

Expected bias if evidence supports it:

- Direct Playwright as core runtime
- Playwright MCP as optional backend
- Stagehand-like as future planner/repair layer

Add focused tests.

### 7. Add adapter surface

Add browserPlaywrightAdapterSurface.ts.

Render:

- Playwright runtime availability
- Direct adapter status
- MCP backend comparison
- Recommended direction
- What was tested
- What was not done
- Next action

Keep concise.

Add focused tests.

### 8. Integrate with /browser runtime status if clean

Update /browser runtime status to include:

- Direct Playwright availability
- MCP backend status as optional/not launched
- runtime direction recommendation

Do not make output noisy.

Add focused tests.

### 9. Add adapter spike fixtures

Add browserPlaywrightAdapterSpikeFixtures.ts.

Fixtures should provide:

- injected Playwright-like client
- controlled page fixture
- DOM snapshot fixture
- accessibility snapshot fixture
- JS-rendered text fixture
- click result fixture
- type result fixture
- invalid/timeout/unavailable fixture
- MCP comparison fixture if needed

No public network. No secrets.

### 10. Add adapter spike scenarios

Add browserPlaywrightAdapterSpikeScenarios.test.ts.

Required scenarios:

1. Playwright unavailable produces deterministic unavailable status
2. injected Playwright-like observe produces DOM/accessibility/provenance receipt
3. injected JS-rendered observe captures rendered text
4. injected click produces post-action observation
5. injected type produces post-action observation without exposing value
6. unsafe target is blocked by existing policy before adapter call
7. invalid adapter response is blocked
8. timeout/unavailable is handled safely
9. raw DOM/secrets are redacted
10. sidebar/report summary includes adapter status

### 11. Add runtime direction decision scenarios

Add browserRuntimeDirectionDecisionScenarios.test.ts.

Required scenarios:

1. Direct Playwright available and controllable recommends core runtime
2. Direct Playwright unavailable recommends dependency decision before implementation
3. MCP backend mature but control plane weaker recommends optional backend
4. Stagehand-like planner useful but not core runtime recommends future planner layer
5. decision report is concise and redacted

### 12. Reuse existing eval gauntlet

Run existing browser runtime gauntlet through injected Playwright-like adapter if clean.

Required behavior:

- no package install
- no real browser launch unless already available and explicitly safe
- no public automation
- report says adapter mode

Add focused tests if touched.

### 13. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 125 evaluated Direct Playwright as core runtime and MCP as optional backend
- no package install or default browser runtime added
- next route recommendation

Recommended next route:

- Route 126: Direct Playwright dependency/runtime implementation decision
- or Route 126: Direct Playwright adapter implementation if dependency is approved
- or Route 126: MCP optional backend prototype if direct Playwright is blocked
- or Route 126: browser eval closeout gate if runtime direction is settled

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
- rtk git diff HEAD -- package.json package-lock.json packages/ts-shell/package.json

Do not run broad package tests.
Do not install packages.
Do not add package scripts.
Do not run public network smoke tests unless explicit env is set.

## Stop conditions

Stop and report if:

- package dependency changes become necessary
- Playwright install becomes necessary
- MCP launch becomes necessary
- provider/model calls become necessary
- public browser automation becomes necessary
- auth/session/cookies become necessary
- raw DOM/page content/secrets would appear
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Direct Playwright vs MCP decision
4. Adapter spike coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

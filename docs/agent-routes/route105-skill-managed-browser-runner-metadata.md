# Route 105: skill-managed browser runner metadata prototype

## Goal

Prototype the skill-managed browser runner metadata layer after Route 104 receipts and replay readiness.

Route 102 chose external-runner-only / future skill-managed runner.
Route 103 implemented explicit external runner bridge.
Route 104 added stable browser execution receipts, evidence bundles, evidence safety, and replay readiness.

Route 105 should make the "skill-managed runner" path concrete without executing skills or discovering tools dynamically.

Target behavior:

- define skill-managed browser runner metadata
- validate explicit skill runner metadata
- connect metadata to external runner policy
- connect metadata to browser runtime status
- connect metadata to `/browser execute` blocked/available explanations
- connect metadata to receipt/replay readiness
- connect metadata to sidebar/tool status
- add scenario harness coverage
- no dynamic skill discovery
- no MCP launch
- no browser execution through skills yet

This route should create the metadata and policy bridge needed before a real skill-managed runner can be implemented.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/playwright-runtime-dependency-decision.md
- docs/design/real-playwright-local-only-execution.md
- docs/design/cli-browser-executor-injection-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- external runner protocol exists
- external runner manifest exists
- skill-managed policy exists only as a boundary
- test-local external runner works through explicit manifest
- browser execution receipts exist
- replay readiness exists
- no dynamic skill discovery exists
- no skill-managed execution exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- browser-use: /home/wang/projects/browser-use
- Playwright repo: /home/wang/projects/playwright

Budget:

- Playwright MCP: at most 7 files
- Stagehand: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 29 files
- exceed by 2 only for directly relevant skill/tool metadata, runner capability, or browser execution policy files

Focus:

Playwright MCP:

- tool metadata
- capability schema
- browser tool status
- action request/response schema
- server availability boundary
- dynamic discovery risk

Stagehand:

- action capability metadata
- observe/act/extract capability split
- cached/replayable action metadata
- execution readiness surface
- deterministic versus AI-mediated action boundary

OpenHands:

- tool runtime metadata
- action/observation events
- UI/session tool availability surface
- blocked/unavailable tool status

Inspect AI:

- tool configuration metadata
- sandbox/tool registry boundaries
- transcript/report linkage
- unavailable tool behavior

mini-swe-agent:

- minimal tool configuration
- command runner capability
- trajectory/report metadata
- tool unavailable/failure handling

Coding-agent baselines:

- skills/tool capability surface
- command registry
- permission/tool availability
- CLI status and blocked output

Answer in docs/design/skill-managed-browser-runner-metadata.md:

1. What metadata should a skill-managed browser runner expose?
2. How should skill-managed mode differ from raw external runner mode?
3. What capability/evidence contract is required before execution?
4. How should metadata affect receipt/replay readiness?
5. What should stay blocked until real skill execution is implemented?
6. What should Route 106 own?

## This route changes

Allowed:

- docs/design/skill-managed-browser-runner-metadata.md
- docs/design/browser-execution-evidence-replay-readiness.md, Route 105 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 105 note only
- docs/design/playwright-runtime-dependency-decision.md, Route 105 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 105 note only
- docs/design/real-cli-scenario-harness.md, Route 105 note only
- docs/design/agent-scenario-harness-foundation.md, Route 105 note only
- docs/design/sidebar-live-event-capture.md, Route 105 note only
- docs/design/context-engineering-continuity-baseline.md, Route 105 note only
- docs/design/edit-capability-roadmap.md, concise Route 105 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSkillRunnerMetadata.ts
- packages/ts-shell/src/core/context/browserSkillRunnerCapability.ts
- packages/ts-shell/src/core/context/browserSkillRunnerReadiness.ts
- packages/ts-shell/src/core/context/browserSkillRunnerManifest.ts
- packages/ts-shell/src/core/context/browserSkillRunnerSurface.ts
- packages/ts-shell/src/core/harness/browserSkillRunnerScenarioExamples.test.ts

Allowed if clean:

- extend external runner manifest with skill-managed metadata
- extend skill-managed policy from Route 103
- integrate skill metadata into `/browser status`
- integrate skill metadata into `/browser execute` blocked/future explanations
- integrate skill metadata into sidebar browser tool status
- integrate skill metadata into receipt/replay readiness
- add real CLI scenarios using explicit metadata manifest only

## This route must preserve

Route-specific boundaries:

- no dynamic skill discovery
- no skill execution
- no MCP server launch
- no Playwright dependency
- no default browser execution
- no external network
- no provider/model calls
- no persistent browser session
- no auth/payment/destructive actions
- no file upload/download
- no arbitrary JavaScript execution
- no screenshot/OCR capture
- no package script/default gate changes
- no SessionManager schema changes
- no broad cli.tsx rewrite
- no edit runtime changes
- no memory persistence behavior changes
- no startup/model auto-injection changes
- no raw page content/secrets/hidden reasoning in metadata, reports, receipts, sidebar events, or command output
- skill-managed metadata is a capability contract, not authority to execute

## Tasks

### 1. Design and audit

Create docs/design/skill-managed-browser-runner-metadata.md.

Include:

- Route 105 reference scan summary
- Route 103/104 external runner + receipt baseline
- skill-managed runner metadata model
- skill-managed versus raw external runner distinction
- capability contract
- evidence contract
- readiness policy
- sidebar/status/report model
- receipt/replay readiness integration
- no dynamic discovery / no execution boundary
- Route 106 recommendation

### 2. Add skill runner metadata model

Add packages/ts-shell/src/core/context/browserSkillRunnerMetadata.ts.

Expected concepts:

- BrowserSkillRunnerMetadata
- BrowserSkillRunnerId
- BrowserSkillRunnerVersion
- BrowserSkillRunnerSource:
  - explicit-manifest
  - skill-managed
  - test-only
  - disabled
- BrowserSkillRunnerStatus:
  - available-metadata-only
  - unavailable
  - blocked
  - future-execution-required
- skill id
- skill name
- runner capability id
- supported actions
- evidence contract
- sandbox contract
- allowlist contract
- confirmation contract
- replay contract
- redactions
- warnings

Required behavior:

- validate required fields
- reject missing evidence/sandbox contracts
- reject unsafe capabilities
- reject dynamic discovery claims
- no execution

Add focused tests.

### 3. Add skill runner capability model

Add packages/ts-shell/src/core/context/browserSkillRunnerCapability.ts.

Expected concepts:

- BrowserSkillRunnerCapability
- supported action kinds:
  - observe
  - extract
  - navigate-local
  - future-click
  - future-type
- unsupported action kinds:
  - auth
  - payment
  - destructive
  - upload
  - download
  - screenshot
  - arbitrary-js
- capability risk:
  - read-only
  - local-only
  - state-changing-future
  - sensitive-blocked
  - unsupported
- capability evidence requirement

Required behavior:

- capability normalization
- risk classification
- no dynamic skill lookup
- deterministic output

Add focused tests.

### 4. Add skill runner readiness

Add packages/ts-shell/src/core/context/browserSkillRunnerReadiness.ts.

Readiness should classify whether metadata is sufficient for future execution.

Statuses:

- metadata-ready
- metadata-incomplete
- blocked-unsafe-capability
- blocked-missing-evidence-contract
- blocked-missing-sandbox-contract
- blocked-dynamic-discovery
- future-execution-required
- unavailable

Required behavior:

- no execution
- no discovery
- no provider/model calls
- clear blockers and next action
- integrate with existing external runner policy if clean

Add focused tests.

### 5. Add skill runner manifest

Add packages/ts-shell/src/core/context/browserSkillRunnerManifest.ts.

Manifest should support explicit test/local metadata.

Expected fields:

- manifest version
- source:
  - cli-harness
  - explicit-local-config
  - test-only
- skill runner metadata
- allowed actions
- fixture/local scope
- sandbox contract
- evidence contract
- replay contract
- timeout/output budgets
- redactions/warnings

Required behavior:

- validate manifest
- reject dynamic discovery mode
- reject execution authority without runner bridge
- reject unsafe capabilities
- reject raw secrets
- deterministic serialization

Add focused tests.

### 6. Add skill runner surface

Add packages/ts-shell/src/core/context/browserSkillRunnerSurface.ts.

Render:

- Skill-managed browser runner
- Skill id/name
- Metadata status
- Supported actions
- Blocked actions
- Evidence contract
- Sandbox contract
- Replay contract
- Execution: not enabled
- Next action

Keep concise and user-facing.

Add focused tests.

### 7. Integrate with external runner policy and manifest bridge

Update existing browserSkillManagedRunnerPolicy, browserExternalRunnerManifest, browserCliExecutorInjection, and browserCliExecutionBridge if clean.

Required behavior:

- explicit skill runner metadata can be loaded from manifest
- dynamic discovery remains blocked
- skill-managed mode without explicit metadata remains future-skill-required
- valid metadata affects status/readiness output
- valid metadata does not execute browser actions
- raw external runner and skill-managed metadata remain distinct
- no default enablement

Add focused tests.

### 8. Integrate with `/browser status` and `/browser execute`

Update browser command runner/surface if clean.

Required behavior:

- `/browser status` can show skill-managed metadata status if manifest/input provides it
- `/browser execute` with skill-managed metadata but no execution bridge returns future-execution-required
- `/browser execute` output includes skill runner readiness and next action
- local external runner execution from Route 103 remains working
- no skill execution occurs

Add focused tests.

### 9. Integrate with receipts and replay readiness

Update browserExecutionReceipt / browserReplayReadiness if clean.

Required behavior:

- receipt can reference skill runner metadata when present
- replay readiness can say replay-needs-skill-runner / replay-needs-runner
- metadata-ready does not mean replay-ready
- no automatic replay
- no persistence

Add focused tests.

### 10. Sidebar and report integration

Update sidebar event adapter and CLI/harness report if clean.

Required behavior:

- sidebar Tools/browser section can show skill-managed metadata status
- `/browser execute` blocked/future result emits sanitized event
- CLI scenario report includes skill metadata readiness
- no raw metadata/secrets

Add focused tests.

### 11. Scenario harness coverage

Add packages/ts-shell/src/core/harness/browserSkillRunnerScenarioExamples.test.ts.

Required scenarios:

1. no skill metadata

- `/browser status`
- skill-managed future-skill-required or unavailable

2. valid skill metadata loaded

- status shows metadata-ready
- execution still not enabled

3. execute with metadata but no runner bridge

- `/browser execute observe local-fixture://demo`
- result future-execution-required
- Executed: no
- receipt/replay readiness indicates needs runner

4. unsafe skill capability rejected

- manifest claims auth/payment/destructive or arbitrary-js
- blocked-unsafe-capability
- no raw manifest leak

5. sidebar/report shows metadata status

- render `/sidebar` or inspect report
- skill-managed metadata appears as status, not execution

### 12. Real CLI scenarios

If clean, add real CLI coverage using explicit skill metadata manifest.

Required real CLI scenarios:

- valid metadata status through `/browser status`
- execute with metadata but no runner bridge returns future-execution-required
- unsafe metadata manifest blocks safely

If CLI injection is coupled, keep in-process harness coverage and document blocker.

### 13. Docs and roadmap update

Update:

- docs/design/skill-managed-browser-runner-metadata.md with final notes
- docs/design/browser-execution-evidence-replay-readiness.md with Route 105 note
- docs/design/browser-external-runner-skill-bridge.md with Route 105 note
- docs/design/playwright-runtime-dependency-decision.md with Route 105 note
- docs/design/browser-sandbox-network-allowlist.md with Route 105 note
- docs/design/real-cli-scenario-harness.md with Route 105 note
- docs/design/agent-scenario-harness-foundation.md with Route 105 note
- docs/design/sidebar-live-event-capture.md with Route 105 note
- docs/design/context-engineering-continuity-baseline.md with Route 105 note
- docs/design/edit-capability-roadmap.md with concise status and Route 106 recommendation

Recommended next route:

- Route 106: skill-managed browser runner execution bridge
  - if metadata/readiness is stable
- or Route 106: browser action cache/replay design
  - if replay metadata should come before skill execution
- or Route 106: external-network browser execution design
  - only if local/skill metadata and receipts are stable
- or Route 106: browser runner UX polish
  - if status/output is too noisy

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- real CLI scenario tests touched by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.
Do not add package scripts.

If real CLI scenario tests reveal unrelated existing CLI failures, narrow to safe subset and document blocker.

## Stop conditions

Stop and report if:

- skill metadata requires dynamic skill discovery
- skill metadata requires real skill execution
- MCP server launch becomes necessary
- external network becomes necessary
- Playwright package dependency becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- raw metadata/secrets would appear in output/report
- metadata semantics imply execution authority

## Final report

1. What changed
2. Reference scan summary
3. Skill-managed metadata design
4. Scenario coverage
5. Real CLI coverage
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

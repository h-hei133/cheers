# Route 125: real-runner adapter pack, controlled multi-step planner, and browser eval score gates

## Goal

Implement a larger browser capability slice that combines real-runner adapter profiles, controlled multi-step action planning, and browser eval score gates.

Route 124 added:

- browser runtime protocol
- external runtime manifest
- external process adapter
- skill runtime binding
- adapter executor
- snapshot validation
- selector repair apply for controlled pages
- expanded browser eval gauntlet

Route 125 should advance three fronts together:

1. Real-runner adapter pack
   - Playwright-like adapter profile
   - Stagehand-like adapter profile
   - skill-managed runtime profile
   - explicit manifest selection
   - deterministic unavailable behavior when runner is absent

2. Controlled multi-step action planner
   - plan bounded observe/extract/click/type sequences on controlled/local/test pages
   - use DOM/accessibility snapshots and action targets
   - apply selector repair only when controlled and explicit
   - verify post-action observation

3. Browser eval score gates
   - turn runtime gauntlet into score-gated benchmark
   - classify failures
   - produce concise report
   - expose pass/fail thresholds for controlled browser capability closeout

This route should trust the existing browser safety foundation and make a larger capability jump, while staying controlled and explicit.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-runner-adapter-planner-eval-gates.md
- docs/design/edit-capability-roadmap.md: concise Route 125 note only

Do not append Route 125 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/opt-in-real-browser-runtime-adapter.md
- docs/design/real-browser-runtime-mvp.md
- docs/design/browser-public-readonly-web-runner.md
- docs/design/public-readonly-extraction-quality.md
- docs/design/browser-egress-guard-network-audit.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- opt-in browser runtime adapter boundary exists
- temp external runner and skill-managed test binding work
- DOM/accessibility snapshots exist
- controlled click/type exist
- selector repair apply exists for controlled pages
- browser eval gauntlet exists but is not score-gated closeout
- no Playwright-like/Stagehand-like adapter profiles exist
- no controlled multi-step planner exists
- no browser capability score gate exists

## Reference scan

Primary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands

Harness/eval references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Playwright MCP: at most 16 files
- Stagehand: at most 16 files
- OpenHands: at most 10 files
- Inspect AI + mini-swe-agent: at most 12 files total
- opencode/gemini-cli/ClaudeCode combined: at most 8 files
- total default budget: 62 files
- exceed by 5 only for directly relevant runner adapter, browser action planner, selector repair, benchmark scoring, task report, or controlled runtime files

Focus:

- Playwright MCP: browser tool schemas, browser context lifecycle, click/type/navigate tools, snapshot/accessibility response, locator/action target representation, server unavailable behavior
- Stagehand: observe/act/extract planner, action cache, self-healing/selector repair, action target confidence, multi-step browser interaction, summary/report surfaces
- OpenHands: browser tool events, action/observation loop, tool availability, sandbox/runtime reporting, failure classification
- Inspect AI: task/scorer/solver separation, score gates, eval report structure, skipped/unavailable cases, deterministic harness patterns
- mini-swe-agent: trajectory records, step reports, process runner evidence, reproduction-friendly failure logs
- coding-agent baselines: command permissioning, runtime availability, slash command UX, sidebar/report summaries, explicit tool config

Answer in docs/design/browser-runner-adapter-planner-eval-gates.md:

1. What adapter profiles are needed for Playwright-like, Stagehand-like, and skill-managed runners?
2. How does a controlled multi-step browser action planner decide actions without model/provider calls?
3. What safety gates apply before every planned action?
4. How does selector repair apply fit into the planner?
5. What benchmark score gates define controlled browser runtime readiness?
6. What remains blocked until Route 126?

## This route changes

Allowed:

- docs/design/browser-runner-adapter-planner-eval-gates.md
- docs/design/edit-capability-roadmap.md, concise Route 125 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserRunnerAdapterProfile.ts
- packages/ts-shell/src/core/context/browserPlaywrightLikeAdapterProfile.ts
- packages/ts-shell/src/core/context/browserStagehandLikeAdapterProfile.ts
- packages/ts-shell/src/core/context/browserSkillManagedAdapterProfile.ts
- packages/ts-shell/src/core/context/browserRuntimeAdapterRegistry.ts
- packages/ts-shell/src/core/context/browserActionPlanModel.ts
- packages/ts-shell/src/core/context/browserActionPlanner.ts
- packages/ts-shell/src/core/context/browserActionPlanPolicy.ts
- packages/ts-shell/src/core/context/browserActionPlanExecutor.ts
- packages/ts-shell/src/core/context/browserActionPlanVerifier.ts
- packages/ts-shell/src/core/context/browserActionPlanSurface.ts
- packages/ts-shell/src/core/harness/browserEvalScoreGate.ts
- packages/ts-shell/src/core/harness/browserEvalFailureClassifier.ts
- packages/ts-shell/src/core/harness/browserEvalCloseoutReport.ts
- packages/ts-shell/src/core/harness/browserRunnerAdapterProfileScenarios.test.ts
- packages/ts-shell/src/core/harness/browserControlledActionPlannerScenarios.test.ts
- packages/ts-shell/src/core/harness/browserEvalScoreGateScenarios.test.ts

Allowed if clean:

- extend existing runtime manifest to select adapter profile
- extend runtime adapter executor to route through profile-specific request/response mapping
- add test-local runner scripts for Playwright-like and Stagehand-like protocols
- add controlled multi-step plan command or harness API
- add /browser plan or /browser execute --plan only if command UX remains simple
- add eval score gate command/report only if clean
- integrate plan/eval summaries into sidebar/report
- keep public HTTP read-only path unchanged

## Boundaries

Preserve:

- no package dependency changes
- no Playwright install
- no Stagehand install
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

Multi-step planning is allowed only for controlled/local/test pages and deterministic snapshots. It must not become public autonomous browser automation.

## Tasks

### 1. Design

Create docs/design/browser-runner-adapter-planner-eval-gates.md.

Keep it concise but complete.

Include:

- reference scan summary
- Route 124 adapter baseline
- adapter profile model
- Playwright-like protocol mapping
- Stagehand-like protocol mapping
- skill-managed protocol mapping
- controlled action planner model
- selector repair integration
- eval score gate model
- blocked public automation boundary
- Route 126 recommendation

### 2. Add adapter profile model

Add browserRunnerAdapterProfile.ts.

Expected concepts:

- BrowserRunnerAdapterProfile
- profile kind: playwright-like, stagehand-like, skill-managed, simulated, unavailable
- supported actions
- snapshot capabilities
- selector capabilities
- JS-rendered capability
- action target capability
- repair capability
- protocol version
- unavailable reason
- warnings

Required behavior:

- pure metadata and validation
- no runner launch
- no dynamic discovery
- deterministic output

Add focused tests.

### 3. Add Playwright-like adapter profile

Add browserPlaywrightLikeAdapterProfile.ts.

Profile should map current runtime protocol to a Playwright-MCP-like shape:

- navigate
- snapshot / accessibility snapshot
- click target
- type target
- text extraction
- unavailable / invalid response

Do not launch Playwright or MCP.

Add focused tests with protocol fixture responses.

### 4. Add Stagehand-like adapter profile

Add browserStagehandLikeAdapterProfile.ts.

Profile should map current runtime protocol to a Stagehand-like shape:

- observe
- extract
- act
- action target confidence
- repair/cached action metadata
- JS-rendered observation summary

Do not call LLM/provider. Do not install Stagehand.

Add focused tests with protocol fixture responses.

### 5. Add skill-managed adapter profile

Add browserSkillManagedAdapterProfile.ts.

Profile should:

- reuse existing skill runtime binding metadata
- expose supported action subset
- classify future-skill-runtime-required
- block missing explicit binding
- block dynamic discovery

Add focused tests.

### 6. Add adapter registry

Add browserRuntimeAdapterRegistry.ts.

Registry should:

- choose profile from explicit manifest
- return unavailable if absent
- validate capability compatibility
- refuse public automation profile unless future route enables it
- provide concise status for /browser runtime status

Add focused tests.

### 7. Add action plan model

Add browserActionPlanModel.ts.

Plan fields:

- plan id
- goal kind: observe, extract, click-target, type-target, verify-state
- origin scope
- steps
- required snapshots
- action targets
- selector repair candidates
- verification expectation
- risk level
- max steps
- warnings/blockers

Step kinds:

- observe
- extract
- click
- type
- repair-selector
- verify-observation
- stop

Add focused tests.

### 8. Add action planner

Add browserActionPlanner.ts.

Planner should be deterministic and provider-free.

Inputs:

- current observation
- DOM/accessibility snapshots
- requested goal
- action target hints
- allowed actions
- selector repair candidates

Planner should:

- choose action target by exact accessible name/text/role match
- choose safe input target by label/name
- create bounded plan up to max steps
- require verification step after click/type
- use selector repair candidate when original target missing and confidence passes
- block ambiguous targets
- block public click/type
- block sensitive targets

Add focused tests.

### 9. Add action plan policy

Add browserActionPlanPolicy.ts.

Policy should enforce:

- controlled/local/test only
- max step count
- allowed actions
- action target confidence threshold
- explicit confirmation for click/type if configured
- no password/payment/destructive/upload/download
- no public click/type
- no arbitrary JS
- no raw DOM output

Add focused tests.

### 10. Add action plan executor and verifier

Add browserActionPlanExecutor.ts and browserActionPlanVerifier.ts.

Executor should:

- run plan steps through existing runtime adapter executor
- stop on first failed step
- record per-step observation/provenance/receipt
- never exceed max steps
- never auto-repair unless plan includes explicit repair step
- return plan result

Verifier should:

- compare expected observation state
- verify text/role/state changes from post-action observation
- classify pass/fail/blocked/skipped
- produce concise failure reason

Add focused tests.

### 11. Add action plan surface

Add browserActionPlanSurface.ts.

Render:

- Browser action plan
- Goal
- Steps
- Executed steps
- Verification
- Snapshot/provenance ids
- Blockers/warnings
- Next action

Keep concise.

Add focused tests.

### 12. Integrate with /browser if clean

Preferred UX:

- /browser plan <goal> for preview only, if simple
- /browser execute plan <goal> or harness API for controlled execution, if clean

If command syntax is too much, expose via harness/API only and document.

Required behavior if integrated:

- public plan execution blocked
- controlled plan preview available
- controlled plan execution requires explicit runtime manifest
- output includes plan surface and verification
- existing /browser execute paths remain stable

Add focused tests if touched.

### 13. Add adapter profile scenarios

Add browserRunnerAdapterProfileScenarios.test.ts.

Required scenarios:

1. no profile -> unavailable
2. Playwright-like fixture maps snapshot/click/type responses
3. Stagehand-like fixture maps observe/extract/act responses
4. skill-managed profile requires explicit binding
5. invalid profile response blocked
6. public automation profile blocked
7. raw DOM/secrets redacted

### 14. Add controlled planner scenarios

Add browserControlledActionPlannerScenarios.test.ts.

Required scenarios:

1. plan observe + verify title
2. plan extract rendered text
3. plan click button by accessible name, verify state change
4. plan type into safe input, verify value/status change without exposing value
5. ambiguous target blocked
6. missing selector repaired with high-confidence candidate
7. low-confidence repair blocked
8. password/payment target blocked
9. public click/type blocked
10. max step count enforced
11. failed step stops plan
12. no raw DOM/secrets in plan report

### 15. Add eval score gate

Add browserEvalScoreGate.ts, browserEvalFailureClassifier.ts, browserEvalCloseoutReport.ts.

Score gate should:

- define required tasks
- set minimum pass threshold
- classify failures: unavailable, blocked, assertion-failed, unsafe-output, timeout, policy-blocked
- produce closeout report
- mark skipped versus failed clearly
- remain deterministic

Add focused tests.

### 16. Add eval score gate scenarios

Add browserEvalScoreGateScenarios.test.ts.

Required scenarios:

1. all controlled tasks pass -> gate passed
2. one required task fails -> gate failed
3. unavailable runtime -> skipped or failed according to policy
4. unsafe output -> failed unsafe
5. policy-blocked unsafe action -> expected pass if task is block-test
6. closeout report concise and redacted

### 17. Sidebar/report integration

If clean:

- report includes adapter profile, plan result, score gate, failure classes
- sidebar summary includes controlled browser plan/eval status
- no raw DOM/page content/secrets

Add focused tests if touched.

### 18. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 125 added runner adapter profiles, controlled multi-step action planner, and browser eval score gates
- public browser automation remains blocked
- next route recommendation

Recommended next route:

- Route 126: opt-in real Playwright adapter implementation if dependency/runtime exists externally
- or Route 126: browser action planner UX polish and controlled closeout
- or Route 126: browser session/auth design, disabled by default
- or Route 126: public browser automation readiness design

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

- package dependency changes become necessary
- Playwright install becomes necessary
- Stagehand install becomes necessary
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
3. Adapter/planner/eval design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

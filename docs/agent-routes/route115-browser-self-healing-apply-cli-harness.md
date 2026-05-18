# Route 115: browser self-healing apply cross-process CLI harness

## Goal

Prove Route 114 explicit local/test manifest patch writer through real CLI cross-process scenarios.

Route 114 added metadata-safe manifest patch writing for browser self-healing apply:

- add-runner-binding
- add-skill-metadata
- update-allowlist-local-fixture
- refresh-fixture-summary

Route 115 should verify that these repairs work across CLI child processes:

- one CLI process applies a repair to an explicit local/test manifest
- a later CLI process reads the patched manifest
- replay/status reflects the patched metadata
- replay still requires explicit command
- no automatic replay occurs
- no browser authority is expanded

This route is primarily harness/evidence hardening, not a new browser capability expansion.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-self-healing-apply-cli-harness.md
- docs/design/edit-capability-roadmap.md: concise Route 115 note only

Do not append Route 115 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-self-healing-manifest-patch-writer.md
- docs/design/browser-self-healing-explicit-apply.md
- docs/design/browser-action-self-healing-proposal.md
- docs/design/browser-replay-repair-readiness.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/real-cli-scenario-harness.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- self-healing proposals exist
- explicit repair apply command exists
- manifest patch writer exists
- patch writer uses validation before and after patch
- patch writer uses temp file plus rename
- in-process tests cover metadata-safe manifest patching
- cross-process CLI repair-then-replay evidence does not exist yet

## Reference scan

Primary references:

- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands
- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- Playwright MCP: /home/wang/projects/playwright-mcp
- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Stagehand: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 7 files total
- Playwright MCP: at most 4 files
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 26 files
- exceed by 2 only for directly relevant CLI harness, repair apply, manifest patch, replay, or report files

Focus:

- Stagehand: repaired action metadata and replay boundaries
- OpenHands: action recovery reporting and process-visible status
- Inspect AI: durable eval evidence and report separation
- mini-swe-agent: CLI trajectory and cross-process command evidence
- Playwright MCP: browser action metadata and capability status boundaries

Answer in docs/design/browser-self-healing-apply-cli-harness.md:

1. What cross-process repair behavior must be proven?
2. Which repair patches can be validated through real CLI scenarios?
3. How should repaired manifest state be reported without exposing raw manifest content?
4. What must remain blocked after repair apply?
5. What should Route 116 own?

## This route changes

Allowed:

- docs/design/browser-self-healing-apply-cli-harness.md
- docs/design/edit-capability-roadmap.md, concise Route 115 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/harness/browserSelfHealingApplyCliScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserSelfHealingApplyCliScenarioExamples.test.ts
- packages/ts-shell/src/core/harness/browserSelfHealingApplyCliReport.ts

Allowed if clean:

- extend existing real CLI scenario harness to pass repair proposal context and manifest path
- add CLI fixtures that create explicit local/test manifests
- add CLI fixtures that create proposal ids and sanitized proposal registry/context
- assert patched manifest state through a later CLI process
- assert replay/status uses patched manifest metadata
- add concise repair apply report rendering

## Boundaries

Preserve:

- no automatic repair
- no automatic replay
- no browser execution changes
- no external network
- no dynamic skill discovery
- no MCP launch
- no Playwright dependency
- no provider/model calls
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no default persistent state
- no global allowlist changes
- no global runner binding changes
- no raw manifest content, evidence, secrets, or hidden reasoning in CLI output, reports, or sidebar summaries

Cross-process manifest repair is allowed only for explicit local/test manifests.

## Tasks

### 1. Design

Create docs/design/browser-self-healing-apply-cli-harness.md.

Keep it concise.

Include:

- reference scan summary
- cross-process repair proof model
- CLI fixture strategy
- manifest repair evidence model
- replay/status after repair model
- blocked cases
- no-auto-replay boundary
- Route 116 recommendation

### 2. Add CLI repair fixtures

Add browserSelfHealingApplyCliScenarioFixtures.ts.

Fixtures should create:

- temp external runner manifest
- temp skill runner manifest
- temp local fixture manifest
- explicit persistent cache root if needed
- sanitized self-healing proposals
- env for real CLI child processes
- helper to inspect patched manifest safely
- cleanup helper

Required behavior:

- temp dirs only
- no raw secrets
- no external network
- deterministic proposal ids
- no raw manifest dumps in assertion errors

Add focused tests if helper logic exists.

### 3. Add CLI repair report helper

Add browserSelfHealingApplyCliReport.ts.

Report should include:

- scenario id
- proposal id
- patch kind
- manifest kind
- apply process result
- follow-up process result
- manifest patched: yes/no
- browser executed: no
- replay executed automatically: no
- raw manifest exposed: no
- warnings/blockers
- next action

Keep report concise.

Add focused tests.

### 4. Scenario: runner binding repair across CLI processes

Add real CLI scenario:

1. create manifest missing runner binding
2. run /browser repair apply <proposal-id> --confirm --manifest <path>
3. run /browser status or /browser execute/replay in a later CLI process
4. assert patched runner binding metadata is recognized
5. assert no automatic replay
6. assert browser executed: no during apply

If current proposal registry cannot cross CLI process safely, create explicit harness proposal manifest/context and document the bridge.

### 5. Scenario: skill metadata repair across CLI processes

Add real CLI scenario:

1. create manifest missing skill metadata
2. apply add-skill-metadata proposal with explicit manifest
3. later CLI status sees metadata-ready
4. execute still requires explicit runner binding and does not auto-run unless all gates are present

### 6. Scenario: local-fixture allowlist repair across CLI processes

Add real CLI scenario:

1. create local fixture manifest missing local-fixture allowlist
2. apply update-allowlist-local-fixture proposal
3. later CLI dry-run/replay/status sees local fixture allowlist metadata
4. external URL remains blocked

### 7. Scenario: fixture refresh repair across CLI processes

Add real CLI scenario:

1. create fixture manifest with stale/sparse safe summary
2. apply refresh-fixture-summary proposal
3. later CLI status/report sees refreshed sanitized summary
4. no raw fixture content appears

### 8. Blocked scenarios

Required blocked scenarios:

- external network allowlist patch blocked
- unsafe evidence patch blocked
- missing manifest context blocked
- invalid manifest path blocked safely
- global manifest/config mutation blocked
- apply without --confirm blocked if command currently requires confirmation

### 9. Replay still explicit

Add scenario proving:

- after repair apply, replay is not automatically executed
- user/harness must still call /browser replay <receipt-id>
- replay still revalidates gates
- command output says automatic replay: no

### 10. Sidebar/report integration

If clean:

- report includes repair apply summary
- sidebar-safe summary includes patch kind/status
- no raw manifest content

Add focused tests if touched.

### 11. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 115 added cross-process CLI harness evidence for self-healing manifest repair
- no automatic repair/replay
- no browser execution changes
- next route recommendation

Recommended next route:

- Route 116: replay UX/report polish
- or Route 116: external-network browser execution design, only after local repair/replay evidence remains stable
- or Route 116: self-healing apply persistence policy, only if proposal/manifest context needs a durable store

## Validation

Run:

- focused tests for touched browser/context modules
- focused tests for touched command modules if touched
- focused tests for touched harness modules
- real CLI scenario tests added by this route
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

- cross-process repair requires SessionManager schema changes
- cross-process repair requires CLI lifecycle rewrite
- proposal context requires unsafe persistence
- repair apply requires browser execution
- repair apply triggers automatic replay
- external network becomes necessary
- dynamic skill discovery becomes necessary
- MCP launch becomes necessary
- provider/model calls become necessary
- raw manifest/evidence/secrets would appear
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Cross-process repair harness design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

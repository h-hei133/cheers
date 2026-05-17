# Route 112: browser action self-healing proposal

## Goal

Add browser action self-healing proposal generation on top of Route 111 repair readiness.

Route 111 added replay failure classification, repair readiness, repair preview, and blocked replay repair output.

Route 112 should go one step further:

- generate structured self-healing proposals for replay failures
- identify concrete safe repair steps
- classify repair confidence and required user action
- produce apply-ready metadata patches only as proposals
- integrate proposals into replay output, reports, and sidebar summaries
- add harness scenarios for repair proposal quality
- do not apply repairs
- do not execute browser actions
- do not persist repaired cache entries
- do not auto-replay

This route should make replay failures actionable without expanding browser execution authority.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-action-self-healing-proposal.md
- docs/design/edit-capability-roadmap.md: concise Route 112 note only

Do not append Route 112 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-replay-repair-readiness.md
- docs/design/browser-action-cache-explicit-replay.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- replay failures are classified
- repair readiness exists
- repair preview is shown for blocked replay
- successful replay reports Repair needed: no
- persistent cache exists and is hardened
- no self-healing proposal model exists
- no repairs are applied

## Reference scan

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
- OpenHands: /home/wang/projects/OpenHands

Harness references:

- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Secondary references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Budget:

- Stagehand: at most 10 files
- Playwright MCP: at most 5 files
- OpenHands: at most 4 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 28 files
- exceed by 2 only for directly relevant self-healing, action cache, repair, replay, or evidence files

Focus:

Stagehand:

- self-healing action concepts
- cached action repair boundaries
- action preview before repair
- deterministic versus AI-mediated repair
- metadata needed to safely reuse actions

Playwright MCP:

- action target evidence
- tool response schema
- browser action limitations
- evidence needed to update an action safely

OpenHands:

- failed action explanations
- user-visible recovery suggestions
- action/observation report surfaces

Inspect AI / mini-swe-agent:

- trajectory failure classification
- reportable repair suggestions
- safe reproducibility evidence

Answer in docs/design/browser-action-self-healing-proposal.md:

1. What is safe to call self-healing in this project?
2. Which replay failures can produce repair proposals?
3. What proposal fields are required before future apply?
4. What must remain blocked until explicit repair apply exists?
5. What should Route 113 own?

## This route changes

Allowed:

- docs/design/browser-action-self-healing-proposal.md
- docs/design/edit-capability-roadmap.md, concise Route 112 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSelfHealingProposal.ts
- packages/ts-shell/src/core/context/browserSelfHealingPlanner.ts
- packages/ts-shell/src/core/context/browserSelfHealingPatch.ts
- packages/ts-shell/src/core/context/browserSelfHealingSurface.ts
- packages/ts-shell/src/core/harness/browserSelfHealingScenarioExamples.test.ts

Allowed if clean:

- extend blocked replay output with self-healing proposal
- extend repair preview output with proposal id and confidence
- add report/sidebar summary for self-healing proposal
- add proposal-only patch objects for metadata/cache/runner/confirmation repair
- add harness assertions for proposal quality

## Boundaries

Preserve:

- no automatic repair
- no repair apply
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
- no raw evidence/secrets in proposals or reports

Self-healing proposal is advice and structured metadata only. It is not authority to mutate cache, runner metadata, skill metadata, allowlist, confirmation, or receipts.

## Tasks

### 1. Design

Create docs/design/browser-action-self-healing-proposal.md.

Keep concise.

Include:

- reference scan summary
- self-healing definition
- proposal model
- repair proposal categories
- confidence model
- proposed patch model
- output/report/sidebar integration
- no-apply boundary
- Route 113 recommendation

### 2. Add self-healing proposal model

Add browserSelfHealingProposal.ts.

Expected concepts:

- BrowserSelfHealingProposal
- BrowserSelfHealingProposalId
- BrowserSelfHealingProposalStatus:
  - proposed
  - blocked
  - not-applicable
  - unsafe
- BrowserSelfHealingProposalKind:
  - add-runner-binding
  - add-skill-metadata
  - request-confirmation
  - repair-cache
  - update-allowlist
  - refresh-fixture
  - retry-local-runner
  - reject-unsafe-evidence
  - external-network-blocked
- BrowserSelfHealingConfidence:
  - high
  - medium
  - low
  - blocked
- required user action
- proposed patch reference
- blockers
- warnings
- next action

Add focused tests.

### 3. Add self-healing patch model

Add browserSelfHealingPatch.ts.

Patch model should be proposal-only.

Patch kinds:

- runner binding patch
- skill metadata patch
- confirmation patch
- cache repair patch
- allowlist patch
- fixture refresh patch
- no-op blocked patch

Required behavior:

- no filesystem writes
- no cache writes
- no metadata mutation
- no secrets/raw evidence
- deterministic serialization
- unsafe patch blocked

Add focused tests.

### 4. Add self-healing planner

Add browserSelfHealingPlanner.ts.

Planner should consume:

- replay failure classification
- repair readiness
- repair preview
- cache entry / receipt summary
- sandbox/allowlist/confirmation summaries
- skill metadata / runner binding status if available

Planner should produce BrowserSelfHealingProposal.

Rules:

- missing runner -> add-runner-binding proposal
- missing skill metadata -> add-skill-metadata proposal
- missing confirmation -> request-confirmation proposal
- corrupted cache -> repair-cache proposal
- unsafe evidence -> blocked unsafe proposal
- external network -> blocked external-network proposal
- timeout/malformed local/test -> retry-local-runner or refresh-fixture proposal if safe
- success -> not-applicable

Add focused tests.

### 5. Add self-healing surface

Add browserSelfHealingSurface.ts.

Render concise output:

- Browser self-healing proposal
- Failure
- Proposal
- Confidence
- Required user action
- Proposed patch
- Applied: no
- Executed: no
- Next action

Add focused tests.

### 6. Integrate with replay output

Update replay command / repair surface as needed.

Required behavior:

- blocked replay output can show repair readiness and self-healing proposal
- successful replay does not show noisy proposal
- output remains concise
- no behavior changes to replay execution

Add focused tests.

### 7. Report/sidebar integration

If clean:

- scenario report includes self-healing proposal summary
- sidebar event for blocked replay can include proposal kind/confidence
- no raw evidence

Add focused tests if touched.

### 8. Scenario coverage

Add browserSelfHealingScenarioExamples.test.ts.

Required scenarios:

1. missing runner -> add-runner-binding proposal
2. missing skill metadata -> add-skill-metadata proposal
3. missing confirmation -> request-confirmation proposal
4. corrupted cache -> repair-cache proposal
5. unsafe evidence -> blocked unsafe proposal
6. external URL -> blocked external-network proposal
7. timeout/malformed local/test -> retry-local-runner or refresh-fixture proposal
8. successful replay -> no proposal / not-applicable

### 9. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 112 added browser self-healing proposal
- no repair apply
- no automatic replay
- next route recommendation

Recommended next route:

- Route 113: explicit self-healing apply design
- or Route 113: replay UX/report polish
- or Route 113: external-network browser execution design only after self-healing proposal remains stable

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

- proposal requires actual repair mutation
- proposal requires browser execution
- proposal requires external network
- proposal requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw evidence/secrets would appear
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Self-healing proposal design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

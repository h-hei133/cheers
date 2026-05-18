# Route 113: browser self-healing explicit apply for metadata-safe repairs

## Goal

Add explicit, user-reviewed self-healing apply for metadata-safe browser replay repairs.

Route 111 added replay repair readiness.
Route 112 added proposal-only self-healing proposals and proposal-only patch models.

Route 113 should add an explicit apply layer for safe metadata/cache repairs:

- apply policy
- apply plan
- apply executor
- apply surface
- `/browser repair apply ...` or equivalent command if clean
- harness scenarios for cache repair, confirmation, allowlist, runner binding, and unsafe-blocked cases
- no automatic apply
- no automatic replay
- no browser execution changes
- no external network
- no dynamic discovery

This route should allow a user/harness to apply safe repair metadata deliberately, then leave replay execution as a separate explicit step.

## Docs discipline

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-self-healing-explicit-apply.md
- docs/design/edit-capability-roadmap.md: concise Route 113 note only

Do not append Route 113 notes across browser docs.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-action-self-healing-proposal.md
- docs/design/browser-replay-repair-readiness.md
- docs/design/browser-action-cache-explicit-replay.md
- docs/design/browser-persistent-receipt-cache.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- replay failures are classified
- repair readiness exists
- self-healing proposals exist
- proposal-only patches exist
- proposals are shown in blocked replay output and reports
- no repair apply exists
- no automatic replay exists

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

- Stagehand: at most 9 files
- Playwright MCP: at most 5 files
- OpenHands: at most 4 files
- Inspect AI + mini-swe-agent: at most 5 files total
- opencode/gemini-cli/ClaudeCode combined: at most 4 files
- total default budget: 27 files
- exceed by 2 only for directly relevant repair apply, action cache, metadata patch, replay, or report files

Focus:

Stagehand:

- self-healing apply boundary
- cached action update model
- action repair confirmation
- deterministic repair versus AI-mediated repair
- what should not be auto-applied

Playwright MCP:

- browser tool metadata
- action target evidence
- safe capability changes
- execution boundary after metadata changes

OpenHands:

- user-visible recovery actions
- action/observation repair reporting
- blocked action next-step UX

Inspect AI / mini-swe-agent:

- trajectory repair reports
- reproducible failure repair
- safe applied/not-applied evidence

Answer in docs/design/browser-self-healing-explicit-apply.md:

1. Which self-healing proposals are safe to apply?
2. Which proposals must remain blocked or preview-only?
3. What does apply change, and what does it never change?
4. How should apply output prove no replay/browser execution occurred?
5. What should Route 114 own?

## This route changes

Allowed:

- docs/design/browser-self-healing-explicit-apply.md
- docs/design/edit-capability-roadmap.md, concise Route 113 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserSelfHealingApplyPolicy.ts
- packages/ts-shell/src/core/context/browserSelfHealingApplyPlan.ts
- packages/ts-shell/src/core/context/browserSelfHealingApplyExecutor.ts
- packages/ts-shell/src/core/context/browserSelfHealingApplySurface.ts
- packages/ts-shell/src/core/context/browserSelfHealingCommandContract.ts
- packages/ts-shell/src/core/context/browserSelfHealingCommandRunner.ts
- packages/ts-shell/src/core/harness/browserSelfHealingApplyScenarioExamples.test.ts

Allowed if clean:

- integrate `/browser repair apply <proposal-id>`
- integrate `/browser repair status`
- apply cache repair proposal by invoking existing explicit cache repair/compact path
- apply confirmation proposal only to explicit local/test command context or explicit manifest, not global session state
- apply allowlist proposal only to explicit local/test manifest if safe
- apply runner binding / skill metadata proposal only to explicit local/test manifest if safe
- produce an apply receipt/report
- show apply status in sidebar/report summaries
- require explicit proposal id and explicit cache/manifest context

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
- no raw evidence/secrets in apply plans, apply reports, manifests, or command output

Apply is allowed only for explicit local/test metadata or explicit sanitized cache maintenance. Applied repair is not authority to replay automatically.

## Tasks

### 1. Design

Create docs/design/browser-self-healing-explicit-apply.md.

Keep concise.

Include:

- reference scan summary
- applyable proposal taxonomy
- blocked proposal taxonomy
- apply policy
- apply plan
- apply execution boundary
- cache/manifest mutation policy
- command/report/sidebar surface
- no-auto-replay boundary
- Route 114 recommendation

### 2. Add apply policy

Add browserSelfHealingApplyPolicy.ts.

Classify proposal kinds:

Applyable with explicit local/test context:

- repair-cache
- request-confirmation
- add-runner-binding
- add-skill-metadata
- update-allowlist
- refresh-fixture
- retry-local-runner metadata reset if safe

Blocked:

- reject-unsafe-evidence
- external-network-blocked
- auth/payment/destructive
- arbitrary-js
- missing raw evidence
- dynamic discovery required

Policy statuses:

- apply-allowed
- apply-needs-explicit-context
- apply-needs-user-confirmation
- apply-blocked-unsafe
- apply-blocked-external-network
- apply-blocked-unsupported
- apply-not-applicable

Add focused tests.

### 3. Add apply plan

Add browserSelfHealingApplyPlan.ts.

Plan should include:

- proposal id
- proposal kind
- apply status
- target:
  - cache
  - manifest
  - confirmation
  - allowlist
  - runner-binding
  - skill-metadata
  - fixture
- intended metadata changes
- required explicit context
- required user confirmation
- risks
- blockers
- warnings
- applied: false
- executed browser action: false
- next action

No filesystem writes in plan.

Add focused tests.

### 4. Add apply executor

Add browserSelfHealingApplyExecutor.ts.

Executor should apply only safe, explicit metadata/cache changes.

Allowed operations:

- invoke existing explicit cache repair/compact for repair-cache
- write to explicit local/test manifest only if manifest helper already supports safe writes
- update explicit local/test confirmation state only within command/harness context
- update explicit local/test allowlist only within explicit manifest/context
- update explicit runner binding / skill metadata only in explicit manifest/context
- return blocked if target context is missing or unsafe

Required behavior:

- no browser execution
- no replay execution
- no global state mutation
- no SessionManager mutation
- no default path
- no raw content/secrets
- all mutations produce sanitized apply result

Add focused tests.

If manifest write support is too coupled, implement apply plan + blocked-safe executor for that category and document follow-up. Do not force unsafe writes.

### 5. Add apply surface

Add browserSelfHealingApplySurface.ts.

Render:

- Browser self-healing apply
- Proposal id
- Proposal kind
- Target
- Applied: yes/no
- Browser executed: no
- Replay executed: no
- Metadata/cache changed
- Warnings/blockers
- Next action

Keep concise.

Add focused tests.

### 6. Add command contract/runner

Add:

- browserSelfHealingCommandContract.ts
- browserSelfHealingCommandRunner.ts

Preferred UX:

- `/browser repair status`
- `/browser repair apply <proposal-id>`

Required behavior:

- status explains explicit repair apply is available only for proposal ids in current explicit context
- apply requires explicit proposal id
- apply requires explicit cache/manifest/context as needed
- invalid proposal id is blocked
- output clearly says no browser/replay execution occurred

Add focused tests.

### 7. Integrate with `/browser`

Update browser command runtime if clean.

Required behavior:

- `/browser repair status` routes
- `/browser repair apply <proposal-id>` routes
- existing `/browser replay`, `/browser execute`, preview, dry-run, status remain stable
- no hidden automatic apply

Add focused tests.

### 8. Proposal registry/context

If needed, add a small explicit in-memory proposal registry for command/harness context.

Rules:

- no persistence by default
- no global registry
- only sanitized proposals
- explicit context required
- reports proposal count/status

If current replay output can pass proposal directly in tests, avoid overengineering.

### 9. Report/sidebar integration

If clean:

- scenario report includes apply result summary
- sidebar event can show repair apply status
- no raw evidence

Add focused tests if touched.

### 10. Scenario coverage

Add browserSelfHealingApplyScenarioExamples.test.ts.

Required scenarios:

1. repair-cache proposal applies cache repair/compact with explicit cache context
2. missing runner proposal produces apply plan and blocks without manifest context
3. add-runner-binding applies only to explicit local/test manifest if safe, otherwise blocked with clear next action
4. missing confirmation applies only to explicit local/test confirmation context
5. unsafe evidence proposal is blocked
6. external URL proposal is blocked
7. successful apply output says browser executed: no and replay executed: no
8. after apply, replay still requires explicit `/browser replay ...`

### 11. Roadmap update

Update docs/design/edit-capability-roadmap.md with only 3-6 lines:

- Route 113 added explicit metadata-safe self-healing apply
- no automatic repair/replay
- no browser execution changes
- next route recommendation

Recommended next route:

- Route 114: browser replay UX/report polish
- or Route 114: self-healing apply CLI cross-process harness
- or Route 114: external-network browser execution design only after repair apply remains stable

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

- apply requires browser execution
- apply requires automatic replay
- apply requires external network
- apply requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw evidence/secrets would appear
- global manifest/session mutation becomes necessary
- docs updates spread across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Apply policy/design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

# Route 111: browser replay repair readiness and self-healing preview

## Goal

Add browser replay repair readiness and self-healing preview on top of the existing explicit replay/cache foundation.

Route 107 added explicit replay.
Route 108 added explicit persistent receipt cache.
Route 109 hardened cache persistence.
Route 110 added multi-process cache stress evidence.

Route 111 should add a Stagehand-inspired repair layer, but preview-only:

- classify why a replay cannot run
- identify whether the failure is repairable
- produce a repair preview
- suggest a safe next action
- attach repair readiness to receipt/replay reports
- show repair status in `/browser replay ...` output
- do not auto-repair
- do not auto-replay
- do not execute external network actions
- do not persist repaired actions by default

This route should make replay failures more useful without expanding browser authority.

## Docs discipline

This route must control documentation size.

Allowed docs updates:

- this route file
- one new design doc: docs/design/browser-replay-repair-readiness.md
- edit-capability-roadmap.md: concise 3-6 line Route 111 note only

Do not append Route 111 notes to every browser design doc.

Use the final report for validation, residue, and boundary details.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-action-cache-explicit-replay.md
- docs/design/browser-persistent-receipt-cache.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- explicit replay works for replay-ready local/test receipts
- replay revalidates sandbox, allowlist, confirmation, runtime preflight, and runner binding
- explicit persistent cache supports cross-process replay
- persistent cache has lock, compaction, repair, and multiprocess stress coverage
- replay failures are safe but not very helpful
- no repair/self-healing preview exists

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
- exceed by 2 only for directly relevant action repair, self-healing, replay, receipt, or report files

Focus:

Stagehand:

- action cache
- self-healing boundaries
- action preview
- observe/act/extract repair concepts
- what metadata is needed to repair an action

Playwright MCP:

- action target evidence
- accessibility snapshot evidence
- tool result structure
- replay limitations

OpenHands:

- failed action reporting
- action/observation repair surface
- user-visible next action

Inspect AI / mini-swe-agent:

- trajectory failure classification
- report assertions
- safe reproducibility evidence

Answer in docs/design/browser-replay-repair-readiness.md:

1. What replay failures are repairable?
2. What metadata is needed for repair preview?
3. What should stay blocked until real self-healing exists?
4. How should repair preview appear in command output and reports?
5. What should Route 112 own?

## This route changes

Allowed:

- docs/design/browser-replay-repair-readiness.md
- docs/design/edit-capability-roadmap.md, concise Route 111 note only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserReplayFailureClassifier.ts
- packages/ts-shell/src/core/context/browserReplayRepairReadiness.ts
- packages/ts-shell/src/core/context/browserReplayRepairPreview.ts
- packages/ts-shell/src/core/context/browserReplayRepairSurface.ts
- packages/ts-shell/src/core/harness/browserReplayRepairScenarioExamples.test.ts

Allowed if clean:

- extend replay planner/executor output with repair readiness
- extend `/browser replay <receipt-id>` blocked output with repair preview
- extend `/browser replay status` with repairable blocked count
- add sidebar/report summary for repair readiness
- add harness assertions for repairable vs non-repairable replay failures

## Boundaries

Preserve:

- no automatic repair
- no automatic replay
- no self-healing execution
- no external network
- no dynamic skill discovery
- no MCP launch
- no Playwright dependency
- no provider/model calls
- no package script changes
- no SessionManager schema changes
- no CLI lifecycle rewrite
- no raw evidence/secrets in repair preview or reports

Repair preview is advice and metadata only. It is not authority to execute.

## Tasks

### 1. Design

Create docs/design/browser-replay-repair-readiness.md.

Include:

- reference scan summary
- replay failure taxonomy
- repairable vs non-repairable categories
- repair preview model
- command/report/sidebar surface
- no-auto-repair boundary
- Route 112 recommendation

Keep this doc concise.

### 2. Add replay failure classifier

Add browserReplayFailureClassifier.ts.

Classify failures such as:

- missing cache entry
- invalidated/deleted receipt
- missing runner binding
- missing skill metadata
- sandbox blocked
- allowlist blocked
- confirmation missing
- unsafe evidence
- timeout
- malformed response
- external URL blocked
- unsupported action
- stale fixture
- corrupted cache record

Output:

- failure kind
- severity
- user-visible reason
- developer-only evidence if needed
- next action

Add focused tests.

### 3. Add repair readiness

Add browserReplayRepairReadiness.ts.

Statuses:

- repair-ready-preview
- repair-needs-runner
- repair-needs-metadata
- repair-needs-confirmation
- repair-needs-cache-repair
- repair-needs-allowlist
- repair-blocked-unsafe
- repair-blocked-external-network
- repair-not-applicable

Rules:

- local/test missing runner can be repair-needs-runner
- missing metadata can be repair-needs-metadata
- confirmation missing can be repair-needs-confirmation
- corrupted cache can be repair-needs-cache-repair
- unsafe evidence is blocked
- external network remains blocked
- timeout/malformed can be repair-ready-preview only if original action remains local/test and evidence contract is intact

Add focused tests.

### 4. Add repair preview

Add browserReplayRepairPreview.ts.

Preview should include:

- source receipt/cache entry
- failure kind
- repair readiness
- proposed safe repair step
- required user action
- required runner/metadata/cache condition
- expected evidence after repair
- executed: no
- repair applied: no

Do not include raw evidence.

Add focused tests.

### 5. Add repair surface

Add browserReplayRepairSurface.ts.

Render concise output:

- Browser replay repair preview
- Failure
- Repair readiness
- Suggested action
- Required gate
- Executed: no
- Repair applied: no
- Next action

Add focused tests.

### 6. Integrate with replay command

Update replay command runner/planner only as needed.

Required behavior:

- blocked replay output includes repair readiness when useful
- successful replay output unchanged except optional "Repair needed: no"
- `/browser replay status` may include repairable blocked count if clean
- no execution behavior changes

Add focused tests.

### 7. Harness scenarios

Add browserReplayRepairScenarioExamples.test.ts.

Required scenarios:

1. missing runner binding produces repair-needs-runner
2. missing skill metadata produces repair-needs-metadata
3. confirmation missing produces repair-needs-confirmation
4. corrupted cache record produces repair-needs-cache-repair
5. unsafe evidence produces repair-blocked-unsafe
6. external URL produces repair-blocked-external-network
7. timeout/malformed local/test result produces repair-ready-preview or blocked with clear reason
8. successful replay says repair needed: no or omits repair section

### 8. Sidebar/report integration

If clean:

- report includes repair readiness summary
- sidebar event for replay blocked can include repair readiness
- no raw evidence

Add focused tests if touched.

### 9. Roadmap update

Update edit-capability-roadmap.md only with a concise Route 111 note:

- replay repair readiness added
- no auto-repair
- no external network
- next recommended route

Do not update every browser design doc.

Recommended next route:

- Route 112: browser replay UX/report polish
- or Route 112: browser action self-healing design, still no execution
- or Route 112: external-network browser execution design only after repair preview is stable

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

- repair preview requires actual browser execution
- repair preview requires external network
- repair preview requires dynamic skill discovery
- MCP launch becomes necessary
- provider/model calls become necessary
- raw evidence/secrets would appear
- replay semantics become automatic
- docs updates start spreading across many design docs

## Final report

1. What changed
2. Reference scan summary
3. Repair readiness design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

# Route 110: browser persistent cache multi-process stress and concurrency evidence

## Goal

Add real multi-process stress evidence for the explicit sanitized browser receipt/action cache.

Route 108 introduced explicit persistent receipt/action cache.
Route 109 hardened the cache with lock/lease model, atomic writes, integrity scanning, recovery, compaction, retention, repair, and maintenance commands.

Remaining Route 109 risk:

- locking is covered by deterministic lock-file simulations
- no long-running or real multi-process stress scenario has proven concurrent CLI behavior

Route 110 should add bounded real CLI multi-process stress harness coverage:

- concurrent CLI execute-write scenarios
- concurrent replay/status scenarios
- compact/repair while writes are attempted
- busy/stale lock behavior under real child processes
- cache integrity after concurrent operations
- stress report summaries
- no default persistence
- no external network
- no Playwright dependency
- no dynamic discovery
- no raw evidence persistence

This route should make the explicit persistent cache credible under realistic CLI usage before any external-network browser execution or broader replay UX work.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-persistent-receipt-cache.md
- docs/design/browser-action-cache-explicit-replay.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- explicit persistent cache exists
- cache lock/lease model exists
- atomic temp-file + rename writes exist
- compact/repair commands exist
- corrupted/unsafe records are skipped safely
- cross-process replay works in normal sequential scenarios
- deterministic lock-file simulations exist
- no real multi-process stress harness exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Browser/cache references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- browser-use: /home/wang/projects/browser-use
- Playwright repo: /home/wang/projects/playwright

Budget:

- OpenHands: at most 7 files
- Inspect AI + mini-swe-agent: at most 8 files total
- Stagehand: at most 5 files
- Playwright MCP: at most 4 files
- opencode/gemini-cli/ClaudeCode combined: at most 6 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 30 files
- exceed by 2 only for directly relevant multi-process, cache, lock, stress, trajectory, or report files

Focus:

OpenHands:

- event/log persistence under concurrent activity
- action/observation storage
- process/runtime event reporting
- failure and recovery evidence

Inspect AI:

- parallel eval/log execution
- durable log/report safety
- failure/skipped run reporting
- transcript/evidence aggregation

mini-swe-agent:

- subprocess trajectory handling
- concurrent task safety if present
- command execution evidence
- failure reproduction reports

Stagehand:

- action cache robustness
- cached action boundaries
- replay/cache invalidation
- safe reuse reporting

Playwright MCP:

- browser tool result boundaries
- server/tool state risks
- snapshot/result persistence caution

Coding-agent baselines:

- CLI spawn tests
- process timeout handling
- command history/log safety
- lock/atomic write patterns
- cache cleanup

Answer in docs/design/browser-cache-multiprocess-stress.md:

1. What multi-process cache behaviors must be proven before broader browser execution?
2. Which scenarios should be real child-process stress versus deterministic unit tests?
3. How should lock contention, stale locks, and write failures be reported?
4. What integrity guarantees should be asserted after stress runs?
5. What remains out of scope until external-network browser execution?
6. What should Route 111 own?

## This route changes

Allowed:

- docs/design/browser-cache-multiprocess-stress.md
- docs/design/browser-persistent-cache-hardening.md, Route 110 note only
- docs/design/browser-persistent-receipt-cache.md, Route 110 note only
- docs/design/browser-action-cache-explicit-replay.md, Route 110 note only
- docs/design/browser-execution-evidence-replay-readiness.md, Route 110 note only
- docs/design/skill-managed-browser-runner-execution-bridge.md, Route 110 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 110 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 110 note only
- docs/design/real-cli-scenario-harness.md, Route 110 note only
- docs/design/agent-scenario-harness-foundation.md, Route 110 note only
- docs/design/sidebar-live-event-capture.md, Route 110 note only
- docs/design/context-engineering-continuity-baseline.md, Route 110 note only
- docs/design/edit-capability-roadmap.md, concise Route 110 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/harness/browserCacheMultiprocessScenarioModel.ts
- packages/ts-shell/src/core/harness/browserCacheMultiprocessRunner.ts
- packages/ts-shell/src/core/harness/browserCacheMultiprocessReport.ts
- packages/ts-shell/src/core/harness/browserCacheMultiprocessFixtures.ts
- packages/ts-shell/src/core/harness/browserCacheMultiprocessScenarioExamples.test.ts

Allowed if clean:

- add test-only helper runner scripts under temp dirs
- spawn bounded CLI child processes through existing real CLI harness
- run concurrent execute-write commands against same explicit cache root
- run status/replay while writes are in progress
- run compact/repair while lock is busy
- simulate stale lock and then run real CLI maintenance command
- assert final cache integrity through cache store/health APIs
- add stress report renderer
- add no new package scripts

## This route must preserve

Route-specific boundaries:

- no default cache persistence
- no automatic replay
- no raw evidence persistence
- no external network
- no dynamic skill discovery
- no MCP server launch
- no Playwright dependency
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
- no raw page content, raw HTML, raw runner stdout/stderr, screenshots, secrets, credentials, or hidden reasoning in stress reports, cache files, command output, or sidebar events
- stress tests must be bounded and deterministic enough for focused validation
- stress tests must not hang or become flaky

## Tasks

### 1. Design and audit

Create docs/design/browser-cache-multiprocess-stress.md.

Include:

- Route 110 reference scan summary
- Route 109 cache hardening baseline
- multi-process stress goals
- child-process scenario model
- concurrency budget
- timeout policy
- lock contention model
- stale lock model
- integrity assertions
- report model
- no-default-persistence boundary
- Route 111 recommendation

### 2. Add multi-process scenario model

Add packages/ts-shell/src/core/harness/browserCacheMultiprocessScenarioModel.ts.

Expected concepts:

- BrowserCacheMultiprocessScenario
- BrowserCacheProcessStep
- BrowserCacheProcessRole:
  - writer
  - replayer
  - status-reader
  - compactor
  - repairer
  - lock-holder
- BrowserCacheProcessResult
- BrowserCacheStressResult
- BrowserCacheStressStatus:
  - passed
  - failed
  - blocked
  - skipped
- process timing metadata
- cache integrity summary
- lock summary
- assertion summary

Required behavior:

- pure types/helpers
- deterministic ids/timestamps where helpers exist
- no process spawn in model file

Add focused tests if helper logic exists.

### 3. Add multi-process fixtures

Add packages/ts-shell/src/core/harness/browserCacheMultiprocessFixtures.ts.

Fixtures should create:

- temp cache root
- cache manifest
- external runner manifest
- skill-managed runner manifest if useful
- test-local runner script
- slow runner script for lock contention
- malformed/unsafe runner scripts if needed
- stale lock fixture
- busy lock fixture
- env for CLI child processes
- cleanup helper

Required behavior:

- temp dirs only
- no external network
- no secrets
- deterministic outputs
- runner scripts bounded by timeout
- cleanup after tests

Add focused tests if helper logic exists.

### 4. Add multi-process runner

Add packages/ts-shell/src/core/harness/browserCacheMultiprocessRunner.ts.

Runner should:

- use existing agentCliProcess / real CLI harness where possible
- launch bounded child processes
- support concurrent groups
- enforce per-process timeout
- collect stdout/stderr/exit/timing
- collect cache integrity after run
- collect lock status after run
- stop/cleanup on timeout
- return structured BrowserCacheStressResult

Required behavior:

- no provider/model calls
- no browser/MCP/network side effects
- no default cache
- no raw stdout/stderr in report beyond safe summaries
- deterministic enough for focused tests

Add focused tests with small bounded process count.

### 5. Add stress report

Add packages/ts-shell/src/core/harness/browserCacheMultiprocessReport.ts.

Report should include:

- scenario id/name
- process count
- process roles
- exit statuses
- timeout summary
- lock summary
- integrity summary
- records written
- records skipped
- replay status
- compact/repair summary
- safety summary
- next action
- redactions

Keep concise and deterministic.

Add focused tests.

### 6. Scenario: concurrent execute writes

Add real CLI scenario coverage:

- create explicit cache manifest
- create valid test-local external runner manifest
- launch 2-4 `/browser execute observe local-fixture://demo-N` processes against same cache
- assert no raw/secrets
- assert cache health healthy or warning only with expected lock contention
- assert valid replay-ready records written
- assert no corrupt JSONL lines

If true concurrency is flaky, use staggered starts with deterministic delays and document.

### 7. Scenario: replay/status while writing

Add real CLI scenario coverage:

- one slow execute-write process
- concurrently run `/browser replay cache status`
- optionally run `/browser replay <known-existing-receipt>`
- assert status does not leak raw content
- assert busy lock or partial write handled safely
- assert final integrity is healthy/warning, not unsafe/corrupted

### 8. Scenario: compact while busy

Add real CLI scenario coverage:

- hold or simulate active lock
- run `/browser replay cache compact`
- assert compact blocks or reports busy safely
- release/expire lock
- compact succeeds
- tombstones remain authoritative

### 9. Scenario: stale lock recovery

Add real CLI scenario coverage:

- create stale lock
- run cache status / compact / repair
- assert stale lock detected
- assert stale lock can be recovered or safely reported according to policy
- assert no partial writes

### 10. Scenario: repair after partial/corrupt file

Add real CLI scenario coverage:

- create cache with valid record + corrupt line + unsafe line
- run `/browser replay cache repair`
- assert corrupt/unsafe skipped by count
- assert valid records preserved
- assert no raw corrupt line leak
- assert replay of valid record still works if clean

### 11. Cache integrity assertions

Add reusable helper assertions in harness if clean:

- cache has no raw secret markers
- cache has no raw HTML/page content
- cache has valid JSONL after compaction/repair
- deleted tombstones not resurrected
- invalidated records not replayable
- active replay-ready count expected
- corrupted skipped count expected
- lock state cleared or safely stale
- no process timeout unexpected

### 12. Sidebar and report integration

Update sidebar event adapter / CLI report only if needed.

Required behavior:

- cache stress/maintenance command output can be summarized safely
- reports include lock/integrity counts
- no raw lines/output
- no cross-process sidebar persistence assumption

Add focused tests if touched.

### 13. Tests

Required focused tests:

- multiprocess model/report helpers
- fixtures create safe temp manifests/runners
- runner handles concurrent successful processes
- runner handles timeout cleanup
- concurrent execute-write scenario passes
- status while writing scenario passes or documents deterministic limitation
- compact busy lock scenario passes
- stale lock recovery scenario passes
- repair corrupt/unsafe scenario passes
- final cache integrity assertions pass
- existing Route 108/109 execute/replay tests still pass
- no package/provider/model/network/MCP side effects

### 14. Docs and roadmap update

Update:

- docs/design/browser-cache-multiprocess-stress.md with final notes
- docs/design/browser-persistent-cache-hardening.md with Route 110 note
- docs/design/browser-persistent-receipt-cache.md with Route 110 note
- docs/design/browser-action-cache-explicit-replay.md with Route 110 note
- docs/design/browser-execution-evidence-replay-readiness.md with Route 110 note
- docs/design/skill-managed-browser-runner-execution-bridge.md with Route 110 note
- docs/design/browser-external-runner-skill-bridge.md with Route 110 note
- docs/design/browser-sandbox-network-allowlist.md with Route 110 note
- docs/design/real-cli-scenario-harness.md with Route 110 note
- docs/design/agent-scenario-harness-foundation.md with Route 110 note
- docs/design/sidebar-live-event-capture.md with Route 110 note
- docs/design/context-engineering-continuity-baseline.md with Route 110 note
- docs/design/edit-capability-roadmap.md with concise status and Route 111 recommendation

Recommended next route:

- Route 111: browser replay UX/report polish
  - if cache stress passes and output needs product polish
- or Route 111: browser action self-healing design
  - if replay/cache is stable and Stagehand-like repair should come next
- or Route 111: external-network browser execution design
  - only if local persistent replay and multiprocess cache are stable
- or Route 111: cache concurrency deeper stress
  - if Route 110 reveals real multi-process instability

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- real CLI multi-process scenario tests added by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.
Do not add package scripts.

If real multi-process stress is flaky, reduce process count, use deterministic delays/locks, and document remaining stress-test limitations rather than weakening cache safety.

## Stop conditions

Stop and report if:

- multi-process tests become flaky or hang-prone
- cache hardening requires SessionManager schema changes
- cache hardening requires broad CLI lifecycle rewrite
- cache hardening requires raw evidence persistence
- lock semantics are unsafe under child processes
- compaction could resurrect deleted/invalidated records
- replay would bypass sandbox/allowlist/confirmation revalidation
- automatic replay becomes necessary
- external network becomes necessary
- dynamic skill discovery becomes necessary
- MCP server launch becomes necessary
- Playwright package dependency becomes necessary
- provider/model calls become necessary

## Final report

1. What changed
2. Reference scan summary
3. Multi-process stress design
4. Scenario coverage
5. Lock/integrity/compaction evidence
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

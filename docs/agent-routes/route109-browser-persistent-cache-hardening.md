# Route 109: browser persistent cache hardening, compaction, and recovery

## Goal

Harden the explicit sanitized browser receipt/action cache introduced by Route 108.

Route 108 added:

- explicit persistent browser receipt/action cache
- sanitized JSONL records
- explicit cache manifest/root
- execute writes replay-ready receipts when explicit cache context exists
- replay can read persistent records across CLI processes
- cache status/invalidate/delete UX
- cross-process CLI replay scenarios

Route 108 risk:

- persistent cache is prototype-grade JSONL
- future hardening should cover locking, compaction, corruption recovery, and concurrent CLI safety

Route 109 should harden that cache layer:

- atomic write discipline
- lock/lease model or safe single-writer guard
- corruption detection and recovery
- compaction of tombstones/deleted records
- retention and budget enforcement
- cache integrity summary
- repaired/skipped record reporting
- CLI scenario coverage for corrupted, partial, concurrent-ish, compacted, invalidated, deleted, and over-budget caches
- no automatic replay
- no raw evidence persistence
- no browser capability expansion

This route should make persistent cache safe enough to remain as a foundation for future browser replay, action cache, and skill-managed runner routes.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
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

- explicit sanitized persistent cache exists
- no default cache path exists
- JSONL store supports write/get/list/invalidate/delete
- deleted records rewrite active content and append sanitized tombstone
- replay still revalidates sandbox/allowlist/confirmation/preflight
- corrupted/unsafe records can be skipped/rejected
- cache locking/atomicity/compaction are not yet hardened

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- OpenHands: /home/wang/projects/OpenHands
- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent
- Stagehand: /home/wang/projects/stagehand

Browser/tooling reference:

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
- Stagehand: at most 6 files
- Playwright MCP: at most 4 files
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 30 files
- exceed by 2 only for directly relevant log/cache/trajectory/compaction/recovery files

Focus:

OpenHands:

- event/log persistence
- action/observation storage
- corruption/failure handling
- session activity records
- compact report surfaces

Inspect AI:

- eval log format
- transcript persistence
- resumable/reproducible logs
- report redaction
- failed/corrupted record handling if present

mini-swe-agent:

- trajectory persistence
- command evidence records
- simple durable report format
- failure reproduction files

Stagehand:

- action cache safety
- cache invalidation
- replay/cache boundaries
- what is safe to store

Playwright MCP:

- browser evidence boundary
- tool output summaries
- snapshot/result persistence risks

Coding-agent baselines:

- session logs
- command history
- cache cleanup
- file locking or atomic write patterns
- corruption recovery

Answer in docs/design/browser-persistent-cache-hardening.md:

1. What are the minimum hardening requirements for explicit browser receipt cache?
2. What atomic write / lock / lease model should be used?
3. How should corrupt, partial, unsafe, or duplicate records be handled?
4. How should compaction preserve tombstone semantics without raw evidence?
5. What retention/budget rules should be enforced?
6. What should Route 110 own?

## This route changes

Allowed:

- docs/design/browser-persistent-cache-hardening.md
- docs/design/browser-persistent-receipt-cache.md, Route 109 note only
- docs/design/browser-action-cache-explicit-replay.md, Route 109 note only
- docs/design/browser-execution-evidence-replay-readiness.md, Route 109 note only
- docs/design/skill-managed-browser-runner-execution-bridge.md, Route 109 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 109 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 109 note only
- docs/design/real-cli-scenario-harness.md, Route 109 note only
- docs/design/agent-scenario-harness-foundation.md, Route 109 note only
- docs/design/sidebar-live-event-capture.md, Route 109 note only
- docs/design/context-engineering-continuity-baseline.md, Route 109 note only
- docs/design/edit-capability-roadmap.md, concise Route 109 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserReceiptCacheLock.ts
- packages/ts-shell/src/core/context/browserReceiptCacheCompaction.ts
- packages/ts-shell/src/core/context/browserReceiptCacheRecovery.ts
- packages/ts-shell/src/core/context/browserReceiptCacheIntegrity.ts
- packages/ts-shell/src/core/context/browserReceiptCacheRetention.ts
- packages/ts-shell/src/core/harness/browserPersistentCacheHardeningScenarioExamples.test.ts

Allowed if clean:

- update browserReceiptCacheStore.ts to use atomic write helpers
- add lock/lease support using explicit cache root
- add compaction command/API
- add repair/recover read path that skips corrupt records safely
- add cache status fields for lock/compaction/recovery/integrity
- add `/browser replay cache compact` if UX remains simple
- add `/browser replay cache repair` only if safe and clear
- add CLI scenarios for cache hardening

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
- no raw page content, raw HTML, raw runner stdout/stderr, screenshots, secrets, credentials, or hidden reasoning in cache, recovery reports, compaction reports, command output, sidebar events, or scenario reports
- cache hardening must not bypass sandbox/allowlist/confirmation revalidation

## Tasks

### 1. Design and audit

Create docs/design/browser-persistent-cache-hardening.md.

Include:

- Route 109 reference scan summary
- Route 108 cache baseline
- hardening requirements
- atomic write model
- lock/lease model
- corruption recovery model
- compaction model
- retention/budget model
- integrity reporting model
- CLI scenario strategy
- no-default-persistence boundary
- Route 110 recommendation

### 2. Add cache lock/lease model

Add packages/ts-shell/src/core/context/browserReceiptCacheLock.ts.

Expected concepts:

- BrowserReceiptCacheLock
- lock id
- owner id
- createdAt
- expiresAt
- operation:
  - write
  - compact
  - repair
  - delete
  - invalidate
- status:
  - acquired
  - busy
  - expired
  - invalid
  - released
- BrowserReceiptCacheLockDecision

Required behavior:

- explicit cache root/path required
- deterministic lock ids/timestamps in tests
- stale lock detection
- release semantics
- no global lock path
- no process-wide singleton
- safe error messages
- no raw path leaks if paths are sensitive

Add focused tests.

### 3. Add atomic write discipline

Update browserReceiptCacheStore.ts or add helper in lock module.

Required behavior:

- write via temp file + rename where applicable
- append/write operations must not leave partially serialized active records in normal flow
- failure during write returns warning/blocker without claiming success
- delete/invalidate operations preserve sanitized tombstone semantics
- no raw evidence introduced during rewrite
- old behavior remains compatible with existing records

Add focused tests with temp dirs.

### 4. Add cache integrity scanner

Add packages/ts-shell/src/core/context/browserReceiptCacheIntegrity.ts.

Scanner should classify:

- valid records
- invalid JSON lines
- unsafe records
- duplicate active records
- tombstone records
- deleted records
- invalidated records
- stale replay readiness
- over-budget records
- unknown version records
- redaction violations

Output:

- integrityStatus:
  - healthy
  - warning
  - corrupted
  - unsafe
  - empty
- counts
- skipped records
- blockers
- warnings
- next action

Required behavior:

- no raw corrupted line in output
- no raw secrets
- deterministic
- safe for CLI status/report

Add focused tests.

### 5. Add cache recovery reader

Add packages/ts-shell/src/core/context/browserReceiptCacheRecovery.ts.

Recovery should:

- read cache file
- skip corrupt/unsafe records
- preserve valid active records
- preserve tombstones
- report skipped/corrupt/unsafe counts
- optionally produce repair plan without writing by default
- never surface raw corrupt lines
- never recover raw unsafe evidence

Add focused tests.

### 6. Add compaction model

Add packages/ts-shell/src/core/context/browserReceiptCacheCompaction.ts.

Compaction should:

- take valid recovered records
- keep latest active record per receipt id
- keep sanitized tombstones needed to prevent deleted replay
- remove superseded/duplicate records
- remove unsafe/corrupt records
- preserve invalidation/delete semantics
- produce compaction report
- write compacted store only through explicit compact operation/lock

Output:

- compacted yes/no
- records before/after
- tombstones kept
- records removed
- warnings/blockers
- next action

Add focused tests.

### 7. Add retention/budget policy

Add packages/ts-shell/src/core/context/browserReceiptCacheRetention.ts.

Policy should enforce:

- max records
- max file size if easy
- max age if timestamp available
- keep replay-ready active records first
- keep tombstones needed for delete/invalidate safety
- drop oldest non-replayable inactive records
- never drop required tombstone if it would resurrect deleted record
- no raw content

Add focused tests.

### 8. Integrate health/status/surface

Update browserReceiptCacheHealth.ts and browserReceiptCacheSurface.ts.

Required behavior:

- status shows lock/integrity/compaction/retention summaries
- status says raw evidence stored: no
- status says persistence: explicit only
- corrupted/unsafe records are reported as counts, not raw lines
- next action suggests compact/repair/delete/invalidate where appropriate
- output remains concise

Add focused tests.

### 9. Integrate commands

Update browser replay cache command runner if clean.

Preferred UX:

- `/browser replay cache status`
- `/browser replay cache compact`
- `/browser replay cache repair`
- `/browser replay cache invalidate <receipt-id>`
- `/browser replay cache delete <receipt-id>`

Only add compact/repair if UX remains clear.

Required behavior:

- explicit cache context required
- compact/repair use lock
- compact/repair never write raw evidence
- invalid cache manifest blocks safely
- no default path
- no automatic replay

Add focused tests.

### 10. Harness fixtures

Add or update harness fixtures for hardening scenarios.

Add packages/ts-shell/src/core/harness/browserPersistentCacheHardeningScenarioExamples.test.ts.

Fixtures should create:

- healthy cache
- partial/corrupt JSONL line
- unsafe record
- duplicate records
- invalidated/deleted tombstones
- over-budget cache
- stale lock
- busy lock
- compaction candidate
- repair candidate

Required behavior:

- temp dirs only
- cleanup temp files
- no raw secrets in expected outputs
- deterministic timestamps

### 11. Scenario examples

Required scenarios:

1. corrupted cache status

- create corrupt JSONL line
- `/browser replay cache status`
- reports corrupted/skipped count
- no raw line leak

2. unsafe record rejected

- create unsafe record with secret/raw marker
- status reports unsafe/skipped
- replay does not use it

3. compact removes duplicates and preserves tombstones

- create duplicate active records and delete tombstone
- compact
- list/status verifies semantics

4. invalidated/deleted still not replayable after compact

- replay blocked after compaction

5. lock busy blocks write/compact safely

- simulate active lock
- compact/write blocked or warning
- no partial write

6. stale lock can be recovered or reported

- stale lock handling deterministic

7. execute-write still works with healthy cache

- existing Route 108 behavior preserved

8. cross-process replay still works after compaction

- if CLI scenario remains clean

### 12. Sidebar and report integration

Update sidebar event adapter and CLI scenario report if clean.

Required behavior:

- cache status/compact/repair events appear as safe browser cache events
- reports include integrity status and compaction summary
- no raw corrupt/unsafe record content
- no cross-process sidebar persistence assumption

Add focused tests.

### 13. Tests

Required focused tests:

- lock acquire/release/stale/busy behavior
- atomic write success/failure behavior
- integrity scanner handles healthy/corrupt/unsafe/duplicate/tombstone records
- recovery reader skips unsafe/corrupt records safely
- compaction preserves tombstone semantics
- retention does not resurrect deleted records
- cache status surface is concise and redacted
- cache compact command works with explicit context
- cache repair command works or is documented/deferred
- replay refuses invalidated/deleted/unsafe records after compaction
- existing execute-write and replay tests still pass
- no package/provider/model/network/MCP side effects

### 14. Docs and roadmap update

Update:

- docs/design/browser-persistent-cache-hardening.md with final notes
- docs/design/browser-persistent-receipt-cache.md with Route 109 note
- docs/design/browser-action-cache-explicit-replay.md with Route 109 note
- docs/design/browser-execution-evidence-replay-readiness.md with Route 109 note
- docs/design/skill-managed-browser-runner-execution-bridge.md with Route 109 note
- docs/design/browser-external-runner-skill-bridge.md with Route 109 note
- docs/design/browser-sandbox-network-allowlist.md with Route 109 note
- docs/design/real-cli-scenario-harness.md with Route 109 note
- docs/design/agent-scenario-harness-foundation.md with Route 109 note
- docs/design/sidebar-live-event-capture.md with Route 109 note
- docs/design/context-engineering-continuity-baseline.md with Route 109 note
- docs/design/edit-capability-roadmap.md with concise status and Route 110 recommendation

Recommended next route:

- Route 110: browser replay UX/report polish
  - if cache hardening works and output needs product polish
- or Route 110: browser action self-healing design
  - if cache/replay is stable and Stagehand-like repair should come next
- or Route 110: external-network browser execution design
  - only if local persistent replay is stable
- or Route 110: persistent cache concurrency hardening
  - if locking reveals deeper multi-process issues

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

If cache locking/concurrency scenarios are flaky, reduce to deterministic lock-file simulations and document real multi-process stress testing as future work.

## Stop conditions

Stop and report if:

- cache hardening requires SessionManager schema changes
- cache hardening requires broad CLI lifecycle rewrite
- cache hardening requires raw evidence persistence
- lock semantics become flaky or non-deterministic
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
3. Cache hardening design
4. Lock/compaction/recovery behavior
5. Scenario coverage
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

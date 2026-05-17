# Route 108: browser persistent receipt cache and cross-process replay readiness

## Goal

Add an explicit, sanitized, local persistent browser receipt/action cache prototype.

Route 104 added browser execution receipts and replay readiness.
Route 106 added skill-managed local/test execution.
Route 107 added in-memory receipt-backed action cache and explicit replay.

Route 107 limitation:

- action cache is same-process only
- real CLI execute-then-replay cannot cross child-process boundaries without a persistent cache

Route 108 should add a safe persistence decision and prototype:

- explicit local cache store
- sanitized receipt/cache-entry persistence
- cache list/get/delete/invalidate
- cache health/status
- CLI harness env/manifest support
- `/browser replay status` can show explicit persistent cache status if provided
- `/browser replay <receipt-id>` can use explicit persistent cache if provided
- real CLI scenarios prove execute in one process and replay/status in another process where clean
- no automatic replay
- no default persistence
- no raw evidence persistence

This route should make cross-process replay possible only through explicit local/test cache configuration.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/browser-action-cache-explicit-replay.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- in-memory browser action cache exists
- explicit replay command exists
- replay creates linked receipts
- replay revalidates sandbox/allowlist/confirmation/runtime preflight
- external runner and skill-managed local/test execution work
- CLI cross-process replay is not supported
- no persistent browser action cache exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Stagehand: /home/wang/projects/stagehand
- OpenHands: /home/wang/projects/OpenHands
- Inspect AI: /home/wang/projects/inspect_ai
- mini-swe-agent: /home/wang/projects/mini-swe-agent

Browser/tooling references:

- Playwright MCP: /home/wang/projects/playwright-mcp

Secondary coding-agent references:

- opencode: /home/wang/projects/opencode
- gemini-cli: /home/wang/projects/gemini-cli
- ClaudeCode: /home/wang/projects/source-claudecode

Optional only if present:

- browser-use: /home/wang/projects/browser-use
- Playwright repo: /home/wang/projects/playwright

Budget:

- Stagehand: at most 7 files
- OpenHands: at most 6 files
- Inspect AI + mini-swe-agent: at most 8 files total
- Playwright MCP: at most 4 files
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 30 files
- exceed by 2 only for directly relevant cache, persistence, trajectory, log, receipt, or replay files

Focus:

Stagehand:

- action cache
- cached action metadata
- replay/reuse boundaries
- self-healing boundary
- what is safe to cache

OpenHands:

- action/observation persistence
- event/log storage
- UI/session activity records
- safe evidence summaries

Inspect AI:

- eval log persistence
- transcript/evidence separation
- report redaction
- reproducibility metadata

mini-swe-agent:

- trajectory file/report format
- command evidence persistence
- failure reproduction
- minimal durable run records

Playwright MCP:

- browser evidence summaries
- snapshot/tool result persistence boundaries
- server state risks

Coding-agent baselines:

- session logs
- command history
- replay/continue boundaries
- cache/persistence safety

Answer in docs/design/browser-persistent-receipt-cache.md:

1. What should be persisted from a browser execution receipt?
2. What must never be persisted?
3. How should persistent cache be scoped: project, manifest, session, or harness?
4. How should invalidation/delete/cleanup work?
5. How should CLI cross-process replay use the cache safely?
6. What should Route 109 own?

## This route changes

Allowed:

- docs/design/browser-persistent-receipt-cache.md
- docs/design/browser-action-cache-explicit-replay.md, Route 108 note only
- docs/design/browser-execution-evidence-replay-readiness.md, Route 108 note only
- docs/design/skill-managed-browser-runner-execution-bridge.md, Route 108 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 108 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 108 note only
- docs/design/real-cli-scenario-harness.md, Route 108 note only
- docs/design/agent-scenario-harness-foundation.md, Route 108 note only
- docs/design/sidebar-live-event-capture.md, Route 108 note only
- docs/design/context-engineering-continuity-baseline.md, Route 108 note only
- docs/design/edit-capability-roadmap.md, concise Route 108 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserPersistentReceiptCache.ts
- packages/ts-shell/src/core/context/browserReceiptCacheStore.ts
- packages/ts-shell/src/core/context/browserReceiptCacheManifest.ts
- packages/ts-shell/src/core/context/browserReceiptCacheHealth.ts
- packages/ts-shell/src/core/context/browserReceiptCacheSurface.ts
- packages/ts-shell/src/core/harness/browserPersistentReplayScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserPersistentReplayScenarioExamples.test.ts

Allowed if clean:

- explicit env pointer for browser receipt cache root / manifest
- JSONL or JSON store for sanitized cache entries only
- cache list/get/write/delete/invalidate
- replay command reads persistent cache only when explicit cache context exists
- execute command writes replay-ready receipts only when explicit cache context exists
- CLI scenario executes in one process and replays in another process using explicit cache root
- cache health/status shown in `/browser replay status`

## This route must preserve

Route-specific boundaries:

- no default cache persistence
- no automatic replay
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
- no raw page content, raw HTML, raw runner stdout/stderr, screenshots, secrets, credentials, or hidden reasoning in persistent cache
- persistent cache is explicit, local/test scoped, discardable, and auditable

## Tasks

### 1. Design and audit

Create docs/design/browser-persistent-receipt-cache.md.

Include:

- Route 108 reference scan summary
- Route 107 in-memory cache baseline
- persistence decision
- cache scope decision
- cache record schema
- cache manifest model
- safety/redaction policy
- invalidation/delete/cleanup policy
- CLI cross-process replay model
- no-default-persistence boundary
- Route 109 recommendation

### 2. Add persistent receipt cache record/store

Add packages/ts-shell/src/core/context/browserPersistentReceiptCache.ts.

Expected concepts:

- BrowserPersistentReceiptCacheRecord
- cacheRecordVersion
- cacheEntry
- sanitized receipt summary
- sanitized evidence bundle summary
- replay readiness snapshot
- source:
  - cli-harness
  - explicit-local
  - test-only
- status:
  - active
  - invalidated
  - deleted
- createdAt
- invalidatedAt
- deletedAt
- redactions
- warnings

Required behavior:

- create records only from sanitized BrowserActionCacheEntry / BrowserExecutionReceipt
- reject raw evidence/secrets
- deterministic serialization
- no file IO in model file

Add focused tests.

### 3. Add receipt cache store

Add packages/ts-shell/src/core/context/browserReceiptCacheStore.ts.

Store should support:

- write record
- get by receipt id
- list records
- invalidate record
- delete record
- purge deleted if clean
- health/read check
- output budget

Store policy:

- explicit root/path required
- no default global path
- JSONL or JSON acceptable
- writes are local only
- delete removes active record content or marks tombstone without raw evidence
- invalidated records are not replayable
- deleted records are not replayable
- corrupted records fail safely

Add focused tests using temp dir.

### 4. Add receipt cache manifest

Add packages/ts-shell/src/core/context/browserReceiptCacheManifest.ts.

Manifest should represent explicit cache configuration.

Expected fields:

- manifest version
- cache root/path
- source:
  - cli-harness
  - explicit-local
  - test-only
- allowed operations:
  - read
  - write
  - invalidate
  - delete
- scope:
  - project
  - session
  - harness
- max records
- redaction policy
- cleanup policy
- warnings

Required behavior:

- validate manifest
- reject global/default paths
- reject unsafe path traversal
- reject missing budget
- reject raw secrets
- deterministic serialization

Add focused tests.

### 5. Add cache health and surface

Add:

- packages/ts-shell/src/core/context/browserReceiptCacheHealth.ts
- packages/ts-shell/src/core/context/browserReceiptCacheSurface.ts

Health should report:

- configured / missing / invalid
- readable / writable
- record count
- invalidated/deleted count
- corrupted/skipped count
- replayable count
- last update if available
- warnings/blockers

Surface should render:

- Browser receipt cache
- Status
- Scope
- Records
- Replayable records
- Invalidated/deleted records
- Next action
- Persistence: explicit only
- Raw evidence stored: no

Add focused tests.

### 6. Integrate cache manifest into CLI bridge

Update CLI/browser manifest handling as clean.

Required behavior:

- explicit env pointer can provide receipt cache manifest or cache root
- no env means no persistent cache
- invalid cache manifest blocks cache use but not unrelated command execution unless cache is required
- report safe blocker/warning
- no raw manifest content in output
- existing external runner and skill-managed manifests remain working

Add focused tests.

### 7. Integrate with `/browser execute`

When explicit persistent cache context exists:

- write replay-ready execution receipts to persistent cache
- do not write non-replay-ready receipts by default unless route documents storing blocked receipts as inactive
- never write unsafe evidence
- failed cache write should not claim execution failed, but must surface cache warning
- output should show cache write status

Required behavior:

- no explicit cache means no persistence
- in-memory cache behavior remains working
- raw evidence not persisted

Add focused tests.

### 8. Integrate with `/browser replay`

Update replay command runner.

Required behavior:

- `/browser replay status` shows in-memory cache and persistent cache status if configured
- `/browser replay <receipt-id>` can read from persistent cache if explicit cache context exists
- replay still revalidates current sandbox/allowlist/confirmation/runner binding
- invalidated/deleted cache records are blocked
- persistent record does not bypass policy
- replay creates new receipt and may write it to persistent cache if explicit write allowed

Add focused tests.

### 9. Add cache management command if clean

Optional command forms:

- `/browser replay cache`
- `/browser replay cache status`
- `/browser replay cache delete <receipt-id>`
- `/browser replay cache invalidate <receipt-id>`

Only add if UX stays simple. Otherwise expose through runner APIs/tests and document future UX.

Required behavior if added:

- explicit cache context required
- delete/invalidate only sanitized records
- no broad purge unless explicit
- no raw evidence output

Add focused tests if added.

### 10. Harness fixtures

Add packages/ts-shell/src/core/harness/browserPersistentReplayScenarioFixtures.ts.

Fixtures should:

- create temp cache root
- create valid cache manifest
- set env for CLI scenario
- combine with external runner / skill-managed runner manifests
- inspect persisted sanitized records
- assert no raw/secrets in cache file
- cleanup temp files

Add focused tests if helper logic exists.

### 11. Scenario examples

Add packages/ts-shell/src/core/harness/browserPersistentReplayScenarioExamples.test.ts.

Required scenarios:

1. CLI execute writes persistent replay-ready receipt

- valid external runner manifest
- valid persistent cache manifest
- run `/browser execute observe local-fixture://demo`
- assert Executed: yes
- assert cache record written
- assert no raw/secrets in cache file

2. CLI replay from persistent cache in separate process

- use same cache manifest
- run `/browser replay <receipt-id>`
- assert replay runs or produces allowed replay result
- assert new linked receipt generated
- assert no raw/secrets

3. invalidated persistent receipt cannot replay

- invalidate cache record
- replay blocked
- replay-blocked reason shown

4. deleted persistent receipt cannot replay

- delete cache record
- replay not found / deleted
- no raw evidence remains

5. no cache configured

- execute/replay works as before with no persistence claim

6. unsafe cache record rejected

- manually create unsafe/corrupted cache record
- status reports skipped/blocked
- no raw leak

If cross-process replay still requires command context not available via CLI, document precisely and keep store/replay runner tests passing.

### 12. Sidebar and report integration

Update sidebar event adapter and CLI scenario report if clean.

Required behavior:

- execution event includes cache write status if configured
- replay event includes source persistent cache record if used
- report includes cache status, record id, replay status
- no raw cache content in report
- no cross-process sidebar persistence assumption

Add focused tests.

### 13. Tests

Required focused tests:

- cache record derives only from sanitized receipt
- unsafe evidence rejected before persistence
- store write/get/list/delete/invalidate works
- manifest rejects unsafe/default/global paths
- cache health reports configured/missing/corrupted
- execute writes cache only with explicit context
- replay reads cache only with explicit context
- invalidated/deleted records not replayable
- persistent replay still revalidates gates
- CLI execute then separate CLI replay works if clean
- cache files contain no raw/secrets
- no package/provider/model/network/MCP side effects

### 14. Docs and roadmap update

Update:

- docs/design/browser-persistent-receipt-cache.md with final notes
- docs/design/browser-action-cache-explicit-replay.md with Route 108 note
- docs/design/browser-execution-evidence-replay-readiness.md with Route 108 note
- docs/design/skill-managed-browser-runner-execution-bridge.md with Route 108 note
- docs/design/browser-external-runner-skill-bridge.md with Route 108 note
- docs/design/browser-sandbox-network-allowlist.md with Route 108 note
- docs/design/real-cli-scenario-harness.md with Route 108 note
- docs/design/agent-scenario-harness-foundation.md with Route 108 note
- docs/design/sidebar-live-event-capture.md with Route 108 note
- docs/design/context-engineering-continuity-baseline.md with Route 108 note
- docs/design/edit-capability-roadmap.md with concise status and Route 109 recommendation

Recommended next route:

- Route 109: browser replay UX/report polish
  - if persistent cache and cross-process replay work
- or Route 109: browser action self-healing design
  - if replay is stable and Stagehand-like repair should come next
- or Route 109: external-network browser execution design
  - only if local persistent receipt replay is stable
- or Route 109: persistent cache hardening
  - if cache corruption/cleanup/locking needs more work

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
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

If cross-process replay cannot work without broader CLI lifecycle changes, document blocker and do not force persistence into session schema.

## Stop conditions

Stop and report if:

- persistence requires SessionManager schema changes
- persistence requires broad CLI lifecycle rewrite
- cache records would need raw evidence
- replay would bypass sandbox/allowlist/confirmation revalidation
- automatic replay becomes necessary
- external network becomes necessary
- dynamic skill discovery becomes necessary
- MCP server launch becomes necessary
- Playwright package dependency becomes necessary
- provider/model calls become necessary
- cache path semantics become unsafe/confusing
- cross-process cache causes flaky tests

## Final report

1. What changed
2. Reference scan summary
3. Persistent cache design
4. Cross-process CLI replay coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

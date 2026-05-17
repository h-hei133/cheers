# Route 107: browser action cache and explicit replay prototype

## Goal

Add a receipt-backed browser action cache and explicit replay prototype.

Route 104 added browser execution receipts and replay readiness.
Route 106 added explicit skill-managed browser runner execution for local/test scoped actions.

Route 107 should connect these layers:

- action cache model
- receipt-backed cache entries
- replay request / replay policy
- explicit replay planner
- explicit replay executor over existing local/test runner bridges
- `/browser replay ...` command if clean
- replay receipts and sidebar/report/harness integration
- no automatic replay
- no cache persistence
- no external network
- no dynamic skill discovery

This route should implement explicit local/test replay for replay-ready browser receipts without expanding browser execution authority.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
- docs/design/skill-managed-browser-runner-execution-bridge.md
- docs/design/skill-managed-browser-runner-metadata.md
- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/browser-external-runner-skill-bridge.md
- docs/design/browser-sandbox-network-allowlist.md
- docs/design/real-cli-scenario-harness.md
- docs/design/agent-scenario-harness-foundation.md
- docs/design/sidebar-live-event-capture.md
- docs/design/context-engineering-continuity-baseline.md
- docs/design/edit-capability-roadmap.md

Current baseline:

- test-local external runner execution works
- explicit skill-managed local/test execution works
- execution receipts exist
- replay readiness exists
- replay-ready local/test observe/extract receipts can be identified
- no action cache exists
- no explicit replay command exists
- no automatic replay exists

## Reference scan

Use `docs/agent-routes/REFERENCE_SCAN_POLICY.md`.

Primary references:

- Stagehand: /home/wang/projects/stagehand
- Playwright MCP: /home/wang/projects/playwright-mcp
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

- Stagehand: at most 9 files
- Playwright MCP: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 31 files
- exceed by 2 only for directly relevant action cache, replay, receipt, trace, or harness files

Focus:

Stagehand:

- action cache
- replayable actions
- self-healing boundary
- observe/act/extract replay distinction
- deterministic action caching
- preview-to-execute-to-replay lifecycle

Playwright MCP:

- browser action evidence
- action request/response schema
- accessibility snapshot references
- replay limitations
- tool/server state boundaries

OpenHands:

- action/observation trajectory
- replay/report evidence
- UI/session activity
- blocked/failure event surface

Inspect AI:

- transcript/evidence replay
- eval log reuse
- scorer/assertion separation
- deterministic replay safety

mini-swe-agent:

- trajectory replay ideas
- command history
- failure reproduction
- minimal run report

Coding-agent baselines:

- command replay boundaries
- session continuation
- result evidence
- sidebar/activity summaries

Answer in docs/design/browser-action-cache-explicit-replay.md:

1. What should be cached from a browser execution receipt?
2. What makes an action replayable versus replay-blocked?
3. How should Stagehand-style action cache concepts be adapted without self-healing execution?
4. What must be revalidated before replay?
5. How should replay output and receipts differ from original execution receipts?
6. What should Route 108 own?

## This route changes

Allowed:

- docs/design/browser-action-cache-explicit-replay.md
- docs/design/skill-managed-browser-runner-execution-bridge.md, Route 107 note only
- docs/design/browser-execution-evidence-replay-readiness.md, Route 107 note only
- docs/design/browser-external-runner-skill-bridge.md, Route 107 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 107 note only
- docs/design/real-cli-scenario-harness.md, Route 107 note only
- docs/design/agent-scenario-harness-foundation.md, Route 107 note only
- docs/design/sidebar-live-event-capture.md, Route 107 note only
- docs/design/context-engineering-continuity-baseline.md, Route 107 note only
- docs/design/edit-capability-roadmap.md, concise Route 107 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserActionCache.ts
- packages/ts-shell/src/core/context/browserActionCacheEntry.ts
- packages/ts-shell/src/core/context/browserReplayPolicy.ts
- packages/ts-shell/src/core/context/browserReplayPlanner.ts
- packages/ts-shell/src/core/context/browserReplayExecutor.ts
- packages/ts-shell/src/core/context/browserReplaySurface.ts
- packages/ts-shell/src/core/context/browserReplayCommandContract.ts
- packages/ts-shell/src/core/context/browserReplayCommandRunner.ts
- packages/ts-shell/src/core/harness/browserReplayScenarioFixtures.ts
- packages/ts-shell/src/core/harness/browserReplayScenarioExamples.test.ts

Allowed if clean:

- add `/browser replay <receipt-id>`
- add `/browser replay status`
- add in-memory cache entries derived from receipts
- add manifest-scoped cache fixtures for CLI harness
- replay only replay-ready local/test receipts
- replay through existing external-runner or skill-managed test-local binding
- generate a new replay receipt
- emit sidebar event for replay blocked/success/failure

## This route must preserve

Route-specific boundaries:

- no automatic replay
- no cache persistence
- no external network
- no default browser execution
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
- no raw page content/secrets/hidden reasoning in cache entries, replay output, receipts, reports, or sidebar events
- replay must revalidate sandbox, allowlist, confirmation, runner binding, and evidence policy before execution
- replay-ready receipt is not authority to replay by itself

## Tasks

### 1. Design and audit

Create docs/design/browser-action-cache-explicit-replay.md.

Include:

- Route 107 reference scan summary
- Route 104/106 receipt and skill execution baseline
- action cache model
- replay policy
- replay planner
- replay execution bridge
- receipt-to-cache transformation
- replay receipt model
- sidebar/report/harness integration
- no automatic replay / no persistence boundary
- no self-healing boundary
- Route 108 recommendation

### 2. Add action cache entry model

Add packages/ts-shell/src/core/context/browserActionCacheEntry.ts.

Expected concepts:

- BrowserActionCacheEntry
- BrowserActionCacheEntryId
- BrowserActionCacheEntryVersion
- source receipt id
- source receipt status
- action kind
- execution mode
- runner source
- skill metadata reference if present
- binding reference if present
- fixture/local target
- sandbox decision snapshot
- allowlist decision snapshot
- confirmation decision snapshot
- evidence summary
- replay readiness snapshot
- redactions
- warnings
- createdAt

Required behavior:

- derive entry only from sanitized receipt/evidence
- reject raw content/secrets
- deterministic ids/timestamps in tests
- no persistence
- no execution

Add focused tests.

### 3. Add in-memory action cache

Add packages/ts-shell/src/core/context/browserActionCache.ts.

Expected behavior:

- in-memory cache only
- add entry
- get entry
- list entries
- clear entries
- max entry budget
- replace duplicate source receipt deterministically
- hide developer-only/unsafe entries by default
- no persistence
- no default global cache

Add focused tests.

### 4. Add replay policy

Add packages/ts-shell/src/core/context/browserReplayPolicy.ts.

Policy should decide whether an action cache entry can be replayed.

Allowed replay subset:

- observe local fixture
- extract local fixture
- navigate local-fixture://...

Allowed modes:

- external-runner test-local
- skill-managed test-local
- local-fixture executor if still supported

Blocked:

- external URL
- unsafe receipt/evidence
- missing runner binding
- missing sandbox/allowlist/confirmation records
- auth/payment/destructive/upload/download/screenshot/OCR
- timeout/malformed/unsafe original receipt
- state-changing click/type unless future route explicitly reopens
- stale/unknown replay readiness
- missing manifest/fixture

Policy outputs:

- replay-allowed
- replay-blocked
- replay-needs-runner
- replay-needs-confirmation
- replay-unsafe
- replay-not-found
- replay-not-applicable
- future-runtime-required

Required behavior:

- no execution
- no provider/model calls
- clear blockers and next action

Add focused tests.

### 5. Add replay planner

Add packages/ts-shell/src/core/context/browserReplayPlanner.ts.

Planner should:

- accept replay request and cache entry
- revalidate replay policy
- build a replay execution request
- preserve original evidence references
- record replay reason/source command
- require current manifest/runner binding
- require current sandbox/allowlist/confirmation state
- produce replay plan or blocked plan

Output:

- replayPlanId
- source receipt id
- cache entry id
- action kind
- runner mode
- fixture/local target
- revalidation summary
- expected evidence
- blockers
- warnings
- next action
- willExecute yes/no

Add focused tests.

### 6. Add replay executor

Add packages/ts-shell/src/core/context/browserReplayExecutor.ts.

Executor should:

- consume replay plan
- execute only if replay policy allows
- route through existing external-runner or skill-managed executor
- create a new browser execution receipt
- link replay receipt to source receipt/cache entry
- mark receipt source as replay
- preserve replay readiness classification
- block safely on missing/invalid runner
- block unsafe/malformed/timeout output

Required behavior:

- no automatic replay
- no persistence
- no external network
- no dynamic discovery
- no raw content/secrets
- no provider/model calls

Add focused tests.

### 7. Add replay surface

Add packages/ts-shell/src/core/context/browserReplaySurface.ts.

Render:

- Browser replay
- Source receipt
- Cache entry
- Action
- Runner mode
- Revalidation status
- Replay status
- New receipt id if executed
- Evidence summary
- Replay readiness
- Redactions/warnings
- Executed: yes/no
- Next action

Keep concise.

Add focused tests.

### 8. Add replay command contract and runner

Add:

- packages/ts-shell/src/core/context/browserReplayCommandContract.ts
- packages/ts-shell/src/core/context/browserReplayCommandRunner.ts

Preferred UX:

- `/browser replay <receipt-id>`
- `/browser replay status`

Required behavior:

- status shows in-memory cache state
- replay requires explicit receipt/cache entry
- no entry returns replay-not-found
- replay revalidates current gates
- replay creates new receipt only on allowed execution
- no raw/secrets
- invalid args rejected clearly

Add focused tests.

### 9. Integrate with `/browser`

Update browser command runtime if clean.

Required behavior:

- `/browser replay status` routes to status
- `/browser replay <receipt-id>` routes to runner
- existing `/browser execute`, preview, dry-run, status remain stable
- no cache means useful message
- no default replay
- sidebar event emitted if sink exists

Add focused tests.

### 10. Integrate cache with execution results

When `/browser execute` produces a replay-ready receipt, add it to in-memory cache if a cache is explicitly available in command/harness context.

Required behavior:

- no global default cache
- no persistence
- no cache write without explicit context
- unsafe/non-replay-ready receipts not cached by default
- cache summary available to `/browser replay status`

Add focused tests.

### 11. CLI manifest and harness support

Add packages/ts-shell/src/core/harness/browserReplayScenarioFixtures.ts.

Fixtures should:

- create valid external runner manifest
- create valid skill-managed manifest/binding
- create temp runner scripts
- seed cache entries from prior receipt
- provide env/context for CLI scenario where possible
- cleanup temp files

If cross-process in-memory cache cannot persist between CLI invocations:

- support same-process command sequence if CLI harness allows it
- otherwise test replay runner in-process and document CLI persistence blocker
- do not add persistence just to pass CLI replay

### 12. Scenario examples

Add packages/ts-shell/src/core/harness/browserReplayScenarioExamples.test.ts.

Required scenarios:

1. external runner execute then replay in-process

- execute observe local-fixture
- cache receipt
- replay receipt
- new receipt created
- replay-ready remains true

2. skill-managed execute then replay in-process

- skill-managed observe local-fixture
- cache receipt
- replay receipt
- receipt source is replay/skill-managed

3. external URL blocked replay

- blocked original receipt
- cache/replay policy blocks

4. malformed/timeout/unsafe receipts not replayable

- replay-blocked
- no raw leaks

5. `/browser replay status` shows cache state

- no persistence claim

6. CLI scenario notes

- if in-memory cache cannot cross CLI process, assert status/command behavior and document in design/final report

### 13. Receipt and replay integration

Update browserExecutionReceipt / browserReplayReadiness if clean.

Required behavior:

- replay receipt links source receipt/cache entry
- replay readiness identifies replay-generated receipts
- replay-generated receipt can be replay-ready only if safe/local/test
- no automatic replay chain
- no persistence

Add focused tests.

### 14. Sidebar and report integration

Update sidebar event adapter / CLI report if clean.

Required behavior:

- browser replay success appears as Browser replay event
- replay blocked appears as warning/blocker
- reports show source receipt and new receipt
- no raw runner output
- no cross-process persistence assumption

Add focused tests.

### 15. Tests

Required focused tests:

- cache entry derives from safe receipt
- cache entry rejects unsafe evidence
- in-memory cache add/get/list/clear/budget works
- replay policy allows safe local/test observe/extract
- replay policy blocks external/unsafe/malformed/timeout
- replay planner revalidates gates
- replay executor creates linked receipt
- replay executor blocks missing runner/binding
- `/browser replay status` works
- `/browser replay <receipt-id>` works in explicit harness context
- sidebar/report show replay status safely
- scenarios cover external runner and skill-managed replay
- no persistence/package/provider/model/network/MCP side effects

### 16. Docs and roadmap update

Update:

- docs/design/browser-action-cache-explicit-replay.md with final notes
- docs/design/skill-managed-browser-runner-execution-bridge.md with Route 107 note
- docs/design/browser-execution-evidence-replay-readiness.md with Route 107 note
- docs/design/browser-external-runner-skill-bridge.md with Route 107 note
- docs/design/browser-sandbox-network-allowlist.md with Route 107 note
- docs/design/real-cli-scenario-harness.md with Route 107 note
- docs/design/agent-scenario-harness-foundation.md with Route 107 note
- docs/design/sidebar-live-event-capture.md with Route 107 note
- docs/design/context-engineering-continuity-baseline.md with Route 107 note
- docs/design/edit-capability-roadmap.md with concise status and Route 108 recommendation

Recommended next route:

- Route 108: browser replay UX/report polish
  - if cache/replay works but output is noisy
- or Route 108: browser action self-healing design
  - if Stagehand-like recovery should come next
- or Route 108: external-network browser execution design
  - only if local replay receipts are stable
- or Route 108: persistent action cache decision
  - only if persistence is clearly needed and safe

## Validation

Route-specific final validation:

- focused tests for touched browser/context modules
- focused tests for touched command modules
- focused tests for touched harness modules
- scenario tests added by this route
- rtk npm run verify:edit-capability-closeout
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk git diff --check
- rtk git status --short --branch

Do not run broad package tests.
Do not install packages.
Do not add package scripts.

If real CLI scenario tests reveal unrelated existing CLI failures or cache cannot cross process, document limitation rather than adding persistence.

## Stop conditions

Stop and report if:

- replay requires persistence
- replay requires external network
- replay requires dynamic skill discovery
- MCP server launch becomes necessary
- Playwright package dependency becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- replay semantics imply automatic execution
- raw evidence/secrets would appear in output/report

## Final report

1. What changed
2. Reference scan summary
3. Cache/replay design
4. Scenario coverage
5. CLI/cache limitations, if any
6. Validation
7. Boundaries preserved
8. Residue cleanup
9. Risks / blockers
10. Next route recommendation
11. Proposed commit message

Do not commit or push.

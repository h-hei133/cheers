# Route 104: browser execution evidence receipt and replay readiness

## Goal

Harden browser execution evidence after Route 103 external runner bridge.

Route 103 added:

- external runner protocol
- external runner manifest
- skill-managed runner policy
- external runner process adapter
- external runner executor
- external runner surface
- real CLI scenarios for default blocked, external runner observe/extract success, malformed response, timeout, unsafe output, and external URL blocked

Route 104 should turn browser execution output into stable, auditable, replay-aware receipts:

- normalized browser execution receipt
- evidence bundle model
- redaction and safety classification
- replay readiness classifier
- action-cache/replay boundary design
- report/sidebar/harness receipt integration
- CLI scenario report assertions for receipt integrity
- no automatic replay
- no external network
- no real Playwright dependency
- no dynamic skill/MCP discovery

This route should prepare browser execution for future skill-managed runner and action replay without enabling either by default.

## Baseline

Follow:

- docs/agent-routes/COMMON_BOUNDARIES.md
- docs/agent-routes/REFERENCE_SCAN_POLICY.md
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

- browser external runner bridge works through explicit local/test manifests
- `/browser execute` can run test-local external runner observe/extract
- external URL remains blocked
- runner timeout/malformed/unsafe output are handled
- CLI scenario harness covers browser external runner cases
- browser execution evidence is surfaced but not yet normalized as stable receipts
- replay/cache readiness is not modeled

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

- Stagehand: at most 8 files
- Playwright MCP: at most 6 files
- OpenHands: at most 5 files
- Inspect AI + mini-swe-agent: at most 6 files total
- opencode/gemini-cli/ClaudeCode combined: at most 5 files
- optional browser-use/Playwright repo: at most 3 files total if present
- total default budget: 30 files
- exceed by 2 only for directly relevant evidence, trace, cache, replay, or report files

Focus:

Stagehand:

- action cache
- observe/act/extract result shape
- preview-to-execute evidence
- self-healing/replay boundaries
- deterministic action evidence

Playwright MCP:

- tool response evidence
- accessibility snapshot evidence
- browser action result shape
- server/tool status
- safe evidence summaries

OpenHands:

- action/observation event model
- tool result evidence
- UI/session activity evidence
- failure/blocked execution reporting

Inspect AI:

- transcript/log/evidence separation
- scorer/assertion patterns
- tool-use eval reports
- redacted report rendering

mini-swe-agent:

- trajectory evidence
- command execution result
- failure handling
- minimal report shape

Coding-agent baselines:

- result evidence projection
- CLI report structure
- command output safety
- event/sidebar summaries

Answer in docs/design/browser-execution-evidence-replay-readiness.md:

1. What should a stable browser execution receipt contain?
2. Which evidence is user-visible, developer-only, or hidden?
3. What makes an action replay-ready versus replay-blocked?
4. What Stagehand-like action cache concepts should be borrowed now?
5. What should remain deferred until actual replay/cache execution?
6. What should Route 105 own?

## This route changes

Allowed:

- docs/design/browser-execution-evidence-replay-readiness.md
- docs/design/browser-external-runner-skill-bridge.md, Route 104 note only
- docs/design/playwright-runtime-dependency-decision.md, Route 104 note only
- docs/design/real-playwright-local-only-execution.md, Route 104 note only
- docs/design/cli-browser-executor-injection-bridge.md, Route 104 note only
- docs/design/browser-sandbox-network-allowlist.md, Route 104 note only
- docs/design/real-cli-scenario-harness.md, Route 104 note only
- docs/design/agent-scenario-harness-foundation.md, Route 104 note only
- docs/design/sidebar-live-event-capture.md, Route 104 note only
- docs/design/context-engineering-continuity-baseline.md, Route 104 note only
- docs/design/edit-capability-roadmap.md, concise Route 104 update only
- packages/ts-shell/src/core/context/*
- packages/ts-shell/src/core/commands/*
- packages/ts-shell/src/core/harness/*
- packages/ts-shell/src/core/shell/*
- packages/ts-shell/src/entrypoints/*
- packages/ts-shell/src/session/*
- focused tests for touched modules

Preferred new files:

- packages/ts-shell/src/core/context/browserExecutionReceipt.ts
- packages/ts-shell/src/core/context/browserEvidenceBundle.ts
- packages/ts-shell/src/core/context/browserEvidenceSafety.ts
- packages/ts-shell/src/core/context/browserReplayReadiness.ts
- packages/ts-shell/src/core/context/browserExecutionReceiptSurface.ts
- packages/ts-shell/src/core/harness/browserExecutionReceiptAssertions.ts
- packages/ts-shell/src/core/harness/browserExecutionReceiptScenarioExamples.test.ts

Allowed if clean:

- add receipt creation to browser external runner executor
- add receipt summary to `/browser execute` output
- add receipt summary to sidebar event adapter
- add receipt summary to CLI scenario report
- add harness assertions for receipt integrity and replay readiness
- add replay-ready classification only; do not execute replay
- add action-cache metadata only; do not persist cache

## This route must preserve

Route-specific boundaries:

- no automatic replay
- no action cache persistence
- no external network
- no real Playwright dependency
- no MCP server launch or dynamic MCP discovery
- no provider/model calls
- no default browser execution
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
- no raw page content/secrets/hidden reasoning in receipts, reports, sidebar events, or command output
- receipts are evidence records, not authority to replay automatically

## Tasks

### 1. Design and audit

Create docs/design/browser-execution-evidence-replay-readiness.md.

Include:

- Route 104 reference scan summary
- Route 103 external runner baseline
- execution receipt model
- evidence bundle model
- evidence visibility model
- safety/redaction policy
- replay readiness classifier
- action cache/replay boundary
- sidebar/report/harness integration model
- no-replay/no-persistence boundary
- Route 105 recommendation

### 2. Add browser execution receipt model

Add packages/ts-shell/src/core/context/browserExecutionReceipt.ts.

Expected concepts:

- BrowserExecutionReceipt
- BrowserExecutionReceiptId
- BrowserExecutionReceiptVersion
- BrowserExecutionReceiptStatus:
  - executed
  - blocked
  - failed
  - timed-out
  - invalid-response
  - unavailable
  - unsafe-output
- BrowserExecutionReceiptSource:
  - external-runner
  - local-fixture
  - fake-test
  - playwright-local-unavailable
  - dry-run
- BrowserExecutionReceiptVisibility:
  - user-visible
  - developer-only
  - hidden
- action kind
- execution mode
- runner id/source
- manifest id/source
- fixture id
- sandbox decision
- allowlist decision
- confirmation decision
- evidence bundle reference
- replay readiness
- redactions
- warnings
- next action
- executed yes/no

Required behavior:

- deterministic receipt ids/timestamps in tests
- pure helpers
- no execution
- no raw content/secrets

Add focused tests.

### 3. Add evidence bundle model

Add packages/ts-shell/src/core/context/browserEvidenceBundle.ts.

Evidence bundle should normalize evidence from:

- external runner success
- external runner blocked
- malformed response
- timeout
- unsafe output
- local fixture executor
- dry-run plan
- unavailable runtime

Expected fields:

- bundle id
- safe title
- safe URL
- safe origin or local fixture id
- observation summary
- extraction summary
- action trace summary
- stdout/stderr summary
- response metadata summary
- evidence references
- redactions
- warnings
- visibility labels

Must exclude:

- raw HTML
- raw page text beyond bounded summaries
- screenshots/OCR blobs
- secrets/tokens/credentials
- hidden reasoning
- raw stdout/stderr over budget

Add focused tests.

### 4. Add evidence safety classifier

Add packages/ts-shell/src/core/context/browserEvidenceSafety.ts.

Classifier should detect/block/redact:

- raw HTML markers
- large raw page content
- secret-looking content
- credential URLs
- hidden reasoning markers
- screenshot/OCR payload markers
- binary/blob-ish payload
- raw stdout/stderr over budget
- unsafe external URL evidence if present

Output:

- safetyStatus:
  - safe
  - redacted
  - unsafe
  - blocked
- redactions
- blockers
- warnings
- safe summaries

Required behavior:

- deterministic
- no provider/model calls
- conservative blocking for clear unsafe evidence
- no raw unsafe content in classifier output

Add focused tests.

### 5. Add replay readiness classifier

Add packages/ts-shell/src/core/context/browserReplayReadiness.ts.

Classifier should determine whether an executed action is replay-ready.

Replay readiness statuses:

- replay-ready
- replay-blocked
- replay-needs-confirmation
- replay-needs-runner
- replay-unsafe
- replay-not-applicable

Criteria:

Replay-ready only if:

- action was local/test scoped
- action kind is observe/extract/navigate-local
- evidence is safe
- fixture or local target is stable
- sandbox/allowlist/confirmation decisions are recorded
- runner mode is explicit
- no external network
- no auth/payment/destructive/upload/download/screenshot/OCR

Blocked if:

- external URL
- unsafe evidence
- missing fixture/runner/allowlist
- state-changing action without confirmation
- timeout/malformed/unsafe result
- failed execution

Required behavior:

- no replay execution
- no persistence
- clear next action

Add focused tests.

### 6. Add receipt surface

Add packages/ts-shell/src/core/context/browserExecutionReceiptSurface.ts.

Surface should render:

- Browser execution receipt
- Receipt id
- Status
- Action
- Mode
- Runner
- Evidence summary
- Replay readiness
- Redactions/warnings
- Executed: yes/no
- Next action

Keep output concise and user-facing.

Add focused tests.

### 7. Integrate receipts into browser execution

Update browser external runner executor / browser execution runner / execution result conversion.

Required behavior:

- every `/browser execute` result can include receipt summary
- success creates executed receipt
- blocked creates blocked receipt if useful
- malformed/timeout/unsafe creates failed/blocked receipt
- dry-run remains non-executing but may map to dry-run receipt only if clean
- receipt does not expose raw content
- receipt does not imply automatic replay

Add focused tests.

### 8. Integrate receipts into sidebar and CLI report

Update sidebar event adapter and CLI scenario report if clean.

Required behavior:

- sidebar event can show receipt status and replay readiness
- CLI report includes receipt summary
- report does not include raw evidence
- warning/blocker events preserve unsafe/timeout/malformed statuses
- no cross-process persistence assumption

Add focused tests.

### 9. Add harness receipt assertions

Add packages/ts-shell/src/core/harness/browserExecutionReceiptAssertions.ts.

Assertions should include:

- receipt exists
- receipt status equals expected
- receipt executed yes/no
- receipt has evidence bundle
- receipt replay readiness equals expected
- receipt has no raw content/secrets
- receipt includes sandbox/allowlist/confirmation decisions
- receipt next action exists
- receipt is local/test scoped when expected

Add focused tests.

### 10. Add scenario examples

Add packages/ts-shell/src/core/harness/browserExecutionReceiptScenarioExamples.test.ts.

Required scenarios:

1. external runner observe success produces replay-ready receipt

- test-local runner
- observe local-fixture
- Executed: yes
- receipt replay-ready
- evidence safe

2. external runner extract success produces replay-ready receipt

- test-local runner
- extract local-fixture
- safe extraction summary

3. external URL blocked produces replay-blocked receipt

- valid runner manifest
- navigate https://example.com
- Executed: no

4. malformed response produces invalid-response receipt

- no raw stdout leak
- replay-blocked

5. timeout produces timed-out receipt

- replay-blocked
- no hang

6. unsafe output produces unsafe/blocked receipt

- secret/raw markers redacted
- replay-unsafe or replay-blocked

### 11. Docs and roadmap update

Update:

- docs/design/browser-execution-evidence-replay-readiness.md with final notes
- docs/design/browser-external-runner-skill-bridge.md with Route 104 note
- docs/design/playwright-runtime-dependency-decision.md with Route 104 note
- docs/design/real-playwright-local-only-execution.md with Route 104 note
- docs/design/cli-browser-executor-injection-bridge.md with Route 104 note
- docs/design/browser-sandbox-network-allowlist.md with Route 104 note
- docs/design/real-cli-scenario-harness.md with Route 104 note
- docs/design/agent-scenario-harness-foundation.md with Route 104 note
- docs/design/sidebar-live-event-capture.md with Route 104 note
- docs/design/context-engineering-continuity-baseline.md with Route 104 note
- docs/design/edit-capability-roadmap.md with concise status and Route 105 recommendation

Recommended next route:

- Route 105: skill-managed browser runner metadata prototype
  - if receipts/replay readiness are stable
- or Route 105: browser action cache/replay design
  - if Stagehand-like repeatability should come next
- or Route 105: external-network browser execution design
  - only if receipt/replay/safety evidence is stable
- or Route 105: browser evidence report polish
  - if receipt integration reveals noisy output

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

- receipt integration requires persistence
- replay readiness starts executing replay
- external network becomes necessary
- Playwright package dependency becomes necessary
- MCP server launch becomes necessary
- provider/model calls become necessary
- SessionManager schema changes become necessary
- CLI lifecycle rewrite becomes necessary
- raw evidence/secrets would need to appear in output/report
- receipt output becomes too verbose for user-facing display

## Final report

1. What changed
2. Reference scan summary
3. Receipt and replay readiness design
4. Scenario coverage
5. Validation
6. Boundaries preserved
7. Residue cleanup
8. Risks / blockers
9. Next route recommendation
10. Proposed commit message

Do not commit or push.

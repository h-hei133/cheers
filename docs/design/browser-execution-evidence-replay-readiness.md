# Browser execution evidence receipt and replay readiness

Route 104 hardens browser execution output into stable evidence receipts. It is
an evidence-only route: receipts classify what happened and whether a future
explicit replay route could use the evidence, but they do not execute replay,
persist cache entries, launch Playwright/MCP, call providers/models, or enable
external-network browsing.

## Reference Scan Summary

Bounded scan results:

- Stagehand separates `observe`, `act`, and `extract` results and annotates
  repeatability with cache concepts such as `cacheStatus`, `cacheKey`,
  `variableKeys`, action arrays, and replay step shapes. Route 104 borrows only
  metadata vocabulary and deterministic action evidence; it does not add cache
  storage or replay execution.
- Playwright MCP treats accessibility snapshots as action evidence and
  documents screenshots as read-only evidence that should not drive actions.
  Route 104 follows the safe-summary direction and rejects screenshot/OCR blobs.
- OpenHands models action/observation outcomes as success, error, or timeout
  for UI/report rendering. Route 104 maps browser execution to receipt status
  plus replay readiness without exposing raw observations.
- Inspect AI keeps sample metadata, scores, transcript events, and report
  rendering separate. Route 104 mirrors that split by keeping receipts, evidence
  bundles, safety classification, and report surfaces distinct.
- mini-swe-agent trajectory fixtures show minimal action/result records that
  can be inspected without custom tool state. Route 104 keeps CLI scenario
  receipts similarly compact and text-auditable.

## Route 103 Baseline

Route 103 added an explicit external-runner bridge behind a validated local/test
manifest. `/browser execute` can run observe/extract against local fixtures and
still blocks default execution, external URL navigation, malformed responses,
timeouts, unsafe output, raw runner stdout/stderr, provider/model calls, MCP
launch, and persistent browser sessions.

Before Route 104, browser evidence was present but mostly text-shaped. Reports
could infer `executed=yes/no`, mode, and manifest status, but there was no stable
receipt object, evidence bundle, or replay readiness classification.

## Execution Receipt Model

`BrowserExecutionReceipt` is the stable record created for browser execution
results. It contains:

- deterministic receipt id and version
- status: `executed`, `blocked`, `failed`, `timed-out`, `invalid-response`,
  `unavailable`, or `unsafe-output`
- source: external runner, local fixture, fake test, unavailable Playwright, or
  dry-run
- action kind, execution mode, runner, manifest, fixture, sandbox, allowlist,
  and confirmation decisions
- evidence bundle reference
- replay readiness classification
- redactions, warnings, next action, and `Executed: yes/no`
- explicit `rawContent: excluded`, provider call `none`, and model call `none`

Receipts are pure data. They are not authority to replay automatically.

## Evidence Bundle Model

`BrowserEvidenceBundle` normalizes evidence from successful external runner
responses, blocked execution, malformed output, timeout, unsafe output, local
fixture execution, dry-run-like non-execution, and unavailable runtime paths.

The bundle keeps only safe summaries:

- safe title
- safe URL or redacted external URL marker
- safe origin or local fixture id
- observation and extraction summaries
- action trace summary
- stdout/stderr summary
- response metadata summary
- evidence references with visibility labels
- redactions and warnings

The bundle excludes raw HTML, raw page text beyond bounded summaries,
screenshots/OCR blobs, secrets, hidden reasoning, and over-budget raw
stdout/stderr.

## Visibility Model

Evidence is labeled as:

- `user-visible`: compact receipt status, action, mode, execution, safe summary,
  replay readiness, and next action
- `developer-only`: runner metadata, snapshot-summary references, stdout/stderr
  summaries, action trace summaries, redactions, and safety warnings
- `hidden`: raw content categories that remain excluded rather than rendered

Reports and sidebar events use the user-visible summary and bounded
developer-only labels. They do not render raw evidence.

## Safety and Redaction Policy

`browserEvidenceSafety` conservatively detects and blocks/redacts:

- raw HTML markers
- raw content markers
- secret-looking strings and credential URLs
- hidden reasoning markers
- screenshot/OCR and image payload markers
- binary/blob-like payloads
- over-budget stdout/stderr
- unsafe external URL evidence

Classifier output contains blocker/redaction labels and safe summaries only. It
does not echo unsafe input.

## Replay Readiness Classifier

`browserReplayReadiness` determines whether a receipt is replay-ready for a
future explicit route.

Replay-ready requires:

- local/test scope
- observe, extract, or local navigate action
- safe evidence
- stable fixture or local target
- recorded sandbox, allowlist, and confirmation decisions
- explicit runner mode
- no external network
- no auth, payment, destructive, upload, download, screenshot, or OCR action

Blocked paths include external URL evidence, unsafe evidence, missing runner or
decisions, failed execution, timeout, malformed response, and unsupported
state-changing actions. Replay execution remains `not-started` and persistence
remains `none`.

## Action Cache Boundary

Route 104 borrows Stagehand-like metadata only:

- deterministic action cache key
- cache concept label
- variable key list
- deterministic action evidence
- cache status `not-persisted`

It does not add storage, cache lookup, cache writes, self-healing, AI planning,
or replay execution.

## Integration Model

`/browser execute` now renders:

- existing browser execution surface
- external runner surface when applicable
- browser execution receipt surface
- sandbox, lifecycle, runtime dependency, and CLI bridge surfaces

Sidebar command events include receipt-safe lines in the summarized event.
Scenario reports include receipt status and replay readiness. Harness receipt
assertions verify receipt existence, status, executed state, replay readiness,
safe output, decision context, local/test scope, and next action.

## No-Replay and No-Persistence Boundary

Route 104 explicitly preserves:

- no automatic replay
- no action cache persistence
- no startup cache or browser session persistence
- no external network
- no Playwright dependency
- no MCP launch/discovery
- no provider/model calls
- no SessionManager schema changes
- no raw evidence, secrets, or hidden reasoning in receipts, reports, sidebar
  events, or command output

## Route 105 Recommendation

Best next route: skill-managed browser runner metadata prototype, if the
receipt/replay-readiness model remains stable under Route 104 validation.

Alternative Route 105 choices:

- browser action cache/replay design, if repeatability should be designed before
  skill-managed runner metadata
- browser evidence report polish, if receipt output is too noisy in real CLI
  usage
- external-network browser execution design only after local/test receipt safety
  and replay-readiness remain stable

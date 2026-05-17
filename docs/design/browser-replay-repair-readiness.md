# Browser Replay Repair Readiness

Status: Route 111 implemented candidate.
Date: 2026-05-17

## Scope

Route 111 adds preview-only replay repair readiness on top of the explicit
browser replay/cache foundation from Routes 107-110. It classifies blocked
replay failures, decides whether a safe repair preview exists, renders a
concise preview, and adds report/sidebar-safe summary fields.

It does not auto-repair, auto-replay, execute self-healing, call providers or
models, launch MCP, add Playwright dependencies, use external network, persist
repaired actions by default, change package scripts, or change SessionManager
schema.

## Reference Scan Summary

Stagehand informed the split between cached action metadata, previewable repair
steps, and actual self-healing execution. Route 111 adopts only the metadata
and preview concept.

Playwright MCP and OpenHands informed the surface boundary: browser evidence
should stay summarized, user-visible failures should include a next action, and
tool output should not become raw replay state.

Inspect AI and mini-swe-agent informed failure-report discipline: classify
failed trajectories/runs into safe report fields, preserve reproducibility
signals, and avoid raw failure payloads in summaries.

No implementation code was copied from reference repositories.

## Failure Taxonomy

Repair classifier kinds:

- missing cache entry
- invalidated or deleted receipt
- missing runner binding
- missing skill metadata
- sandbox/confirmation missing
- allowlist blocked
- unsafe evidence
- timeout
- malformed response
- external URL blocked
- unsupported action
- stale fixture
- corrupted cache record

## Repairable Categories

Repairable as preview only:

- missing local/test runner or skill binding
- missing skill metadata
- missing current sandbox/allowlist/confirmation
- corrupted explicit cache record, via explicit cache repair
- timeout or malformed local/test runner result, when the original action stays
  local/test and safe-summary evidence is intact
- missing cache entry or stale fixture, as a prompt to run a new explicit
  local/test action

Blocked:

- unsafe evidence
- external network targets
- unsupported actions
- invalidated/deleted receipts that require a new explicit local/test execution

## Preview Model

`browserReplayFailureClassifier.ts` produces a safe failure kind, severity,
reason, evidence token, and next action.

`browserReplayRepairReadiness.ts` maps failures into readiness statuses such
as `repair-needs-runner`, `repair-needs-metadata`,
`repair-needs-confirmation`, `repair-needs-cache-repair`,
`repair-blocked-unsafe`, and `repair-blocked-external-network`.

`browserReplayRepairPreview.ts` creates metadata-only previews:

- source receipt/cache entry
- failure kind
- repair readiness
- proposed safe repair step
- required user action
- required gate or condition
- expected evidence after repair
- executed: no
- repair applied: no

## Command, Report, And Sidebar Surface

Blocked `/browser replay <receipt-id>` output now includes a `Browser replay
repair preview` section when useful. Successful replay says `Repair needed:
no` and does not render a repair preview.

Reports can summarize repair readiness from replay output. Sidebar command
summaries allow only safe repair lines: failure, readiness, required gate,
suggested action, executed no, repair applied no, automatic repair no, and next
action.

## Route 112 Recommendation

Recommended Route 112: browser replay UX/report polish, because repair
readiness is now available but output may need product tightening.

Alternative Route 112 options:

- browser action self-healing design, still preview-only until a route owns
  execution
- external-network browser execution design only after repair preview remains
  stable

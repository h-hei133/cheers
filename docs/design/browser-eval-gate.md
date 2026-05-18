# Browser Eval Gate

Route 129 made controlled same-page browser transactions executable for local
fixtures: observe/extract, click/extract, type/extract, optional re-observe,
deterministic planning, one-step repair, transaction evidence, and `/continue`
summaries. Route 130 closes that capability with deterministic trace, report,
score, golden eval, and gate coverage.

## Trace

`browserTrace.ts` derives a compact trace from `BrowserTxnResult`. It records a
trace id, transaction id, controlled local target, planned operation sequence,
planner confidence/reason, executed step summaries, observation/action
summaries, repair status/evidence, final reason/result, cleanup, redaction, and
bounded timing. It only stores sanitized summaries and boundary markers:
raw DOM, cookies/session/storage, hidden values, typed values, image capture,
MCP live backend state, and provider/model output are excluded.

## Report

`browserTxnReport.ts` renders the terminal/result surface. It keeps the existing
`Browser task completed/stopped` title but adds outcome labels, trace id,
planner decision, repair, result, reason, cleanup, redaction, evidence id, and
next action. Browser transaction failures now distinguish planner stop, policy
block, runtime unavailable, target missing, repair failed, timeout, cleanup
failed, and redaction state.

## Eval And Scoring

`browserScore.ts` scores deterministic criteria as `pass`, `fail`, `skip`, or
`warn`: planner confidence, transaction status, reason code, action target,
repair necessity/result, unsafe-action boundary, final extraction, cleanup, and
redaction. `browserTxnGolden.ts` defines golden cases for observe/extract,
click/extract, type/extract, repair success/failure, low confidence, policy
block, timeout cleanup, redaction, and runtime-unavailable skip. `browserTxnEval.ts`
runs real cases only when the local Playwright runtime is ready and uses
injected/skipped modes for deterministic pre-runtime or unavailable paths.

## Replay And Continue

Transaction runs now emit both `browser-agent-transaction:*` and
`browser-agent-transaction-trace:*` evidence. `/continue` consumes these compact
summaries only; it does not require page state and does not persist browser
pages across sessions.

## Gate Status

`verify:browser-txn-gate` runs focused trace, report/scoring, eval/golden, gate,
transaction, agent-loop, continuation, and local browser tests. The gate checks
for trace id, cleanup evidence, reason codes, result summaries, pass/fail/skip
outcomes, and redaction leaks. This remains a closeout gate only: no provider
calls, public web automation, auth/session persistence, destructive flows, raw
DOM/secrets, image capture, MCP live backend, or autonomous browser planner.

## Reference Notes

Reference scans were bounded to shapes, not code copying: Inspect AI score/event
updates, mini-swe-agent trajectory output naming, Stagehand eval report cases,
OpenHands callback result status, Playwright MCP snapshot-after-action tests,
opencode session summaries, and ClaudeCode permission telemetry/result
separation.

## Route 131 Recommendation

Route 131 should focus on operator-facing browser transaction closeout docs and
manual diagnostics for controlled local fixtures, or pause browser expansion and
return to the highest-priority default CLI product hardening blocker.

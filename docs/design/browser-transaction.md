# Browser Transaction

Route 129 builds on Route 128. Route 128 registered controlled Direct
Playwright `browser.observe`, `browser.extract`, `browser.click`, and
`browser.type` tools, hid them unless runtime status is ready, enforced local
fixture policy before adapter calls, and stored sanitized browser observations
for transcript and `/continue`.

Route 129 adds a same-page transaction path for browser tasks. A transaction
uses one controlled target, one runtime availability/policy preflight, one
temporary browser/page lifecycle, and mandatory cleanup. Supported sequences are
`observe -> extract`, `observe -> click -> extract`,
`observe -> type -> extract`, and the same action paths with one
`re-observe` before extract. The page is never retained across unrelated turns
or sessions.

Planning is deterministic and local. `browserPlan.ts` maps controlled local
prompts to a bounded operation sequence, target summary, required policy level,
confidence, and repair allowance. Low-confidence plans stop before runtime; no
provider/model call, Stagehand planner, Playwright MCP backend, or public web
automation is used.

Repair is one-step and only inside controlled local transactions. A missing
click/type target may select exactly one safe role/name candidate from the prior
observation. Repair evidence records attempted/succeeded/failed status and
keeps blind clicks, arbitrary JavaScript, auth/session, upload/download,
payment, destructive actions, screenshots/OCR, raw DOM, and secrets out of the
surface.

Evidence is transaction-shaped: transaction id, target, plan, step summaries,
final summary, reason code, repair status, cleanup status, redaction status,
duration, and evidence id. Transcript and `/continue` store only budgeted
summary lines (`browser-agent-transaction:*`) plus Route 128-compatible
observation markers; raw page content, hidden values, typed text, storage,
cookies, screenshots, and provider config are excluded.

Validation added focused runtime, agent-loop, and continuation tests for
same-page observe/extract, click/type/extract, repair success/failure,
re-observe, timeout cleanup, unavailable runtime, redaction, cleanup failure,
and `/continue` summaries.

Recommended Route 130: add a manifest-backed transaction closeout/report
surface that can compare deterministic transaction traces across local fixture
runs without broad autonomy, public browsing, MCP live backend, provider calls,
or browser/session persistence.

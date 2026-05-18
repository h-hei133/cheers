# Browser Agent Loop

Route 128 connects the Route 127 Direct Playwright runtime to the existing
agent tool/query path. Route 127 already established that `playwright-core`,
Chromium, runtime status, cleanup evidence, safe summaries, and failure reason
codes are real enough for controlled local/test execution.

## Contract

The registered tools are:

- `browser.observe`
- `browser.extract`
- `browser.click`
- `browser.type`

They are normal core tools, so the agent sees them through the existing
registry/dispatcher and lifecycle events. Their schemas expose controlled
fixture/local target fields, bounded timeout, extraction kind, and
`valueClassification=safe-test-text` for typing. Raw DOM, screenshots, cookies,
storage, auth material, and typed secret values are excluded from tool output,
metadata, transcript summaries, and continuation evidence.

## Availability

Tool visibility is driven by `PwRuntimeStatus`:

- `ready`: browser tools are visible to the agent.
- `package-missing`, `binary-missing`, `disabled`, `failed`: browser tools are
  hidden from visible tool lists and direct calls return unavailable/stopped
  observations without pretending execution happened.

## Policy

`browserToolPolicy.ts` runs before `PwAdapter`. It allows controlled
`local-fixture://` and approved loopback-style targets, safe observe/extract,
and safe click/type in controlled fixtures. It blocks public web automation,
auth/login/session/cookie/payment/destructive/download/upload targets,
unknown external targets, and secret-looking typing.

## Observation

`browserObs.ts` maps Direct Playwright results into agent-safe observations:
operation, controlled target summary, visible text summary, reason code,
cleanup status, redaction status, evidence id, and safe next actions. It does
not preserve raw DOM or secret material.

## Query Loop

Browser prompts are planned as `taskKind=browser` inside the existing MVP
agent loop. The coder turn dispatches browser tools through the existing
lifecycle wrapper, receives observations from tool metadata, writes compact
browser evidence into `codingResult`, and produces final answers from the
sanitized observation. Controlled autonomous use is limited to local fixtures;
there is no Stagehand planner, public browsing mode, MCP live backend, or
provider/model call.

## Transcript And Continue

Browser action summaries are recorded as `browser-agent-observation:*`
continuation evidence. `SessionManager` keeps those evidence lines as critical
continuation context, so `/continue` can summarize prior observe/click/type,
policy-blocked, unavailable, timeout, or target-missing outcomes without raw
DOM.

## Validation

Route 128 adds focused coverage for browser tool availability, policy blocks,
real observe/click/type, target missing, timeout cleanup evidence, redaction,
and continuation from prior browser evidence. Existing Direct Playwright real
fixture tests remain the runtime proof.

## Route 129

Recommended Route 129: add a same-page controlled action sequence abstraction
for observe -> click/type -> extract without browser session persistence beyond
one tool transaction, plus stronger eval fixtures for multi-step page state.

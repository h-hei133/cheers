# Opt-In Real Browser Runtime Adapter

Route 124 builds on the Route 123 controlled browser runtime MVP. It adds an
explicit adapter boundary for external-process and skill-managed browser
runners while keeping browser automation controlled/local/test scoped.

## Reference Scan Summary

- Playwright MCP separates browser context/session concerns from action tools
  and favors accessibility snapshots and locator metadata over screenshots as
  action authority.
- Stagehand keeps observe/act/extract distinct, previews candidate actions,
  and treats cached or repaired actions as explicit follow-up behavior.
- OpenHands separates browser actions from browser observations and surfaces
  bounded output/error summaries to users.
- Inspect AI separates task definitions, scoring, skipped/unavailable states,
  and report rendering.
- mini-swe-agent records bounded trajectories and reproduction evidence rather
  than treating subprocess output as hidden durable state.

## Adapter Boundary

The minimum adapter boundary is:

- an explicit external runtime manifest;
- a protocol request/response shape;
- a process or skill-managed runner supplied by harness/config;
- deterministic response and snapshot validation;
- controlled action-loop execution through the Route 123 observation,
  provenance, receipt, and surface models.

The adapter never installs Playwright, launches MCP, discovers skills
dynamically, calls a provider/model, or becomes the default runtime.

## External vs Skill-Managed Runtime

External-process runtime uses an explicit command and args from the manifest.
The process receives a protocol request as JSON stdin and must return one JSON
protocol response within timeout and output budget.

Skill-managed runtime uses explicit binding metadata supplied by the caller.
The binding must declare allowed actions and snapshot capabilities and provide a
test/local runner function. Missing binding returns
`future-skill-runtime-required`; no dynamic discovery is attempted.

## Runtime Protocol

The runner protocol supports `runtime-status`, `navigate`, `observe`,
`extract`, `click`, `type`, and `close`. Responses include status, runtime id,
session id, current URL summary, DOM/accessibility payload summaries, optional
action target result, post-action observation, warnings/redactions, and error
summary.

Protocol validation rejects malformed JSON, unsupported actions/status,
oversized DOM payloads, raw page dump markers, credential URLs, unsupported
actions, and unsafe output. Secret-looking and hidden-reasoning text is
redacted before becoming observation or receipt data.

## Snapshot Validation

Adapter responses are converted into Route 123 DOM and accessibility snapshots
only after validation. DOM validation enforces budgets, strips unsafe markup,
redacts secret-looking values, blocks sensitive user-entered values, and keeps
raw DOM excluded from user-visible receipts and reports. Accessibility
validation keeps bounded role/interactive summaries and redacts sensitive
labels.

## Selector Repair Apply

Selector repair apply is controlled metadata only. A preview-ready repair seed
may select a high-confidence accessibility candidate for controlled/local/test
pages after explicit confirmation for click/type. Public repair, sensitive
targets, low-confidence candidates, arbitrary model-generated selectors, and
automatic repaired action execution remain blocked.

## Eval Gauntlet

The gauntlet covers rendered title/headings, visible text extraction,
accessibility landmarks/action targets, safe click/type state changes,
password/payment blocking, selector repair apply plus explicit action
execution, provenance/citation presence, public click blocking, invalid/timeout
runner handling, and raw DOM/secret exclusion from reports.

## Route 125 Recommendation

Route 125 should choose one narrow next step:

- an opt-in real Playwright or Stagehand runner adapter;
- a controlled browser action planner;
- a browser session/auth design that remains disabled by default;
- expanded eval score gates for browser runtime quality.

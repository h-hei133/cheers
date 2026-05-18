# Browser External-Network Runner Handoff

Route 117 adds an explicit handoff protocol for an external-network browser
runner, but the route remains simulated-only. No browser is launched, no
external network request is made, no MCP server is started, and no provider or
model call is allowed.

## Reference Scan Summary

- Playwright MCP exposes browser actions as named tools with clear tool
  boundaries. Route 117 mirrors that by allowing only `navigate`, `observe`,
  and `extract`, while keeping upload, screenshot, OCR, auth, payment, and
  destructive actions blocked.
- Stagehand-like flows separate action intent from observation/extraction
  result. Route 117 keeps a request/response protocol rather than treating a
  browser runner as ambient runtime state.
- OpenHands-style tool handoff reports make blocked/unavailable tool states
  explicit. Route 117 records manifest, gate, policy, and handoff status
  separately so blocked states remain explainable.
- Inspect AI and mini-swe-agent harness patterns keep simulated tool evidence
  distinct from real execution evidence. Route 117 uses simulated receipts that
  explicitly say real network execution did not happen.
- Existing coding-agent browser routes already require sandbox, allowlist,
  confirmation, and safe-summary evidence before execution-like output.

## Route 116 Baseline

Route 116 added the disabled-by-default external-network execution bridge. It
can classify unsafe URL targets, missing allowlist, missing confirmation,
disabled runner, and ready-for-future-runner states. It does not define a
runner manifest, handoff protocol, simulated runner response, or handoff
receipt.

## Manifest Model

An external-network runner manifest declares:

- manifest version and explicit source
- runner mode: `simulated-external`, `disabled`, or `future-real-external`
- exact allowed `https` origins, with no wildcard and no credential URLs
- allowed action kinds: `navigate`, `observe`, and `extract`
- explicitly disallowed sensitive actions
- timeout and output budgets
- evidence contract: `safe-summary-only`
- `networkExecution: false`
- warnings

There is no default manifest. CLI harness support is explicit through a
route-scoped environment variable and produces only test harness gates.

## Handoff Protocol

The request includes request id, action kind, target origin, safe URL summary,
allowlist status, confirmation status, sandbox/preflight status, runner mode,
evidence requirements, output budget, and `realNetworkExecution: false`.

The response includes status, execution flags, safe title/summary, warnings,
redactions, error summary, and evidence. Validation rejects raw page content,
URL credentials, secrets, hidden reasoning markers, screenshot/OCR payloads,
oversized output, and any response claiming real network execution.

## Required Gates

Simulated handoff requires all of the following:

- valid external URL intent
- allowlist decision `allowed`
- confirmation `confirmed` or `not-required`
- sandbox `allowed` or `future-runtime-required`
- valid external-network runner manifest
- runner mode `simulated-external`
- allowed action kind
- manifest origin match
- `realNetworkExecution: false`

Missing or failing gates remain blocked. A `future-real-external` manifest
reports that a future real runner is required, but remains non-callable here.

## Receipt And Surface

The receipt records origin, action, runner mode, gate summary, simulated
handoff status, real network execution `no`, browser launched `no`, safe
evidence summary, warnings/redactions, and next action.

The user surface renders an `External browser runner handoff` section only when
the simulated handoff was created. It does not include raw page content,
credential URLs, secrets, hidden reasoning, screenshots, OCR, stdout/stderr
blobs, or provider details.

## Route 118

Route 118 should either design the real external-network runner while keeping
it disabled by default, or polish handoff report/replay UX if real execution
should wait. It must separately own any browser launch, real network call,
MCP/tool-server launch, dynamic discovery, provider/model call, or stronger
confirmation UX.

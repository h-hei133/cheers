# Browser external-network execution bridge

Route 116 adds an external-network browser execution bridge that is opt-in and
disabled by default. It does not launch a browser, call MCP, call a provider, or
perform any external network request.

## Reference scan summary

- Playwright MCP exposes many browser/network tools explicitly and keeps unsafe
  capabilities such as file upload, screenshots, and unsafe code as named tool
  surfaces. Local implication: external-network execution needs a named bridge
  and capability status, not silent fallback to generic execution.
- Stagehand's browser eval fixtures keep action targets and expected evidence
  explicit. Local implication: the first external-network step should normalize
  URL intent and report deterministic gate evidence.
- OpenHands separates trajectory export and live status handling. Local
  implication: bridge output should be a compact report/receipt, not raw page
  content or raw runtime state.
- Inspect AI writes thinned manifests and headers separately from full logs.
  Local implication: Route 116 risk receipts should carry gate status and
  redactions without storing raw browser content.
- mini-swe-agent trajectory files carry explicit run metadata. Local implication:
  CLI evidence should show command boundaries and `Executed: no`.

## Existing gate reuse

The bridge reuses existing local code for:

- sandbox authority
- network allowlist decisions
- confirmation decisions
- runtime preflight evidence
- execution policy shape

It does not create a new permission model, allowlist store, confirmation store,
runner registry, provider path, MCP launcher, or browser lifecycle.

## Execution mode

External-network bridge modes are:

- `disabled`
- `blocked-by-policy`
- `explicit-external-runner-required`
- `future-runtime-required`
- `ready-for-future-runner`

All modes have `executed: false`. URL credentials are redacted before display.

## Disabled runner policy

The external-network runner is disabled by default. The bridge can report
`ready-for-future-runner` only when tests explicitly represent sandbox,
allowlist, confirmation, and a future runner state. Even then, no runner process
is called and no network request is made.

## Decision matrix

- missing allowlist -> blocked
- missing confirmation -> blocked
- unsupported scheme, credential URL, private network -> blocked
- sensitive actions -> blocked
- complete gates + disabled runner -> blocked-runner-disabled
- complete gates + future runner represented -> ready-for-future-runner

## Receipt and report model

The risk receipt includes receipt id, origin, action, sandbox, allowlist,
confirmation, preflight, runner status, risk level, blockers, readiness,
`executed: false`, redactions, and next action.

Reports may show sanitized origin and gate statuses. They must not show raw page
content, URL credentials, secrets, hidden reasoning, browser output, or raw
runtime state.

## Route 117

Route 117 should either design an external runner while still keeping real
execution disabled by default, polish CLI harness/reporting, or defer browser
network execution in favor of replay/report UX.

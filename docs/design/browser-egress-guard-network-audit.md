# Browser Egress Guard And Network Audit

Status: Route 119 implemented candidate.
Date: 2026-05-18

## Scope

Route 119 adds an enforcement and audit layer before browser-shaped network
execution. It builds on Route 118 controlled-network execution, which can call
only a harness-issued loopback HTTP server.

This route does not enable public internet browsing, launch a browser, add
Playwright/MCP/provider/model calls, change package scripts, or create default
persistent state.

## Reference Scan

Files inspected: 7 directly relevant files.

- `/home/wang/projects/playwright-mcp/config.d.ts`
- `/home/wang/projects/playwright-mcp/README.md`
- `/home/wang/projects/stagehand/packages/core/lib/v3/understudy/networkManager.ts`
- `/home/wang/projects/OpenHands/openhands/analytics/analytics_service.py`
- `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/task/run.py`
- `/home/wang/projects/mini-swe-agent/docs/usage/output_files.md`
- `/home/wang/projects/mini-swe-agent/tests/conftest.py`

Findings:

1. Playwright MCP exposes allowed/blocked origins and network logs, but its
   own docs state origin allow/block settings are not a security boundary and
   do not affect redirects. Local implication: this project needs its own
   pre-request and post-redirect guard before any future browser runner.
2. Stagehand centralizes network bookkeeping across frame/session traffic and
   offers observer-style request lifecycle events. Local implication: audit
   records should be emitted as structured request lifecycle evidence, not as
   raw page content.
3. OpenHands and Inspect AI keep explicit event/log records for user-visible
   lifecycle and eval samples. Local implication: browser egress needs a small
   report-safe record with decision, status, warnings, and next action.
4. mini-swe-agent trajectory files preserve full run history and metadata for
   later inspection. Local implication: Route 119 scenarios should prove the
   egress decision and audit id are visible in CLI/harness reports without
   leaking secrets or page bodies.

## Route 118 Baseline

Route 118 already proved controlled network-shaped execution through an
explicit manifest:

- the only executable origin is the harness loopback origin
- public external URLs are blocked before execution
- controlled responses are summarized and budgeted
- no browser process is launched

Route 119 keeps that boundary and inserts egress/audit checks around it.

## Egress Guard Model

Every future browser network request must pass through
`browserNetworkEgressGuard.ts` before execution. The guard receives the
requested URL, allowed origins, controlled origin metadata, action kind,
network mode, redirect target when known, and output budget.

In this route the only allow decision is `allowed-controlled-origin`.
Everything else blocks:

- no explicit allowlist
- origin mismatch
- public origin
- private non-harness origin
- credential-bearing URL
- unsupported scheme
- redirect escape
- sensitive action
- output budget overflow

The guard is pure policy. It does not perform network calls and it does not
mutate allowlists.

## Redirect Policy

`browserRedirectPolicy.ts` reruns the egress guard when a redirect target is
observed. No redirect and same controlled-origin redirects are allowed. Public
origins, private non-harness origins, credential URLs, and unsupported schemes
block as redirect escape or the more specific credential/scheme status.

Redirect summaries use sanitized origins only. URL credentials, raw page
content, secrets, and hidden reasoning must not appear in receipts or reports.

## Audit Record Model

`browserNetworkAuditRecord.ts` creates report-safe audit records with:

- deterministic audit id and request id
- action kind
- requested, effective, and allowed origin summaries
- egress and redirect decisions
- `publicNetwork: no`
- controlled/private/credential flags
- status code and byte budget summaries
- warnings, redactions, evidence, and next action

The record is safe for the controlled-network receipt, terminal surface,
scenario report, and sidebar summary.

## Controlled-Network Integration

`browserControlledNetworkExecutor.ts` calls the egress guard before the harness
HTTP request. If the guard blocks, no request is made and the executor returns
a blocked audit record.

When the harness response includes a redirect, the executor calls the redirect
policy before treating the response as successful. Redirect escape returns a
blocked receipt with the audit id and decision. Successful controlled requests
carry the audit record through `browserControlledNetworkReceipt.ts` and
`browserControlledNetworkSurface.ts`.

## Public Internet Boundary

Public internet remains blocked in Route 119. `future-public` is a named mode
only so future routes have a clear place to add explicit design; this route
does not allow it. No browser launch, Playwright dependency, MCP launch,
provider/model call, or dynamic skill discovery is added.

## Route 120 Recommendation

Route 120 should own public external-network execution design, still opt-in,
using this guard as the mandatory egress boundary. It should decide runner
dependency/tooling, explicit user confirmation, public allowlist semantics,
and how audit records are persisted or displayed without raw page content.

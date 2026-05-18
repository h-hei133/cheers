# Browser Controlled-Network Runner Harness

Route 118 adds a test-only controlled-network browser runner harness. It is not
public external browsing: the only allowed network target is an explicit
loopback HTTP server created by the harness for the current test run.

## Reference Scan Summary

- Playwright MCP keeps browser/network tools behind named capabilities and uses
  local test servers for deterministic network-shaped tests. Route 118 follows
  the same boundary with an explicit loopback server and no browser launch.
- Stagehand separates observe/extract semantics from action execution and
  treats page evidence as summarized output. Route 118 records only safe title
  and summary text.
- OpenHands-style runtime reports distinguish unavailable, blocked, and
  executed tool states. Route 118 keeps policy, request, receipt, and report
  status separate.
- Inspect AI and mini-swe-agent test patterns favor controlled environments,
  transcript evidence, and bounded output. Route 118 uses a deterministic
  loopback server plus CLI scenario evidence.

## Controlled-Network Definition

Controlled-network execution differs from public external-network execution in
three ways:

- the server is started by the test harness on loopback only
- the manifest must name the exact origin and run id
- the executor rejects any origin mismatch, public URL, credential URL,
  redirect outside loopback, timeout, or unsafe output

Allowed origins are exact `http://127.0.0.1:<dynamic-port>` harness origins.
Public `https://...`, wildcard origins, credential URLs, unsupported schemes,
and private origins not issued by the harness remain blocked.

## Runner Manifest

The controlled runner manifest declares version, source, runner mode
`controlled-network-test`, allowed loopback origin, allowed actions
`navigate`/`observe`/`extract`, run id, timeout/output budgets, evidence
contract, `publicNetworkAllowed: false`, and `browserLaunchAllowed: false`.

No default manifest exists. CLI use is explicit through a test harness manifest
environment variable.

## Test Server And Executor

The harness server binds to `127.0.0.1` with a dynamic port, serves small
deterministic pages, records request paths, supports a public redirect test,
and exposes a slow endpoint for timeout coverage.

The executor uses Node HTTP only for the manifest origin. It does not launch a
browser, import Playwright, start MCP, call providers/models, follow public
redirects, or store raw page content.

## Evidence And Receipt

Receipts record controlled origin, action, policy status, request status,
public network `no`, browser launched `no`, safe HTTP status/title/summary,
timeout/output budgets, redactions/warnings, executed yes/no, and next action.

The CLI/report/sidebar surfaces can show controlled-network executed or blocked
status, but they must not show raw HTML, URL credentials, secrets, hidden
reasoning, screenshots, OCR, or large stdout/stderr blobs.

## Route 119

Route 119 should own either public external-network execution design with a
real runner still opt-in, controlled-network evidence/report polish, or a
browser runner dependency/tooling decision if controlled network exposes a
runtime gap.

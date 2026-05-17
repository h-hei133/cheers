# Playwright CLI Real Execution Opt-In

Route 99 adds the first opt-in browser execution path after the Route 97
sandbox gates and Route 98 real CLI scenario harness. The path is local/test
local first: a deterministic local fixture executor can return executed
evidence, while default `/browser execute ...` remains blocked.

No default browser execution, external-network browsing, MCP launch, provider
or model call, package change, SessionManager schema change, persistent browser
session, screenshot/OCR capture, upload/download, auth/payment/destructive
flow, or raw content exposure is added.

## Reference Scan Summary

Playwright MCP patterns to borrow:

- Treat browser actions as tool invocations with explicit code/action evidence
  and accessibility snapshot summaries.
- Keep snapshot output bounded and action-linked rather than dumping raw page
  content.
- Make executed versus blocked status visible in the tool response.

Stagehand patterns to borrow:

- Preserve the distinction between observe, extract, and act.
- Use preview/observe before action; local fixture execution only covers
  read-only observe/extract in this route.
- Return structured action/evidence summaries instead of raw page payloads.
- Keep action cache/replay as a later design, not hidden runtime behavior.

OpenHands patterns to borrow:

- Represent action and observation evidence separately.
- Keep sandbox/tool observations user-visible but not raw runtime payloads.
- Treat rejection/blocked observations as first-class outcomes.

Inspect AI and mini-swe-agent patterns to borrow:

- Keep execution evidence, assertion results, and reports separate.
- Record trajectory status, timeout/failure, and redactions explicitly.
- Avoid turning a harness into the runtime implementation.

## Baseline

Route 97 already provides browser sandbox authority, network allowlist,
confirmation records, runtime preflight, evidence policy, and sidebar preflight
summaries.

Route 98 already provides process-level CLI scenario reports. It can prove the
default blocked CLI path, but it cannot inject a local fixture executor through
the CLI without adding a new bridge. That bridge is deferred.

## Execution Mode Decision

The smallest safe real execution path is `local-fixture`:

- executor is explicitly injected
- sandbox authority is explicitly `local-fixture`
- fixture content is deterministic and summarized
- only observe/extract and local fixture navigation are represented
- output says `Executed: yes` and `Mode: local-fixture`
- browser process is reported as `local fixture only`

External-network execution remains blocked. `explicit-local` and
`future-external` are represented as policy states, not default runtime access.

## Evidence Model

Execution evidence must include:

- action request id
- execution mode
- runtime name
- local fixture id or target
- safe title
- safe URL
- bounded safe summary
- action trace summary
- sandbox/allowlist/confirmation status
- executed yes/no
- redactions and warnings

Evidence must not include raw HTML, raw page text, screenshots/OCR text,
secrets, provider credentials, hidden reasoning, file upload/download data, or
persistent session state.

## Implementation Boundary

Route 99 adds:

- `browserLocalExecutionAuthority.ts`
- `browserLocalFixture.ts`
- `browserExecutionEvidenceRedactor.ts`
- `browserExecutionLifecycleSurface.ts`
- `browserPlaywrightCliExecutor.ts`

The Playwright CLI executor seam is non-default. Without an injected process
runner it reports unavailable/plan-only. The local fixture executor implements
bounded execution behavior for tests and scenarios without launching a browser
or MCP server.

## Sidebar Integration

`/browser execute ...` continues to emit through the existing command-result
sidebar adapter. Local fixture execution success appears as a sanitized
`Browser execution` event, and the command output includes a browser execution
lifecycle section.

## Scenario Harness Coverage

In-process scenario coverage proves:

- default `/browser execute observe` is blocked
- local fixture observe succeeds with `Executed: yes`
- local fixture extract succeeds with sanitized extraction summary
- external URL navigation remains blocked
- sidebar event is emitted

Real CLI scenario coverage proves:

- default `/browser execute observe` remains blocked through the child process
- Route 100 can explicitly inject a valid local-fixture manifest through the
  CLI harness and execute observe/extract without launching Playwright, MCP,
  providers, models, or network

Local fixture execution through the real CLI is now limited to the Route 100
test-local manifest bridge. Real Playwright execution remains deferred.

## Blocked Until Later Routes

Still blocked:

- external-network browsing
- arbitrary URL execution
- auth, payment, destructive, upload, download, screenshot/OCR
- arbitrary JavaScript execution
- persistent browser sessions
- MCP launch or dynamic MCP discovery
- provider/model calls
- real Playwright CLI execution bridge

## Route 100 Recommendation

Route 100 adds the CLI executor injection bridge for local-fixture execution
only. Choose Route 101 real Playwright CLI local-only execution only if the
manifest bridge remains stable and lifecycle gates can stay explicit.

Choose external-network browser execution opt-in only after local execution,
redaction, lifecycle, and scenario evidence remain stable.

Choose browser action cache/replay if Stagehand-like repeatability should come
before external network.

# Browser Public Read-Only Web Runner

Status: Route 120 implemented candidate.
Date: 2026-05-18

## Scope

Route 120 adds the first real public web execution path. It is not browser
automation: it performs only explicitly confirmed HTTPS `GET`/`HEAD` reads
through a bounded HTTP client and returns sanitized evidence.

It does not launch a browser, execute JavaScript, use cookies/auth/session
state, call MCP/provider/model APIs, submit forms, perform write methods, store
downloads, persist raw page content, or mutate global allowlists.

## Reference Scan

Files inspected: 8 directly relevant files.

- `/home/wang/projects/playwright-mcp/config.d.ts`
- `/home/wang/projects/playwright-mcp/README.md`
- `/home/wang/projects/OpenHands/openhands/app_server/services/httpx_client_injector.py`
- `/home/wang/projects/stagehand/packages/core/lib/v3/understudy/networkManager.ts`
- `/home/wang/projects/inspect_ai/src/inspect_ai/_eval/task/run.py`
- `/home/wang/projects/mini-swe-agent/docs/usage/output_files.md`
- `/home/wang/projects/mini-swe-agent/tests/conftest.py`
- Route 119 local egress/audit modules

Findings:

1. Playwright MCP separates tool capabilities, network controls, snapshots,
   and network logs, but its origin allow/block knobs are not a redirect-proof
   security boundary. Local implication: Route 120 keeps its own manifest,
   pre-request egress guard, and redirect egress check.
2. OpenHands keeps HTTP client injection explicit and scoped. Local
   implication: tests use an injected client; the built-in client is only for
   explicit opt-in execution.
3. Stagehand centralizes request lifecycle observation. Local implication:
   redirects and request outcomes are summarized as lifecycle evidence, not raw
   page content.
4. Inspect AI and mini-swe-agent preserve run/sample evidence with normalized
   reports. Local implication: CLI/scenario reports expose receipt ids,
   decisions, and summaries while excluding raw response bodies and secrets.

## Minimum Useful Runner

The minimum useful public read-only runner is:

- explicit manifest
- exact HTTPS origin allowlist
- explicit network confirmation
- action limited to `navigate`, `observe`, or `extract`
- method limited to `GET` or `HEAD`
- Route 119 egress guard before the request
- redirect egress guard for each redirect
- bounded timeout, redirect count, response bytes, and content types
- sanitized receipt/evidence/report only

This gives users a narrow way to fetch public read-only evidence without
creating a browser automation feature.

## Gates

A public request must pass these gates before any network call:

- manifest is present and valid
- manifest allows public network reads and disables browser, JavaScript, and
  cookies
- requested origin is an exact allowlisted public HTTPS origin
- confirmation is explicitly represented as confirmed
- action is read-only and method is `GET` or `HEAD`
- URL has no credentials and is not private/local
- output budget is represented
- egress guard allows the effective origin

Redirects are checked against the same public allowlist. Non-allowlisted,
private/local, credential, unsupported-scheme, and over-limit redirects block.

## Evidence Model

Safe evidence includes:

- action kind and method
- final origin
- status code class and content type summary
- content length versus budget
- optional sanitized title
- short sanitized text summary
- redirect origin summary
- egress audit id and decision
- warnings and redactions

Evidence excludes raw full page content, URL credentials, cookies, headers,
secrets, hidden reasoning, binary bodies, screenshots, OCR payloads, and file
downloads.

## Deterministic Tests

Default tests use injected HTTP clients and controlled local harnesses. They do
not depend on public internet availability. Real public smoke tests should stay
explicit opt-in and skipped by default.

## Route 121

Route 121 should either polish public read-only UX/reporting or add a skipped
opt-in real public smoke harness. Browser automation, JavaScript, cookies,
auth/session handling, screenshots, and form/action support should remain a
separate design route after the HTTP read-only boundary is stable.
